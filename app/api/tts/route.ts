import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import Message from '@/models/Message';
import Chat from '@/models/Chat';
import { verifyToken } from '@/lib/auth';

const WORKER_URL =
  process.env.NEXT_PUBLIC_WORDBRIDGE_WORKER_URL ||
  'https://wordbridge-ai.shaikabduljaleel1214.workers.dev';

type TtsWorkerResponse = {
  audioBase64?: string;
  audio?: string;
  mimeType?: string;
  error?: string;
};

function getTranslatedTextForLanguage(
  translatedContent: any,
  targetLang: string,
  fallbackText: string
): string {
  if (!translatedContent || typeof translatedContent !== 'object') return fallbackText;

  if (translatedContent instanceof Map) {
    return translatedContent.get(targetLang) || translatedContent.get('en') || fallbackText;
  }

  return translatedContent[targetLang] || translatedContent.en || fallbackText;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (!decoded || !decoded.userId) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const { messageId, targetLang } = await request.json();
    if (!messageId || !targetLang) {
      return NextResponse.json({ message: 'messageId and targetLang are required' }, { status: 400 });
    }

    await connectDB();

    const message = await Message.findById(messageId).lean() as any;
    if (!message || message.type !== 'voice') {
      return NextResponse.json({ message: 'Voice message not found' }, { status: 404 });
    }

    const chat = await Chat.findById(message.chat).lean() as any;
    if (!chat || !chat.participants?.some((p: any) => p.toString() === decoded.userId)) {
      return NextResponse.json({ message: 'Chat not found' }, { status: 404 });
    }

    const textForTts = getTranslatedTextForLanguage(
      message.translatedContent,
      String(targetLang),
      message.content || 'Voice message'
    );

    if (!textForTts || textForTts === 'Voice message') {
      return NextResponse.json({ message: 'No transcript available for TTS' }, { status: 400 });
    }

    const workerRes = await fetch(`${WORKER_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: textForTts,
        targetLang: String(targetLang),
      }),
    });

    if (!workerRes.ok) {
      const err = await workerRes.text().catch(() => '');
      return NextResponse.json(
        { message: `TTS failed (${workerRes.status})`, details: err || 'Worker returned error' },
        { status: 502 }
      );
    }

    const contentType = workerRes.headers.get('content-type') || '';

    // Worker returned binary audio directly
    if (contentType.startsWith('audio/')) {
      const audioBuffer = await workerRes.arrayBuffer();
      return new Response(audioBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-store',
        },
      });
    }

    // Worker returned JSON with base64 audio
    const data = (await workerRes.json().catch(() => ({}))) as TtsWorkerResponse;
    const base64Audio = data.audioBase64 || data.audio;
    if (!base64Audio) {
      return NextResponse.json(
        { message: data.error || 'TTS response missing audio payload' },
        { status: 502 }
      );
    }

    const bytes = Buffer.from(base64Audio, 'base64');
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': data.mimeType || 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { message: error?.message || 'Failed to generate translated audio' },
      { status: 500 }
    );
  }
}
