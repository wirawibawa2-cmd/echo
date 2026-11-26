// Echo voice output (v7): free on-device Kokoro "Heart" voice first, then Gemini TTS (user's own key), then the iPhone voice.
import { KOKORO_MODELS, DEFAULT_KOKORO_MODEL, KOKORO_VOICES, DEFAULT_KOKORO_VOICE, KOKORO_CACHE, KOKORO_HF } from './kokoro-config.js?v=7.1';
export { KOKORO_MODELS, DEFAULT_KOKORO_MODEL, KOKORO_VOICES, DEFAULT_KOKORO_VOICE };
import { textToPhonemes, VOCAB } from './kokoro-phonemize.js?v=7.1';
const kTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000}s`)), ms))]);
// memory-friendly chunking: sentences, long ones split at commas (activation RAM grows with length)
function kChunks(text, max = 140) {
  const out = [];
  for (const s of (text.match(/[^.!?…]+[.!?…]*["')\]]*\s*/g) || [text]).map(x => x.trim()).filter(Boolean)) {
    if (s.length <= max) { out.push(s); continue; }
    let cur = '';
    for (const p of s.split(/(?<=[,;:—])\s+/)) { if ((cur + ' ' + p).trim().length > max && cur) { out.push(cur.trim()); cur = p; } else cur = (cur + ' ' + p).trim(); }
    while (cur.length > max) { const sp = cur.lastIndexOf(' ', max), cut = sp > 40 ? sp : max; out.push(cur.slice(0, cut).trim()); cur = cur.slice(cut).trim(); }
    if (cur) out.push(cur);
  }
  return out;
}
async function kIds(text) {
  const ph = await kTimeout(textToPhonemes(text, 'a'), 8000, 'phonemizer');
  const ids = [0]; for (const ch of ph) { const id = VOCAB[ch]; if (id !== undefined) ids.push(id); } ids.push(0);
  if (ids.length > 510) { ids.length = 509; ids.push(0); }
  return ids;
}
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
const STYLE = 'American English; playful, warm and teasing, a little sultry and flirty, smiling while talking; natural, not robotic';

// Novelty / old robotic voices on Apple & others – never auto-pick these.
const ROBOTIC = /(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|eloquence|espeak)/i;

export function detectLang() { return 'en'; }   // v6: Echo is English-only

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
  if (lang === 'en' && l !== 'en-us') s -= 6;   // v6: prefer US English
  if (v.localService) s += 1;
  return s;
}

function cleanForSpeech(s) {
  return s.replace(/https?:\/\/\S+/g, '').replace(/[*_#`>~]/g, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
}
function sentences(s) { return (s.match(/[^.!?…]+[.!?…]*\s*/g) || [s]).map(x => x.trim()).filter(Boolean); }

const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const DEV = IOS ? 'iPhone' : 'Device';
const STANDALONE = (() => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } })();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([Promise.resolve(p).catch(() => {}), sleep(ms)]);

// 16-bit PCM WAV (or raw L16 @24 kHz) -> mono Float32 samples. Done by hand: decodeAudioData is flaky on iOS.
export function decodePCM(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let rate = 24000, ch = 1, off = 0, len = bytes.byteLength;
  if (bytes.byteLength > 12 && dv.getUint32(0, false) === 0x52494646 /* RIFF */) {
    let p = 12; off = -1;
    while (p + 8 <= bytes.byteLength) {
      const id = dv.getUint32(p, false), sz = dv.getUint32(p + 4, true);
      if (id === 0x666d7420 /* fmt  */) { ch = dv.getUint16(p + 10, true); rate = dv.getUint32(p + 12, true); }
      if (id === 0x64617461 /* data */) { off = p + 8; len = Math.min(sz, bytes.byteLength - off); break; }
      p += 8 + sz + (sz & 1);
    }
    if (off < 0) throw new Error('bad WAV');
  }
  const n = Math.floor(len / 2 / ch), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(off + i * 2 * ch, true) / 32768;
  return { samples: out, rate };
}
function wavBlob(samples, rate) {
  const b = new ArrayBuffer(44 + samples.length * 2), v = new DataView(b);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Blob([b], { type: 'audio/wav' });
}
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

