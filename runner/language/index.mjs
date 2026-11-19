// language/index.mjs: the three languages of a video, and which voice can speak which language
// (FIX_PLAN 2026-11-19, item 3, DECISIONS 189).
//
// A video has a source language (the script is written once, in it) and three settings, each the
// Identity's content language unless the video says otherwise:
//   voice     what the narrator speaks
//   captions  the burned-in captions
//   screen    the words inside the scenes
// Any of them that differs from the source gets a translation (translate.mjs), reviewed on the
// Script tab before the voice is made.
//
// Which voice speaks which language: never a guess. On 2026-11-18 a Khmer narration was sent to
// ElevenLabs eleven_v3, which does not list Khmer; it read the text as if it were Vietnamese. So a
// language goes only to a provider and model that list it here. The table is from HeyGen's own
// voice capability list (get_video_voice_capabilities, read 2026-11-18), which also lists the
// ElevenLabs models; ElevenLabs' language pages agree on Khmer (in neither v3 nor v4).

export const SOURCE_DEFAULT = "en";

const V2 = "ar bg cs da de el en es fi fil fr hi hr id it ja ko ms nl pl pt ro ru sk sv ta tr uk zh".split(" ");
const TURBO = [...V2, ..."hu nb nn no vi".split(" ")];
const V3 = "af ar as az be bg bn bs ca ceb cs cy da de el en es et fa fi fil fr ga gl gu ha he hi hr hu hy id is it ja jv ka kk kn ko ky lb ln lt lv mk ml mr ms nb ne nl nn no ny pa pl ps pt ro ru sd sk sl so sr sv sw ta te th tr uk ur vi zh".split(" ");
const V4 = [...V3, ..."ast mi mn mt my oc or tg uz yo yue".split(" ")];
// HeyGen's own voice-only speech (heygen-voice-1)
const HEYGEN_VOICE = "ar be bg ca cs da de el en es fa fi fil fr he hi hr hu id it ja ko mk ms nl pl pt ro ru sk sl sr sv ta th tr uk vi zh".split(" ");
// Inside a HeyGen avatar video, the Fish and Mockingbird engines speak more (Khmer among them)
const HEYGEN_VIDEO_EXTRA = "km lo si am bo br eu fo ht la sa sn sq".split(" ");

// Google Cloud Text-to-Speech (its voice list, read 2026-11-19): no Khmer
const GOOGLE = "af ar bg bn ca cs cy da de el en es et eu fi fil fr gl gu he hi hr hu id is it ja kn ko lt lv ml mr ms nb nl pa pl pt ro ru sk sr sv sw ta te th tr uk ur vi yue zh".split(" ");
// Azure Speech: over 140 languages, Khmer among them (km-KH-PisethNeural, km-KH-SreymomNeural)
const AZURE = [...new Set([...V4, "km", "lo", "si", "am", "eu", "sq", "ps", "my", "jv", "su", "zu", "so", "uz", "mn", "kk"])];
// The free Gemini voice (gemini-3.8-flash-tts, the app's default voice): 130 languages on its model
// page, read 2026-11-19, Khmer among them, free of charge on the Gemini API's free tier, no card.
// A live Khmer test read two sentences (DECISIONS 197). Its list has no Ukrainian, so neither has this.
const GEMINI = ("af ak am ar as az be bg bn bs ca ceb cs da de dz el en es et eu fa fi fil fr gl gn gu ha he hi hr ht hu hy id ig is it ja jv ka kk km kn ko ky lb lg ln lo lt lv mai mk ml mn mni mr ms mt my nb ne nl nn ny or pa pl ps pt ro ru rw sat sd si sk sl so sq sr ss st sv sw ta te tg th ti tr ug uz vi yue zh").split(" ");

/** provider -> model -> the languages it speaks (ISO 639-1, the app's codes). */
export const VOICE_LANGUAGES = {
  kokoro: { kokoro: ["en"] },
  gemini: { gemini: GEMINI },
  googlecloud: { googlecloud: GOOGLE },
  azure: { azure: AZURE },
  elevenlabs: { eleven_v4: V4, eleven_v3: V3, eleven_multilingual_v2: V2, eleven_turbo_v2_5: TURBO },
  heygen: { "heygen-voice-1": HEYGEN_VOICE, "avatar-video": [...new Set([...V4, ...HEYGEN_VOICE, ...HEYGEN_VIDEO_EXTRA])] },
};
export const PROVIDER_LABEL = { gemini: "Gemini (free)", kokoro: "The free voice", elevenlabs: "ElevenLabs", heygen: "HeyGen", googlecloud: "Google Cloud", azure: "Azure" };
export const CHECKED_ON = "2026-11-19";

const base = (lang) => String(lang ?? "").toLowerCase().split(/[-_]/)[0];

/** Can this provider (and model) speak this language. Unknown provider or model: no. */
export function canSpeak(provider, model, lang) {
  const models = VOICE_LANGUAGES[provider];
  if (!models) return false;
  const list = model ? models[model] : Object.values(models).flat();
  return Boolean(list?.includes(base(lang)));
}

