// Echo voice output: natural Gemini TTS (free tier, user's own key) with an iPhone/device voice fallback.
const TTS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
export const TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts'];
export const GEMINI_VOICES = [
  ['Leda', 'Leda – youthful, cute (female) ★'], ['Zephyr', 'Zephyr – bright'], ['Autonoe', 'Autonoe – bright (female)'],
  ['Laomedeia', 'Laomedeia – upbeat (female)'], ['Achernar', 'Achernar – soft (female)'], ['Aoede', 'Aoede – breezy, warm (female)'],
  ['Kore', 'Kore – calm, firm (female)'], ['Callirrhoe', 'Callirrhoe – easy-going (female)'],
  ['Puck', 'Puck – upbeat (male)'], ['Charon', 'Charon – informative (male)'], ['Orus', 'Orus – firm (male)'],
  ['Iapetus', 'Iapetus – clear (male)'], ['Enceladus', 'Enceladus – breathy, soft'], ['Fenrir', 'Fenrir – excitable'],
];
export const DEFAULT_GEMINI_VOICE = 'Leda';
// Short constant style string (per Google's TTS prompting guide): cute but natural, never robotic or chipmunk.
const STYLE = 'playful, warm and teasing, a little sultry and flirty, smiling while talking; natural, not robotic';

// Novelty / old robotic voices on Apple & others – never auto-pick these.
const ROBOTIC = /(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|eloquence|espeak)/i;

export function detectLang(text, fallback) {
  const id = (text.match(/\b(aku|kamu|yang|dan|ini|itu|apa|tidak|nggak|bisa|untuk|dengan|ada|saya|halo|terima|kasih|sudah|lagi|ya|juga|mau|cuaca|hari)\b/gi) || []).length;
  const en = (text.match(/\b(the|and|you|is|are|what|this|that|with|for|have|can|your|i'm|it's|to)\b/gi) || []).length;
  if (id > en) return 'id';
  if (en > id) return 'en';
  return fallback;
}

export function scoreVoice(v, lang) {
  const l = (v.lang || '').toLowerCase().replace('_', '-');
  if (!l.startsWith(lang)) return -1;
  const n = `${v.name} ${v.voiceURI || ''}`;
  if (ROBOTIC.test(n)) return 0;
  let s = 10;
  if (/premium/i.test(n)) s += 50;
  if (/enhanced|neural|natural|siri/i.test(n)) s += 35;
  if (/google/i.test(n)) s += 15;                     // Chrome's Google voices are decent
  if (/compact/i.test(n)) s -= 8;
  if (lang === 'en') {
    if (/\b(zoe|nicky|ava|samantha)\b/i.test(n)) s += 14;          // young, bright voices first
    else if (/\b(joelle|noelle|allison|susan|karen|tessa|moira)\b/i.test(n)) s += 9;
    else if (/\b(evan|nathan|tom|daniel|alex|fred)\b/i.test(n)) s += 2;
    if (/\b(zoe|nicky)\b/i.test(n)) s += 4;
    if (l === 'en-us') s += 4; else if (l === 'en-gb' || l === 'en-au') s += 2;
  }
  if (lang === 'id' && /damayanti/i.test(n)) s += 12;
  if (v.localService) s += 1;
  return s;
}

