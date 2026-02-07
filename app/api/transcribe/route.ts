import { NextRequest, NextResponse } from 'next/server';
import { transcribe } from '@/lib/cloudflare-worker';
import { verifyToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const { audio } = await request.json();
    if (!audio || typeof audio !== 'string') {
      return NextResponse.json(
        { message: 'Missing audio (base64 string)' },
        { status: 400 }
      );
    }

    // Strip data URL prefix if present (e.g. data:audio/webm;base64,)
    let base64 = audio;
    if (audio.includes(',')) {
      base64 = audio.split(',')[1];
    }

    const text = await transcribe({
      audioBase64: base64,
      sourceLang: 'auto',
    });

    return NextResponse.json({ text: text || '' });
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || 'Transcription failed' },
      { status: 500 }
    );
  }
}
