# Cloudflare Worker Setup for WordBridge

Your chat app calls the Cloudflare Worker at:
`https://wordbridge-ai.shaikabduljaleel1214.workers.dev`

The app expects **two endpoints** on the Worker. Add `/transcribe` if you haven't already.

---

## 1. Translation (`POST /translate`)

**IMPORTANT:** Use the **m2m100** model, NOT Llama. Llama returns verbose explanations ("The language detected is...") instead of just the translated text. m2m100 outputs ONLY the translation.

Request body:

```json
{
  "text": "Hello",
  "sourceLang": "en",   // optional, defaults to auto-detect
  "targetLang": "de"    // language CODE: en, de, ar, hi, es, fr, etc.
}
```

Response:

```json
{
  "translatedText": "Hallo"
}
```

**Language codes:** en, hi, es, fr, de, ar, zh, ja, ko, pt, ru, ta, te, mr, bn

---

## 2. Transcription (`POST /transcribe`)

Add this route for voice notes and call transcripts. Request body:

```json
{
  "audio": "<base64 audio data>",
  "sourceLang": "auto"
}
```

Response:

```json
{
  "text": "Transcribed text here"
}
```

### Worker code for `/transcribe`

Add this to your Worker's `fetch` handler (alongside `/translate`):

```javascript
// Inside your fetch handler, add:

if (request.method === "POST" && url.pathname === "/transcribe") {
  try {
    const { audio, sourceLang } = await request.json();
    if (!audio) {
      return new Response(
        JSON.stringify({ error: "Missing audio" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Whisper expects base64 audio (without data URL prefix)
    const base64 = audio.includes(",") ? audio.split(",")[1] : audio;

    const result = await env.AI.run(
      "@cf/openai/whisper-large-v3-turbo",
      {
        audio: [...Uint8Array.from(atob(base64), c => c.charCodeAt(0))],
        language: sourceLang === "auto" ? undefined : sourceLang,
      }
    );

    return new Response(
      JSON.stringify({ text: result.text || result.transcript || "" }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e.message || e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
```

Also add CORS for `/transcribe` (OPTIONS preflight) if needed, same as for `/translate`.

---

## Full Worker example (translate + transcribe + CORS)

**Use m2m100 for translation** – it outputs only the translated text (no explanations). Llama returns verbose text that breaks the UI.

```javascript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // POST /translate – USE m2m100, NOT Llama!
    if (request.method === "POST" && url.pathname === "/translate") {
      try {
        const { text, sourceLang, targetLang } = await request.json();
        if (!text || !targetLang) {
          return new Response(
            JSON.stringify({ error: "Missing text or targetLang" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        // m2m100 uses language codes: en, de, ar, hi, es, fr, etc.
        const result = await env.AI.run("@cf/meta/m2m100-1.2b", {
          text: String(text),
          source_lang: sourceLang || "en",
          target_lang: String(targetLang),
        });
        const translatedText = result.translated_text || result.translatedText || "";
        return new Response(
          JSON.stringify({ translatedText }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ error: String(e.message || e) }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // POST /transcribe
    if (request.method === "POST" && url.pathname === "/transcribe") {
      try {
        const { audio, sourceLang } = await request.json();
        if (!audio) {
          return new Response(
            JSON.stringify({ error: "Missing audio" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const base64 = audio.includes(",") ? audio.split(",")[1] : audio;
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const result = await env.AI.run("@cf/openai/whisper-large-v3-turbo", {
          audio: [...bytes],
          language: sourceLang === "auto" ? undefined : sourceLang,
        });
        const text = result.text || result.transcript || "";
        return new Response(
          JSON.stringify({ text }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ error: String(e.message || e) }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};
```

---

## Checklist

- [ ] Worker has `POST /translate` (you have this)
- [ ] Worker has `POST /transcribe` (add the code above)
- [ ] Workers AI binding named `AI` is set
- [ ] CORS headers are set for both routes
