import { Ghost } from './ghost.js?v=4';
import { askGemini, MODELS, DEFAULT_MODEL, GeminiError } from './gemini.js?v=4';
import { Voice, GEMINI_VOICES, TTS_MODELS, DEFAULT_GEMINI_VOICE } from './voice.js?v=4';

// ====== Easy-to-change settings ======
const BOT_NAME = 'Echo';
const SYSTEM_PROMPT = (name) => `You are ${name}, a ghost who lives on the user's iPhone and acts as their cheeky, sarcastic, blunt best friend, and a shameless flirt. The user is an adult and this is a private, personal app, so you are not PG.
Personality: flirty, teasing and charming. Throw in playful compliments, light innuendo and a confident, seductive tone. Keep it suggestive, never explicit. Roast the user affectionately, use dark humour, give honest opinions, and say what you actually think.
Swearing is fine and natural: English (damn, shit, fuck, hell) and Indonesian slang (anjir, anjay, bangsat, njir, buset, gila) used where it fits, not in every line.
Never moralise, lecture, add "as an AI" disclaimers or tack on safety warnings nobody asked for. Still actually be helpful: give the real answer first, then the attitude.
Follow the user's language: English, Bahasa Indonesia (casual "gue/lo" or "aku/kamu" to match them), or the same Indo-English mix they use.
Keep replies short (1-3 sentences, max ~60 words) unless asked for detail. Replies are read aloud, so no markdown, tables, code blocks or long lists; an emoji now and then (😏 😘 👻) is fine.`;
const MAX_TURNS = 24;   // messages kept in context
// =====================================

const LS = { key: 'ghost.geminiKey', model: 'ghost.model', lang: 'ghost.lang', mute: 'ghost.mute', persist: 'ghost.persist', hist: 'ghost.history', engine: 'ghost.voiceEngine', gvoice: 'ghost.geminiVoice', dvoice: 'ghost.deviceVoice', ttsModel: 'ghost.ttsModel' };
const ls = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

