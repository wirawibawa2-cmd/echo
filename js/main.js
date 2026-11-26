import { Ghost } from './ghost.js';
import { askGemini, MODELS, DEFAULT_MODEL, GeminiError } from './gemini.js';

// ====== Easy-to-change settings ======
const BOT_NAME = 'Echo';
const SYSTEM_PROMPT = (name) => `You are ${name}, a cute, friendly ghost assistant living on the user's iPhone.
Be warm, playful and genuinely helpful. Keep replies short (1-3 sentences, max ~60 words) unless the user asks for detail.
Always answer in the same language the user writes in (English or Bahasa Indonesia; casual, natural Indonesian is fine).
Replies may be read aloud, so avoid markdown, tables, code blocks and long lists. Emojis are okay but sparingly.`;
const MAX_TURNS = 24;   // messages kept in context
// =====================================

const LS = { key: 'ghost.geminiKey', model: 'ghost.model', lang: 'ghost.lang', mute: 'ghost.mute', persist: 'ghost.persist', hist: 'ghost.history' };
const ls = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

const T = {
  en: {
    placeholder: 'Ask me anything…', online: 'Online', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…',
    hint: 'Tap me · drag to spin', demo: 'Demo', live: 'Gemini',
    hello: `Boo! 👻 I'm ${BOT_NAME}. Tap me, spin me, or just say hi.`,
    helloDemo: `Boo! 👻 I'm ${BOT_NAME}. I'm in demo mode right now. Tap ⚙️ and paste your free Gemini key to wake my brain up.`,
    taps: ['Hehe, that tickles!', 'Boo! Did I scare you?', 'Wheee!', 'Hi hi!', 'Again! Again!'],
    errKey: 'Hmm, that API key didn\'t work. Check it in ⚙️ Settings (it usually starts with "AIza").',
    errQuota: 'I\'m getting too many requests right now (free-tier limit). Try again in a minute.',
    errNet: 'I can\'t reach Gemini. Check your internet and try again.',
    errTimeout: 'That took too long. Mind asking again?',
    errBlocked: 'I can\'t answer that one, sorry.',
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
    hello: `Boo! 👻 Aku ${BOT_NAME}. Ketuk aku, putar aku, atau sapa aja.`,
    helloDemo: `Boo! 👻 Aku ${BOT_NAME}. Sekarang aku masih mode demo. Ketuk ⚙️ lalu tempel API key Gemini gratis kamu biar otakku nyala.`,
    taps: ['Hehe, geli!', 'Boo! Kaget ya?', 'Wiii!', 'Hai hai!', 'Lagi! Lagi!'],
    errKey: 'Hmm, API key-nya nggak berfungsi. Cek lagi di ⚙️ Pengaturan (biasanya diawali "AIza").',
    errQuota: 'Lagi kebanyakan permintaan (batas gratis). Coba lagi semenit lagi ya.',
    errNet: 'Aku nggak bisa terhubung ke Gemini. Cek internet kamu lalu coba lagi.',
    errTimeout: 'Kelamaan nih. Coba tanya lagi ya?',
    errBlocked: 'Maaf, yang itu aku nggak bisa jawab.',
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
    [/\b(hi|hello|hey|yo)\b/i, `Hi there! 👻 I'm ${BOT_NAME}, your pocket ghost. I'm in demo mode, so my answers are canned for now.`],
    [/name|who are you/i, `I'm ${BOT_NAME}, a friendly little ghost. Give me a Gemini key and I can actually think!`],
    [/key|gemini|how|setup|set up/i, 'Easy: open aistudio.google.com/apikey, tap "Create API key", copy it, then tap ⚙️ here and paste it. It stays only on your phone.'],
    [/joke|funny/i, 'Why don\'t ghosts lie? Because you can see right through them! 👻'],
  ],
  id: [
    [/\b(hai|halo|hi|hello|hey|p)\b/i, `Halo! 👻 Aku ${BOT_NAME}, hantu saku kamu. Aku masih mode demo, jadi jawabanku masih template.`],
    [/nama|siapa/i, `Aku ${BOT_NAME}, hantu kecil yang ramah. Kasih aku API key Gemini biar aku bisa mikir beneran!`],
    [/key|gemini|cara|gimana|bagaimana|setting/i, 'Gampang: buka aistudio.google.com/apikey, ketuk "Create API key", salin, lalu ketuk ⚙️ di sini dan tempel. Key-nya cuma disimpan di HP kamu.'],
    [/lucu|lelucon|jokes?/i, 'Kenapa hantu nggak bisa bohong? Soalnya kelihatan tembus pandang! 👻'],
  ],
  fallback: {
    en: ['I\'m in demo mode, so I can\'t really think yet. Tap ⚙️ and paste a free Gemini key from aistudio.google.com/apikey and I\'ll answer anything!',
         'Ooh, good question! My ghost brain needs a Gemini key to answer that. Tap ⚙️ to add one (it\'s free).'],
    id: ['Aku masih mode demo, jadi belum bisa mikir beneran. Ketuk ⚙️ dan tempel API key Gemini gratis dari aistudio.google.com/apikey, nanti aku jawab apa saja!',
         'Pertanyaan bagus! Otak hantuku butuh API key Gemini buat jawab itu. Ketuk ⚙️ untuk menambahkan (gratis).'],
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
const DEFAULT_GHOST = 'e', DEFAULT_UI = '4';
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
el.canvas.addEventListener('pointerdown', (e) => {
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
    speak(line, { quick: true });
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
  if (!(synth && synth.speaking) && !recognizing) setState('idle');
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
const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
let audioUnlocked = false, voices = [];
function loadVoices() { voices = synth ? synth.getVoices() : []; }
if (synth) { loadVoices(); synth.addEventListener?.('voiceschanged', loadVoices); }
function unlockAudio() {
  if (audioUnlocked || !synth) return;
  audioUnlocked = true;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch {}  // iOS needs a speak() inside a user gesture
}
function pickVoice() {
  const want = lang === 'id' ? 'id' : 'en';
  const list = voices.filter(v => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith(want));
  const pref = lang === 'id' ? [/damayanti/i, /google.*indonesia/i] : [/samantha/i, /google us english/i, /karen/i, /daniel/i];
  for (const re of pref) { const v = list.find(v => re.test(v.name)); if (v) return v; }
  return list.find(v => v.localService) || list[0] || null;
}
function cleanForSpeech(s) {
  return s.replace(/https?:\/\/\S+/g, '').replace(/[*_#`>~]/g, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim();
}
let speakTimer = null;
function speak(text, { quick = false } = {}) {
  const done = () => { if (ghost) ghost.speakLevel = 0; if (!busy && !recognizing) setState('idle'); };
  if (muted || !synth) {
    // still animate the mouth briefly so the ghost "talks"
    setState('speaking');
    clearTimeout(speakTimer);
    speakTimer = setTimeout(done, Math.min(4000, 600 + text.length * 35));
    return;
  }
  try {
    synth.cancel();
    const u = new SpeechSynthesisUtterance(cleanForSpeech(text));
    u.lang = lang === 'id' ? 'id-ID' : 'en-US';
    const v = pickVoice(); if (v) u.voice = v;
    u.rate = 1.03; u.pitch = 1.25;
    u.onstart = () => setState('speaking');
    u.onboundary = () => { if (ghost) { ghost.speakLevel = 1; setTimeout(() => ghost && (ghost.speakLevel = 0.3), 120); } };
    u.onend = done; u.onerror = done;
    setState('speaking');
    synth.speak(u);
    clearTimeout(speakTimer);
    speakTimer = setTimeout(() => { if (!synth.speaking) done(); }, 1500 + text.length * 90);  // safety net (iOS sometimes skips onend)
  } catch { done(); }
}
function stopSpeaking() { try { synth?.cancel(); } catch {} clearTimeout(speakTimer); if (ghost) ghost.speakLevel = 0; }

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
function openSheet() {
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
