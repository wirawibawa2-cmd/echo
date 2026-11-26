// Echo – Piper (open source, MIT) running fully on the phone: espeak-ng phonemizer (WASM) + ONNX Runtime Web (WASM, 1 thread).
// Models are 8-bit quantized copies (~19 MB) of rhasspy/piper-voices, hosted here; files are cached with the Cache API.
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/esm/ort.wasm.min.js';
const PHON = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';
const PHON_JS = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/dist/piper-DeOu3H9E.js';
const HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US';
ort.env.wasm.numThreads = 1;                       // GitHub Pages can't enable cross-origin isolation -> no threads
ort.env.wasm.simd = true;
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/';
const CACHE = 'echo-piper-v1';

export const VOICES = [
  { id: 'en_US-kristin-medium', name: 'Kristin', desc: 'warm, sweet, soft – closest to Heart', star: true, lic: 'Piper (MIT) · dataset: LibriVox, public domain', hf: 'kristin/medium' },
  { id: 'en_US-amy-medium', name: 'Amy', desc: 'bright, friendly, upbeat', lic: 'Piper (MIT) · dataset: Mycroft mimic3 "Amy" (license not clearly stated – personal use)', hf: 'amy/medium' },
  { id: 'en_US-ljspeech-medium', name: 'Linda (LJSpeech)', desc: 'clear, gentle, calm', lic: 'Piper (MIT) · dataset: LJ Speech, public domain', hf: 'ljspeech/medium' },
  { id: 'en_US-kathleen-low', name: 'Kathleen', desc: 'light, casual (lower quality)', lic: 'Piper (MIT) · dataset: CC0', hf: 'kathleen/low' },
];

async function cached(url, onProgress, stallMs = 30000) {
  let cache = null; try { cache = await caches.open(CACHE); const hit = await cache.match(url); if (hit) { const b = await hit.arrayBuffer(); onProgress?.(b.byteLength, b.byteLength, true); return b; } } catch {}
  const ctrl = new AbortController(); let stall = setTimeout(() => ctrl.abort(), stallMs);
  const res = await fetch(url, { signal: ctrl.signal, mode: 'cors' });
  if (!res.ok) { clearTimeout(stall); throw new Error(`download failed (${res.status}) for ${url.split('/').pop()}`); }
  const total = +(res.headers.get('Content-Length') || 0), rd = res.body.getReader(), parts = []; let got = 0;
  try {
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onProgress?.(got, total); clearTimeout(stall); stall = setTimeout(() => ctrl.abort(), stallMs); }
  } catch (e) { throw new Error(`download stalled for ${url.split('/').pop()} (${(got / 1e6).toFixed(1)} MB)`); } finally { clearTimeout(stall); }
  const buf = new Uint8Array(got); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
  try { await cache?.put(url, new Response(buf.slice().buffer, { headers: { 'Content-Type': 'application/octet-stream' } })); } catch {}
  return buf.buffer;
}
const timeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000}s (likely out of memory on this device)`)), ms))]);

let phonMod = null, phonData = null, phonWasm = null;
async function phonemize(text, espeakVoice) {
  phonMod = phonMod || (await import(PHON_JS)).createPiperPhonemize;
  return new Promise(async (resolve, reject) => {
    let done = false;
    try {
      const m = await phonMod({
        print: (l) => { if (!done) { done = true; resolve(JSON.parse(l).phoneme_ids); } },
        printErr: (l) => { if (!done && /error/i.test(l)) { done = true; reject(new Error('phonemizer: ' + l)); } },
        wasmBinary: phonWasm,
        getPreloadedPackage: () => phonData,
        locateFile: (f) => f.endsWith('.wasm') ? `${PHON}.wasm` : f.endsWith('.data') ? `${PHON}.data` : f,
      });
      m.callMain(['-l', espeakVoice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
    } catch (e) { if (!done) { done = true; reject(e); } }
  });
}

export class Piper {
  constructor(log) { this.log = log || (() => {}); this.sessions = {}; this.cfg = {}; }
  async prepare(voice, full, onProgress) {
    const key = voice.id + (full ? ':full' : '');
    if (this.sessions[key]) return key;
    const files = {}; const prog = (k) => (l, t) => { files[k] = [l, t || files[k]?.[1] || 0]; let L = 0, T = 0; for (const f in files) { L += files[f][0]; T += files[f][1]; } onProgress?.(L, T); };
    const mUrl = full ? `${HF}/${voice.hf}/${voice.id}.onnx` : new URL(`./models/${voice.id}.int8.onnx`, import.meta.url).href;
    const cUrl = new URL(`./models/${voice.id}.int8.onnx.json`, import.meta.url).href;
    files.model = [0, full ? 63e6 : 19e6];
    if (!phonData) { files.phon = [0, 18.1e6]; files.pw = [0, 0.64e6]; }
    const [model, cfg, pd, pw] = await Promise.all([
      cached(mUrl, prog('model')), cached(cUrl).then(b => JSON.parse(new TextDecoder().decode(b))),
      phonData ? null : cached(`${PHON}.data`, prog('phon')), phonWasm ? null : cached(`${PHON}.wasm`, prog('pw')),
    ]);
    if (pd) phonData = pd; if (pw) phonWasm = pw;
    this.log(`downloaded ${voice.name}${full ? ' (full)' : ' (8-bit)'}: ${(model.byteLength / 1e6).toFixed(1)} MB model`);
    const t0 = performance.now();
    this.sessions[key] = await timeout(ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }), 60000, 'voice init');
    this.cfg[key] = cfg;
    this.log(`voice init ${(performance.now() - t0).toFixed(0)} ms`);
    return key;
  }
  // returns { pcm: Float32Array, rate }
  async synth(key, text) {
    const cfg = this.cfg[key], s = this.sessions[key];
    const ids = await timeout(phonemize(text, cfg.espeak.voice), 20000, 'phonemizer');
    const inf = cfg.inference || {};
    const feeds = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale ?? 0.667, inf.length_scale ?? 1, inf.noise_w ?? 0.8]), [3]),
    };
    if (cfg.num_speakers > 1) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
    const out = await timeout(s.run(feeds), 30000, 'speech generation');
    return { pcm: out.output.data, rate: cfg.audio.sample_rate };
  }
  async clearCache() { try { await caches.delete(CACHE); } catch {} }
}