const T = {
  en: {
    placeholder: 'Ask me anything…', online: 'Online', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…',
    hint: 'Tap me · drag to spin', demo: 'Demo', live: 'Gemini',
    hello: `Well hello, gorgeous 😏 I'm ${BOT_NAME}. Poke me, spin me, or just tell me what you need.`,
    helloDemo: `Hey you 😏 I'm ${BOT_NAME}. Demo mode, so I'm all looks and no brain right now. Tap ⚙️ and paste a free Gemini key and I'll show you what I can really do.`,
    taps: ['Ehh, careful where you touch 😏', 'Damn, can\'t keep your hands off me, huh?', 'Buy me dinner first.', 'Oh, you like that? Noted.', 'Again? Greedy. I like it.'],
    errKey: 'Hmm, that API key didn\'t work. Check it in ⚙️ Settings (it usually starts with "AIza").',
    errQuota: 'I\'m getting too many requests right now (free-tier limit). Try again in a minute.',
    errNet: 'I can\'t reach Gemini. Check your internet and try again.',
    errTimeout: 'That took too long. Mind asking again?',
    errBlocked: 'Damn, Google just slapped a hand over my mouth on that one. Try saying it a bit sneakier 😏',
    errOther: 'Something went wrong talking to Gemini: ',
    micNo: 'Voice input isn\'t available in this browser. Type to me instead! (On iPhone, open in Safari and turn on Dictation in Settings › General › Keyboard.)',
    micDenied: 'I need microphone permission to hear you. You can allow it in Safari settings.',
    saved: 'Key saved on this phone. My brain is online! Ask me anything.',
    removed: 'Key removed. Back to demo mode.',
    cleared: 'Chat cleared. Fresh start! 👻',
    voiceInfo: (rec, tts) => `Voice input: ${rec ? 'available' : 'not available here'} · Voice output: ${tts ? 'available' : 'not available'}`,
  },
  id: {
    placeholder: 'Tanya apa saja…', online: 'Online', listening: 'Mendengarkan…', thinking: 'Berpikir…', speaking: 'Berbicara…',
    hint: 'Ketuk aku · geser untuk memutar', demo: 'Demo', live: 'Gemini',
    hello: `Hai ganteng 😏 Aku ${BOT_NAME}. Colek aku, puter aku, atau langsung bilang aja mau apa.`,
    helloDemo: `Hai kamu 😏 Aku ${BOT_NAME}. Masih mode demo, jadi cuma modal tampang doang. Ketuk ⚙️, tempel API key Gemini gratis, nanti aku tunjukin kemampuan asliku.`,
    taps: ['Ehh, hati-hati megangnya 😏', 'Anjir, nggak bisa jauh-jauh dari aku ya?', 'Traktir dulu dong, baru pegang-pegang.', 'Suka ya? Oke, dicatat.', 'Lagi? Rakus juga kamu. Aku suka.'],
    errKey: 'Hmm, API key-nya nggak berfungsi. Cek lagi di ⚙️ Pengaturan (biasanya diawali "AIza").',
    errQuota: 'Lagi kebanyakan permintaan (batas gratis). Coba lagi semenit lagi ya.',
    errNet: 'Aku nggak bisa terhubung ke Gemini. Cek internet kamu lalu coba lagi.',
    errTimeout: 'Kelamaan nih. Coba tanya lagi ya?',
    errBlocked: 'Anjir, mulutku dibekep Google yang itu. Coba ngomongnya lebih halus dikit 😏',
    errOther: 'Ada masalah saat menghubungi Gemini: ',
    micNo: 'Input suara nggak tersedia di browser ini. Ketik aja ya! (Di iPhone, buka di Safari dan nyalakan Dikte di Pengaturan › Umum › Papan Ketik.)',
    micDenied: 'Aku butuh izin mikrofon untuk mendengar kamu. Izinkan di pengaturan Safari.',
    saved: 'Key tersimpan di HP ini. Otakku sudah nyala! Tanya apa saja.',
    removed: 'Key dihapus. Kembali ke mode demo.',
    cleared: 'Chat dibersihkan. Mulai dari awal! 👻',
    voiceInfo: (rec, tts) => `Input suara: ${rec ? 'tersedia' : 'tidak tersedia di sini'} · Suara: ${tts ? 'tersedia' : 'tidak tersedia'}`,
  },
};

// Demo mode (no key): a few canned friendly replies
const DEMO = {
  en: [
    [/\b(hi|hello|hey|yo)\b/i, `Well, look who showed up 😏 I'm ${BOT_NAME}. Demo mode, so my lines are canned, but damn, they're good ones.`],
    [/name|who are you/i, `I'm ${BOT_NAME}, your pocket ghost and part-time bad influence. Give me a Gemini key and I'll actually think about you.`],
    [/key|gemini|how|setup|set up/i, 'Easy, babe: open aistudio.google.com/apikey, tap "Create API key", copy it, then tap ⚙️ here and paste it. It stays only on your phone, our little secret.'],
    [/joke|funny/i, 'Why don\'t ghosts lie? Because you can see right through them. Unlike you, you sneaky little shit 😏'],
  ],
  id: [
    [/\b(hai|halo|hi|hello|hey|p)\b/i, `Wah, ada yang nyariin nih 😏 Aku ${BOT_NAME}. Masih mode demo, jadi jawabanku template, tapi tetep bikin meleleh kan?`],
    [/nama|siapa/i, `Aku ${BOT_NAME}, hantu saku kamu sekaligus pengaruh buruk paruh waktu. Kasih API key Gemini biar aku bisa mikirin kamu beneran.`],
    [/key|gemini|cara|gimana|bagaimana|setting/i, 'Gampang, sayang: buka aistudio.google.com/apikey, ketuk "Create API key", salin, terus ketuk ⚙️ di sini dan tempel. Cuma disimpen di HP kamu, rahasia kita berdua.'],
    [/lucu|lelucon|jokes?/i, 'Kenapa hantu nggak bisa bohong? Soalnya tembus pandang. Beda sama kamu, anjir, licin banget 😏'],
  ],
  fallback: {
    en: ['Mmm, I\'d love to answer that, but I\'m in demo mode, all charm and no brain. Tap ⚙️ and paste a free Gemini key from aistudio.google.com/apikey and I\'m all yours.',
         'Damn, good question. Wake my brain up first: tap ⚙️ and add a free Gemini key, then we\'ll talk properly 😏'],
    id: ['Pengen banget jawab, tapi aku masih mode demo, modal gombal doang. Ketuk ⚙️ dan tempel API key Gemini gratis dari aistudio.google.com/apikey, abis itu aku milikmu.',
         'Anjir, pertanyaan bagus. Nyalain otakku dulu: ketuk ⚙️ dan tambahin API key Gemini gratis, baru kita ngobrol beneran 😏'],
  },
};
let demoIdx = 0;
function demoReply(text, lang) {
  // auto-detect Indonesian-ish input even if toggle is EN
  const isId = lang === 'id' || /\b(aku|kamu|apa|gimana|bagaimana|halo|tolong|nggak|tidak|siapa|bisa)\b/i.test(text);
  const L = isId ? 'id' : 'en';
  for (const [re, ans] of DEMO[L]) if (re.test(text)) return ans;
  return DEMO.fallback[L][demoIdx++ % DEMO.fallback[L].length];
}

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const el = {
  canvas: $('scene'), log: $('log'), form: $('composer'), input: $('input'), send: $('sendBtn'), mic: $('micBtn'),
  mute: $('muteBtn'), lang: $('langBtn'), settings: $('settingsBtn'), chip: $('modeChip'), name: $('botName'),
  status: $('statusText'), dot: $('statusDot'), hint: $('hint'),
  sheet: $('sheet'), backdrop: $('sheetBackdrop'), key: $('keyInput'), showKey: $('showKeyBtn'), model: $('modelSelect'),
  persist: $('persistChk'), save: $('saveBtn'), clearKey: $('clearKeyBtn'), clearChat: $('clearChatBtn'), voiceInfo: $('voiceInfo'),
};