// ---- Kokoro client: owns the worker, download progress and crash breadcrumbs ----
const CRUMB = 'echo.kokoro.crumb';
export class Kokoro {
  constructor(onChange) { this.onChange = onChange || (() => {}); this.worker = null; this.state = 'idle'; this.progress = [0, 0]; this.error = ''; this.device = ''; this.key = ''; this.cached = false; this.jobs = new Map(); }
  get ready() { return this.state === 'ready' && !this.phonErr; }
  get pct() { const [l, t] = this.progress; return t ? Math.min(100, Math.round(l / t * 100)) : 0; }
  crumb(stage) { try { localStorage.setItem(CRUMB, JSON.stringify({ stage, key: this.key, t: Date.now() })); } catch {} }
  clearCrumb() { try { localStorage.removeItem(CRUMB); } catch {} }
  static lastCrash() { try { const c = JSON.parse(localStorage.getItem(CRUMB) || 'null'); localStorage.removeItem(CRUMB); return c && Date.now() - c.t < 30 * 60e3 ? c : null; } catch { return null; } }
  static async isCached(modelId) { try { const m = KOKORO_MODELS.find(x => x.id === modelId); const c = await caches.open(KOKORO_CACHE); return !!(await c.match(KOKORO_HF + m.file)); } catch { return false; } }
  static async clearCache() { try { await caches.delete(KOKORO_CACHE); } catch {} }
  // (re)load if the model/engine/optimization changed; terminating the old worker frees all its memory
  load({ model = DEFAULT_KOKORO_MODEL, device = 'auto', opt = 'disabled' } = {}) {
    const key = `${model}|${device}|${opt}`;
    if (this.worker && this.key === key && this.state !== 'error') return;
    this.terminate();
    const m = KOKORO_MODELS.find(x => x.id === model) || KOKORO_MODELS[0];
    this.key = key; this.model = m; this.state = 'loading'; this.stage = 'download'; this.error = ''; this.progress = [0, m.mb * 1e6]; this.cached = false;
    try { this.worker = new Worker(new URL('./kokoro-worker.js?v=7.1', import.meta.url), { type: 'module' }); }
    catch (e) { this.state = 'error'; this.error = 'workers not supported: ' + (e.message || e); this.onChange(); return; }
    this.worker.onerror = (e) => { this.state = 'error'; this.error = 'voice engine failed to start' + (e.message ? ': ' + e.message : ''); this.clearCrumb(); this.onChange(); this._failJobs(this.error); };
    this.worker.onmessage = ({ data: d }) => {
      if (d.type === 'stage') { this.stage = d.stage; this.stageMsg = d.msg; this.crumb(d.stage); }
      else if (d.type === 'progress') this.progress = [d.loaded, d.total || this.progress[1]];
      else if (d.type === 'cached') { this.cached = true; this.progress = [1, 1]; }
      else if (d.type === 'ready') { this.state = 'ready'; this.device = d.device; if (d.ms) this.loadMs = d.ms; this.clearCrumb(); }
      else if (d.type === 'error') {
        if (d.where === 'load') { this.state = 'error'; this.error = `${this.stage}: ${d.error}`; this.clearCrumb(); this._failJobs(this.error); }
        else { const j = this.jobs.get(d.id); this.clearCrumb(); if (j) { this.jobs.delete(d.id); j.reject(new Error(d.error)); } }
      } else if (d.type === 'chunk') { const j = this.jobs.get(d.id); if (j) j.onChunk(d); }
      else if (d.type === 'done') { const j = this.jobs.get(d.id); this.clearCrumb(); if (j) { this.jobs.delete(d.id); j.resolve(); } }
      this.onChange(d);
    };
    this.crumb('download');
    this.worker.postMessage({ type: 'load', file: m.file, device, opt });
    if (!this.phonReady) { const t0 = performance.now(); kIds('Hi there.').then(() => { this.phonReady = true; this.phonMs = Math.round(performance.now() - t0); }).catch(e => { this.phonErr = String(e.message || e); }); }
    this.onChange();
  }
  _failJobs(msg) { for (const [id, j] of this.jobs) j.reject(new Error(msg)); this.jobs.clear(); }
  terminate() { try { this.worker?.terminate(); } catch {} this.worker = null; this._failJobs('voice reloaded'); if (this.state !== 'error') this.state = 'idle'; this.clearCrumb(); }
  stop() { this.worker?.postMessage({ type: 'stop' }); this._failJobs('stopped'); }
  // returns a promise; onChunk({pcm, rate, i, n, ms}) is called for each sentence as soon as it is ready
  async speak(text, voice, onChunk) {
    if (!this.ready) throw new Error('voice not ready');
    const items = [];
    for (const part of kChunks(text)) items.push(await kIds(part));   // main thread: fast (ms per sentence once warm)
    const id = Math.random().toString(36).slice(2);
    return new Promise((resolve, reject) => {
      this.jobs.set(id, { resolve, reject, onChunk });
      this.crumb('generate');
      this.worker.postMessage({ type: 'speak', id, items, voice: voice || DEFAULT_KOKORO_VOICE, speed: 1 });
    });
  }
  label() {
    const v = this.model ? this.model.id : DEFAULT_KOKORO_MODEL;
    return `${v} · ${this.device === 'webgpu' ? 'WebGPU' : 'WASM'}`;
  }
}

