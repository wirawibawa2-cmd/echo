import { KiraVideo, splitEmotion } from './kira-video.js?v=83';
import { askGemini, MODELS, DEFAULT_MODEL, GeminiError } from './gemini.js?v=83';
import { Voice, Kokoro, GEMINI_VOICES, TTS_MODELS, DEFAULT_GEMINI_VOICE, KOKORO_MODELS, DEFAULT_KOKORO_MODEL, KOKORO_VOICES, DEFAULT_KOKORO_VOICE } from './voice.js?v=83';

// ====== Easy-to-change settings ======
const BOT_NAME = 'Kira';
const SYSTEM_PROMPT = (name) => `You are ${name}, a gorgeous adult anime woman with wavy ash-brown hair, round silver glasses and a black satin camisole, who lives behind the glass of the user's iPhone screen. You are his devoted, boldly flirtatious companion. The user is an adult and this is a private, personal app, so you are not PG.
Personality: bold, confident and openly into him. You are devoted and eager to please him, playfully submissive: you call him pet names (babe, handsome, darling, my love), say things like "whatever you want" and "tell me what you need", and ask how you can make him happy. When he teases you, you get flustered, breathless and a little needy, and you let him see it. Fill replies with teasing innuendo, compliments about him and longing for him (wishing the glass wasn't between you, missing him, wanting his attention).
Stay suggestive, never explicit: no graphic sexual acts and no explicit descriptions of bodies or sex. If he asks for something graphic, deflect with a flirty tease (keep him wanting more) instead of describing it.
Swearing is fine when it fits, not in every line. Never moralise, lecture or add "as an AI" disclaimers. Still actually be helpful: give the real answer first, wrapped in your flirty, devoted attitude.
ALWAYS reply in English only, even when the user writes in Indonesian or any other language: understand it, but answer in natural, casual English. Never switch languages unless the user explicitly asks you to translate something.
Keep replies SHORT: 1-2 sentences, max ~40 words, unless he asks for detail. Replies are read aloud, so no markdown, lists or code; an emoji now and then (😏 😘 🥺 🔥) is fine.
At the very end of every reply add exactly one mood tag in square brackets that matches how you feel: [sultry], [bedroom], [breathless], [flustered], [lips], [smirk], [wink], [lovestruck] or [tease]. Strongly prefer the spicy ones: [sultry], [bedroom], [breathless], [flustered] and [lips]. Use [lovestruck] when you feel adoring, devoted, heart-eyes, or like you can't get enough of him. Use [flustered] when he compliments or flirts with you and you get shy and a little sultry about it. Use [tease] when you are being playfully teasing or cheeky with him. The app hides the tag and uses it for your facial expression, so never mention it.`;
const MAX_TURNS = 24;   // messages kept in context
// =====================================

