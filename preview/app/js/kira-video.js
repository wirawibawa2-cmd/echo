// Kira v8: video mascot. Two stacked muted, playsinline <video> elements crossfade between short clips.
// Every clip starts and/or ends on the same home pose, so swaps line up. Ghost-compatible API for main.js.
const DIR = 'assets/kira/';
const V = '?v=81';
export const EXPRESSIONS = ['sultry', 'bedroom', 'liptease', 'breathless', 'smirk', 'wink', 'flustered'];
export const SPICY = ['sultry', 'bedroom', 'liptease', 'breathless', 'smirk', 'wink'];
// v8.1: random picks lean harder toward the spiciest looks
const SPICY_W = ['sultry', 'sultry', 'bedroom', 'bedroom', 'breathless', 'breathless', 'flustered', 'liptease', 'liptease', 'smirk', 'wink'];
const pickSpicy = () => SPICY_W[Math.floor(Math.random() * SPICY_W.length)];
const FADE = 260;          // ms crossfade
const HOLD = 700;          // ms hold on the expression's peak frame
const log = (s) => { try { (window.__echoLog = window.__echoLog || []).push(s); window.__echoDbg?.(s); } catch {} };

export class KiraVideo {
  constructor(stage) {
    this.stage = stage;
    this.state = 'idle'; this.speakLevel = 0; this.time = 0; this.tilt = null; this.happy = 0; this.dragging = false; this.iconMode = false;
    this.vids = [...stage.querySelectorAll('video')];
    for (const v of this.vids) { v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.preload = 'auto'; }
    this.front = 0;            // index of the visible video
    this.cur = null;           // clip name on screen
    this.mode = 'idle';        // idle | talk | expr
    this.pendingExpr = null;   // expression requested while busy
    this.nextIdleExpr = 0;
    this.swaps = 0;
    this.token = 0;
    this._play('idle', true, true);
    this._scheduleIdleExpr();
    document.addEventListener('visibilitychange', () => { const v = this.vids[this.front]; if (document.hidden) v.pause(); else v.play().catch(() => {}); });
    // iOS may refuse the first autoplay in Low Power Mode: retry on the first touch
    const kick = () => { const v = this.vids[this.front]; if (v.paused) v.play().catch(() => {}); };
    for (const ev of ['touchend', 'click']) document.addEventListener(ev, kick, { capture: true, passive: true });
    window.__kira = this;
  }
  get back() { return this.vids[1 - this.front]; }
  src(name) { return DIR + name + '.mp4' + V; }