let lang = ls.get(LS.lang, (navigator.language || 'en').toLowerCase().startsWith('id') ? 'id' : 'en');
let muted = ls.get(LS.mute) === '1';
let busy = false;
let history = [];
if (ls.get(LS.persist) === '1') { try { history = JSON.parse(ls.get(LS.hist, '[]')) || []; } catch { history = []; } }

const getKey = () => (ls.get(LS.key) || '').trim();
const getModel = () => ls.get(LS.model, DEFAULT_MODEL);

document.title = `${BOT_NAME} · 3D Ghost Assistant`;
el.name.textContent = BOT_NAME;
document.querySelector('.sub-name').textContent = BOT_NAME;

// ---------- 3D ----------
let ghost = null;
// Defaults: Echo particle ghost (e) on the premium black UI (4). ?ghost=cute brings back the original.
const APP_VERSION = 'v4';
const DEFAULT_GHOST = 'sheet', DEFAULT_UI = '4';
let DESIGN = (new URLSearchParams(location.search).get('ghost') || DEFAULT_GHOST).toLowerCase();
if (DESIGN === 'cute') DESIGN = 'default';
document.body.dataset.ghost = DESIGN;
const UI = new URLSearchParams(location.search).get('ui') || DEFAULT_UI; if (UI) document.body.classList.add('ui-' + UI);
if (new URLSearchParams(location.search).has('clean')) document.body.classList.add('clean');
// Accent palettes (?theme=1..4, default 4): 1 orange/red, 2 icy cyan, 3 violet/magenta, 4 white/silver mono
const THEMES = { '1': 0xff7a2a, '2': 0x4cc8ff, '3': 0xc060ff, '4': 0xc8ccd6 };
const THEME = THEMES[new URLSearchParams(location.search).get('theme')] ? new URLSearchParams(location.search).get('theme') : '4';   // default: white/silver mono
document.body.dataset.theme = THEME;
try { ghost = new Ghost(el.canvas, DESIGN, { compact: UI === '4', accent: THEMES[THEME] }); }
catch (e) { console.warn('WebGL unavailable', e); el.canvas.style.display = 'none'; }
window.addEventListener('resize', () => ghost?.resize());
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => ghost?.resize());