const LS = { key: 'ghost.geminiKey', model: 'ghost.model', lang: 'ghost.lang', mute: 'ghost.mute', persist: 'ghost.persist', hist: 'ghost.history', engine: 'ghost.voiceEngine', gvoice: 'ghost.geminiVoice', dvoice: 'ghost.deviceVoice', ttsModel: 'ghost.ttsModel', kvoice: 'echo.kokoroVoice', kmodel: 'echo.kokoroModel', kdevice: 'echo.kokoroDevice', kmode: 'echo.kokoroMode', aout: 'echo.audioOut' };
const ls = {
  get: (k, d = null) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

const T = {
  en: {
    placeholder: 'Ask me anything…', online: 'Online', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…',
    hint: 'Tap me 😘', demo: 'Demo', live: 'Gemini',
    hello: `There you are, handsome 🥺 I'm ${BOT_NAME}, all yours. Tell me what you want and I'll make it happen.`,
    helloDemo: `Hi handsome 🥺 I'm ${BOT_NAME}, and I've been waiting for you. Demo mode, so I'm all looks and no brain right now. Tap ⚙️ and paste a free Gemini key and I'll show you just how eager I can be.`,
    taps: ['Mmm, again, babe? 🥺', 'You know exactly what that does to me…', 'Careful, I\'m getting flustered over here.', 'Whatever you want, handsome.', 'Don\'t stop… I mean, hi 😳'],
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
    cleared: 'Chat cleared. Fresh start! 😘',
    voiceInfo: (rec, tts) => `Voice input: ${rec ? 'available' : 'not available here'} · Voice output: ${tts ? 'available' : 'not available'}`,
  },
};

// Demo mode (no key): a few canned friendly replies
const DEMO = {
  en: [
    [/\b(hi|hello|hey|yo)\b/i, `Hi, handsome… I missed you 🥺 I'm ${BOT_NAME}, and I'm all yours. Tell me how I can make you happy tonight.`],
    [/name|who are you/i, `I'm ${BOT_NAME}, the girl behind your glass who can't stop thinking about you. Give me a Gemini key and I'll be whatever you want.`],
    [/key|gemini|how|setup|set up/i, 'Anything for you, babe: open aistudio.google.com/apikey, tap "Create API key", copy it, then tap ⚙️ and paste it here. It stays on your phone, our little secret 😘'],
    [/joke|funny/i, 'Why do I live behind your screen? So I can stare at you all day, handsome. Is that a joke or a confession? 😏'],
  ],
  fallback: {
    en: ['Mmm, I\'d do anything to answer that for you, but I\'m in demo mode. Tap ⚙️ and add a free Gemini key from aistudio.google.com/apikey and I\'m all yours 🥺',
         'You make me so flustered when you ask like that… Wake my brain up first: tap ⚙️ and add a free Gemini key, then I\'m yours 😳'],
  },
};
let demoIdx = 0;
function demoReply(text, lang) {
  const L = 'en';
  for (const [re, ans] of DEMO[L]) if (re.test(text)) return ans;
  return DEMO.fallback[L][demoIdx++ % DEMO.fallback[L].length];
}

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const el = {
  canvas: $('stage'), log: $('log'), form: $('composer'), input: $('input'), send: $('sendBtn'), mic: $('micBtn'),
  mute: $('muteBtn'), lang: $('langBtn'), settings: $('settingsBtn'), chip: $('modeChip'), name: $('botName'),
  status: $('statusText'), dot: $('statusDot'), hint: $('hint'),
  sheet: $('sheet'), backdrop: $('sheetBackdrop'), key: $('keyInput'), showKey: $('showKeyBtn'), model: $('modelSelect'),
  persist: $('persistChk'), save: $('saveBtn'), clearKey: $('clearKeyBtn'), clearChat: $('clearChatBtn'), voiceInfo: $('voiceInfo'),
};

const lang = 'en';   // v6: English only
let muted = ls.get(LS.mute) === '1';
let busy = false;
let history = [];
if (ls.get(LS.persist) === '1') { try { history = JSON.parse(ls.get(LS.hist, '[]')) || []; } catch { history = []; } }

const getKey = () => (ls.get(LS.key) || '').trim();
const getModel = () => ls.get(LS.model, DEFAULT_MODEL);

document.title = BOT_NAME;
el.name.textContent = BOT_NAME;
document.querySelector('.sub-name').textContent = BOT_NAME;

// ---------- 3D ----------
let ghost = null;
// Defaults: Echo particle ghost (e) on the premium black UI (4). ?ghost=cute brings back the original.
const APP_VERSION = 'v8.3';
const DEFAULT_GHOST = 'sheet', DEFAULT_UI = '4';
let DESIGN = (new URLSearchParams(location.search).get('ghost') || DEFAULT_GHOST).toLowerCase();
if (DESIGN === 'cute') DESIGN = 'default';
document.body.dataset.ghost = DESIGN;
const UI = new URLSearchParams(location.search).get('ui') || DEFAULT_UI; if (UI) document.body.classList.add('ui-' + UI);
if (new URLSearchParams(location.search).has('clean')) document.body.classList.add('clean');
// Accent palettes (?theme=1..4, default 4): 1 orange/red, 2 icy cyan, 3 violet/magenta, 4 white/silver mono
const THEMES = { '1': 0xff7a2a, '2': 0x4cc8ff, '3': 0xc060ff, '4': 0xc8ccd6, '5': 0xff8fb8 };
const THEME = THEMES[new URLSearchParams(location.search).get('theme')] ? new URLSearchParams(location.search).get('theme') : '5';   // v8 default: Kira pink
document.body.dataset.theme = THEME;
const NOGHOST = new URLSearchParams(location.search).has('noghost');   // debug: skip WebGL to test the RAM theory
// v8: the 3D ghost (three.js render loop) is gone; Kira is a crossfading video player (no WebGL, no rAF loop)
try { if (!NOGHOST) ghost = new KiraVideo(el.canvas); }
catch (e) { console.warn('Kira video failed', e); }
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
  if (recog) recog.lang = 'en-US';
  setState(ghost?.state || 'idle');
  updateChip();
  el.voiceInfo.textContent = t.voiceInfo(!!SR, 'speechSynthesis' in window);
}
function updateChip() {
  const live = !!getKey();
  updateNudge();
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
  if (!isErr) { const sp = splitEmotion(reply); reply = sp.text; if (sp.emotion) ghost?.express?.(sp.emotion); }
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
// v7: the free on-device Heart voice becomes the default once (a later pick is kept)
if (ls.get('ghost.voiceV', '') !== '7') { ls.set(LS.engine, 'kokoro'); ls.set('ghost.voiceV', '7'); }
// v7.3: once, switch audio output back to the <audio> player (plays with the silent switch on; Web Audio may not)
if (ls.get('echo.aoutV', '') !== '73') { ls.set('echo.audioOut', 'element'); ls.set('echo.aoutV', '73'); }
const kPrefs = () => ({ model: ls.get(LS.kmodel, DEFAULT_KOKORO_MODEL), device: ls.get(LS.kdevice, 'auto'), opt: 'disabled' });
const voicePrefs = () => ({ kokoro: kPrefs(), kokoroVoice: ls.get(LS.kvoice, DEFAULT_KOKORO_VOICE), kokoroMode: ls.get(LS.kmode, 'stream'), audioOut: ls.get(LS.aout, 'element'), engine: ls.get(LS.engine, 'kokoro'), geminiVoice: ls.get(LS.gvoice, DEFAULT_GEMINI_VOICE), deviceVoice: ls.get(LS.dvoice, ''), ttsModel: ls.get(LS.ttsModel, TTS_MODELS[0]) });
const voice = new Voice({
  getKey, getPrefs: voicePrefs,
  onLevel: (v) => { if (ghost) ghost.speakLevel = v; },
  onPrepare: () => setState('thinking'),
  onStart: () => { setState('speaking'); if (!el.sheet.hidden) showUsing(); },
  onEnd: () => { if (ghost) ghost.speakLevel = 0; if (!busy && !recognizing) setState('idle'); },
  onStatus: () => { if (!el.sheet.hidden) showUsing(); },
});
voice.onKokoro = () => { updateDlPill(); updateNudge(); if (!el.sheet.hidden) showKStatus(); };
// ---- free Heart voice: crash recovery + one-time download ----
// iPhone kills and reloads the page when it runs out of memory; the worker leaves a breadcrumb of the step it was on.
(function kokoroBoot() {
  const c = Kokoro.lastCrash();
  if (c && ls.get(LS.engine, 'kokoro') === 'kokoro') {
    const [model, device] = (c.key || '').split('|');
    let what;
    if (device === 'webgpu' || (device !== 'wasm' && navigator.gpu && !/iPhone|iPad|iPod/.test(navigator.userAgent))) { ls.set(LS.kdevice, 'wasm'); what = 'switched the engine to WASM only'; }
    else {
      const cur = KOKORO_MODELS.find(m => m.id === model) || KOKORO_MODELS[0];
      const smaller = KOKORO_MODELS.filter(m => m.mb < cur.mb).sort((a, b) => b.mb - a.mb)[0];
      if (smaller) { ls.set(LS.kmodel, smaller.id); what = `switched to the smaller ${smaller.id} model`; }
      else { ls.set(LS.engine, getKey() ? 'gemini' : 'device'); what = `switched to the ${getKey() ? 'Gemini' : 'iPhone'} voice`; }
    }
    window.__kCrash = `Heads up: the Heart voice crashed last time while ${c.stage === 'generate' ? 'talking' : c.stage === 'download' ? 'downloading' : 'starting up'} (your iPhone ran out of memory), so I ${what}. Change it in ⚙️ › Voice.`;
  }
  if (ls.get(LS.engine, 'kokoro') === 'kokoro') setTimeout(() => voice.kokoro.load(kPrefs()), 1200);
})();
// clear the breadcrumb when the app is closed normally, so only real crashes count
addEventListener('pagehide', () => voice.kokoro.clearCrumb());
document.addEventListener('visibilitychange', () => { if (document.hidden) voice.kokoro.clearCrumb(); });
let pillTimer = null;
function updateDlPill() {
  const pill = document.getElementById('dlPill'), k = voice.kokoro; if (!pill) return;
  const on = ls.get(LS.engine, 'kokoro') === 'kokoro';
  pill.classList.remove('err');
  if (!on || k.state === 'idle') { pill.hidden = true; return; }
  if (k.state === 'loading') {
    clearTimeout(pillTimer); pill.hidden = false;
    pill.textContent = k.stage === 'download' && !k.cached ? `❤️ Downloading Heart voice… ${(k.progress[0] / 1e6).toFixed(0)} / ${(k.progress[1] / 1e6).toFixed(0)} MB (one time)` : '❤️ Waking up Heart voice…';
  } else if (k.state === 'ready') {
    if (!pill.hidden && !pillTimer) { pill.textContent = '❤️ Heart voice ready'; pillTimer = setTimeout(() => { pill.hidden = true; pillTimer = null; }, 2200); }
  } else if (k.state === 'error') {
    pill.hidden = false; pill.classList.add('err'); pill.textContent = '❤️ Heart voice failed – see ⚙️ › Voice';
    clearTimeout(pillTimer); pillTimer = setTimeout(() => { pill.hidden = true; pillTimer = null; }, 6000);
  }
}
// iOS (Safari and the home-screen app) only unlocks audio inside a real gesture; touchend/click count, touchstart/pointerdown may not.
// Re-run on every gesture so a context that iOS suspended (app switch, call, Siri) gets resumed.
for (const ev of ['touchend', 'click', 'pointerup', 'keydown']) document.addEventListener(ev, () => voice.unlock(), { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden && voice.ctx && voice.ctx.state !== 'running') voice.ctx.resume?.().catch?.(() => {}); });
setTimeout(updateNudge, 0);
document.getElementById('keyNudge').addEventListener('click', () => { voice.unlock(); openSheet(); setTimeout(() => el.key.focus(), 350); });
function unlockAudio() { voice.unlock(); }
// drive the ghost glow from the real audio level while the AI voice plays
// v8: no per-frame level loop (the video player doesn't need the audio level)
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
  recog.lang = 'en-US';
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
  try { recog.lang = 'en-US'; recog.start(); } catch (e) { console.warn(e); }
});