  // Load `name` into the hidden video, start it, then crossfade it in.
  _play(name, loop, instant = false) {
    const tok = ++this.token;
    const v = instant ? this.vids[this.front] : this.back;
    const old = instant ? null : this.vids[this.front];
    const want = new URL(this.src(name), location.href).href;
    if (v.src !== want) { v.src = want; v.load(); }
    else { try { v.currentTime = 0; } catch {} }
    v.loop = loop;
    v.onended = null;
    const go = () => {
      if (tok !== this.token) return;
      const p = v.play(); if (p) p.catch((e) => log('[kira] play blocked: ' + e.name));
      if (!instant) {
        v.classList.add('on'); old.classList.remove('on');
        this.front = 1 - this.front;
        setTimeout(() => { if (tok === this.token) { old.pause(); } }, FADE + 40);
      } else v.classList.add('on');
      this.cur = name; this.swaps++;
      log(`[kira] ▶ ${name}${loop ? ' (loop)' : ''}`);
    };
    if (v.readyState >= 3) go(); else v.addEventListener('canplay', go, { once: true });
    return v;
  }
  // Preload only the clip that is most likely next (one at a time).
  _preload(name) {
    const v = this.back; const want = new URL(this.src(name), location.href).href;
    if (v.src !== want) { v.src = want; v.preload = 'auto'; v.load(); }
  }
  _idleOrTalk() {
    const talking = this.state === 'speaking';
    this.mode = talking ? 'talk' : 'idle';
    this._play(talking ? 'talking' : 'idle', true);
    if (this.pendingExpr) { const e = this.pendingExpr; this.pendingExpr = null; setTimeout(() => this.express(e), 400); return; }
    setTimeout(() => this._preload(talking ? 'idle' : 'talking'), 600);
  }
  // Play an expression: in-clip -> short hold -> return clip -> idle/talking.
  express(name) {
    if (!EXPRESSIONS.includes(name)) name = pickSpicy();
    if (this.mode === 'expr') { this.pendingExpr = name; return; }
    this.mode = 'expr';
    const v = this._play(name + '-in', false);
    v.onended = () => {
      v.onended = null;
      this._preload(name + '-out');
      setTimeout(() => {
        if (this.state === 'speaking') this.pendingExpr = null;   // she's talking: go back to the talking loop
        const o = this._play(name + '-out', false);
        o.onended = () => { o.onended = null; this._idleOrTalk(); };
      }, this.state === 'speaking' ? 120 : HOLD);
    };
    setTimeout(() => { if (this.mode === 'expr' && this.cur === name + '-in') this._preload(name + '-out'); }, 1500);
  }
  _scheduleIdleExpr() {
    clearTimeout(this._idleT);
    this._idleT = setTimeout(() => {
      if (this.mode === 'idle' && this.state === 'idle' && !document.hidden) this.express(pickSpicy());
      this._scheduleIdleExpr();
    }, 14000 + Math.random() * 12000);
  }
  // ---- Ghost-compatible API ----
  setState(s) {
    const prev = this.state; this.state = s;
    this.stage.dataset.state = s;
    if (s === prev) return;
    if (this.mode === 'expr') { if (s === 'speaking') this.pendingExpr = null; return; }   // the expression returns to the right loop itself
    if (s === 'speaking' && this.mode !== 'talk') { this.mode = 'talk'; this._play('talking', true); setTimeout(() => this._preload('idle'), 600); }
    else if (s !== 'speaking' && this.mode === 'talk') { this.mode = 'idle'; this._play('idle', true); }
  }
  react() { if (this.mode !== 'expr') this.express(pickSpicy()); }
  surprise() {}
  resize() {}
  setPointer(nx, ny) { this.stage.style.setProperty('--px', (nx * 4).toFixed(2) + 'px'); this.stage.style.setProperty('--py', (-ny * 3).toFixed(2) + 'px'); }
  dragBy() {}
}

// Emotion from the reply: the model appends a tag like [wink]; regex cues are the fallback.
const CUES = [
  ['flustered', /\b(blush\w*|flustered|embarrass\w*|stop it|you're making me|needy)\b|😳|🙈|🥺|>\/?</i],
  ['wink', /\b(wink|kiss(es)?|muah|xoxo)\b|😘|😉|💋/i],
  ['breathless', /\b(breath\w*|heart('s)? racing|whoa|hot in here|weak in the knees)\b|🥵/i],
  ['liptease', /\b(tast\w*|delicious|yum\w*|lick\w*|naughty|bite)\b|😋|👅/i],
  ['bedroom', /\b(bed\w*|tonight|late night|come here|closer|cuddle|mmm+)\b|🌙/i],
  ['sultry', /\b(gorgeous|sexy|hot|handsome|darling|babe|baby|seduc\w*|irresistible)\b|🔥/i],
  ['smirk', /\b(tease|teasing|roast\w*|nice try|oh really|cute|sure you)\b|😏|😈/i],
];
const TAG_RE = /\s*\[(sultry|bedroom|lips?|liptease|breathless|smirk|wink|flustered|none)\]\s*$/i;
export function splitEmotion(text) {
  let tag = null;
  const m = String(text).match(TAG_RE);
  if (m) { tag = m[1].toLowerCase(); text = text.replace(TAG_RE, '').trim(); }
  if (tag === 'lip' || tag === 'lips') tag = 'liptease';
  if (tag === 'none') tag = null;
  if (!tag) for (const [name, re] of CUES) if (re.test(text)) { tag = name; break; }
  // spicy ones should play often: no cue still triggers a random spicy look most of the time
  if (!tag && Math.random() < 0.75) tag = pickSpicy();
  return { text, emotion: tag };
}
