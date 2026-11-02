// g2p.mjs: English text to the phonemes the Kokoro voice model reads, the app's
// own code (DECISIONS 133). The usual Node package for Kokoro pulls in
// espeak-ng, which is GPL, and docs/BUILD_PLAN.md allows no GPL in the bundle.
// So: the CMU pronouncing dictionary (BSD data, ISC package), its ARPAbet
// mapped to Kokoro's American phoneme set, and plain spelling rules for a word
// the dictionary does not have.
//
// English only, on purpose: the dictionary is English. A channel in another
// language uses ElevenLabs or Gemini (channels/recipe.mjs says so).

// ARPAbet to the model's symbols. Its capital letters are single symbols for
// the diphthongs: A = eɪ, I = aɪ, O = oʊ, W = aʊ, Y = ɔɪ.
const VOWELS = { AA: "ɑ", AE: "æ", AO: "ɔ", AW: "W", AY: "I", EH: "ɛ", EY: "A", IH: "ɪ", IY: "i", OW: "O", OY: "Y", UH: "ʊ", UW: "u" };
const CONSONANTS = { B: "b", CH: "ʧ", D: "d", DH: "ð", F: "f", G: "ɡ", HH: "h", JH: "ʤ", K: "k", L: "l", M: "m", N: "n", NG: "ŋ", P: "p", R: "ɹ", S: "s", SH: "ʃ", T: "t", TH: "θ", V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ" };

// Short words a speaker does not stress.
const WEAK = new Set("a an and are as at be been but by can could did do does for from had has have he her him his i if in is it its me my of on or our she so than that the their them then they this to us was we were what when who will with would you your".split(" "));

const isVowel = (p) => /\d$/.test(p);

// One ARPAbet word ("HH AH0 L OW1") as phonemes ("həlˈO"). `weak` drops the
// stress marks of a short function word.
export function arpabetToPhonemes(arpabet, { weak = false } = {}) {
  const parts = String(arpabet).trim().split(/\s+/).filter(Boolean);
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const m = /^([A-Z]+)(\d)?$/.exec(p);
    if (!m) continue;
    const [, base, stress] = m;
    if (stress === undefined) {
      // an American flap: T between a vowel and an unstressed vowel (water)
      const prev = parts[i - 1];
      const next = parts[i + 1];
      const flap = base === "T" && prev && next && isVowel(prev) && isVowel(next) && next.endsWith("0");
      out += flap ? "T" : (CONSONANTS[base] ?? "");
      continue;
    }
    const mark = weak ? "" : stress === "1" ? "ˈ" : stress === "2" ? "ˌ" : "";
    if (base === "ER") out += stress === "0" || weak ? "əɹ" : `${mark}ɜɹ`;
    else if (base === "AH") out += stress === "0" || weak ? "ə" : `${mark}ʌ`;
    else out += `${mark}${VOWELS[base] ?? ""}`;
  }
  return out;
}

// A word the dictionary does not have: spelling rules, longest match first.
const RULES = [
  ["tion", "ʃən"], ["sion", "ʒən"], ["ture", "ʧəɹ"], ["ough", "ʌf"], ["augh", "ɔ"], ["eigh", "A"], ["igh", "I"],
  ["sch", "sk"], ["tch", "ʧ"], ["dge", "ʤ"], ["ing", "ɪŋ"], ["ers", "əɹz"], ["ies", "iz"], ["ous", "əs"],
  ["ph", "f"], ["sh", "ʃ"], ["ch", "ʧ"], ["th", "θ"], ["wh", "w"], ["ck", "k"], ["ng", "ŋ"], ["qu", "kw"], ["kn", "n"], ["wr", "ɹ"],
  ["ee", "i"], ["ea", "i"], ["oo", "u"], ["ai", "A"], ["ay", "A"], ["oa", "O"], ["ou", "W"], ["ow", "O"], ["oi", "Y"], ["oy", "Y"], ["au", "ɔ"], ["aw", "ɔ"], ["ew", "u"], ["ie", "i"],
  ["ar", "ɑɹ"], ["er", "əɹ"], ["ir", "ɜɹ"], ["or", "ɔɹ"], ["ur", "ɜɹ"],
  ["a", "æ"], ["b", "b"], ["c", "k"], ["d", "d"], ["e", "ɛ"], ["f", "f"], ["g", "ɡ"], ["h", "h"], ["i", "ɪ"], ["j", "ʤ"], ["k", "k"], ["l", "l"], ["m", "m"],
  ["n", "n"], ["o", "ɑ"], ["p", "p"], ["q", "k"], ["r", "ɹ"], ["s", "s"], ["t", "t"], ["u", "ʌ"], ["v", "v"], ["w", "w"], ["x", "ks"], ["y", "i"], ["z", "z"],
];
const LONG = { a: "A", e: "i", i: "I", o: "O", u: "u" };