function cleanForSpeech(s) {
  return s.replace(/https?:\/\/\S+/g, '').replace(/[*_#`>~]/g, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
}
function sentences(s) { return (s.match(/[^.!?…]+[.!?…]*\s*/g) || [s]).map(x => x.trim()).filter(Boolean); }

export class Voice {
  constructor({ getKey, getPrefs, onLevel, onStart, onEnd }) {
    Object.assign(this, { getKey, getPrefs, onLevel, onStart, onEnd });
    this.synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.voices = [];
    this.ctx = null; this.analyser = null; this.source = null;
    this.unlocked = false; this.speaking = false; this.token = 0; this.ttsFailUntil = 0;
    if (this.synth) {
      const load = () => { this.voices = this.synth.getVoices(); };
      load(); this.synth.addEventListener?.('voiceschanged', load);
    }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}   // iOS: play even with the silent switch on
  }

  // Must be called inside a user gesture (tap) – unlocks Web Audio and speechSynthesis on iOS.
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        this.ctx = new AC();
        const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource();
        s.buffer = b; s.connect(this.ctx.destination); s.start(0);
        this.ctx.resume?.();
        this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 512; this.analyser.connect(this.ctx.destination);
        this._buf = new Uint8Array(this.analyser.fftSize);
      }
    } catch {}
    try { if (this.synth) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; this.synth.speak(u); } } catch {}
  }

  // Human-readable name of the voice that will be / was used.
  describe(lang) {
    if (this.lastUsed) return this.lastUsed;
    const p = this.getPrefs();
    if (p.engine !== 'device' && this.getKey() && Date.now() > this.ttsFailUntil) return `Gemini ${p.geminiVoice || DEFAULT_GEMINI_VOICE}`;
    const v = this.bestDeviceVoice(lang);
    const dev = /iPhone|iPad|Macintosh/.test(navigator.userAgent) ? 'iPhone' : 'Device';
    return v ? `${dev} – ${v.name}${p.engine !== 'device' && !this.getKey() ? ' (add a Gemini key for the AI voice)' : ''}` : `${dev} default voice`;
  }

  bestDeviceVoice(lang) {
    if (this.synth && !this.voices.length) this.voices = this.synth.getVoices();
    const pref = this.getPrefs().deviceVoice;
    if (pref) { const v = this.voices.find(v => v.voiceURI === pref || v.name === pref); if (v && (v.lang || '').toLowerCase().startsWith(lang)) return v; }
    let best = null, bs = -1;
    for (const v of this.voices) { const s = scoreVoice(v, lang); if (s > bs) { bs = s; best = v; } }
    return bs > 0 ? best : null;
  }

  listDeviceVoices() {
    return this.voices.filter(v => /^(en|id)/i.test(v.lang || ''))
      .map(v => ({ v, s: Math.max(scoreVoice(v, 'en'), scoreVoice(v, 'id')) }))
      .sort((a, b) => b.s - a.s).map(x => x.v);
  }

  level() {
    if (!this.analyser || !this.source) return 0;
    this.analyser.getByteTimeDomainData(this._buf);
    let sum = 0; for (let i = 0; i < this._buf.length; i++) { const d = (this._buf[i] - 128) / 128; sum += d * d; }
    return Math.min(1, Math.sqrt(sum / this._buf.length) * 4);
  }

  stop() {
    this.token++;
    try { this.source?.stop(); } catch {}
    this.source = null;
    try { this.synth?.cancel(); } catch {}
    this._finish(true);
  }

  _finish(silent) { if (this.speaking) { this.speaking = false; if (!silent) this.onEnd?.(); else this.onEnd?.(); } }

  async speak(text, uiLang, opts = {}) {
    this.stop();
    const tok = ++this.token;
    const clean = cleanForSpeech(text);
    if (!clean) return;
    const lang = detectLang(clean, uiLang);
    const prefs = this.getPrefs();
    const useGemini = !opts.device && prefs.engine !== 'device' && this.getKey() && this.ctx && Date.now() > this.ttsFailUntil;
    this.speaking = true; this.onStart?.();
    if (useGemini) {
      try { await this._speakGemini(clean, tok, prefs); this.lastUsed = `Gemini ${prefs.geminiVoice || DEFAULT_GEMINI_VOICE}`; return; }
      catch (e) {
        if (tok !== this.token) return;
        console.warn('Gemini TTS unavailable, using device voice:', e.message || e);
        if (e.status === 429 || e.status === 403 || e.status === 404) this.ttsFailUntil = Date.now() + 5 * 60 * 1000;
      }
    }
    if (tok !== this.token) return;
    await this._speakDevice(clean, lang, tok);
  }

  async _speakGemini(text, tok, prefs) {
    const key = this.getKey();
    let lastErr;
    for (const model of [prefs.ttsModel || TTS_MODELS[0], ...TTS_MODELS.filter(m => m !== prefs.ttsModel)]) {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 20000);
      let res;
      try {
        res = await fetch(TTS_ENDPOINT, {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            model,
            input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style: STYLE }] }] }],
            response_format: { type: 'audio', mime_type: 'audio/wav' },
            generation_config: { speech_config: [{ voice: prefs.geminiVoice || DEFAULT_GEMINI_VOICE }] },
          }),
        });
      } finally { clearTimeout(to); }
      if (tok !== this.token) return;
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const err = new Error(`TTS ${res.status}`); err.status = res.status; lastErr = err;
        if (/API_KEY_INVALID|API key not valid/i.test(body)) throw err;   // bad key: don't retry
        if (res.status === 404 || res.status === 400) continue;    // model unavailable: try the other TTS model
        throw err;
      }
      const data = await res.json();
      const steps = Array.isArray(data) ? data.flatMap(d => d.steps || []) : (data.steps || []);
      const audio = steps.filter(s => s.type === 'model_output').flatMap(s => s.content || []).filter(c => c.type === 'audio').pop();
      if (!audio?.data) { lastErr = new Error('no audio'); continue; }
      const bytes = Uint8Array.from(atob(audio.data), c => c.charCodeAt(0));
      const buf = await this.ctx.decodeAudioData(bytes.buffer.slice(0));
      if (tok !== this.token) return;
      await this.ctx.resume?.();
      await new Promise((resolve) => {
        const src = this.ctx.createBufferSource(); src.buffer = buf; src.connect(this.analyser);
        src.onended = () => { if (this.source === src) this.source = null; resolve(); };
        this.source = src; src.start(0);
      });
      if (tok === this.token) this._finish();
      return;
    }
    throw lastErr || new Error('TTS failed');
  }

  _speakDevice(text, lang, tok) {
    return new Promise((resolve) => {
      if (!this.synth) { setTimeout(() => { if (tok === this.token) this._finish(); resolve(); }, Math.min(4000, 600 + text.length * 35)); return; }
      const v = this.bestDeviceVoice(lang);
      this.lastUsed = `${/iPhone|iPad|Macintosh/.test(navigator.userAgent) ? 'iPhone' : 'Device'} – ${v ? v.name : 'default voice'}`;
      const parts = sentences(text);
      let i = 0;
      const next = () => {
        if (tok !== this.token) return resolve();
        if (i >= parts.length) { this._finish(); return resolve(); }
        const u = new SpeechSynthesisUtterance(parts[i++]);
        u.lang = v?.lang || (lang === 'id' ? 'id-ID' : 'en-US');
        if (v) u.voice = v;
        u.rate = 1.05; u.pitch = 1.18;                     // a touch brighter/cuter, still natural (no chipmunk)
        u.onboundary = () => this.onLevel?.(1);
        let done = false; const fin = () => { if (!done) { done = true; clearTimeout(guard); setTimeout(next, 120); } };
        u.onend = fin; u.onerror = fin;
        const guard = setTimeout(fin, 2500 + u.text.length * 110);   // iOS sometimes skips onend
        this.synth.speak(u);
      };
      next();
    });
  }
}
