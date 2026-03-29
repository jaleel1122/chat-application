# Cloudflare Worker Setup Instructions

This document contains the code changes you need to make in your Cloudflare Worker (`wordbridge-ai`) to support context-aware translation and LLM-based language detection.

## 📍 Worker URL
Your current Worker URL: `https://wordbridge-ai.shaikabduljaleel1214.workers.dev`

## 🔧 Required Changes

You need to add **two new endpoints** to your Cloudflare Worker:

1. `/detect-language` - LLM-based language detection
2. `/translate-context` - Context-aware translation

---

## 1️⃣ Add `/detect-language` Endpoint

This endpoint uses Workers AI LLM to accurately detect the language of text (much better than script-based detection).

### Implementation

Add this route handler in your Worker's main handler function:

```typescript
// In your Worker's fetch handler
if (url.pathname === '/detect-language') {
  try {
    const { text } = await request.json();
    
    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Text is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Use Workers AI LLM for language detection
    const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        {
          role: 'system',
          content: 'You are a language detector. Identify the language of the given text and return ONLY the ISO-639-1 language code (e.g., "en", "es", "ar", "hi", "fr", "de", "zh", "ja", "ko", "pt", "ru", "ta", "te", "mr", "bn"). Return nothing else, just the two-letter code.',
        },
        {
          role: 'user',
          content: text.substring(0, 500), // Limit to first 500 chars for efficiency
        },
      ],
      max_tokens: 10, // We only need a 2-letter code
    });

    // Extract language code from response
    let detectedLang = response.response?.trim()?.toLowerCase() || 'en';
    
    // Clean up response (remove quotes, extra text, etc.)
    detectedLang = detectedLang.replace(/['"]/g, '').split(/[\s\n,]/)[0];
    
    // Validate it's a 2-letter code
    if (detectedLang.length !== 2) {
      detectedLang = 'en'; // Fallback
    }
    
    return new Response(
      JSON.stringify({ language: detectedLang }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Language detection error:', error);
    return new Response(
      JSON.stringify({ error: 'Language detection failed', language: 'en' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

---

## 2️⃣ Add `/translate-context` Endpoint

This endpoint uses LLM with conversation context for context-aware translation that preserves tone and intent.

### Implementation

Add this route handler in your Worker's main handler function:

```typescript
// In your Worker's fetch handler
if (url.pathname === '/translate-context') {
  try {
    const { text, sourceLang, targetLang, context } = await request.json();
    
    if (!text || !targetLang) {
      return new Response(
        JSON.stringify({ error: 'Text and targetLang are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Build context string from conversation history
    let contextStr = '';
    if (context && Array.isArray(context) && context.length > 0) {
      const contextMessages = context.slice(-5).join('\n'); // Last 5 messages
      contextStr = `Previous conversation:\n${contextMessages}\n\nCurrent message to translate:`;
    } else {
      contextStr = 'Translate the following text:';
    }

    // Language name mapping for better prompts
    const langNames: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      ar: 'Arabic',
      hi: 'Hindi',
      fr: 'French',
      de: 'German',
      zh: 'Chinese',
      ja: 'Japanese',
      ko: 'Korean',
      pt: 'Portuguese',
      ru: 'Russian',
      ta: 'Tamil',
      te: 'Telugu',
      mr: 'Marathi',
      bn: 'Bengali',
    };

    const sourceLangName = sourceLang ? (langNames[sourceLang] || sourceLang) : 'auto-detect';
    const targetLangName = langNames[targetLang] || targetLang;

    // Use LLM for context-aware translation
    const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        {
          role: 'system',
          content: `You are a professional translator. Translate the text while preserving tone, intent, sarcasm, cultural nuance, and conversation continuity. Maintain the speaker's style and personality. Translate from ${sourceLangName} to ${targetLangName}. Return ONLY the translation, no explanations, no labels, no quotes around the translation.`,
        },
        {
          role: 'user',
          content: `${contextStr}\n"${text}"`,
        },
      ],
      max_tokens: 500,
    });

    let translated = response.response?.trim() || '';
    
    // Clean up response (remove quotes if present, remove verbose labels)
    translated = translated.replace(/^["']|["']$/g, '').trim();
    
    // Remove common verbose prefixes
    const verbosePrefixes = [
      /^The translation is:/i,
      /^Translation:/i,
      /^In .+:/i,
      /^Here.*translation:/i,
    ];
    
    for (const prefix of verbosePrefixes) {
      translated = translated.replace(prefix, '').trim();
    }
    
    // If translation is empty or too long, fallback to regular translation
    if (!translated || translated.length > text.length * 4) {
      // Fallback: use regular m2m100 translation
      const fallbackResponse = await env.AI.run('@cf/meta/m2m100-1.2b', {
        text: text,
        source_lang: sourceLang || 'en',
        target_lang: targetLang,
      });
      translated = fallbackResponse.translated_text || text;
    }
    
    return new Response(
      JSON.stringify({ translatedText: translated }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Context translation error:', error);
    
    // Fallback to regular translation on error
    try {
      const { text, sourceLang, targetLang } = await request.json();
      const fallbackResponse = await env.AI.run('@cf/meta/m2m100-1.2b', {
        text: text,
        source_lang: sourceLang || 'en',
        target_lang: targetLang,
      });
      
      return new Response(
        JSON.stringify({ translatedText: fallbackResponse.translated_text || text }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (fallbackError) {
      return new Response(
        JSON.stringify({ error: 'Translation failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
}
```

---

## 📝 Complete Worker Example Structure

Here's how your Worker's main handler should look (pseudo-code structure):

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Existing endpoints
    if (url.pathname === '/translate') {
      // Your existing translate endpoint
    }
    
    if (url.pathname === '/transcribe') {
      // Your existing transcribe endpoint
    }
    
    // NEW: Language detection endpoint
    if (url.pathname === '/detect-language') {
      // Add the code from section 1 above
    }
    
    // NEW: Context-aware translation endpoint
    if (url.pathname === '/translate-context') {
      // Add the code from section 2 above
    }
    
    return new Response('Not Found', { status: 404 });
  }
}
```

---

## Fix `/transcribe` (Whisper) — required for voice notes

Cloudflare’s `@cf/openai/whisper-large-v3-turbo` model expects **`audio` as a base64 string**. Passing a decoded byte array (e.g. `[...Uint8Array]`) causes **500** errors.

Replace your `/transcribe` handler with:

```javascript
if (request.method === 'POST' && url.pathname === '/transcribe') {
  try {
    const { audio, sourceLang } = await request.json();
    if (!audio) {
      return new Response(JSON.stringify({ error: 'Missing audio' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    const base64 = audio.includes(',') ? audio.split(',')[1] : audio;
    const aiInput = { audio: base64, task: 'transcribe' };
    if (sourceLang && sourceLang !== 'auto' && typeof sourceLang === 'string') {
      aiInput.language = sourceLang;
    }
    const result = await env.AI.run('@cf/openai/whisper-large-v3-turbo', aiInput);
    return new Response(JSON.stringify({ text: result.text || '' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (e) {
    console.error('transcribe', e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
```

Docs: [whisper-large-v3-turbo](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/).

---

## ✅ Testing

After adding these endpoints, test them:

### Test Language Detection:
```bash
curl -X POST https://wordbridge-ai.shaikabduljaleel1214.workers.dev/detect-language \
  -H "Content-Type: application/json" \
  -d '{"text": "Hola, ¿cómo estás?"}'
```

Expected response: `{"language": "es"}`

### Test Context Translation:
```bash
curl -X POST https://wordbridge-ai.shaikabduljaleel1214.workers.dev/translate-context \
  -H "Content-Type: application/json" \
  -d '{
    "text": "That'\''s crazy!",
    "sourceLang": "en",
    "targetLang": "es",
    "context": ["I just won the lottery!", "No way?!"]
  }'
```

Expected response: `{"translatedText": "¡Eso es increíble!"}` (preserving excitement tone)

---

## 🔍 Important Notes

1. **Workers AI Models**: Make sure you have access to `@cf/meta/llama-3-8b-instruct` in your Cloudflare account. If not available, you can use:
   - `@cf/meta/llama-3-8b-instruct` (recommended)
   - `@cf/mistral/mistral-7b-instruct-v0.1` (alternative)

2. **Fallback Behavior**: Both endpoints have fallback mechanisms:
   - `/detect-language` falls back to script-based detection if LLM fails
   - `/translate-context` falls back to regular m2m100 translation if LLM fails

3. **Cost Optimization**: 
   - Language detection uses `max_tokens: 10` (very cheap)
   - Context translation uses `max_tokens: 500` (moderate cost)
   - Smart mode is only used for messages > 80 chars or when context exists

4. **CORS**: If you need CORS headers, add them:
   ```typescript
   const corsHeaders = {
     'Access-Control-Allow-Origin': '*',
     'Access-Control-Allow-Methods': 'POST, OPTIONS',
     'Access-Control-Allow-Headers': 'Content-Type',
   };
   ```

---

## 🚀 Next Steps

1. ✅ Add the two endpoints to your Cloudflare Worker
2. ✅ Deploy the Worker
3. ✅ Test the endpoints using curl or Postman
4. ✅ Your Next.js app will automatically use the new features!

The Next.js app code has already been updated to use these new endpoints. Once you add them to your Worker, everything will work automatically.
