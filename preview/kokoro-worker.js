// Free, open-source, in-browser TTS: Kokoro-82M (Apache-2.0) via kokoro-js (Apache-2.0), ONNX on WASM. No key, no server.
// Model files are cached by transformers.js in the browser Cache API after the first download.
import { KokoroTTS } from 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js';
let tts = null, loading = null;
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
function load(dtype) {
  if (!loading) {
    const files = {};
    loading = KokoroTTS.from_pretrained(MODEL, {
      dtype: dtype || 'q8', device: 'wasm',
      progress_callback: (p) => {
        if (p.status === 'progress' && p.file) { files[p.file] = [p.loaded || 0, p.total || 0]; }
        if (p.status === 'done' && p.file && files[p.file]) files[p.file][0] = files[p.file][1];
        let l = 0, t = 0; for (const k in files) { l += files[k][0]; t += files[k][1]; }
        postMessage({ type: 'progress', loaded: l, total: t, file: p.file, status: p.status });
      },
    }).then(m => { tts = m; postMessage({ type: 'ready' }); return m; })
      .catch(e => { loading = null; postMessage({ type: 'error', error: String(e && e.message || e) }); throw e; });
  }
  return loading;
}
const sentences = (s) => (s.match(/[^.!?…]+[.!?…]*\s*/g) || [s]).map(x => x.trim()).filter(Boolean);
let cur = 0;
onmessage = async ({ data }) => {
  if (data.type === 'load') { load(data.dtype).catch(() => {}); return; }
  if (data.type === 'stop') { cur++; return; }
  if (data.type === 'speak') {
    const job = ++cur;
    try {
      await load(data.dtype);
      const parts = sentences(data.text);
      for (let i = 0; i < parts.length; i++) {
        if (job !== cur) return;
        const t0 = performance.now();
        const out = await tts.generate(parts[i], { voice: data.voice || 'af_heart', speed: data.speed || 1 });
        if (job !== cur) return;
        const pcm = out.audio;
        postMessage({ type: 'chunk', id: data.id, i, last: i === parts.length - 1, pcm, rate: out.sampling_rate, ms: Math.round(performance.now() - t0), chars: parts[i].length }, [pcm.buffer]);
      }
    } catch (e) { postMessage({ type: 'error', id: data.id, error: String(e && e.message || e) }); }
  }
};