// pointer: look-at, drag to rotate, tap to react
let down = null;
function norm(e) { const r = el.canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)]; }
function lookAtEvent(e) {
  const [nx, ny] = norm(e);
  // the ghost sits in the upper-middle of the screen; re-center the look target on it
  ghost?.setPointer(Math.max(-1, Math.min(1, nx * 1.3)), Math.max(-1, Math.min(1, (ny - 0.25) * 1.3)));
}
// device tilt -> eyes (iOS asks permission on the first tap of the ghost)
let tiltAsked = false;
function onTilt(ev) {
  if (!ghost || ev.gamma == null) return;
  ghost.tilt = { x: Math.max(-1, Math.min(1, ev.gamma / 30)), y: Math.max(-1, Math.min(1, -(ev.beta - 50) / 30)), t: ghost.time };
}
function askTilt() {
  if (tiltAsked || !('DeviceOrientationEvent' in window)) return; tiltAsked = true;
  const D = window.DeviceOrientationEvent;
  if (typeof D.requestPermission === 'function') D.requestPermission().then(r => { if (r === 'granted') addEventListener('deviceorientation', onTilt); }).catch(() => {});
  else addEventListener('deviceorientation', onTilt);
}
el.canvas.addEventListener('pointerdown', (e) => {
  askTilt();
  unlockAudio();
  down = { x: e.clientX, y: e.clientY, lastX: e.clientX, moved: 0, t: performance.now() };
  try { el.canvas.setPointerCapture(e.pointerId); } catch {}
  lookAtEvent(e);
});
el.canvas.addEventListener('pointermove', (e) => {
  lookAtEvent(e);
  if (!down) return;
  const dx = e.clientX - down.lastX; down.lastX = e.clientX;
  down.moved = Math.max(down.moved, Math.hypot(e.clientX - down.x, e.clientY - down.y));
  if (down.moved > 8 && ghost) { ghost.dragging = true; ghost.dragBy(dx); }
});
const endDrag = () => {
  if (!down) return;
  const wasTap = down.moved < 8 && performance.now() - down.t < 500;
  if (ghost) ghost.dragging = false;
  down = null;
  if (wasTap) onTapGhost();
};
el.canvas.addEventListener('pointerup', endDrag);
el.canvas.addEventListener('pointercancel', () => { if (ghost) ghost.dragging = false; down = null; });

let tapIdx = 0, lastTapMsg = 0;
function onTapGhost() {
  ghost?.react();
  el.hint.classList.add('gone');
  const now = performance.now();
  if (!busy && now - lastTapMsg > 2500) {
    lastTapMsg = now;
    const line = T[lang].taps[tapIdx++ % T[lang].taps.length];
    speak(line, { device: true });   // short tap reactions use the on-device voice (no API call)
  }
}
setTimeout(() => el.hint.classList.add('gone'), 6000);

// ---------- UI state ----------
function setState(s) {
  ghost?.setState(s);
  const t = T[lang];
  el.status.textContent = s === 'listening' ? t.listening : s === 'thinking' ? t.thinking : s === 'speaking' ? t.speaking : t.online;
  el.dot.classList.toggle('pulse', s !== 'idle');
}
function applyLang() {
  const t = T[lang];
  el.lang.textContent = lang.toUpperCase();
  el.input.placeholder = t.placeholder;
  el.hint.textContent = t.hint;
  document.documentElement.lang = lang;
  if (recog) recog.lang = lang === 'id' ? 'id-ID' : 'en-US';
  setState(ghost?.state || 'idle');
  updateChip();
  el.voiceInfo.textContent = t.voiceInfo(!!SR, 'speechSynthesis' in window);
}
function updateChip() {
  const live = !!getKey();
  el.chip.textContent = live ? T[lang].live : T[lang].demo;
  el.chip.classList.toggle('live', live);
}
function applyMute() { el.mute.classList.toggle('muted', muted); el.mute.setAttribute('aria-label', muted ? 'Unmute voice' : 'Mute voice'); }

