/**
 * Cloudflare Worker API client for WordBridge AI (translate, transcribe)
 */

const WORKER_URL = process.env.NEXT_PUBLIC_WORDBRIDGE_WORKER_URL || 
  'https://wordbridge-ai.shaikabduljaleel1214.workers.dev';

// m2m100 uses language codes (en, de, ar, hi, etc.)
const LANG_CODE_TO_M2M: Record<string, string> = {
  en: 'en', hi: 'hi', es: 'es', fr: 'fr', de: 'de',
  ar: 'ar', zh: 'zh', ja: 'ja', ko: 'ko', pt: 'pt',
  ru: 'ru', ta: 'ta', te: 'te', mr: 'mr', bn: 'bn',
};

export interface TranslateParams {
  text: string;
  sourceLang?: string;
  targetLang: string;
}

export interface TranslateResponse {
  translatedText?: string;
  error?: string;
}

// Patterns that indicate a verbose "language is X / translation to Y: ..." response (English or Arabic)
const VERBOSE_LABEL = /(?:The language detected|The translation|The phrase|translation (?:to|is)|Is there anything|اللغة هي|الترجمة إلى|ترجمة إلى)/i;

// Sanitize: if Worker returns verbose response, extract only the actual translation
function sanitizeTranslation(raw: string, originalText: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // If response looks like "Label: actual translation" or "Label\nactual translation", extract the translation
  const hasVerboseLabel = VERBOSE_LABEL.test(trimmed);
  const hasColon = /:\s*/.test(trimmed);
  const hasNewline = /\n/.test(trimmed);

  if (hasVerboseLabel && (hasColon || hasNewline)) {
    // Try part after last colon (e.g. "الترجمة إلى العربية: مرحبا" -> "مرحبا")
    const afterLastColon = trimmed.split(/:\s*/).pop()?.trim();
    if (afterLastColon && afterLastColon.length > 0 && !VERBOSE_LABEL.test(afterLastColon)) {
      if (afterLastColon.length <= originalText.length * 3) return afterLastColon;
    }
    // Try last non-empty line (verbose line first, translation on last line)
    const lines = trimmed.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const lastLine = lines[lines.length - 1];
    if (lastLine && !VERBOSE_LABEL.test(lastLine) && lastLine.length <= originalText.length * 3) {
      return lastLine;
    }
    // Try quoted translation
    const quoted = trimmed.match(/'([^']+)'|"([^"]+)"|«([^»]+)»|„([^"]+)"/);
    if (quoted) return (quoted[1] || quoted[2] || quoted[3] || quoted[4] || '').trim() || null;
    return null;
  }

  // Reject other obvious verbose English explanations
  if (
    /^(The language detected|The translation|The phrase|Is there anything)/i.test(trimmed) ||
    /translation (to|is)/i.test(trimmed) ||
    trimmed.length > originalText.length * 3
  ) {
    const quoted = trimmed.match(/'([^']+)'|"([^"]+)"|«([^»]+)»|„([^"]+)"/);
    if (quoted) return (quoted[1] || quoted[2] || quoted[3] || quoted[4] || '').trim() || null;
    return null;
  }

  return trimmed;
}

export async function translate(params: TranslateParams): Promise<string | null> {
  try {
    const targetLangCode = LANG_CODE_TO_M2M[params.targetLang] || params.targetLang;
    const res = await fetch(`${WORKER_URL}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: params.text,
        sourceLang: params.sourceLang ? (LANG_CODE_TO_M2M[params.sourceLang] || params.sourceLang) : undefined,
        targetLang: targetLangCode,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[translate] Worker error:', res.status, err);
      return null;
    }

    const data: TranslateResponse = await res.json();
    const raw = data.translatedText || null;
    if (!raw) return null;
    const sanitized = sanitizeTranslation(raw, params.text);
    if (sanitized !== null) return sanitized;
    // Rejected as verbose - only use raw if it's short and doesn't look like explanation
    if (raw.length < 200 && !/The language detected|translation (to|is)|Is there anything/i.test(raw)) {
      return raw;
    }
    return null; // Fall back to original content in app
  } catch (err) {
    console.error('[translate] Network error:', err);
    return null;
  }
}

export interface TranscribeParams {
  audioBase64: string;
  sourceLang?: string; // 'auto' or specific lang code
}

export interface TranscribeResponse {
  text?: string;
  error?: string;
}

export async function transcribe(params: TranscribeParams): Promise<string | null> {
  try {
    const res = await fetch(`${WORKER_URL}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio: params.audioBase64,
        sourceLang: params.sourceLang ?? 'auto',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[transcribe] Worker error:', res.status, err);
      return null;
    }

    const data: TranscribeResponse = await res.json();
    return data.text || null;
  } catch (err) {
    console.error('[transcribe] Network error:', err);
    return null;
  }
}
