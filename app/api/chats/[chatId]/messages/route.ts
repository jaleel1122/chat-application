import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Message from '@/models/Message';
import Chat from '@/models/Chat';
import { verifyToken } from '@/lib/auth';
import { translate } from '@/lib/cloudflare-worker';

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
        const transcribeRes = await fetch(`${process.env.NEXT_PUBLIC_WORDBRIDGE_WORKER_URL || 'https://wordbridge-ai.shaikabduljaleel1214.workers.dev'}/transcribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: base64, sourceLang: 'auto' }),
        });
        if (transcribeRes.ok) {
          const transData = await transcribeRes.json();
          if (transData.text && transData.text.trim()) {
            finalContent = transData.text.trim();
          }
        }
      } catch {
        // Keep "Voice message" fallback
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

    // Always set translatedContent for text/voice: at least original, plus each participant's preferred language
    const translatedContent: Record<string, string> = {};
    if ((msgType === 'text' || msgType === 'voice') && finalContent && finalContent !== 'Voice message') {
      // Always include original content under 'en' so every message has a consistent shape and UI never breaks
      translatedContent['en'] = finalContent;

      const chatWithParticipants = await Chat.findById(params.chatId)
        .populate('participants', 'preferredLanguage')
        .lean() as { participants?: Array<{ preferredLanguage?: string }> } | null;
      const participants = chatWithParticipants?.participants || [];
      const targetLangs = new Set<string>();
      for (const p of participants as any[]) {
        const lang = p?.preferredLanguage || 'en';
        targetLangs.add(lang);
      }
      for (const lang of targetLangs) {
        if (translatedContent[lang]) continue; // already have (e.g. en)
        try {
          const translated = await translate({ text: finalContent, targetLang: lang });
          if (translated) translatedContent[lang] = translated;
        } catch {
          // Skip failed translations; keep original for this lang below
        }
        if (!translatedContent[lang]) translatedContent[lang] = finalContent;
      }
      await Message.findByIdAndUpdate(message._id, { translatedContent });
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