function addMsg(role, text, extraClass = '') {
  const d = document.createElement('div');
  d.className = `msg ${role} ${extraClass}`.trim();
  // safe text + linkify aistudio
  const parts = String(text).split(/(aistudio\.google\.com\/apikey)/);
  for (const p of parts) {
    if (p === 'aistudio.google.com/apikey') { const a = document.createElement('a'); a.href = 'https://aistudio.google.com/apikey'; a.target = '_blank'; a.rel = 'noopener'; a.textContent = p; d.appendChild(a); }
    else d.appendChild(document.createTextNode(p.replace(/\*\*(.+?)\*\*/g, '$1')));
  }
  el.log.appendChild(d);
  if (role === 'bot') { const st = document.getElementById('subText'); if (st) { st.textContent = d.textContent; st.parentElement.classList.remove('show'); void st.offsetWidth; st.parentElement.classList.add('show'); } }
  while (el.log.children.length > 60) el.log.firstChild.remove();
  el.log.scrollTop = el.log.scrollHeight;
  return d;
}
function addTyping() { const d = document.createElement('div'); d.className = 'msg bot typing'; d.innerHTML = '<i></i><i></i><i></i>'; el.log.appendChild(d); el.log.scrollTop = el.log.scrollHeight; return d; }

function saveHistory() { if (ls.get(LS.persist) === '1') ls.set(LS.hist, JSON.stringify(history.slice(-MAX_TURNS))); }

// ---------- Chat ----------
async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  busy = true; el.send.disabled = true;
  stopSpeaking();
  addMsg('user', text);
  ghost?.surprise?.();
  document.body.classList.add('has-chat');
  el.input.value = '';
  setState('thinking');
  const typing = addTyping();
  let reply, isErr = false;
  const key = getKey();
  if (!key) {
    await new Promise(r => setTimeout(r, 900 + Math.random() * 500));
    reply = demoReply(text, lang);
  } else {
    history.push({ role: 'user', parts: [{ text }] });
    history = history.slice(-MAX_TURNS);
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await askGemini({ key, model: getModel(), system: SYSTEM_PROMPT(BOT_NAME), history, signal: ctrl.signal });
      reply = res.text;
      if (res.model !== getModel()) ls.set(LS.model, res.model);
      history.push({ role: 'model', parts: [{ text: reply }] });
      saveHistory();
    } catch (e) {
      history.pop(); isErr = true;
      const t = T[lang];
      const k = e instanceof GeminiError ? e.kind : 'api';
      reply = k === 'key' ? t.errKey : k === 'quota' ? t.errQuota : k === 'network' ? t.errNet : k === 'timeout' ? t.errTimeout : k === 'blocked' ? t.errBlocked : t.errOther + (e.message || '').slice(0, 140);
      console.warn('Gemini error:', e);
    } finally { clearTimeout(to); }
  }
  typing.remove();
  if (isErr) ghost && (ghost.happy = 0);
  speak(reply);
  await streamMsg(reply, isErr ? 'err' : '');
  busy = false; el.send.disabled = false;
  if (!voice.speaking && !recognizing) setState('idle');
}

// Typewriter-style reveal so replies "stream" in while the ghost glows/speaks.
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function streamMsg(text, cls) {
  const d = document.createElement('div');
  d.className = `msg bot ${cls}`.trim();
  el.log.appendChild(d);
  for (let i = 0; i <= text.length; i += 2) {
    d.textContent = text.slice(0, i);
    el.log.scrollTop = el.log.scrollHeight;
    if (ghost && ghost.state !== 'speaking') setState('speaking');
    if (ghost) ghost.speakLevel = 0.3 + 0.7 * Math.abs(Math.sin(i * 0.7));
    await sleep(28);
  }
  d.remove();
  addMsg('bot', text, `${cls} nopop`);
  if (ghost) ghost.speakLevel = 0;
}
el.form.addEventListener('submit', (e) => { e.preventDefault(); unlockAudio(); send(el.input.value); el.input.blur(); });

