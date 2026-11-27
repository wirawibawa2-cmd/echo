// Echo v7.2 – the exact /preview/heart.html pipeline (worked on Wira's iPhone), main thread, no worker.
// Only additions: voice (style) choice and an explicit Auto=WASM on iPhone.
// Kokoro (Apache-2.0), ONNX Runtime Web (MIT). No key, no server. Lean pipeline: no transformers.js,
// one model copy in JS (dropped right after session create), single-threaded WASM with SIMD, memory arena off.
// v7.3: phonemes come from a pure-JS lexicon G2P (g2p.js) – the espeak-ng phonemizer hung inside the app on iPhone.
import { VOCAB } from './kokoro-vocab.js?v=82';
import { g2p, loadLexicon } from './g2p.js?v=82';
const ORT_VER = '1.22.0', ORT = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/`;
const HF = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/';
const CACHE = 'echo-kokoro-v1';
export const MODELS = [
  { id: 'q8f16', file: 'model_q8f16.onnx', mb: 86.0, label: 'q8f16 – least RAM, most likely to load ★', def: true },
  { id: 'q8', file: 'model_quantized.onnx', mb: 92.4, label: 'q8 (8-bit)' },
  { id: 'uint8f16', file: 'model_uint8f16.onnx', mb: 114.2, label: 'uint8f16' },
  { id: 'q4f16', file: 'model_q4f16.onnx', mb: 154.6, label: 'q4f16 (4-bit + fp16)' },
  { id: 'fp16', file: 'model_fp16.onnx', mb: 163.2, label: 'fp16 – higher quality' },
  { id: 'uint8', file: 'model_uint8.onnx', mb: 177.5, label: 'uint8' },
  { id: 'q4', file: 'model_q4.onnx', mb: 305.2, label: 'q4 (4-bit + fp32)' },
  { id: 'fp32', file: 'model.onnx', mb: 325.5, label: 'fp32 full – best quality, most RAM' },
];
const tick = () => new Promise(r => setTimeout(r, 30));          // let the stage log paint before heavy sync work
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000}s`)), ms))]);

// Stream the download straight into the Cache API (no JS copy while downloading), then read it back ONCE.
async function fetchModel(url, onProg, signalStall = 45000) {
  let cache = null; try { cache = await caches.open(CACHE); } catch {}
  let hit = cache && await cache.match(url);
  if (!hit) {
    const ctrl = new AbortController(); let stall = setTimeout(() => ctrl.abort(), signalStall);
    const res = await fetch(url, { signal: ctrl.signal, mode: 'cors' });
    if (!res.ok) throw new Error(`download failed (HTTP ${res.status})`);
    const total = +(res.headers.get('Content-Length') || 0); let got = 0;
    const counted = res.body.pipeThrough(new TransformStream({ transform(c, ctl) { got += c.length; onProg(got, total); clearTimeout(stall); stall = setTimeout(() => ctrl.abort(), signalStall); ctl.enqueue(c); } }));
    try {
      if (!cache) throw new Error('no cache');
      await cache.put(url, new Response(counted, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(total) } }));
      hit = await cache.match(url);
    } catch (e) {
      clearTimeout(stall);
      if (ctrl.signal.aborted) throw new Error(`download stalled at ${(got / 1e6).toFixed(1)} MB`);
      throw new Error('download/cache failed: ' + (e.message || e));
    }
    clearTimeout(stall);
  } else onProg(1, 1, true);
  return new Uint8Array(await hit.arrayBuffer());
}
export async function isCached(file) { try { const c = await caches.open(CACHE); return !!(await c.match(HF + file)); } catch { return false; } }
export async function clearCache() { try { await caches.delete(CACHE); } catch {} }

let ortMod = null, ortKind = null;
async function loadOrt(webgpu) {
  if (ortMod) return ortMod;
  ortKind = webgpu ? 'webgpu' : 'wasm';
  ortMod = await import(`${ORT}${webgpu ? 'ort.webgpu.min.mjs' : 'ort.wasm.min.mjs'}`);
  ortMod.env.wasm.numThreads = 1;            // Pages has no cross-origin isolation -> no threads anyway; also lowest RAM
  ortMod.env.wasm.simd = true;
  ortMod.env.wasm.proxy = false;             // main thread: no extra copy into a worker
  ortMod.env.wasm.wasmPaths = ORT;
  return ortMod;
}

