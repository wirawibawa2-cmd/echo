// Echo v7 – Kokoro TTS in a worker, so the ghost keeps animating while speech is generated.
// Lean pipeline from /preview/heart.html: download streamed into Cache API, one JS copy dropped after session create,
// single-threaded WASM + SIMD, memory arena off, graph optimization off by default; WebGPU first (Auto) with WASM fallback.
// v7.1: phonemes are made on the main thread (espeak-ng WASM hung inside a worker on iOS Safari); the worker only runs the model.
import { KOKORO_HF as HF, KOKORO_CACHE as CACHE } from './kokoro-config.js?v=7.1';
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const stage = (s, msg) => postMessage({ type: 'stage', stage: s, msg });
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000}s`)), ms))]);

async function fetchModel(url, onProg, stallMs = 45000) {
  let cache = null; try { cache = await caches.open(CACHE); } catch {}
  let hit = cache && await cache.match(url);
  if (!hit) {
    const ctrl = new AbortController(); let stall = setTimeout(() => ctrl.abort(), stallMs);
    const res = await fetch(url, { signal: ctrl.signal, mode: 'cors' });
    if (!res.ok) throw new Error(`download failed (HTTP ${res.status})`);
    const total = +(res.headers.get('Content-Length') || 0); let got = 0, lastP = 0;
    const counted = res.body.pipeThrough(new TransformStream({ transform(c, ctl) {
      got += c.length; const now = Date.now(); if (now - lastP > 150) { lastP = now; onProg(got, total); }
      clearTimeout(stall); stall = setTimeout(() => ctrl.abort(), stallMs); ctl.enqueue(c);
    } }));
    try {
      if (!cache) throw new Error('no cache');
      await cache.put(url, new Response(counted, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(total) } }));
      hit = await cache.match(url);
    } catch (e) {
      clearTimeout(stall);
      if (ctrl.signal.aborted) throw new Error(`download stalled at ${(got / 1e6).toFixed(1)} MB`);
      throw new Error('download/cache failed: ' + (e.message || e));
    }
    clearTimeout(stall); onProg(total, total);
  } else postMessage({ type: 'cached' });
  return new Uint8Array(await hit.arrayBuffer());
}

let ort = null, session = null, device = null, modelFile = null, spare = null, checked = false;
const styles = new Map();
const SO = (opt) => ({ graphOptimizationLevel: opt || 'disabled', enableCpuMemArena: false, enableMemPattern: false, executionMode: 'sequential' });
async function load({ file, device: want, opt }) {
  const t0 = performance.now();
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  let gpu = (want === 'webgpu' || (want === 'auto' && !ios)) && typeof navigator !== 'undefined' && !!navigator.gpu;
  if (gpu) {   // skip software/fallback adapters and fp16 models on GPUs without shader-f16 (they only throw validation errors)
    try {
      const ad = await withTimeout(navigator.gpu.requestAdapter(), 5000, 'gpu');
      const info = ad?.info || {};
      if (!ad || ad.isFallbackAdapter || info.isFallbackAdapter || /swiftshader|llvmpipe|software/i.test(`${info.vendor} ${info.architecture} ${info.description}`)) gpu = false;
      else if (/f16/.test(file) && !ad.features.has('shader-f16')) gpu = false;
      if (!gpu) stage('engine', 'no usable WebGPU here → WASM');
    } catch { gpu = false; }
  }
  stage('download', file);
  let bytes = await fetchModel(HF + file, (l, t) => postMessage({ type: 'progress', loaded: l, total: t }));
  stage('engine', gpu ? 'WebGPU+WASM' : 'WASM');
  ort = await withTimeout(import(`${ORT}${gpu ? 'ort.webgpu.min.mjs' : 'ort.wasm.min.mjs'}`), 60000, 'engine load');
  ort.env.wasm.numThreads = 1; ort.env.wasm.simd = true; ort.env.wasm.proxy = false; ort.env.wasm.wasmPaths = ORT;
  const create = (eps) => withTimeout(ort.InferenceSession.create(bytes, { ...SO(opt), executionProviders: eps }), 120000, 'session create');
  if (gpu) {
    stage('session', 'WebGPU');
    try { session = await create(['webgpu', 'wasm']); device = 'webgpu'; spare = bytes; checked = false; }
    catch (e) { stage('session', 'WebGPU failed (' + String(e.message || e).slice(0, 60) + ') → WASM'); }
  }
  if (!session) { stage('session', 'WASM'); session = await create(['wasm']); device = 'wasm'; checked = true; }
  bytes = null; modelFile = file;
  postMessage({ type: 'ready', device, ms: Math.round(performance.now() - t0) });
}
async function toWasm(why) {
  stage('session', `WebGPU ${why} → WASM`);
  const b = spare || await fetchModel(HF + modelFile, () => {});
  try { await session.release?.(); } catch {}
  session = await withTimeout(ort.InferenceSession.create(b, { ...SO('disabled'), executionProviders: ['wasm'] }), 120000, 'session create');
  device = 'wasm'; spare = null; checked = true;
  postMessage({ type: 'ready', device, fallback: true });
}
async function style(voice) {
  if (!styles.has(voice)) { const r = await fetch(new URL(`../assets/voices/${voice}.bin?v=7`, import.meta.url)); if (!r.ok) throw new Error('voice file ' + voice + ' missing'); styles.set(voice, new Float32Array(await r.arrayBuffer())); }
  return styles.get(voice);
}
async function synth(ids, voice, speed) {
  const n = ids.length, off = 256 * Math.min(Math.max(n - 2, 0), 509), st = await style(voice);
  const feeds = {
    input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, n]),
    style: new ort.Tensor('float32', st.slice(off, off + 256), [1, 256]),
    speed: new ort.Tensor('float32', Float32Array.from([speed || 1]), [1]),
  };
  stage('generate', `${n} tokens · ${device}`);
  const t0 = performance.now(); let out;
  try { out = await withTimeout(session.run(feeds), 60000, 'speech generation'); }
  catch (e) { if (device !== 'webgpu') throw e; await toWasm('error'); return synth(ids, voice, speed); }
  let pcm = out.waveform.data;
  if (device === 'webgpu' && !checked) {
    let bad = 0, peak = 0; for (let i = 0; i < pcm.length; i += 7) { const v = pcm[i]; if (!Number.isFinite(v)) bad++; else peak = Math.max(peak, Math.abs(v)); }
    if (bad || peak < 1e-4) { await toWasm(bad ? 'NaN output' : 'silent output'); return synth(ids, voice, speed); }
    checked = true; spare = null;
  }
  pcm = new Float32Array(pcm);   // own buffer, transferable
  return { pcm, ms: performance.now() - t0 };
}
let loading = null, job = 0;
onmessage = async ({ data }) => {
  if (data.type === 'load') {
    if (!loading) loading = load(data).catch(e => { loading = null; postMessage({ type: 'error', where: 'load', error: String(e.message || e) }); throw e; });
    loading.catch(() => {}); return;
  }
  if (data.type === 'stop') { job++; return; }
  if (data.type === 'speak') {
    const my = ++job;
    try {
      if (!loading) throw new Error('voice not loaded');
      await loading;
      const parts = data.items;
      for (let i = 0; i < parts.length; i++) {
        if (my !== job) return;
        const { pcm, ms } = await synth(parts[i], data.voice, data.speed);
        if (my !== job) return;
        postMessage({ type: 'chunk', id: data.id, i, n: parts.length, pcm, rate: 24000, ms: Math.round(ms) }, [pcm.buffer]);
      }
      postMessage({ type: 'done', id: data.id });
    } catch (e) { postMessage({ type: 'error', where: 'speak', id: data.id, error: String(e.message || e) }); }
  }
};
