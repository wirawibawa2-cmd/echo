// Gemini REST client (browser -> generativelanguage.googleapis.com). Key comes from localStorage only.
export const MODELS = [
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (fastest, free tier)' },
  { id: 'gemini-4-hydrogen',     label: 'Gemini 4 Hydrogen (smartest free)' },
  { id: 'gemini-3.8-flash',      label: 'Gemini 3.8 Flash (free tier)' },
  { id: 'gemini-flash-latest',   label: 'gemini-flash-latest (auto alias)' },
];
export const DEFAULT_MODEL = MODELS[0].id;
// Most permissive thresholds the API allows. Core harms (e.g. child safety) are always blocked by Google regardless.
const CATS = ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'];
const SAFETY_LEVELS = [
  [...CATS, 'HARM_CATEGORY_CIVIC_INTEGRITY'].map(category => ({ category, threshold: 'OFF' })),
  CATS.map(category => ({ category, threshold: 'OFF' })),
  CATS.map(category => ({ category, threshold: 'BLOCK_NONE' })),
  null,                                   // last resort: API defaults (already Off on current models)
];
let safetyIdx = 0;                        // remembers the first level the API accepted
const ENDPOINT = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;

export class GeminiError extends Error { constructor(kind, msg, status) { super(msg); this.kind = kind; this.status = status; } }

export async function askGemini({ key, model, system, history, signal }) {
  const tryModels = [model, ...MODELS.map(m => m.id).filter(id => id !== model)];
  let lastErr;
  for (const m of tryModels) {
    try { return { text: await call(m), model: m }; }
    catch (e) {
      lastErr = e;
      // Only fall through to another model when this one is missing/retired.
      if (!(e.kind === 'model')) throw e;
    }
  }
  throw lastErr;

  async function call(m) {
    for (;;) {
      try { return await callOnce(m, SAFETY_LEVELS[safetyIdx]); }
      catch (e) {
        // an unsupported category/threshold is a 400 – step down to the next accepted safety level
        if (e.kind === 'api' && e.status === 400 && /safety|category|threshold|civic|harm/i.test(e.message) && safetyIdx < SAFETY_LEVELS.length - 1) { safetyIdx++; continue; }
        throw e;
      }
    }
  }

  async function callOnce(m, safety) {
    let res;
    try {
      res = await fetch(ENDPOINT(m), {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: history,
          generationConfig: { maxOutputTokens: 600, temperature: 1.1 },
          ...(safety ? { safetySettings: safety } : {}),
        }),
      });
    } catch (e) {
      if (e.name === 'AbortError') throw new GeminiError('timeout', 'timeout');
      throw new GeminiError('network', e.message);
    }
    let data = null; try { data = await res.json(); } catch {}
    if (!res.ok) {
      const msg = data?.error?.message || res.statusText;
      const reason = JSON.stringify(data?.error?.details || '');
      if (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(reason + msg)) throw new GeminiError('key', msg, 400);
      if (res.status === 401 || res.status === 403) throw new GeminiError('key', msg, res.status);
      if (res.status === 404 || /not found|not supported|retired/i.test(msg)) throw new GeminiError('model', msg, res.status);
      if (res.status === 429) throw new GeminiError('quota', msg, 429);
      throw new GeminiError('api', msg, res.status);
    }
    const cand = data?.candidates?.[0];
    const text = (cand?.content?.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
    if (!text) {
      if (data?.promptFeedback?.blockReason || /SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/.test(cand?.finishReason || '')) throw new GeminiError('blocked', 'blocked');
      throw new GeminiError('empty', 'empty');
    }
    return text;
  }
}
