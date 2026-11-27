// Echo v7.3 – pure-JS English G2P for Kokoro: no espeak/WASM on the hot path.
// Lexicon = misaki US gold+silver (Apache-2.0, hexgrad) – the same phoneme set Kokoro was trained on.
// Lookup is a binary search over one sorted TSV string (low RAM: ~4.5 MB string + offsets, no 180k-key object).
let LEX = null, OFF = null, loading = null;
export function loadLexicon(url) {
  if (!loading) loading = (async () => {
    const r = await fetch(url); if (!r.ok) throw new Error('lexicon HTTP ' + r.status);
    LEX = await r.text();
    const offs = [0]; for (let i = LEX.indexOf('\n'); i !== -1 && i < LEX.length - 1; i = LEX.indexOf('\n', i + 1)) offs.push(i + 1);
    OFF = Uint32Array.from(offs);
  })().catch(e => { loading = null; throw e; });
  return loading;
}
export const lexiconReady = () => !!OFF;
function look(w) {
  let lo = 0, hi = OFF.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, s = OFF[mid], tab = LEX.indexOf('\t', s), key = LEX.slice(s, tab);
    if (key === w) return LEX.slice(tab + 1, LEX.indexOf('\n', tab));
    if (key < w) lo = mid + 1; else hi = mid - 1;
  }
  return null;
}
const VOICELESS = /[ptkfθ]$/, SIBIL = /[szʃʒʧʤ]$/;
function stem(w) {
  let p;
  if (/'s$/.test(w) && (p = lex(w.slice(0, -2)))) return p + (SIBIL.test(p) ? 'ᵻz' : VOICELESS.test(p) ? 's' : 'z');
  if (/s$/.test(w) && w.length > 3) {
    if ((p = look(w.slice(0, -1)))) return p + (SIBIL.test(p) ? 'ᵻz' : VOICELESS.test(p) ? 's' : 'z');
    if (/es$/.test(w) && (p = look(w.slice(0, -2)))) return p + 'ᵻz';
  }
  if (/ed$/.test(w) && w.length > 4) {
    p = look(w.slice(0, -2)) || look(w.slice(0, -1)) || (/(.)\1ed$/.test(w) && look(w.slice(0, -3)));
    if (p) return p + (/[td]$/.test(p) ? 'ᵻd' : VOICELESS.test(p) || SIBIL.test(p) && !/[zʒʤ]$/.test(p) ? 't' : 'd');
  }
  if (/ing$/.test(w) && w.length > 5) {
    p = look(w.slice(0, -3)) || look(w.slice(0, -3) + 'e') || (/(.)\1ing$/.test(w) && look(w.slice(0, -4)));
    if (p) return p + 'ɪŋ';
  }
  if (/ly$/.test(w) && w.length > 4 && (p = look(w.slice(0, -2)))) return p + 'li';
  if (/n't$/.test(w) && (p = look(w.slice(0, -3)))) return p + 'nt';
  return null;
}
function lex(w) { return look(w) || stem(w); }
// crude letter-to-sound for words nobody knows (slang, names); good enough to not stall
const RULES = [['tion', 'ʃən'], ['sh', 'ʃ'], ['ch', 'ʧ'], ['th', 'θ'], ['ng', 'ŋ'], ['ph', 'f'], ['ck', 'k'], ['qu', 'kw'], ['ee', 'i'], ['ea', 'i'], ['oo', 'u'], ['ou', 'W'], ['ow', 'O'], ['ai', 'A'], ['ay', 'A'], ['oa', 'O'], ['oi', 'Y'], ['oy', 'Y'], ['au', 'ɔ'], ['aw', 'ɔ'], ['igh', 'I'], ['er', 'ɜɹ'], ['ar', 'ɑɹ'], ['or', 'ɔɹ'], ['ir', 'ɜɹ'], ['ur', 'ɜɹ'],
  ['a', 'æ'], ['e', 'ɛ'], ['i', 'ɪ'], ['o', 'ɑ'], ['u', 'ʌ'], ['y', 'i'], ['b', 'b'], ['c', 'k'], ['d', 'd'], ['f', 'f'], ['g', 'ɡ'], ['h', 'h'], ['j', 'ʤ'], ['k', 'k'], ['l', 'l'], ['m', 'm'], ['n', 'n'], ['p', 'p'], ['q', 'k'], ['r', 'ɹ'], ['s', 's'], ['t', 't'], ['v', 'v'], ['w', 'w'], ['x', 'ks'], ['z', 'z']];
function rules(w) {
  let out = '', i = 0; w = w.replace(/[^a-z]/g, '');
  if (w.length > 2 && /[^aeiou]e$/.test(w)) w = w.slice(0, -1);
  while (i < w.length) { const r = RULES.find(([g]) => w.startsWith(g, i)); if (r) { out += r[1]; i += r[0].length; } else i++; }
  const v = out.search(/[æɛɪɑʌiuAIOWYɔɜ]/); return v > 0 ? out.slice(0, v) + 'ˈ' + out.slice(v) : 'ˈ' + out;
}
const ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const TENS = ' ten twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
function num(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + num(n % 100) : '');
  for (const [v, w] of [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]) if (n >= v) return num(Math.floor(n / v)) + ' ' + w + (n % v ? ' ' + num(n % v) : '');
  return String(n);
}
function normalize(t) {
  return t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/&/g, ' and ').replace(/%/g, ' percent').replace(/\$(\d+)/g, '$1 dollars')
    .replace(/(\d+)\.(\d+)/g, (m, a, b) => `${a} point ${b.split('').join(' ')}`)
    .replace(/\d{1,12}/g, (m) => num(parseInt(m, 10))).replace(/\s+/g, ' ').trim();
}
const VOWEL_START = /^[ˈˌ]?[aeiouæɑɐɔəɛɜɪʊʌAIOWYᵻ]/;
// text -> Kokoro phoneme string (words separated by spaces, punctuation kept, like kokoro-js output)
export function g2p(text, oov) {
  const toks = normalize(text).match(/[A-Za-z]+(?:['’][A-Za-z]+)*|[;:,.!?—…"()]+|\s+/g) || [];
  const words = toks.map(t => /^[A-Za-z]/.test(t) ? t.toLowerCase() : null);
  let out = '';
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], w = words[i];
    if (!w) { out += /^\s+$/.test(t) ? ' ' : t; continue; }
    let next = null; for (let j = i + 1; j < toks.length; j++) if (words[j]) { next = lex(words[j]) || words[j]; break; } else if (!/^\s+$/.test(toks[j])) break;
    let p;
    if (w === 'the') p = next && VOWEL_START.test(next) ? 'ði' : 'ðə';
    else if (w === 'a') p = 'ɐ';
    else if (w === 'to') p = next && VOWEL_START.test(next) ? 'tʊ' : 'tə';
    else p = lex(w) || (oov && oov(w)) || rules(w);
    out += p;
  }
  return out.replace(/ +/g, ' ').trim();
}
