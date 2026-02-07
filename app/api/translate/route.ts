import { NextRequest, NextResponse } from 'next/server';
import { translate } from '@/lib/cloudflare-worker';
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

    const { text, sourceLang, targetLang } = await request.json();
    if (!text || !targetLang) {
      return NextResponse.json(
        { message: 'Missing text or targetLang' },
        { status: 400 }
      );
    }

    const translatedText = await translate({
      text: String(text),
      sourceLang: sourceLang ? String(sourceLang) : undefined,
      targetLang: String(targetLang),
    });

    if (!translatedText) {
      return NextResponse.json(
        { message: 'Translation failed' },
        { status: 502 }
      );
    }

    return NextResponse.json({ translatedText });
  } catch (error: any) {
    return NextResponse.json(
      { message: error.message || 'Translation failed' },
      { status: 500 }
    );
  }
}