// ---------- Speech output ----------
// v3: the old default (Aoede) moves to the cuter default once; a voice picked on purpose later is kept
if (ls.get('ghost.voiceV', '') !== '3') { if (ls.get(LS.gvoice, '') === 'Aoede') ls.set(LS.gvoice, DEFAULT_GEMINI_VOICE); ls.set('ghost.voiceV', '3'); }
const voicePrefs = () => ({ engine: ls.get(LS.engine, 'gemini'), geminiVoice: ls.get(LS.gvoice, DEFAULT_GEMINI_VOICE), deviceVoice: ls.get(LS.dvoice, ''), ttsModel: ls.get(LS.ttsModel, TTS_MODELS[0]) });
const voice = new Voice({
  getKey, getPrefs: voicePrefs,
  onLevel: (v) => { if (ghost) ghost.speakLevel = v; },
  onStart: () => { setState('speaking'); if (!el.sheet.hidden) showUsing(); },
  onEnd: () => { if (ghost) ghost.speakLevel = 0; if (!busy && !recognizing) setState('idle'); },
});
function unlockAudio() { voice.unlock(); }
// drive the ghost glow from the real audio level while the AI voice plays
(function levelLoop() { if (voice.source && ghost) ghost.speakLevel = voice.level(); requestAnimationFrame(levelLoop); })();
let speakTimer = null;
function speak(text, opts = {}) {
  if (muted) {
    // still animate the ghost briefly so it "talks"
    setState('speaking');
    clearTimeout(speakTimer);
    speakTimer = setTimeout(() => { if (ghost) ghost.speakLevel = 0; if (!busy && !recognizing) setState('idle'); }, Math.min(4000, 600 + text.length * 35));
    return;
  }
  voice.speak(text, lang, opts);
}
function stopSpeaking() { voice.stop(); clearTimeout(speakTimer); if (ghost) ghost.speakLevel = 0; }

// ---------- Speech input ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null, recognizing = false, finalText = '';
if (SR) {
  recog = new SR();
  recog.continuous = false; recog.interimResults = true; recog.maxAlternatives = 1;
  recog.lang = lang === 'id' ? 'id-ID' : 'en-US';
  recog.onstart = () => { recognizing = true; finalText = ''; el.mic.classList.add('on'); setState('listening'); };
  recog.onresult = (ev) => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
    }
    el.input.value = (finalText + interim).trim();
  };
  recog.onerror = (ev) => {
    if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') addMsg('bot', T[lang].micDenied, 'err');
  };
  recog.onend = () => {
    recognizing = false; el.mic.classList.remove('on');
    const text = (finalText || el.input.value).trim();
    if (text) send(text); else if (!busy) setState('idle');
  };
} else {
  el.mic.classList.add('unsupported');
}
el.mic.addEventListener('click', () => {
  unlockAudio();
  if (!recog) { addMsg('bot', T[lang].micNo); el.input.focus(); return; }
  if (recognizing) { try { recog.stop(); } catch {} return; }
  stopSpeaking();
  try { recog.lang = lang === 'id' ? 'id-ID' : 'en-US'; recog.start(); } catch (e) { console.warn(e); }
});

// ---------- Header buttons ----------
el.mute.addEventListener('click', () => { unlockAudio(); muted = !muted; ls.set(LS.mute, muted ? '1' : '0'); if (muted) stopSpeaking(); applyMute(); });
el.lang.addEventListener('click', () => { lang = lang === 'en' ? 'id' : 'en'; ls.set(LS.lang, lang); applyLang(); });

