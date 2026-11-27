// Echo voice output (v7): free on-device Kokoro "Heart" voice first, then Gemini TTS (user's own key), then the iPhone voice.
import { KOKORO_MODELS, DEFAULT_KOKORO_MODEL, KOKORO_VOICES, DEFAULT_KOKORO_VOICE, KOKORO_CACHE, KOKORO_HF } from './kokoro-config.js?v=85';
export { KOKORO_MODELS, DEFAULT_KOKORO_MODEL, KOKORO_VOICES, DEFAULT_KOKORO_VOICE };
import { Heart, chunks as heartChunks } from './heart-engine.js?v=85';
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
// v7.2: no worker – the exact heart.html engine (heart-engine.js) on the main thread.
export const dbg = (s) => { try { (window.__echoLog = window.__echoLog || []).push(`${(performance.now() / 1000).toFixed(1)}s ${s}`); window.__echoDbg?.(s); } catch {} };
export class Kokoro {
  constructor(onChange) { this.onChange = onChange || (() => {}); this.heart = null; this.state = 'idle'; this.progress = [0, 0]; this.error = ''; this.device = ''; this.key = ''; this.cached = false; this.job = 0; }
  get ready() { return this.state === 'ready'; }
  get pct() { const [l, t] = this.progress; return t ? Math.min(100, Math.round(l / t * 100)) : 0; }
  crumb(stage) { try { localStorage.setItem(CRUMB, JSON.stringify({ stage, key: this.key, t: Date.now() })); } catch {} }
  clearCrumb() { try { localStorage.removeItem(CRUMB); } catch {} }
  static lastCrash() { try { const c = JSON.parse(localStorage.getItem(CRUMB) || 'null'); localStorage.removeItem(CRUMB); return c && Date.now() - c.t < 30 * 60e3 ? c : null; } catch { return null; } }
  static async isCached(modelId) { try { const m = KOKORO_MODELS.find(x => x.id === modelId); const c = await caches.open(KOKORO_CACHE); return !!(await c.match(KOKORO_HF + m.file)); } catch { return false; } }
  static async clearCache() { try { await caches.delete(KOKORO_CACHE); } catch {} }
  load({ model = DEFAULT_KOKORO_MODEL, device = 'auto', opt = 'disabled' } = {}) {
    const key = `${model}|${device}|${opt}`;
    if (this.heart && this.key === key && this.state !== 'error') return;
    this.terminate();
    const m = KOKORO_MODELS.find(x => x.id === model) || KOKORO_MODELS[0];
    this.key = key; this.model = m; this.state = 'loading'; this.stage = 'download'; this.error = ''; this.progress = [0, m.mb * 1e6]; this.cached = false;
    const h = this.heart = new Heart((st, msg) => {
      if (h !== this.heart) return;
      this.stage = st === 'engine' ? 'session' : st; this.stageMsg = msg; dbg(`[heart] ${st}: ${msg}`);
      if (st !== 'phonemize' && st !== 'generate') this.crumb(this.stage);
      this.onChange({ type: 'stage' });
    });
    this.crumb('download'); this.onChange();
    const t0 = performance.now();
    h.load(m, { device, opt, onProg: (l, t, hit) => {
      if (h !== this.heart) return;
      if (hit) { this.cached = true; this.progress = [1, 1]; } else this.progress = [l, t || this.progress[1]];
      this.onChange({ type: 'progress' });
    } }).then(() => {
      if (h !== this.heart) return;
      this.state = 'ready'; this.device = h.device; this.loadMs = Math.round(performance.now() - t0); this.clearCrumb();
      dbg(`[heart] ready on ${h.device} in ${this.loadMs} ms`); this.onChange({ type: 'ready' });
    }).catch((e) => {
      if (h !== this.heart) return;
      this.state = 'error'; this.error = `${this.stage}: ${e.message || e}`; this.clearCrumb(); dbg('[heart] load error ' + this.error); this.onChange({ type: 'error' });
    });
  }
  terminate() { this.job++; try { this.heart?.session?.release?.(); } catch {} this.heart = null; if (this.state !== 'error') this.state = 'idle'; this.clearCrumb(); }
  stop() { this.job++; }
  // generates sentence by sentence on the main thread (same as heart.html); onChunk({pcm, rate, i, n, ms})
  async speak(text, voice, onChunk) {
    if (!this.ready) throw new Error('voice not ready');
    const my = ++this.job, h = this.heart;
    await h.setVoice(voice || DEFAULT_KOKORO_VOICE);
    const parts = heartChunks(text);
    for (let i = 0; i < parts.length; i++) {
      if (my !== this.job) throw new Error('stopped');
      this.crumb('generate');
      const { pcm, rate, ms } = await h.synth(parts[i]);
      this.clearCrumb();
      this.device = h.device;
      dbg(`[heart] chunk ${i + 1}/${parts.length}: ${(pcm.length / rate).toFixed(1)}s audio in ${Math.round(ms)} ms`);
      if (my !== this.job) throw new Error('stopped');
      onChunk({ pcm, rate, i, n: parts.length, ms });
    }
  }
  label() { return `${this.model ? this.model.id : DEFAULT_KOKORO_MODEL} · ${this.device === 'webgpu' ? 'WebGPU' : 'WASM'}`; }
}