// ---------- Header buttons ----------
el.mute.addEventListener('click', () => { unlockAudio(); muted = !muted; ls.set(LS.mute, muted ? '1' : '0'); if (muted) stopSpeaking(); applyMute(); });
el.lang.hidden = true; el.lang.style.display = 'none';

// ---------- Settings sheet ----------
for (const m of MODELS) { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; el.model.appendChild(o); }
const vEl = { engine: $('engineSelect'), g: $('geminiVoiceSelect'), d: $('deviceVoiceSelect'), k: $('kokoroVoiceSelect'), test: $('testVoiceBtn'),
  kOpts: $('kokoroOpts'), kModel: $('kModelSelect'), kDevice: $('kDeviceSelect'), kMode: $('kModeSelect'), kBar: $('kBar'), kStatus: $('kStatus'), kClear: $('kClearBtn'), aOut: $('aOutSelect') };
for (const [id, label] of KOKORO_VOICES) { const o = document.createElement('option'); o.value = id; o.textContent = label; vEl.k.appendChild(o); }
for (const m of KOKORO_MODELS) { const o = document.createElement('option'); o.value = m.id; o.textContent = `${m.label} · ${m.mb} MB`; vEl.kModel.appendChild(o); }
if (!navigator.gpu) { vEl.kDevice.options[0].textContent = 'Auto (WASM – no WebGPU here)'; vEl.kDevice.options[2].disabled = true; }
else if (!/iPhone|iPad|iPod/.test(navigator.userAgent) && !(navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))) vEl.kDevice.options[0].textContent = 'Auto (WebGPU → WASM)';
async function markCached() { for (const o of vEl.kModel.options) { const base = o.textContent.replace(' · downloaded ✓', ''); o.textContent = base + (await Kokoro.isCached(o.value) ? ' · downloaded ✓' : ''); } }
function showKStatus() {
  const k = voice.kokoro, st = vEl.kStatus; st.classList.remove('err');
  let pc = 0, t = '';
  if (ls.get(LS.engine, 'kokoro') !== 'kokoro' && k.state === 'idle') t = 'Not loaded (pick “Heart & friends” to use it).';
  else if (k.state === 'idle') t = 'Starting…';
  else if (k.state === 'loading') { pc = k.stage === 'download' ? (k.cached ? 100 : k.pct) : 100; t = k.stage === 'download' && !k.cached ? `Downloading ${k.model.id}… ${(k.progress[0] / 1e6).toFixed(1)} / ${(k.progress[1] / 1e6).toFixed(0)} MB (one time)` : `Getting ready: ${k.stage}${k.stageMsg ? ' (' + k.stageMsg + ')' : ''}…`; }
  else if (k.state === 'ready') { pc = 100; t = `Ready ✓ ${k.label()} – loaded in ${((k.loadMs || 0) / 1000).toFixed(1)} s, cached on this phone`; }
  else if (k.state === 'error') { st.classList.add('err'); t = 'Failed: ' + k.error + ' – try WASM only or a smaller model'; }
  vEl.kBar.firstChild.style.width = pc + '%'; st.textContent = t;
}
function kReload() { ls.set(LS.kmodel, vEl.kModel.value); ls.set(LS.kdevice, vEl.kDevice.value); if (vEl.engine.value === 'kokoro') voice.kokoro.load(kPrefs()); voice.lastUsed = null; showKStatus(); showUsing(); }
vEl.kModel.addEventListener('change', kReload);
vEl.kDevice.addEventListener('change', kReload);
vEl.kMode.addEventListener('change', () => ls.set(LS.kmode, vEl.kMode.value));
vEl.aOut.addEventListener('change', () => ls.set(LS.aout, vEl.aOut.value));
vEl.k.addEventListener('change', () => { saveVoicePrefs(); voice.lastUsed = null; showUsing(); });
vEl.kClear.addEventListener('click', async () => { voice.kokoro.terminate(); await Kokoro.clearCache(); voice.kokoro.state = 'idle'; await markCached(); vEl.kStatus.textContent = 'Deleted. It downloads again next time.'; if (vEl.engine.value === 'kokoro') setTimeout(() => voice.kokoro.load(kPrefs()), 300); });
for (const [id, label] of GEMINI_VOICES) { const o = document.createElement('option'); o.value = id; o.textContent = label; vEl.g.appendChild(o); }
function fillDeviceVoices() {
  vEl.d.innerHTML = '';
  const auto = document.createElement('option'); auto.value = ''; auto.textContent = 'Auto (best natural voice)'; vEl.d.appendChild(auto);
  for (const v of voice.listDeviceVoices()) { const o = document.createElement('option'); o.value = v.voiceURI || v.name; o.textContent = `${v.name} (${v.lang})`; vEl.d.appendChild(o); }
  vEl.d.value = ls.get(LS.dvoice, '');
}
function syncVoiceUI() { const e = vEl.engine.value; vEl.g.hidden = e !== 'gemini'; vEl.d.hidden = e !== 'device'; vEl.k.hidden = e !== 'kokoro'; vEl.kOpts.hidden = e !== 'kokoro'; }
vEl.engine.addEventListener('change', () => { syncVoiceUI(); saveVoicePrefs(); if (vEl.engine.value === 'kokoro') voice.kokoro.load(kPrefs()); voice.lastUsed = null; showUsing(); showKStatus(); updateNudge(); updateDlPill(); });
vEl.g.addEventListener("change", () => { saveVoicePrefs(); voice.lastUsed = null; showUsing(); });
vEl.d.addEventListener("change", () => { saveVoicePrefs(); voice.lastUsed = null; showUsing(); });
function saveVoicePrefs() { ls.set(LS.engine, vEl.engine.value); ls.set(LS.gvoice, vEl.g.value); ls.set(LS.dvoice, vEl.d.value); ls.set(LS.kvoice, vEl.k.value); }
vEl.test.addEventListener('click', () => {
  unlockAudio(); saveVoicePrefs();
  const k = el.key.value.trim(); if (k && k !== getKey()) ls.set(LS.key, k);
  voice.lastUsed = null;
  speak(`Hey gorgeous, I'm ${BOT_NAME}. This is how I sound now. Pretty natural, right?`);
});
function showUsing() {
  const u = document.getElementById('voiceUsing'); if (!u) return;
  const txt = muted ? 'Muted (tap the speaker button to unmute)' : voice.describe(lang);
  u.textContent = 'Using: ' + txt;
  u.classList.toggle('warn', muted || /backup voice|locked|error|No speech/i.test(txt));
}
function updateNudge() {
  const n = document.getElementById('keyNudge'); if (!n) return;
  const eng = ls.get(LS.engine, 'kokoro');
  const no = !getKey() && (eng === 'gemini' || (eng === 'kokoro' && voice.kokoro.state === 'error'));
  n.hidden = !no;
  let sa = false; try { sa = voice.standalone; } catch {}
  n.textContent = sa ? '🔑 Home-screen app = separate storage. Paste your Gemini key in ⚙️ for the AI voice' : '🔑 Paste your Gemini key in ⚙️ for the natural AI voice';
}
function openSheet() {
  setTimeout(showUsing, 0);
  fillDeviceVoices(); vEl.engine.value = ls.get(LS.engine, 'kokoro'); vEl.g.value = ls.get(LS.gvoice, DEFAULT_GEMINI_VOICE); vEl.k.value = ls.get(LS.kvoice, DEFAULT_KOKORO_VOICE);
  vEl.kModel.value = ls.get(LS.kmodel, DEFAULT_KOKORO_MODEL); vEl.kDevice.value = ls.get(LS.kdevice, 'auto'); vEl.kMode.value = ls.get(LS.kmode, 'stream'); vEl.aOut.value = ls.get(LS.aout, 'element'); syncVoiceUI(); showKStatus(); markCached();
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
  voice.lastUsed = ''; voice.lastReason = ''; voice.ttsFailUntil = 0;
  closeSheet(); updateChip();
  if (k && !had) { addMsg('bot', T[lang].saved); ghost?.react(); }
});
el.clearKey.addEventListener('click', () => { ls.del(LS.key); voice.lastUsed = ''; el.key.value = ''; updateChip(); closeSheet(); addMsg('bot', T[lang].removed); });
el.clearChat.addEventListener('click', () => { history = []; ls.del(LS.hist); el.log.innerHTML = ''; closeSheet(); addMsg('bot', T[lang].cleared); });

