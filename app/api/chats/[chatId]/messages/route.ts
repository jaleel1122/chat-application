import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Message from '@/models/Message';
import Chat from '@/models/Chat';
import { verifyToken } from '@/lib/auth';
import {
  translate,
  detectSourceLanguage,
  detectLanguageLLM,
  translateWithContext,
  transcribe,
} from '@/lib/cloudflare-worker';

export async function GET(
  request: NextRequest,
  { params }: { params: { chatId: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      );
    }

    await connectDB();

    const chat = await Chat.findById(params.chatId);
    if (!chat || !chat.participants.includes(decoded.userId)) {
      return NextResponse.json(
        { message: 'Chat not found' },
        { status: 404 }
      );
    }

    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50');
    const before = request.nextUrl.searchParams.get('before');

    const query: any = { chat: params.chatId };
    if (before) {
      query._id = { $lt: before };
    }

    const messages = await Message.find(query)
      .populate('sender', 'name email avatar')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Ensure translatedContent is a plain object (Mongoose Map serializes correctly with .lean())
    const serialized = (messages as any[]).reverse().map((m: any) => ({
      ...m,
      translatedContent: m.translatedContent && typeof m.translatedContent === 'object' && !Array.isArray(m.translatedContent)
        ? (m.translatedContent instanceof Map
            ? Object.fromEntries(m.translatedContent)
            : m.translatedContent)
        : m.translatedContent ?? {},
    }));

    return NextResponse.json(serialized);
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { chatId: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded || !decoded.userId) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      );
    }

    await connectDB();

    const chat = await Chat.findById(params.chatId);
    if (!chat || !chat.participants.includes(decoded.userId)) {
      return NextResponse.json(
        { message: 'Chat not found' },
        { status: 404 }
      );
    }

    // Delete all messages within this chat but keep the chat itself
    await Message.deleteMany({ chat: params.chatId });

    // Clear lastMessage reference so UI doesn't show stale preview
    await Chat.findByIdAndUpdate(params.chatId, {
      $unset: { lastMessage: "" },
    });

    return NextResponse.json(
      { message: 'Messages deleted successfully' },
      { status: 200 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || 'Failed to delete messages' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { chatId: string } }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      return NextResponse.json(
        { message: 'Invalid token' },
        { status: 401 }
      );
    }

    await connectDB();

    const chat = await Chat.findById(params.chatId);
    if (!chat || !chat.participants.includes(decoded.userId)) {
      return NextResponse.json(
        { message: 'Chat not found' },
        { status: 404 }
      );
    }

    const { content, type, mediaUrl } = await request.json();
    const msgType = type || 'text';

    // For voice notes: transcribe audio first
    let finalContent = content || (msgType === 'voice' ? 'Voice message' : '');
    if (msgType === 'voice' && mediaUrl && typeof mediaUrl === 'string' && mediaUrl.startsWith('data:audio')) {
      try {
        const base64 = mediaUrl.includes(',') ? mediaUrl.split(',')[1] : mediaUrl;
        const transcript = await transcribe({ audioBase64: base64, sourceLang: 'auto' });
        if (transcript?.trim()) {
          finalContent = transcript.trim();
        }
      } catch (err) {
        console.error('[messages POST] voice transcribe failed:', err);
      }
    }

    const message = await Message.create({
      chat: params.chatId,
      sender: decoded.userId,
      content: finalContent,
      type: msgType,
      mediaUrl,
      readBy: [decoded.userId],
    });

    // Enhanced translation with context-aware support
    const translatedContent: Record<string, string> = {};
    if ((msgType === 'text' || msgType === 'voice') && finalContent && finalContent !== 'Voice message') {
      // Use LLM-based detection (better accuracy than script-based)
      const sourceLang = await detectLanguageLLM(finalContent) || detectSourceLanguage(finalContent);

      const chatWithParticipants = await Chat.findById(params.chatId)
        .populate('participants', 'preferredLanguage')
        .lean() as { participants?: Array<{ preferredLanguage?: string }> } | null;
      const participants = chatWithParticipants?.participants || [];
      const targetLangs = new Set<string>(['en', 'ar']); // ensure en and ar always present for UI
      for (const p of participants as any[]) {
        const lang = p?.preferredLanguage || 'en';
        targetLangs.add(lang);
      }

      // Get conversation context for smart translation (last 5 messages)
      const recentMessages = await Message.find({ chat: params.chatId })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean() as Array<{ content: string; sender: any }>;

      const conversationContext = recentMessages
        .reverse()
        .map((m) => ({
          content: m.content,
          senderId: m.sender?.toString() || '',
        }))
        .filter((m) => m.content && m.content !== 'Voice message' && m.content.trim().length > 0);

      // Determine if we should use smart mode (for longer/complex messages)
      // Smart mode uses LLM with context for better tone preservation
      const useSmartMode = finalContent.length > 80 || conversationContext.length >= 2;

      for (const lang of targetLangs) {
        if (lang === sourceLang) {
          translatedContent[lang] = finalContent;
          continue;
        }
        try {
          const translated = await translateWithContext({
            text: finalContent,
            sourceLang: sourceLang || undefined,
            targetLang: lang,
            conversationContext: useSmartMode ? conversationContext : undefined,
            useSmartMode,
          });
          if (translated) translatedContent[lang] = translated;
        } catch {
          // fallback to original on failure
        }
        if (!translatedContent[lang]) translatedContent[lang] = finalContent;
      }

      await Message.findByIdAndUpdate(message._id, { 
        translatedContent,
        detectedLanguage: sourceLang || undefined,
      });
    }

    await Chat.findByIdAndUpdate(params.chatId, {
      lastMessage: message._id,
      updatedAt: new Date(),
    });

    const populatedMessage = await Message.findById(message._id)
      .populate('sender', 'name email avatar')
      .lean();
    const result = populatedMessage as any;
    if (result && Object.keys(translatedContent).length > 0) {
      result.translatedContent = translatedContent;
    }
    return NextResponse.json(result || populatedMessage);
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || 'Failed to send message' },
      { status: 500 }
    );
  }
}