export class Voice {
  constructor({ getKey, getPrefs, onLevel, onPrepare, onStart, onEnd, onStatus }) {
    Object.assign(this, { getKey, getPrefs, onLevel, onPrepare, onStart, onEnd, onStatus });
    this.synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.voices = [];
    this.ctx = null; this.analyser = null; this.source = null; this.el = null;
    this.unlocked = false; this.synthPrimed = false; this.speaking = false; this.token = 0; this.ttsFailUntil = 0;
    this.lastUsed = ''; this.lastReason = ''; this._utts = [];
    this.standalone = STANDALONE;
    this.kokoro = new Kokoro((d) => { this.onStatus?.(); this.onKokoro?.(d); });
    this.needSynth = () => { const p = this.getPrefs(); return p.engine === 'device' || ((!this.kokoro.ready || this.kokoro.lastErr) && (!this.getKey() || Date.now() < this.ttsFailUntil)); };
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
        this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 512;
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
      if (this.synth && this.needSynth?.() && !this.speaking && !(this.synth.speaking || this.synth.pending) && Date.now() - (this._primeT || 0) > 1500) {
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

  _markStarted() { if (!this._started) { this._started = true; this.onStart?.(); } }
  _finish() { if (this.speaking) { this.speaking = false; this.onEnd?.(); } this.onStatus?.(); }

  async speak(text, uiLang, opts = {}) {
    this.stop();
    const tok = ++this.token;
    const clean = cleanForSpeech(text);
    if (!clean) return;
    const lang = detectLang(clean, uiLang);
    const prefs = this.getPrefs(), key = this.getKey();
    this.speaking = true; this._started = false; this.onPrepare?.();   // 'Speaking…' only once audio really starts
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
    arm(30000);
    try {
      await Promise.race([watchdog, this.kokoro.speak(text, prefs.kokoroVoice, (c) => {
        if (tok !== this.token) return;
        arm(30000);
        if (gapless) held.push(c); else play(c.pcm, c.rate);
      })]);
    } finally { clearTimeout(wd); }
    if (gapless) for (const c of held) play(c.pcm, c.rate);
    await chain;
    if (firstErr) throw firstErr;
  }
  // v7.2 playback: an <audio> element (primed inside a tap) fed a WAV blob – the same route as samples.html, which
  // plays on iPhone even with the silent switch on. Web Audio (heart.html's route) is the second try.
  _playSeg(samples, rate, tok) {
    const out = (this.getPrefs().audioOut || 'element');
    const order = out === 'webaudio' ? ['webaudio', 'element'] : ['element', 'webaudio'];
    const tryOne = async (i) => {
      if (tok !== this.token) return;
      const how = order[i]; if (!how) throw new Error('no audio output worked');
      try { await (how === 'element' ? this._viaElement(samples, rate, tok) : this._viaCtx(samples, rate, tok)); this.lastOut = how; }
      catch (e) { dbg(`[audio] ${how} failed: ${e.message || e}`); this.lastOutErr = `${how}: ${e.message || e}`; return tryOne(i + 1); }
    };
    return tryOne(0);
  }
  async _viaElement(samples, rate, tok) {
    if (!this.el) throw new Error('no <audio> element (tap once)');
    const dur = samples.length / rate, url = URL.createObjectURL(wavBlob(samples, rate));
    const el = this.el;
    try {
      el.muted = false; el.volume = 1; el.src = url;
      dbg(`[audio] <audio> play ${dur.toFixed(1)}s`);
      // generation blocks the main thread, so a wall-clock timeout can fire late – check the element's real state instead
      await Promise.race([el.play(), new Promise((res, rej) => setTimeout(() => (!el.paused && el.currentTime >= 0 ? res() : rej(new Error('play() blocked'))), 4000))]);
      this._markStarted();
      this._elPcm = samples; this._elRate = rate;   // ghost glow follows the real samples
      await new Promise((resolve) => {
        let done = false; const end = () => { if (done) return; done = true; clearTimeout(guard); el.onended = el.onerror = el.onpause = null; resolve(); };
        el.onended = end; el.onerror = end; el.onpause = end; const guard = setTimeout(end, dur * 1000 + 2000);
      });
    } finally { this._elPcm = null; setTimeout(() => URL.revokeObjectURL(url), 3000); }
  }
  async _viaCtx(samples, rate, tok) {
    if (this.ctx && this.ctx.state !== 'running') await withTimeout(this.ctx.resume?.(), 800);
    if (!(this.ctx && this.ctx.state === 'running')) throw new Error('Web Audio ' + (this.ctx ? this.ctx.state : 'missing'));
    const dur = samples.length / rate;
    const buf = this.ctx.createBuffer(1, samples.length, rate); buf.getChannelData(0).set(samples);
    dbg(`[audio] Web Audio play ${dur.toFixed(1)}s (ctx ${this.ctx.state}, ${this.ctx.sampleRate} Hz)`);
    await new Promise((resolve) => {
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.connect(this.ctx.destination); src.connect(this.analyser);
      let done = false; const end = () => { if (done) return; done = true; clearTimeout(guard); if (this.source === src) this.source = null; resolve(); };
      src.onended = end; const guard = setTimeout(end, dur * 1000 + 1500);
      this.source = src; (this._ksrcs = this._ksrcs || []).push(src); src.start(0); this._markStarted();
    });
  }
  level() {
    if (this._elPcm && this.el && !this.el.paused) {
      const i = Math.floor(this.el.currentTime * this._elRate), p = this._elPcm; let sum = 0, n = 0;
      for (let j = Math.max(0, i - 600); j < Math.min(p.length, i + 600); j += 4) { sum += p[j] * p[j]; n++; }
      return n ? Math.min(1, Math.sqrt(sum / n) * 5) : 0;
    }
    if (!this.analyser || !this.source) return 0;
    this.analyser.getByteTimeDomainData(this._buf);
    let sum = 0; for (let i = 0; i < this._buf.length; i++) { const d = (this._buf[i] - 128) / 128; sum += d * d; }
    return Math.min(1, Math.sqrt(sum / this._buf.length) * 4);
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
    try { await this._playSeg(samples, rate, tok); }
    catch (e) { const er = new Error('locked'); er.reason = 'audio blocked – ' + (e.message || e) + ' (tap the screen once)'; throw er; }
    if (tok === this.token) this._finish();
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
        u.onstart = () => { started = true; this._markStarted(); };
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
