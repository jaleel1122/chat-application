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

/** Script-based detection: m2m100 does not support auto-detect, so we infer source language from script. */
function detectSourceLanguage(text: string): string {
  if (!text || typeof text !== 'string') return 'en';
  const t = text.trim();
  if (!t.length) return 'en';
  // Arabic (U+0600–U+06FF)
  if (/[\u0600-\u06FF]/.test(t)) return 'ar';
  // CJK: Chinese (common + CJK Unified)
  if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(t)) return 'zh';
  // Hiragana/Katakana → Japanese
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(t)) return 'ja';
  // Hangul → Korean
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(t)) return 'ko';
  // Devanagari (Hindi, etc.)
  if (/[\u0900-\u097F]/.test(t)) return 'hi';
  // Cyrillic → Russian
  if (/[\u0400-\u04FF]/.test(t)) return 'ru';
  // Tamil
  if (/[\u0B80-\u0BFF]/.test(t)) return 'ta';
  // Telugu
  if (/[\u0C00-\u0C7F]/.test(t)) return 'te';
  // Bengali
  if (/[\u0980-\u09FF]/.test(t)) return 'bn';
  // Default to English (covers Latin script and unknown)
  return 'en';
}

export { detectSourceLanguage };

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
    const body: Record<string, string> = { audio: params.audioBase64 };
    const sl = params.sourceLang ?? 'auto';
    if (sl && sl !== 'auto') body.sourceLang = sl;

    const res = await fetch(`${WORKER_URL}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const raw = await res.text();
      let err: unknown = raw;
      try {
        err = JSON.parse(raw);
      } catch {
        /* keep raw */
      }
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

/**
 * LLM-based language detection (better than script-based)
 * Uses Cloudflare Worker AI to detect language accurately
 * Falls back to script-based detection if Worker is unavailable
 */
export interface DetectLanguageResponse {
  language?: string;
  error?: string;
}

export async function detectLanguageLLM(text: string): Promise<string | null> {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return 'en'; // Fallback
  }

  try {
    const res = await fetch(`${WORKER_URL}/detect-language`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      console.error('[detectLanguageLLM] Worker error:', res.status);
      return detectSourceLanguage(text); // Fallback to script-based
    }

    const data: DetectLanguageResponse = await res.json();
    const detectedLang = data.language?.toLowerCase().trim();
    
    // Validate language code (basic check)
    if (detectedLang && detectedLang.length === 2) {
      return detectedLang;
    }
    
    return detectSourceLanguage(text); // Fallback if invalid response
  } catch (err) {
    console.error('[detectLanguageLLM] Network error:', err);
    return detectSourceLanguage(text); // Fallback
  }
}

/**
 * Context-aware translation with conversation history
 * Uses LLM for better tone preservation and context understanding
 */
export interface TranslateWithContextParams {
  text: string;
  sourceLang?: string;
  targetLang: string;
  conversationContext?: Array<{ content: string; senderId: string }>; // Last N messages
  useSmartMode?: boolean; // Use LLM for context-aware translation
}

export async function translateWithContext(
  params: TranslateWithContextParams
): Promise<string | null> {
  const { text, sourceLang, targetLang, conversationContext, useSmartMode } = params;

  // Smart mode: Use LLM with context for better tone preservation
  if (useSmartMode && conversationContext && conversationContext.length > 0) {
    try {
      const res = await fetch(`${WORKER_URL}/translate-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          sourceLang,
          targetLang,
          context: conversationContext.map((m) => m.content).slice(-5), // Last 5 messages
        }),
      });

      if (res.ok) {
        const data: TranslateResponse = await res.json();
        const raw = data.translatedText || null;
        if (raw) {
          const sanitized = sanitizeTranslation(raw, text);
          if (sanitized) return sanitized;
          // If sanitization failed but we have a response, try using it if it's reasonable
          if (raw.length < text.length * 3 && !VERBOSE_LABEL.test(raw)) {
            return raw;
          }
        }
      }
    } catch (err) {
      console.error('[translateWithContext] Smart mode error:', err);
      // Fall through to fast mode
    }
  }

  // Fast mode: Use regular translation (fallback or default)
  return translate({ text, sourceLang, targetLang });
}