/** The models of a provider that speak this language. */
export const modelsFor = (provider, lang) => Object.entries(VOICE_LANGUAGES[provider] ?? {}).filter(([, l]) => l.includes(base(lang))).map(([m]) => m);

/** Every provider and model that speaks a language: [{ provider, model }]. */
export const speakersOf = (lang) => Object.entries(VOICE_LANGUAGES).flatMap(([provider, models]) => Object.entries(models).filter(([, l]) => l.includes(base(lang))).map(([model]) => ({ provider, model })));

/**
 * One plain sentence when this provider and model cannot speak the language, naming who can;
 * null when it can. The voice gate refuses with it, the voice picker shows it.
 */
export function voiceProblem(provider, model, lang, label = languageLabel(lang)) {
  // a provider the table does not know is not judged here
  if (!VOICE_LANGUAGES[provider] || canSpeak(provider, model, lang)) return null;
  const who = PROVIDER_LABEL[provider] ?? provider;
  const others = [...new Set(speakersOf(lang).filter((s) => s.provider !== provider).map((s) => s.provider))];
  const named = others.map((p) => (p === "heygen" && modelsFor("heygen", lang).every((m) => m === "avatar-video") ? "HeyGen inside an avatar video" : PROVIDER_LABEL[p]));
  const list = named.length > 1 ? `${named.slice(0, -1).join(", ")} or ${named.at(-1)}` : named[0];
  const where = named.length ? `${list} can` : "none of the app's voices can yet";
  const which = model && provider === "elevenlabs" ? ` with ${model}` : "";
  return `${who} cannot speak ${label}${which}. ${where[0].toUpperCase()}${where.slice(1)}.`;
}

// Every language the app knows, with the label the user sees. The content languages of
// catalog.ts are a subset; Khmer (km) is new (DECISIONS 189).
// The content languages the app offers: every one whose letters the bundled fonts draw (Latin with
// its extended letters, and Khmer with Noto Sans Khmer). A voice may speak more (Thai, Vietnamese,
// Chinese, Arabic...); those come when a font for their letters is bundled (DECISIONS 195).
export const CONTENT_LANGUAGES = ["en", "hu", "de", "es", "fr", "it", "pt", "nl", "pl", "ro", "cs", "sk", "sv", "da", "fi", "nb", "et", "lv", "lt", "hr", "sl", "ca", "tr", "id", "ms", "fil", "km"];

export const LANGUAGE_LABELS = {
  en: "English", hu: "Hungarian", de: "German", es: "Spanish", fr: "French", it: "Italian", pt: "Portuguese", nl: "Dutch", pl: "Polish", ro: "Romanian",
  km: "Khmer", vi: "Vietnamese", th: "Thai", id: "Indonesian", ms: "Malay", fil: "Filipino", zh: "Chinese", ja: "Japanese", ko: "Korean", hi: "Hindi",
  ar: "Arabic", tr: "Turkish", ru: "Russian", uk: "Ukrainian", cs: "Czech", sk: "Slovak", sv: "Swedish", da: "Danish", fi: "Finnish", el: "Greek",
  nb: "Norwegian", et: "Estonian", lv: "Latvian", lt: "Lithuanian", hr: "Croatian", sl: "Slovenian", ca: "Catalan",
};
export const languageLabel = (lang) => LANGUAGE_LABELS[base(lang)] ?? String(lang ?? "");

// Scripts the bundled Latin fonts cannot draw, and the OFL font that can (library/fonts.json).
export const SCRIPT_FONTS = { km: "Noto Sans Khmer" };
export const fontFor = (lang) => SCRIPT_FONTS[base(lang)] ?? null;
// Khmer writes no spaces between words, only between phrases: the captions split on phrases
export const NO_SPACES = new Set(["km", "th", "lo", "my", "zh", "ja"]);

/**
 * The three languages of a video (project.json `languages`), each the project's language unless set.
 * `source`: the language the script is written in.
 */
export function videoLanguages(project = {}) {
  const fallback = project.language || SOURCE_DEFAULT;
  const l = project.languages ?? {};
  const pick = (v) => (typeof v === "string" && v.trim() ? base(v) : base(fallback));
  return { source: pick(l.source), voice: pick(l.voice), captions: pick(l.captions), screen: pick(l.screen) };
}

/** Which of voice, captions and screen need a translation of the script. */
export const needsTranslation = (langs) => ["voice", "captions", "screen"].filter((k) => langs[k] !== langs.source);

/**
 * The script font's non-Latin faces again under every other family's name (fontFaces css in),
 * so a title or a caption set in the look's display font draws its Khmer letters with the script
 * font, letter by letter, instead of the system's fallback.
 */
export function scriptFallbackCss(css, families) {
  const rules = String(css ?? "").split("\n");
  const out = [];
  for (const script of Object.values(SCRIPT_FONTS)) {
    const own = rules.filter((r) => r.includes(`font-family: '${script}'`) && !/U\+0000-00FF|U\+0100-/.test(r));
    for (const f of families) if (f !== script) out.push(...own.map((r) => r.replace(`font-family: '${script}'`, `font-family: '${f}'`)));
  }
  return out.join("\n");
}
