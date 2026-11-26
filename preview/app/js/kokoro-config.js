// Echo v7 – free on-device voice: Kokoro-82M (Apache-2.0) via ONNX Runtime Web (MIT). Shared config for the page and the worker.
export const KOKORO_MODELS = [
  { id: 'q8f16', file: 'model_q8f16.onnx', mb: 86.0, label: 'q8f16 – least RAM ★' },
  { id: 'q8', file: 'model_quantized.onnx', mb: 92.4, label: 'q8 (8-bit)' },
  { id: 'uint8f16', file: 'model_uint8f16.onnx', mb: 114.2, label: 'uint8f16' },
  { id: 'q4f16', file: 'model_q4f16.onnx', mb: 154.6, label: 'q4f16' },
  { id: 'fp16', file: 'model_fp16.onnx', mb: 163.2, label: 'fp16 – higher quality' },
  { id: 'fp32', file: 'model.onnx', mb: 325.5, label: 'fp32 full – most RAM' },
];
export const DEFAULT_KOKORO_MODEL = 'q8f16';
export const KOKORO_VOICES = [
  ['af_heart', 'Heart – warm, sweet ★'], ['af_bella', 'Bella – bright, flirty'], ['af_nicole', 'Nicole – soft, breathy'],
  ['af_aoede', 'Aoede – breezy'], ['af_kore', 'Kore – calm'], ['af_sarah', 'Sarah – friendly'], ['af_sky', 'Sky – light'], ['af_nova', 'Nova – clear'],
];
export const DEFAULT_KOKORO_VOICE = 'af_heart';
export const KOKORO_HF = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/';
export const KOKORO_CACHE = 'echo-kokoro-v1';   // same cache as /preview/heart.html, so a model downloaded there is reused