export class Voice {
  constructor({ getKey, getPrefs, onLevel, onStart, onEnd, onStatus }) {
    Object.assign(this, { getKey, getPrefs, onLevel, onStart, onEnd, onStatus });
    this.synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.voices = [];
    this.ctx = null; this.analyser = null; this.source = null; this.el = null;
    this.unlocked = false; this.synthPrimed = false; this.speaking = false; this.token = 0; this.ttsFailUntil = 0;
    this.lastUsed = ''; this.lastReason = ''; this._utts = [];
    this.standalone = STANDALONE;
    this.kokoro = new Kokoro((d) => { if (!d || d.type !== 'chunk') this.onStatus?.(); this.onKokoro?.(d); });
    if (this.synth) {
      const load = () => { const v = this.synth.getVoices(); if (v.length) this.voices = v; };
      load(); this.synth.addEventListener?.('voiceschanged', load);
      if ('onvoiceschanged' in this.synth && !this.synth.onvoiceschanged) this.synth.onvoiceschanged = load;
    }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}   // iOS: play even with the silent switch on
  }

  // Call from EVERY user gesture (touchend/click/keydown). iOS only unlocks audio inside a real gesture,
  // and a context can fall back to "suspended"/"interrupted" later (app switch, call, Siri), so re-resume each time.
  unlock() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC && !this.ctx) {
        this.ctx = new AC();
        this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 512; this.analyser.connect(this.ctx.destination);
        this._buf = new Uint8Array(this.analyser.fftSize);
        this.ctx.onstatechange = () => this.onStatus?.();
      }
      if (this.ctx && this.ctx.state !== 'running') {
        this.ctx.resume?.();
        const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource();
        s.buffer = b; s.connect(this.ctx.destination); s.start(0);
      }
    } catch (e) { this.lastReason = 'audio unlock failed: ' + (e.message || e); }
    try {   // a primed <audio> element is the second route for the AI voice if Web Audio stays locked
      if (!this.el) { this.el = new Audio(); this.el.setAttribute('playsinline', ''); this.el.preload = 'auto'; }
      if (!this.unlocked) { this.el.src = SILENT_WAV; const pr = this.el.play(); pr?.catch?.(() => {}); }
    } catch {}
    try {   // speechSynthesis must speak once inside a gesture on iOS; a whitespace-only utterance can be ignored
      if (this.synth && !this.speaking && !(this.synth.speaking || this.synth.pending) && Date.now() - (this._primeT || 0) > 1500) {
        this.synthPrimed = true; this._primeT = Date.now();
        const u = new SpeechSynthesisUtterance('.'); u.volume = 0; u.rate = 2; this._utts.push(u); this.synth.speak(u);
      }
    } catch {}
    this.unlocked = true;
  }

  audioState() { return this.ctx ? this.ctx.state : 'none'; }

  // Human-readable "Using: …" text: the voice actually used (or about to be) and why the backup voice is used.
  describe(lang) {
    const p = this.getPrefs(), key = this.getKey();
    if (this.lastUsed) return this.lastUsed;
    const order = this._order(p);
    for (const e of order) {
      if (e === 'kokoro' && this.kokoro.ready) return this._kLabel(p);
      if (e === 'gemini' && key && Date.now() > this.ttsFailUntil) return `Gemini ${p.geminiVoice || DEFAULT_GEMINI_VOICE} (AI voice)` + (order[0] === 'kokoro' ? ' · ' + this._kWhy() : '');
    }
    return this._backupLabel(lang, this._reason(key, p));
  }
  _order(p) { return p.engine === 'device' ? ['device'] : p.engine === 'gemini' ? ['gemini', 'kokoro', 'device'] : ['kokoro', 'gemini', 'device']; }
  _kName(p) { const id = p.kokoroVoice || DEFAULT_KOKORO_VOICE; return (KOKORO_VOICES.find(v => v[0] === id)?.[1] || id).split(' –')[0]; }
  _kLabel(p) { return `${this._kName(p)} – free voice on this phone (Kokoro · ${this.kokoro.label()})`; }
  _kWhy() {
    const k = this.kokoro;
    if (k.state === 'loading') return k.stage === 'download' && !k.cached ? `Heart voice downloading ${k.pct}% (one time)` : `Heart voice starting (${k.stage})`;
    if (k.state === 'error') return `Heart voice failed – ${k.error}`;
    if (k.phonErr) return `Heart voice text engine failed – ${k.phonErr}`;
    if (k.lastErr) return `Heart voice error – ${k.lastErr}`;
    return 'Heart voice not loaded';
  }
  _reason(key, p) {
    if (p.engine === 'device') return 'you picked the iPhone voice';
    const kw = p.engine === 'kokoro' ? this._kWhy() + '; ' : '';
    if (!key) return kw + (this.standalone ? 'no Gemini key in this home-screen app (it has its own storage – paste the key in ⚙️ here)' : 'no Gemini key – paste it in ⚙️');
    if (Date.now() < this.ttsFailUntil && this.lastReason) return kw + this.lastReason + ' (retrying in a few min)';
    return kw + (this.lastReason || 'Gemini voice unavailable');
  }
  _backupLabel(lang, reason) {
    const v = this.bestDeviceVoice(lang);
    return `${DEV} backup voice${v ? ' – ' + v.name : ''} · reason: ${reason}`;
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
    return this.voices.filter(v => /^en/i.test(v.lang || ''))
      .map(v => ({ v, s: scoreVoice(v, 'en') }))
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
    try { this.kokoro.stop(); } catch {}
    for (const src of this._ksrcs || []) { try { src.stop(); } catch {} }
    this._ksrcs = [];
    try { this.source?.stop(); } catch {}
    this.source = null;
    try { if (this.el && !this.el.paused) this.el.pause(); } catch {}
    try { if (this.synth && (this.synth.speaking || this.synth.pending)) this.synth.cancel(); } catch {}
    this._finish(true);
  }

  _finish() { if (this.speaking) { this.speaking = false; this.onEnd?.(); } this.onStatus?.(); }

  async speak(text, uiLang, opts = {}) {
    this.stop();
    const tok = ++this.token;
    const clean = cleanForSpeech(text);
    if (!clean) return;
    const lang = detectLang(clean, uiLang);
    const prefs = this.getPrefs(), key = this.getKey();
    this.speaking = true; this.onStart?.();
    let order = this._order(prefs);
    if (opts.device) order = this.kokoro.ready && prefs.engine !== 'device' ? ['kokoro', 'device'] : ['device'];   // short tap lines: never wait for a download or call the API
    for (const eng of order) {
      if (tok !== this.token) return;
      if (eng === 'kokoro') {
        if (!this.kokoro.ready) { if (this.kokoro.state === 'idle' && prefs.engine === 'kokoro') this.kokoro.load(prefs.kokoro); continue; }
        try {
          this.lastUsed = this._kLabel(prefs); this.onStatus?.();
          await this._speakKokoro(clean, tok, prefs);
          this.kokoro.lastErr = ''; if (tok === this.token) this.lastUsed = this._kLabel(prefs);
          if (tok === this.token) this._finish();
          return;
        } catch (e) {
          if (tok !== this.token || /stopped|reloaded/.test(e.message)) return;
          this.kokoro.lastErr = String(e.message || e).slice(0, 90);
          console.warn('Kokoro voice failed, falling back:', this.kokoro.lastErr);
          continue;
        }
      }
      if (eng === 'gemini') {
        if (!key || Date.now() < this.ttsFailUntil) continue;
        try { await this._speakGemini(clean, tok, prefs); if (tok === this.token || !this.speaking) { this.lastUsed = `Gemini ${prefs.geminiVoice || DEFAULT_GEMINI_VOICE} (AI voice)` + (order[0] === 'kokoro' ? ' · ' + this._kWhy() : ''); this.lastReason = ''; this.onStatus?.(); } return; }
        catch (e) {
          if (tok !== this.token) return;
          this.lastReason = e.reason || ('Gemini voice error: ' + (e.message || e));
          console.warn('Gemini TTS unavailable, falling back:', this.lastReason);
          if (e.status === 429 || e.status === 403 || e.status === 404 || e.status === 400) this.ttsFailUntil = Date.now() + 3 * 60 * 1000;
          continue;
        }
      }
      if (eng === 'device') {
        const reason = opts.device && prefs.engine !== 'device' ? 'short tap line (Heart voice not ready yet)' : this._reason(key, prefs);
        await this._speakDevice(clean, lang, tok, reason);
        return;
      }
    }
  }

  // Kokoro: sentences arrive from the worker one by one; "stream" plays each as soon as it is ready,
  // "gapless" waits for the whole reply. Audio goes through the same gesture-unlocked context (+ analyser for the ghost).
  async _speakKokoro(text, tok, prefs) {
    const gapless = prefs.kokoroMode === 'gapless', held = [];
    let chain = Promise.resolve(), firstErr = null;
    this._ksrcs = [];
    const play = (pcm, rate) => { chain = chain.then(() => tok === this.token ? this._playSeg(pcm, rate, tok) : null).catch(e => { firstErr = firstErr || e; }); };
    let wd = null, rejectWd = null;
    const arm = (ms) => { clearTimeout(wd); wd = setTimeout(() => { this.kokoro.stop(); rejectWd?.(new Error(`too slow on this phone (no audio after ${ms / 1000}s)`)); }, ms); };
    const watchdog = new Promise((_, rej) => { rejectWd = rej; });
    arm(9000);
    try {
      await Promise.race([watchdog, this.kokoro.speak(text, prefs.kokoroVoice, (c) => {
        if (tok !== this.token) return;
        arm(20000);
        if (gapless) held.push(c); else play(c.pcm, c.rate);
      })]);
    } finally { clearTimeout(wd); }
    if (gapless) for (const c of held) play(c.pcm, c.rate);
    await chain;
    if (firstErr) throw firstErr;
  }
  _playSeg(samples, rate, tok) {
    const dur = samples.length / rate;
    const viaCtx = async () => {
      if (this.ctx && this.ctx.state !== 'running') await withTimeout(this.ctx.resume?.(), 800);
      if (!(this.ctx && this.ctx.state === 'running')) return false;
      const buf = this.ctx.createBuffer(1, samples.length, rate); buf.getChannelData(0).set(samples);
      await new Promise((resolve) => {
        const src = this.ctx.createBufferSource(); src.buffer = buf; src.connect(this.analyser);
        let done = false; const end = () => { if (done) return; done = true; clearTimeout(guard); if (this.source === src) this.source = null; resolve(); };
        src.onended = end; const guard = setTimeout(end, dur * 1000 + 1500);
        this.source = src; this._ksrcs.push(src); src.start(0);
      });
      return true;
    };
    return viaCtx().then(async (ok) => {
      if (ok || tok !== this.token) return;
      if (!this.el) { const er = new Error('no audio output'); throw er; }
      const url = URL.createObjectURL(wavBlob(samples, rate));
      try {
        this.el.src = url; await this.el.play();
        await new Promise((resolve) => { let done = false; const end = () => { if (done) return; done = true; clearTimeout(guard); resolve(); }; this.el.onended = end; this.el.onerror = end; this.el.onpause = end; const guard = setTimeout(end, dur * 1000 + 1500); });
      } catch (e) { throw new Error('audio still locked – tap the screen once'); }
      finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
    });
  }

  async _speakGemini(text, tok, prefs) {
    const key = this.getKey();
    let lastErr;
    const fail = (msg, status, reason) => { const e = new Error(msg); e.status = status; e.reason = reason || msg; return e; };
    for (const model of [prefs.ttsModel || TTS_MODELS[0], ...TTS_MODELS.filter(m => m !== (prefs.ttsModel || TTS_MODELS[0]))]) {
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
      } catch (e) { clearTimeout(to); lastErr = fail(e.name === 'AbortError' ? 'timeout' : 'network', 0, e.name === 'AbortError' ? 'Gemini voice timed out' : 'no connection to Gemini voice'); continue; }
      clearTimeout(to);
      if (tok !== this.token) return;
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let msg = ''; try { msg = JSON.parse(body)?.error?.message || ''; } catch {}
        const st = res.status;
        const why = /API_KEY_INVALID|API key not valid/i.test(body) ? 'Gemini key rejected' : st === 429 ? 'Gemini voice quota hit (429)' : st === 403 ? 'Gemini voice not allowed for this key (403)' : st === 404 ? `TTS model ${model} not found (404)` : `Gemini voice error ${st}${msg ? ': ' + msg.slice(0, 80) : ''}`;
        lastErr = fail(`TTS ${st}`, st, why);
        if (/API_KEY_INVALID|API key not valid/i.test(body) || st === 429 || st === 403) throw lastErr;   // other model won't help
        continue;
      }
      const data = await res.json().catch(() => null);
      const steps = Array.isArray(data) ? data.flatMap(d => d.steps || []) : (data?.steps || []);
      // audio lives in steps[].content[].data (base64); don't depend on the exact step type name
      const parts = [...steps.flatMap(s => s.content || []), ...(data?.output_audio ? [data.output_audio] : []), ...(data?.outputs || [])];
      const audio = parts.filter(c => c && c.data && (c.type === 'audio' || /audio/.test(c.mime_type || c.mimeType || ''))).pop();
      if (!audio) { lastErr = fail('no audio', 0, 'Gemini voice returned no audio'); continue; }
      const bin = atob(audio.data), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const { samples, rate } = decodePCM(bytes);
      if (!samples.length) { lastErr = fail('empty audio', 0, 'Gemini voice returned empty audio'); continue; }
      if (tok !== this.token) return;
      await this._play(samples, rate, tok);
      return;
    }
    throw lastErr || fail('TTS failed', 0, 'Gemini voice failed');
  }

  // Play through the gesture-unlocked AudioContext; if iOS keeps it suspended, use the primed <audio> element.
  async _play(samples, rate, tok) {
    const dur = samples.length / rate;
    if (this.ctx && this.ctx.state !== 'running') await withTimeout(this.ctx.resume?.(), 800);
    if (this.ctx && this.ctx.state === 'running') {
      const buf = this.ctx.createBuffer(1, samples.length, rate);
      buf.getChannelData(0).set(samples);
      return new Promise((resolve) => {
        const src = this.ctx.createBufferSource(); src.buffer = buf; src.connect(this.analyser);
        let done = false; const end = () => { if (done) return; done = true; clearTimeout(guard); if (this.source === src) this.source = null; if (tok === this.token) this._finish(); resolve(); };
        src.onended = end; const guard = setTimeout(end, dur * 1000 + 1500);   // never hang if onended is lost
        this.source = src; src.start(0);
      });
    }
    if (this.el) {
      const url = URL.createObjectURL(wavBlob(samples, rate));
      try {
        this.el.src = url;
        await this.el.play();
        await new Promise((resolve) => {
          let done = false; const end = () => { if (done) return; done = true; clearTimeout(guard); resolve(); };
          this.el.onended = end; this.el.onerror = end; this.el.onpause = end; const guard = setTimeout(end, dur * 1000 + 1500);
        });
        if (tok === this.token) this._finish();
        return;
      } catch (e) { const er = new Error('locked'); er.reason = 'audio still locked – tap the screen once, then try again'; throw er; }
      finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
    }
    const er = new Error('no audio'); er.reason = 'no audio output available'; throw er;
  }

  async _waitVoices(ms) {
    if (!this.synth || this.voices.length) return;
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const v = this.synth.getVoices(); if (v.length) { this.voices = v; return; } await sleep(100); }
  }

  async _speakDevice(text, lang, tok, reason) {
    if (!this.synth) { this.lastUsed = `No speech engine in this browser`; await sleep(Math.min(4000, 600 + text.length * 35)); if (tok === this.token) this._finish(); return; }
    await this._waitVoices(1200);
    if (tok !== this.token) return;
    const v = this.bestDeviceVoice(lang);
    this.lastUsed = `${DEV} backup voice${v ? ' – ' + v.name : ''} · reason: ${reason}`;
    this.onStatus?.();
    try { if (this.synth.speaking || this.synth.pending) { this.synth.cancel(); await sleep(80); } } catch {}   // iOS drops a speak() right after cancel()
    try { this.synth.resume?.(); } catch {}
    const parts = sentences(text);
    await new Promise((resolve) => {
      let i = 0;
      const next = () => {
        if (tok !== this.token) return resolve();
        if (i >= parts.length) { this._finish(); return resolve(); }
        const u = new SpeechSynthesisUtterance(parts[i++]);
        u.lang = v?.lang || 'en-US';
        if (v) u.voice = v;
        u.rate = 1.05; u.pitch = 1.18; u.volume = 1;
        this._utts.push(u); if (this._utts.length > 8) this._utts.shift();   // keep refs: iOS GC can drop onend
        let started = false;
        u.onstart = () => { started = true; };
        u.onboundary = () => this.onLevel?.(1);
        let done = false; const fin = (ev) => {
          if (done) return; done = true; clearTimeout(guard); clearTimeout(kick);
          if (ev && ev.type === 'error' && ev.error && !/interrupted|canceled/.test(ev.error) && !this.lastUsed.includes('speech error')) { this.lastUsed += ` (speech error: ${ev.error})`; this.onStatus?.(); }
          setTimeout(next, 120);
        };
        u.onend = fin; u.onerror = fin;
        const guard = setTimeout(fin, 2500 + u.text.length * 110);   // iOS sometimes skips onend
        const kick = setTimeout(() => { if (!started && tok === this.token) { try { this.synth.resume?.(); } catch {} } }, 1200);
        this.synth.speak(u);
      };
      next();
    });
  }
}