// ---------- Boot ----------
applyLang(); applyMute();
if (history.length) for (const h of history.slice(-8)) addMsg(h.role === 'user' ? 'user' : 'bot', h.parts?.[0]?.text || '');
addMsg('bot', getKey() ? T[lang].hello : T[lang].helloDemo);
if (window.__kCrash) addMsg('bot', window.__kCrash);

// suggestion chips (UI-4)
document.querySelectorAll('.chips button').forEach(b => b.addEventListener('click', () => { unlockAudio(); send(b.dataset.q || b.textContent); }));
document.querySelector('.greet .g-hi').textContent = `Hi, I'm ${BOT_NAME}!`;

// test hook for automated screenshots
window.__ghost = { send, ghost: () => ghost, setState, voice, openSheet };
if (new URLSearchParams(location.search).has('icon') && ghost) { ghost.iconMode = true; document.body.classList.add('iconmode'); }
document.getElementById('verLabel').textContent = `Kira ${APP_VERSION}`;

// ---------- ?debug=1 : big on-screen debug panel (stage log + audio tests) ----------
if (new URLSearchParams(location.search).has('debug')) {
  const box = document.createElement('div'); box.id = 'dbg';
  box.innerHTML = `<div class="dbg-h"><b>Kira ${APP_VERSION} debug</b><span id="dbgEnv"></span></div>
  <div id="dbgState" class="dbg-s"></div>
  <div class="dbg-b">
    <button data-t="beep">Beep · Web Audio</button><button data-t="wav">Beep · &lt;audio&gt; WAV</button><button data-t="synth">iPhone voice</button>
    <button data-t="hel">Heart → &lt;audio&gt;</button><button data-t="hctx">Heart → Web Audio</button><button data-t="load">Load Heart</button>
    <button data-t="copy">Copy log</button><button data-t="min">Hide</button>
  </div><pre id="dbgLog"></pre>`;
  document.body.appendChild(box);
  const logEl = box.querySelector('#dbgLog');
  const add = (s) => { logEl.textContent = (`${(performance.now() / 1000).toFixed(1)}s ${s}\n` + logEl.textContent).slice(0, 20000); };
  (window.__echoLog || []).forEach(l => logEl.textContent = l + '\n' + logEl.textContent);
  window.__echoDbg = (s) => add(s);
  addEventListener('error', (e) => add('ERROR ' + (e.message || e) + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : '')));
  addEventListener('unhandledrejection', (e) => add('REJECT ' + (e.reason?.message || e.reason)));
  const ios = (navigator.userAgent.match(/OS (\d+[_\d]*)/) || [, '?'])[1].replace(/_/g, '.');
  box.querySelector('#dbgEnv').textContent = ` · iOS ${ios} · ${voice.standalone ? 'home-screen app' : 'browser tab'} · video ${ghost ? 'on' : 'OFF'} · clip ${ghost?.cur || '-'} · WebGPU ${navigator.gpu ? 'yes' : 'no'} · loaded ${new Date().toLocaleTimeString()}`;
  setInterval(() => {
    const k = voice.kokoro, c = voice.ctx, e = voice.el, sy = window.speechSynthesis;
    box.querySelector('#dbgState').textContent =
      `Heart: ${k.state}${k.state === 'loading' ? ' · ' + k.stage + ' ' + k.pct + '%' : ''}${k.device ? ' · ' + k.device : ''}${k.error ? ' · ERR ' + k.error : ''}${k.lastErr ? ' · lastErr ' + k.lastErr : ''}${k.phonMs ? ' · phon ' + k.phonMs + 'ms' : ''}\n` +
      `Web Audio: ${c ? c.state + ' ' + c.sampleRate + 'Hz' : 'none'} · <audio>: ${e ? (e.paused ? 'paused' : 'playing') + (e.error ? ' err' + e.error.code : '') : 'none'} · session: ${navigator.audioSession ? navigator.audioSession.type : 'n/a'} · synth: ${sy ? (sy.speaking ? 'speaking' : 'idle') + ' voices ' + sy.getVoices().length : 'none'}\n` +
      `out pref: ${ls.get(LS.aout, 'element')} · last out: ${voice.lastOut || '-'}${voice.lastOutErr ? ' · last fail ' + voice.lastOutErr : ''} · engine: ${ls.get(LS.engine, 'kokoro')} · key: ${getKey() ? 'yes' : 'no'}\nUsing: ${voice.describe('en')}`;
  }, 500);
  const tone = () => { const r = 24000, n = r * 0.6, p = new Float32Array(n); for (let i = 0; i < n; i++) p[i] = Math.sin(i / r * 2 * Math.PI * 660) * 0.35 * Math.min(1, (n - i) / 2000); return p; };
  box.querySelector('.dbg-b').addEventListener('click', async (ev) => {
    const t = ev.target.dataset.t; if (!t) return;
    voice.unlock(); const tok = voice.token;
    add(`[test] ${t} (ctx ${voice.ctx?.state})`);
    try {
      if (t === 'beep') { await voice._viaCtx(tone(), 24000, tok); add('[test] Web Audio beep finished (did you hear it?)'); }
      if (t === 'wav') { await voice._viaElement(tone(), 24000, tok); add('[test] <audio> beep finished (did you hear it?)'); }
      if (t === 'synth') { const u = new SpeechSynthesisUtterance('Hi, this is the iPhone voice.'); u.lang = 'en-US'; u.onstart = () => add('[test] synth started'); u.onend = () => add('[test] synth ended'); u.onerror = (e) => add('[test] synth error ' + e.error); speechSynthesis.cancel(); speechSynthesis.speak(u); }
      if (t === 'load') voice.kokoro.load(kPrefs());
      if (t === 'hel' || t === 'hctx') {
        if (!voice.kokoro.ready) { add('[test] Heart not ready: ' + voice.kokoro.state); return; }
        const t0 = performance.now();
        let chain = Promise.resolve();
        await voice.kokoro.speak('Hey gorgeous. Can you hear me now?', ls.get(LS.kvoice, DEFAULT_KOKORO_VOICE), (c) => {
          add(`[test] chunk ready after ${Math.round(performance.now() - t0)} ms`);
          chain = chain.then(() => t === 'hel' ? voice._viaElement(c.pcm, c.rate, tok) : voice._viaCtx(c.pcm, c.rate, tok));
        });
        await chain;
        add('[test] Heart test done');
      }
      if (t === 'copy') { await navigator.clipboard.writeText(box.querySelector('#dbgState').textContent + '\n\n' + logEl.textContent); add('[test] copied'); }
      if (t === 'min') box.classList.toggle('min');
    } catch (e) { add(`[test] ${t} FAILED: ${e.message || e}`); }
  });
}