export class Heart {
  constructor(stage) { this.stage = stage || (() => {}); this.session = null; this.style = null; this.device = null; }
  get ortKind() { return ortKind; }
  async setVoice(id) {
    this.styles = this.styles || {};
    if (!this.styles[id]) { const r = await fetch(new URL(`../assets/voices/${id}.bin?v=7`, import.meta.url)); if (!r.ok) throw new Error('voice file ' + id + ' missing'); this.styles[id] = new Float32Array(await r.arrayBuffer()); }
    this.voiceId = id; this.style = this.styles[id];
  }
  async load(model, { device = 'auto', opt = 'disabled', onProg } = {}) {
    const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    const wantGpu = (device === 'webgpu' || (device === 'auto' && !IOS)) && !!navigator.gpu;
    if (device === 'webgpu' && !navigator.gpu) throw new Error('WebGPU not available in this browser');
    this.stage('download', `${model.id} · ${model.mb} MB`);
    await this.setVoice(this.voiceId || 'af_heart');
    this.stage('download', 'English dictionary (~1.3 MB)');
    await withTimeout(loadLexicon(new URL('../assets/lexicon-us.tsv?v=82', import.meta.url).href), 60000, 'dictionary download');
    let bytes = await fetchModel(HF + model.file, onProg);
    this.stage('engine', `loading ONNX Runtime (${wantGpu ? 'WebGPU+WASM' : 'WASM'})`); await tick();
    const ort = await withTimeout(loadOrt(wantGpu), 60000, 'engine load');
    const so = { graphOptimizationLevel: opt, enableCpuMemArena: false, enableMemPattern: false, executionMode: 'sequential' };
    const tryCreate = async (eps, tag) => {
      this.stage('session', `creating session on ${tag} (${(bytes.byteLength / 1e6).toFixed(0)} MB)`); await tick();
      const t0 = performance.now();
      const s = await withTimeout(ort.InferenceSession.create(bytes, { ...so, executionProviders: eps }), 120000, 'session create');
      this.stage('session', `ready on ${tag} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
      return s;
    };
    try {
      if (wantGpu && ortKind === 'webgpu') {
        try { this.session = await tryCreate(['webgpu', 'wasm'], 'WebGPU'); this.device = 'webgpu'; }
        catch (e) { if (device === 'webgpu') throw e; this.stage('session', `WebGPU failed (${e.message || e}) → falling back to WASM`); }
      }
      if (!this.session) { this.session = await tryCreate(['wasm'], 'WASM'); this.device = 'wasm'; }
      this._bytes = wantGpu && this.device === 'webgpu' ? bytes : null;   // keep only if we may still need a WASM fallback
    } finally { bytes = null; }
    this.ort = ort; this.model = model;
  }
  async _fallbackWasm(reason) {
    this.stage('session', `WebGPU output bad (${reason}) → re-creating on WASM`); await tick();
    const b = this._bytes || await fetchModel(HF + this.model.file, () => {});
    try { await this.session.release?.(); } catch {}
    this.session = await withTimeout(this.ort.InferenceSession.create(b, { graphOptimizationLevel: 'disabled', enableCpuMemArena: false, enableMemPattern: false, executionProviders: ['wasm'] }), 120000, 'session create');
    this.device = 'wasm'; this._bytes = null; this._checked = true;
    this.stage('session', 'ready on WASM (fallback)');
  }
  async synth(text, speed = 1) {
    this.stage('phonemize', `"${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`); await tick();
    const ph = g2p(text);   // synchronous, ~1 ms
    const ids = [0]; for (const ch of ph) { const id = VOCAB[ch]; if (id !== undefined) ids.push(id); } ids.push(0);
    if (ids.length > 510) ids.length = 509, ids.push(0);
    const n = ids.length, off = 256 * Math.min(Math.max(n - 2, 0), 509);
    const T = this.ort.Tensor;
    const feeds = {
      input_ids: new T('int64', BigInt64Array.from(ids, BigInt), [1, n]),
      style: new T('float32', this.style.slice(off, off + 256), [1, 256]),
      speed: new T('float32', Float32Array.from([speed]), [1]),
    };
    this.stage('generate', `${n} tokens on ${this.device.toUpperCase()}`); await tick();
    const t0 = performance.now();
    let out;
    try { out = await withTimeout(this.session.run(feeds), 60000, 'speech generation'); }
    catch (e) {
      if (this.device !== 'webgpu') throw e;
      await this._fallbackWasm('error ' + String(e.message || e).slice(0, 60)); return this.synth(text, speed);
    }
    let pcm = out.waveform.data;
    if (this.device === 'webgpu' && !this._checked) {
      let bad = 0, peak = 0; for (let i = 0; i < pcm.length; i += 7) { const v = pcm[i]; if (!Number.isFinite(v)) bad++; else peak = Math.max(peak, Math.abs(v)); }
      if (bad || peak < 1e-4) { await this._fallbackWasm(bad ? 'NaN' : 'silence'); return this.synth(text, speed); }
      this._checked = true; this._bytes = null;   // GPU output looks fine -> drop the spare model copy
    }
    if (pcm.buffer.byteLength !== pcm.byteLength || !(pcm instanceof Float32Array)) pcm = Float32Array.from(pcm);
    out = null;
    return { pcm, rate: 24000, ms: performance.now() - t0, phonemes: ph };
  }
}
// memory-friendly chunking: sentences, long ones split again at commas/semicolons (activation RAM grows with length)
export function chunks(text, max = 140) {
  const out = [];
  for (const s of (text.match(/[^.!?…]+[.!?…]*["')\]]*\s*/g) || [text]).map(x => x.trim()).filter(Boolean)) {
    if (s.length <= max) { out.push(s); continue; }
    let cur = '';
    for (const p of s.split(/(?<=[,;:—])\s+/)) { if ((cur + ' ' + p).trim().length > max && cur) { out.push(cur.trim()); cur = p; } else cur = (cur + ' ' + p).trim(); }
    if (cur) {
      while (cur.length > max) { const cut = cur.lastIndexOf(' ', max) > 40 ? cur.lastIndexOf(' ', max) : max; out.push(cur.slice(0, cut).trim()); cur = cur.slice(cut).trim(); }
      if (cur) out.push(cur);
    }
  }
  return out;
}