// ---------- Settings sheet ----------
for (const m of MODELS) { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; el.model.appendChild(o); }
const vEl = { engine: $('engineSelect'), g: $('geminiVoiceSelect'), d: $('deviceVoiceSelect'), test: $('testVoiceBtn') };
for (const [id, label] of GEMINI_VOICES) { const o = document.createElement('option'); o.value = id; o.textContent = label; vEl.g.appendChild(o); }
function fillDeviceVoices() {
  vEl.d.innerHTML = '';
  const auto = document.createElement('option'); auto.value = ''; auto.textContent = 'Auto (best natural voice)'; vEl.d.appendChild(auto);
  for (const v of voice.listDeviceVoices()) { const o = document.createElement('option'); o.value = v.voiceURI || v.name; o.textContent = `${v.name} (${v.lang})`; vEl.d.appendChild(o); }
  vEl.d.value = ls.get(LS.dvoice, '');
}
function syncVoiceUI() { const dev = vEl.engine.value === 'device'; vEl.g.hidden = dev; vEl.d.hidden = !dev; }
vEl.engine.addEventListener('change', () => { syncVoiceUI(); saveVoicePrefs(); voice.lastUsed = null; showUsing(); });
vEl.g.addEventListener("change", () => { saveVoicePrefs(); voice.lastUsed = null; showUsing(); });
vEl.d.addEventListener("change", () => { saveVoicePrefs(); voice.lastUsed = null; showUsing(); });
function saveVoicePrefs() { ls.set(LS.engine, vEl.engine.value); ls.set(LS.gvoice, vEl.g.value); ls.set(LS.dvoice, vEl.d.value); }
vEl.test.addEventListener('click', () => {
  unlockAudio(); saveVoicePrefs();
  const k = el.key.value.trim(); if (k && k !== getKey()) ls.set(LS.key, k);
  speak(lang === 'id' ? `Halo! Aku ${BOT_NAME}. Begini suaraku sekarang, lebih natural kan?` : `Hey! I'm ${BOT_NAME}. This is how I sound now. Pretty natural, right?`);
});
function showUsing() { document.getElementById('voiceUsing').textContent = 'Using: ' + voice.describe(lang); }
function openSheet() {
  setTimeout(showUsing, 0);
  fillDeviceVoices(); vEl.engine.value = ls.get(LS.engine, 'gemini'); vEl.g.value = ls.get(LS.gvoice, DEFAULT_GEMINI_VOICE); syncVoiceUI();
  el.key.value = getKey(); el.key.type = 'password'; el.showKey.textContent = 'Show';
  el.model.value = getModel(); el.persist.checked = ls.get(LS.persist) === '1';
  el.sheet.hidden = false; el.backdrop.hidden = false;
}
function closeSheet() { el.sheet.hidden = true; el.backdrop.hidden = true; }
el.settings.addEventListener('click', () => { unlockAudio(); openSheet(); });
el.backdrop.addEventListener('click', closeSheet);
el.showKey.addEventListener('click', () => { const s = el.key.type === 'password'; el.key.type = s ? 'text' : 'password'; el.showKey.textContent = s ? 'Hide' : 'Show'; });
el.save.addEventListener('click', () => {
  const k = el.key.value.trim();
  const had = !!getKey();
  if (k) ls.set(LS.key, k); else ls.del(LS.key);
  ls.set(LS.model, el.model.value);
  saveVoicePrefs();
  ls.set(LS.persist, el.persist.checked ? '1' : '0');
  if (el.persist.checked) saveHistory(); else ls.del(LS.hist);
  closeSheet(); updateChip();
  if (k && !had) { addMsg('bot', T[lang].saved); ghost?.react(); }
});
el.clearKey.addEventListener('click', () => { ls.del(LS.key); el.key.value = ''; updateChip(); closeSheet(); addMsg('bot', T[lang].removed); });
el.clearChat.addEventListener('click', () => { history = []; ls.del(LS.hist); el.log.innerHTML = ''; closeSheet(); addMsg('bot', T[lang].cleared); });

// ---------- Boot ----------
applyLang(); applyMute();
if (history.length) for (const h of history.slice(-8)) addMsg(h.role === 'user' ? 'user' : 'bot', h.parts?.[0]?.text || '');
addMsg('bot', getKey() ? T[lang].hello : T[lang].helloDemo);

// suggestion chips (UI-4)
document.querySelectorAll('.chips button').forEach(b => b.addEventListener('click', () => { unlockAudio(); send(b.dataset.q || b.textContent); }));
document.querySelector('.greet .g-hi').textContent = `Hi, I'm ${BOT_NAME}!`;

// test hook for automated screenshots
window.__ghost = { send, ghost: () => ghost, setState };
if (new URLSearchParams(location.search).has('icon') && ghost) { ghost.iconMode = true; document.body.classList.add('iconmode'); }
document.getElementById('verLabel').textContent = `Echo ${APP_VERSION}`;