export function spellOut(word) {
  let w = String(word).toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return "";
  let out = "";
  let stressed = false;
  const mark = (p) => {
    if (stressed || !/[æɛɪɑʌɔAIOWYiuəɜ]/.test(p)) return p;
    stressed = true;
    return `ˈ${p}`;
  };
  // a silent final e makes the vowel before it long: "fable", "mine"
  const magic = /[aeiou][bcdfgklmnprstvz]e$/.test(w);
  if (magic) w = w.slice(0, -1);
  for (let i = 0; i < w.length; ) {
    const rule = RULES.find(([from]) => w.startsWith(from, i));
    if (!rule) {
      i++;
      continue;
    }
    const lastVowel = magic && i === w.length - 2 && rule[0].length === 1 && LONG[rule[0]];
    out += mark(lastVowel ? LONG[rule[0]] : rule[1]);
    i += rule[0].length;
  }
  return out;
}

// ---- numbers and signs, as they are said ------------------------------------------

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export function numberWords(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 0) return `minus ${numberWords(-n)}`;
  if (n < 20) return ONES[n];
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberWords(n % 100)}` : ""}`;
  for (const [size, name] of [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]]) {
    if (n >= size) return `${numberWords(Math.floor(n / size))} ${name}${n % size ? ` ${numberWords(n % size)}` : ""}`;
  }
  return "";
}

// A year is said in two pairs: 1984 is "nineteen eighty four".
function yearWords(n) {
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  if (lo === 0) return `${numberWords(hi)} hundred`;
  return `${numberWords(hi)} ${lo < 10 ? `oh ${ONES[lo]}` : numberWords(lo)}`;
}

const SIGNS = { "&": "and", "+": "plus", "=": "equals", "@": "at" };
const MULTIPLIER = { k: "thousand", m: "million", b: "billion" };

// One whitespace-free piece of text as plain words to look up.
export function spokenWords(token) {
  const t = String(token).replace(/[’‘]/g, "'");
  const out = [];
  const rx = /(\$)?(\d[\d,]*(?:\.\d+)?)(st|nd|rd|th)?([kmb](?![a-z]))?(%)?|[\p{L}]+(?:'[\p{L}]+)?|[&+=@]/giu;
  for (const m of t.matchAll(rx)) {
    const [all, dollar, num, ordinal, mult, percent] = m;
    if (!num) {
      out.push(SIGNS[all] ?? all.toLowerCase());
      continue;
    }
    const clean = num.replace(/,/g, "");
    const [whole, frac] = clean.split(".");
    const n = Number(whole);
    const isYear = !dollar && !percent && !mult && !ordinal && !frac && /^\d{4}$/.test(clean) && !num.includes(",") && n >= 1100 && n < 2100 && n % 1000 >= 100;
    out.push(isYear ? yearWords(n) : numberWords(n));
    if (frac) out.push(`point ${[...frac].map((d) => ONES[Number(d)]).join(" ")}`);
    if (ordinal) out[out.length - 1] = ordinalOf(out[out.length - 1]);
    if (mult) out.push(MULTIPLIER[mult.toLowerCase()]);
    if (dollar) out.push(n === 1 && !frac ? "dollar" : "dollars");
    if (percent) out.push("percent");
  }
  return out.join(" ").split(/\s+/).filter(Boolean);
}

const IRREGULAR_ORDINAL = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
function ordinalOf(words) {
  const list = words.split(" ");
  const last = list.at(-1);
  list[list.length - 1] = IRREGULAR_ORDINAL[last] ?? (last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return list.join(" ");
}

// The sentence marks the model pauses on. Everything else is not read.
const MARKS = /[.,!?;:…]/g;

let dictionary = null;
async function loadDictionary() {
  dictionary ??= (await import("cmu-pronouncing-dictionary")).dictionary;
  return dictionary;
}

// One word as phonemes. A word in capitals that the dictionary lacks is said
// letter by letter (an acronym: "KPI").
function wordPhonemes(word, dict) {
  const lower = word.toLowerCase();
  const found = dict[lower];
  if (found) return arpabetToPhonemes(found, { weak: WEAK.has(lower) });
  if (word.length >= 2 && word.length <= 6 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)) {
    return [...lower].map((c) => (dict[c] ? arpabetToPhonemes(dict[c]) : spellOut(c))).join(" ");
  }
  return spellOut(word);
}

/**
 * The text as a list of tokens, one per whitespace-separated piece of the
 * original, so the timing comes back on the script's own words.
 * [{ text: "10%,", phonemes: "tˈɛn pəɹsˈɛnt," }]
 */
export async function phonemize(text) {
  const dict = await loadDictionary();
  const tokens = [];
  for (const piece of String(text).split(/\s+/).filter(Boolean)) {
    // the case stays for the acronym rule; spokenWords gives words in lowercase only for numbers
    const words = /\d|[&+=@]/.test(piece) ? spokenWords(piece) : (piece.replace(/[’‘]/g, "'").match(/[\p{L}]+(?:'[\p{L}]+)?/gu) ?? []);
    const said = words.map((w) => wordPhonemes(w, dict)).join(" ");
    const marks = (piece.match(MARKS) ?? []).slice(-1).join("");
    if (said) tokens.push({ text: piece, phonemes: `${said}${marks}` });
    else if (tokens.length && marks) tokens[tokens.length - 1].phonemes += marks;
    // a piece with nothing to say (a dash, a bullet) still belongs to the text
    else if (tokens.length) tokens[tokens.length - 1].text += ` ${piece}`;
  }
  return tokens;
}
