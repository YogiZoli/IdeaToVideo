// channelwizard/kit.mjs: the YouTube Brand Channel Wizard's questions and everything made from
// the answers without AI (DECISIONS 174): the kit's texts, the image prompts, the checklist, what
// goes into the Identity's fields, and the Evergreen Traffic Card as markdown. Pure: no file, no
// network, no AI, so the wizard works with no key at all and `scripts/ui-mock` can load this file.
// The questions and the click paths are Zoltan's own lead magnet (yt-band-channel-wizard), which
// makes the same card; its email gate, webhook, program link and PDF are left out on purpose.

export const PHASES = ["Account and profile", "Brand Channel, handle, verification", "Identity and keyword research", "Channel customization", "Studio defaults and community moderation"];

// One question per screen. Each one says why it asks. `ai`: the field a "Write it with AI" button
// fills (gates/channel FIELDS).
export const QUESTIONS = [
  { id: "who", short: "Who", phase: 1, type: "text", key: "who", ai: true, title: "Who do you help?", why: "I ask because a channel for everyone gets found by no one. One clear group makes every later step easier.", label: "Finish the sentence: I help ...", ph: "busy yoga teachers" },
  { id: "result", short: "Result", phase: 1, type: "text", key: "result", ai: true, title: "What do you help them do?", why: "I ask because people search for a result, not for a course. This becomes your tagline.", label: "Finish the sentence: I help them ...", ph: "fill their classes without paid ads" },
  { id: "topic", short: "Topic", phase: 1, type: "text", key: "topic", ai: true, title: "What is your course about, in two or three words?", why: "I ask because YouTube needs a plain topic to file your channel under.", label: "Your topic", ph: "yoga studio marketing" },
  { id: "face", short: "You or brand", phase: 1, type: "face", key: "face", title: "Is the channel you, or a brand?", why: "I ask because it decides the name, the handle and the profile picture.", opts: [["person", "It is me", "My own name and my face"], ["brand", "It is a brand", "A business or course name"]] },
  { id: "team", short: "Team", phase: 2, type: "choice", key: "team", title: "Will anyone else ever touch this channel?", why: "I ask because a Brand Channel lets you add a helper, or hand the channel over later, without sharing your Google password.", opts: [["solo", "Just me, for now", ""], ["team", "A helper or a team", ""], ["sell", "I may sell or hand it over one day", ""]] },
  { id: "phrases", short: "Searches", phase: 3, type: "area", key: "phrases", ai: true, title: "What would your student type into YouTube today?", why: "I ask because these are the seeds for your keyword research. Their words, not yours.", label: "As many searches as you like, one per line. Each one is looked up in vidIQ. At most 20 are used.", ph: "how to get more yoga students\nyoga studio marketing ideas\nhow to fill a yoga class" },
  { id: "pain", short: "Frustration", phase: 3, type: "text", key: "pain", ai: true, title: "What frustrates them most right now?", why: "I ask because the best videos start from a problem the viewer already feels.", label: "In their own words", ph: "posting every day and still teaching to empty rooms" },
  { id: "proof", short: "Proof", phase: 3, type: "text", key: "proof", ai: true, title: "Why should they listen to you?", why: "I ask because one honest line of experience makes a stranger trust your About section.", label: "One line of real experience or results", ph: "12 years running a studio, 300 teachers trained" },
  { id: "market", short: "Market", phase: 3, type: "market", title: "Which language and country are you aiming at?", why: "I ask because search numbers change a lot between languages and countries." },
  { id: "links", short: "Links", phase: 4, type: "links", title: "Where should a viewer go after watching?", why: "I ask because the first link on your channel should be your free gift, so views turn into email subscribers. Leave blank what you do not have yet." },
  { id: "look", short: "Feel", phase: 4, type: "look", key: "style", title: "How should the channel feel?", why: "I ask because your logo and banner prompts need one clear style to look like they belong together.", opts: [["Clean and minimal", "Clean and minimal", "Lots of space, calm, simple shapes"], ["Bold and energetic", "Bold and energetic", "Strong contrast, big type"], ["Warm and personal", "Warm and personal", "Soft, friendly, human"], ["Premium and dark", "Premium and dark", "Dark background, refined accents"]] },
  { id: "pace", short: "Pace", phase: 5, type: "choice", key: "pace", title: "How often can you really publish?", why: "I ask because a pace you keep beats a pace you promise. It goes into your About text and your video plan.", opts: [["every two weeks", "Every two weeks", ""], ["every week", "Every week", ""], ["twice a week", "Twice a week", ""], ["several times a week", "Several times a week", ""], ["every day", "Every day", ""]] },
  { id: "mod", short: "Comments", phase: 5, type: "choice", key: "mod", title: "How hands-on do you want to be with comments?", why: "I ask because YouTube can hold risky comments for you. This sets your moderation default.", opts: [["basic", "Light touch", "Hold only the clearly bad ones"], ["strict", "Careful", "Hold more comments for my review"]] },
];

const REQUIRED = ["who", "result", "topic", "phrases", "pain", "proof"];

// The app's content languages (catalog.ts LANGUAGES), as the card writes them. traffic-card.mjs reads them back.
export const LANGUAGE_NAMES = { en: "English", hu: "Hungarian", de: "German", es: "Spanish", fr: "French", it: "Italian", pt: "Portuguese", nl: "Dutch", pl: "Polish", ro: "Romanian", cs: "Czech", sk: "Slovak", sv: "Swedish", da: "Danish", fi: "Finnish", nb: "Norwegian", et: "Estonian", lv: "Latvian", lt: "Lithuanian", hr: "Croatian", sl: "Slovenian", ca: "Catalan", tr: "Turkish", id: "Indonesian", ms: "Malay", fil: "Filipino", km: "Khmer" };

export const DEFAULT_COLOR = "#17C05B";
export const PATH_NOTE = "Click paths checked in October 2026. YouTube renames menus often. If a label is missing, look for the nearest match in the same menu.";
export const CARD_TITLE = "YouTube Evergreen Organic Traffic Card";

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[.!\s]+$/, "");
const cap = (s) => { const t = clean(s); return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; };
const low = (s) => { const t = clean(s); return !t || /^\p{Lu}\p{Lu}/u.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1); };
const title = (s) => clean(s).split(" ").map((w) => (w.length > 3 || /^\p{Lu}/u.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ").replace(/^./, (c) => c.toUpperCase());
const slug = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const uniq = (list) => { const seen = new Set(); return list.filter((x) => { const k = String(x).toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true; }); };
const lines = (s) => String(s ?? "").split(/\r?\n+/).map(clean).filter(Boolean);
const language = (a) => LANGUAGE_NAMES[a.lang] ?? LANGUAGE_NAMES.en;
const url = (s) => { const t = String(s ?? "").trim(); if (!t) return ""; const full = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`; return /^https?:\/\/\S+$/i.test(full) ? full : ""; };

export const baseName = (a) => clean(a.name) || title(a.topic) || "Your Channel";

export function nameIdeas(a) {
  const n = baseName(a);
  const t = title(a.topic);
  const first = n.split(" ")[0];
  const withTopic = (list) => (t ? list : []);
  return uniq(a.face === "brand"
    ? [n, `${n} Academy`, ...withTopic([`${n} | ${t}`, `${t} by ${n}`]), `${n} TV`]
    : [n, ...withTopic([`${t} with ${first}`, `${n} | ${t}`, `${first} Teaches ${t}`, `${t} School with ${first}`])]);
}

// From the name the kit has now (the first line of its name ideas). A handle is at most 30 characters.
export function handleIdeas(a, name = baseName(a)) {
  const n = slug(name);
  const t = slug(a.topic);
  const first = slug(String(name).split(" ")[0]);
  const list = a.face === "brand" ? [n, `${n}academy`, `${n}tv`, `${n}hq`, t && `${t}by${n}`] : [n, t && `${first}${t}`, t && `${t}with${first}`, `${n}tv`, `learnwith${first}`];
  return uniq(list.filter(Boolean).map((h) => h.slice(0, 30)).filter((h) => h.length >= 3)).map((h) => `@${h}`);
}

export function taglineText(a) {
  if (clean(a.who) && clean(a.result)) return `I help ${low(a.who)} ${low(a.result)}.`;
  if (clean(a.topic) && clean(a.who)) return `${title(a.topic)} for ${low(a.who)}.`;
  return clean(a.topic) ? `${title(a.topic)}.` : "";
}

export function descriptionText(a) {
  return [taglineText(a), clean(a.topic) && clean(a.who) && `${cap(a.topic)} for ${low(a.who)}.`, `New videos ${a.pace || "every week"}.`].filter(Boolean).join(" ");
}

export function aboutText(a) {
  const p = [];
  if (clean(a.topic) && clean(a.who)) p.push(`${cap(a.topic)} for ${low(a.who)}.${clean(a.result) ? ` I help ${low(a.who)} ${low(a.result)}.` : ""}`);
  else if (taglineText(a)) p.push(taglineText(a));
  if (clean(a.pain)) p.push(`The struggle I hear most: ${low(a.pain)}. This channel is here to fix that, one clear video at a time.`);
  if (clean(a.proof)) p.push(`Why listen to me: ${low(a.proof)}.`);
  p.push(`New videos ${a.pace || "every week"}. Subscribe so you do not miss the next one.`);
  if (url(a.gift)) p.push(`Start here, free: ${url(a.gift)}`);
  p.push("Business enquiries: [your contact email]");
  return p.join("\n\n");
}

export function linkRows(a) {
  const out = [];
  if (url(a.gift)) out.push(`Start here (free) | ${url(a.gift)}`);
  if (url(a.course)) out.push(`The course | ${url(a.course)}`);
  if (url(a.site)) out.push(`Website | ${url(a.site)}`);
  return out;
}

export function linksText(a) {
  const rows = linkRows(a);
  return `Link title | URL\n${(rows.length ? rows : ["Start here (free) | [link to your free gift, add this first]"]).join("\n")}\n\nKeep the free gift as link number one. It is the one link YouTube shows on your channel header.`;
}

// The image prompts are text to paste into any image tool: this app never pays for a picture.
// They name no person, brand, logo, character or artist; the only name is the channel's own, as text.
export function logoPrompt(a, name = baseName(a)) {
  return [
    `Design a YouTube profile picture for a channel called "${name}".`,
    `Topic: ${clean(a.topic)}. Audience: ${clean(a.who)}.`,
    "Canvas: square, 1:1, export at 800 x 800 px.",
    "YouTube shows it inside a circle, so keep everything important inside the centered circle and leave the corners empty.",
    "It must stay readable at very small size (about 98 x 98 px, and smaller next to comments). So: one simple mark or at most 1 to 3 large letters, thick shapes, strong contrast, no thin lines, no small text, no tagline.",
    `Make a clean monogram from the initials of "${name}".`,
    `Style: ${a.style || "Clean and minimal"}. Main color: ${a.color || DEFAULT_COLOR}, plus one neutral.`,
    "Flat background, no mockup, no border, no watermark, no real person, no existing brand or character.",
  ].join("\n");
}

export function bannerPrompt(a, name = baseName(a), tagline = taglineText(a)) {
  return [
    `Design a YouTube channel banner for a channel called "${name}".`,
    "Canvas: 2560 x 1440 px (16:9). Generate in 16:9 and export at exactly 2560 x 1440.",
    "Safe area: a centered rectangle of 1546 x 423 px. ALL text and the logo must sit inside this rectangle. Phones show only this area, desktop shows a 2560 x 423 strip, TVs show the full canvas.",
    "Text inside the safe area, spelled exactly:",
    `  Line 1, large: ${name}`,
    ...(clean(tagline) ? [`  Line 2, smaller: ${String(tagline).trim()}`] : []),
    "The logo or profile mark sits on the left of the text, also inside the safe area.",
    "The background fills the whole 2560 x 1440 canvas and stays calm outside the safe area: no text, no faces and no key details there.",
    `Style: ${a.style || "Clean and minimal"}. Main color: ${a.color || DEFAULT_COLOR}, plus one neutral. High contrast between text and background.`,
    "No extra words, no mockup, no device frame, no watermark, no real person, no existing brand or character.",
  ].join("\n");
}

export function checklist(a) {
  const strict = a.mod === "strict";
  const shared = a.team && a.team !== "solo";
  return [
    { name: PHASES[0], items: [
      { id: "a1", text: "Decide which Google account owns the channel. Use an email you will keep for years, not a shared inbox.", path: "youtube.com, sign in, profile picture (top right)" },
      { id: "a2", text: "Turn on 2-Step Verification on that Google account.", path: "myaccount.google.com > Security > 2-Step Verification" },
      { id: "a3", text: "Fill in the Google account name and photo so invites and emails look real.", path: "myaccount.google.com > Personal info" },
    ] },
    { name: PHASES[1], items: [
      { id: "b1", text: `Create the channel as a Brand Channel, not on your personal profile.${shared ? " You said someone else may touch it, so this step matters most." : " It costs nothing and keeps the door open for a helper later."}`, path: "youtube.com/account > Add or manage your channel(s) > Create a channel > type the channel name > Create" },
      { id: "b2", text: "Switch to the new channel before you change anything else.", path: "youtube.com/channel_switcher" },
      { id: "b3", text: "Claim your handle. Pick one from the handle ideas in this kit.", path: "studio.youtube.com > Customization > Profile > Handle" },
      { id: "b4", text: "Verify the channel with your phone now. It unlocks custom thumbnails, videos over 15 minutes and pinned comments.", path: "youtube.com/verify, then check: studio.youtube.com > Settings > Channel > Feature eligibility" },
      { id: "b5", text: shared ? "Invite your helper with a role. Never share your password." : "Know where roles live, for the day you add a helper.", path: "studio.youtube.com > Settings > Permissions > Invite (Manager or Editor)" },
    ] },
    { name: PHASES[2], items: [
      { id: "c1", text: "Look up your keywords with vidIQ, if you have it. It is optional.", path: "This wizard > Keywords, or Playlist > Keyword Research" },
      { id: "c2", text: "Save this wizard, so the Playlist Planner can read your card.", path: "This wizard > Save" },
      { id: "c3", text: "Pick the final channel name. Search it on YouTube and Google first, so you do not copy an existing brand.", path: "youtube.com search, google.com search, tmsearch.uspto.gov for trademarks" },
      { id: "c4", text: "Add your channel keywords and your country.", path: "studio.youtube.com > Settings > Channel > Basic info > Country of residence and Keywords" },
    ] },
    { name: PHASES[3], items: [
      { id: "d1", text: "Upload the profile picture (800 x 800).", path: "studio.youtube.com > Customization > Profile > Picture > Upload" },
      { id: "d2", text: "Upload the banner (2560 x 1440) and check the crop preview for TV, desktop and mobile.", path: "studio.youtube.com > Customization > Profile > Banner image > Upload" },
      { id: "d3", text: "Set the name and paste the About text into Description.", path: "studio.youtube.com > Customization > Profile > Name, then Description" },
      { id: "d4", text: "Add your links, free gift first, and your contact email.", path: "studio.youtube.com > Customization > Profile > Links > Add link, then Contact info" },
      { id: "d5", text: "Press Publish. Nothing on this page is live until you do.", path: "studio.youtube.com > Customization > Publish (top right)" },
      { id: "d6", text: "Create one playlist per pillar, plus Start here.", path: "studio.youtube.com > Create (top right) > New playlist" },
      { id: "d7", text: "After your first video: set the trailer, the featured video and one section per playlist.", path: "studio.youtube.com > Customization > Home tab > Video spotlight, then Featured sections > Add section" },
    ] },
    { name: PHASES[4], items: [
      { id: "e1", text: "Set the audience for the whole channel.", path: "studio.youtube.com > Settings > Channel > Advanced settings > Audience > No, set this channel as not made for kids" },
      { id: "e2", text: "Set upload defaults: description template with your free gift link on line one, visibility Unlisted, your tags.", path: "studio.youtube.com > Settings > Upload defaults > Basic info" },
      { id: "e3", text: `Set category (Education), video language (${language(a)}) and caption settings.`, path: "studio.youtube.com > Settings > Upload defaults > Advanced settings" },
      { id: "e4", text: `Set comment moderation to ${strict ? "Strict" : "Basic"}, so risky comments are held for your review.`, path: `studio.youtube.com > Settings > Community moderation > Defaults > Comments on your videos > ${strict ? "Strict" : "Basic"}` },
      { id: "e5", text: "Add blocked words and block links in comments.", path: "studio.youtube.com > Settings > Community moderation > Content controls (older layout: Community > Automated filters) > Blocked words, Block links" },
      { id: "e6", text: "Know where held comments land, and check it weekly.", path: "studio.youtube.com > Community (older layout: Comments) > Held for review" },
      { id: "e7", text: "When a video uses a cloned voice or an AI avatar, switch on the altered content label at upload.", path: "Upload > Details > Altered content > Yes" },
    ] },
  ];
}

export const checklistText = (a, checks = {}) =>
  `${checklist(a).map((p, i) => `Phase ${i + 1}: ${p.name}\n${p.items.map((it) => `[${checks[it.id] ? "x" : " "}] ${it.text}\n    ${it.path}`).join("\n")}`).join("\n\n")}\n\n${PATH_NOTE}`;

// The kit: `auto` is what the answers make, `kit` the same with what the user or the AI wrote on top.
export function buildKit(a = {}, texts = {}) {
  const has = (k) => typeof texts[k] === "string" && texts[k].trim() !== "";
  const pick = (k, made) => (has(k) ? texts[k] : made);
  const names = pick("names", nameIdeas(a).join("\n"));
  const name = lines(names)[0] ?? baseName(a);
  const tagline = pick("tagline", taglineText(a));
  const auto = { names: nameIdeas(a).join("\n"), tagline: taglineText(a), description: descriptionText(a), about: aboutText(a), links: linksText(a), logoPrompt: logoPrompt(a, name), bannerPrompt: bannerPrompt(a, name, tagline) };
  const kit = Object.fromEntries(Object.entries(auto).map(([k, v]) => [k, pick(k, v)]));
  return { auto, kit, name, handles: handleIdeas(a, name) };
}

// What an empty required answer leaves out of the kit: said on the screen, it never stops anything.
export const missingAnswers = (a = {}) => REQUIRED.filter((k) => !clean(a[k])).map((k) => QUESTIONS.find((q) => q.key === k).short);

export function audienceText(a) {
  return [clean(a.who) && `${cap(a.who)}.`, clean(a.result) && `They want to ${low(a.result)}.`, clean(a.pain) && `What frustrates them: ${low(a.pain)}.`].filter(Boolean).join(" ");
}

const FEEL = { "Clean and minimal": "Clean and calm: plain words, short sentences, no hype.", "Bold and energetic": "Bold and energetic: direct, strong verbs, short sentences.", "Warm and personal": "Warm and personal: friendly, human, like talking to one person.", "Premium and dark": "Premium and refined: measured, confident, no slang." };
export function voiceText(a) {
  const feel = FEEL[a.style];
  if (!feel && !a.face) return "";
  return [feel, a.face === "brand" ? "Speaks as a brand, with \"we\"." : a.face === "person" ? "Speaks as one person, with \"I\"." : ""].filter(Boolean).join(" ");
}

// The same words as traffic-card.mjs profileText, so that importing the card later changes nothing.
export function profileOf(a) {
  return [clean(a.topic) && `Topic: ${clean(a.topic)}.`, clean(a.result) && `Promise: ${clean(a.result)}.`, clean(a.pain) && `Their frustration: ${clean(a.pain)}.`, clean(a.proof) && `Why listen: ${clean(a.proof)}.`].filter(Boolean).join(" ").replace(/\.\./g, ".").slice(0, 4000);
}

// The answers as the Identity's own fields: each with the value now, to preview before anything is
// overwritten. Only fields with a value that differs. `texts` holds what the user or the AI wrote
// over the three long ones. The channel's name is left alone: the Identity's name is not the
// YouTube channel's, and the kit gives ideas, not a decision (DECISIONS 174).
export function fieldsFrom(a = {}, channel = {}, texts = {}) {
  const out = [];
  const add = (field, label, value, editable = false) => {
    const now = channel[field] ?? "";
    if (value && value !== now) out.push({ field, label, now, value, editable });
  };
  const own = (k, made) => (typeof texts[k] === "string" && texts[k].trim() ? texts[k].trim() : made);
  add("audience", "Audience", own("audienceText", audienceText(a)), true);
  add("brandVoice", "Brand Voice", own("voiceText", voiceText(a)), true);
  add("profile", "Channel Profile", own("profileText", profileOf(a)), true);
  add("youtubeUrl", "YouTube channel", url(a.youtube));
  add("landingUrl", "Landing page", url(a.gift) || url(a.course) || url(a.site));
  if (LANGUAGE_NAMES[a.lang]) add("contentLanguage", "Content language", a.lang);
  return out;
}

const cell = (v) => String(v ?? "").replace(/\s+/g, " ").replace(/\|/g, "/").trim();
// A line of free text never becomes a heading of the card, whose headings are its structure.
const safe = (s) => String(s ?? "").replace(/\r/g, "").split("\n").map((l) => l.replace(/^(\s*)#+(\s)/, "$1$2").replace(/^---+\s*$/, "")).join("\n").trim();

// The keywords of a card: what it had, then vidIQ's, then the searches typed. The typed ones have no
// numbers on purpose: nothing is ever guessed. They also give the Playlist Planner its seeds.
export const MAX_SEARCHES = 20;
export const searchesOf = (a = {}) => uniq(lines(a.phrases)).slice(0, MAX_SEARCHES);
export function keywordRows(a = {}, found = [], kept = []) {
  found = (found ?? []).filter((k) => k?.keep !== false);
  const typed = searchesOf(a).map((keyword) => ({ keyword, volume: null, competition: "", score: null, seed: "your words" }));
  const seen = new Map();
  for (const k of [...kept, ...found, ...typed]) {
    const key = cell(k.keyword).toLowerCase();
    if (key && !seen.has(key)) seen.set(key, k);
  }
  return [...seen.values()];
}

// The Evergreen Traffic Card, version 1: the shape traffic-card.mjs reads. `kept` holds the research
// sections of a card this Identity already has, so that saving the wizard never loses them.
export function cardMarkdown({ answers: a = {}, texts = {}, keywords = [], checks = {}, kept = {}, today = "" }) {
  const { kit, handles } = buildKit(a, texts);
  const M = ["---", "card: youtube-evergreen-organic-traffic-card", "version: 1", `generated: ${today}`, "source: IdeaToVideo, YouTube Brand Channel Wizard", "---", "", `# ${CARD_TITLE}`, "", "## Channel", "", "### Profile"];
  M.push(`- Audience: ${clean(a.who)}`, `- Result: ${clean(a.result)}`, `- Topic: ${clean(a.topic)}`, `- Frustration: ${clean(a.pain)}`, `- Proof: ${clean(a.proof)}`, `- Language: ${language(a)}`, `- Country: ${clean(a.country)}`, `- Channel type: ${a.face === "brand" ? "brand" : "personal"}`, `- Publishing pace: ${a.pace ?? ""}`, `- Style: ${a.style ?? ""}, ${a.color ?? DEFAULT_COLOR}`, "");
  M.push("### Name options", ...lines(kit.names).map((x) => `- ${x}`), "");
  M.push("### Handle options", ...handles.map((x) => `- ${x}`), "");
  M.push("### Tagline", ...lines(kit.tagline).map((x) => `- ${x}`), "");
  M.push("### About", safe(kit.about), "");
  M.push("### Links", ...linkRows(a).map((x) => `- ${x}`), "");
  const none = "_Not done yet._";
  const section = (name) => M.push(`## ${name}`, "", kept[name.toLowerCase()]?.trim() || none, "");
  section("Pillars");
  section("Playlists");
  M.push("## Keywords", "");
  const rows = keywordRows(a, keywords, kept.keywordRows ?? []);
  if (rows.length) {
    M.push("| Rank | Keyword | Monthly search volume | Competition | Overall score | From seed |", "|---|---|---|---|---|---|");
    rows.forEach((k, i) => M.push(`| ${i + 1} | ${cell(k.keyword)} | ${k.volume ?? ""} | ${cell(k.competition)} | ${k.score ?? ""} | ${cell(k.seed)} |`));
  } else M.push(none);
  M.push("");
  section("Competitors");
  section("Outliers");
  section("Gaps");
  section("Video List");
  M.push("## Checklist", "");
  checklist(a).forEach((p, i) => {
    M.push(`### Phase ${i + 1}: ${p.name}`);
    p.items.forEach((it) => M.push(`- [${checks[it.id] ? "x" : " "}] ${it.text} Path: ${it.path}`));
    M.push("");
  });
  M.push("## Notes", "", kept.notes?.trim() || "_None._", "");
  return M.join("\n");
}

// The text for YouTube Studio, Settings > Channel > Basic info > Keywords: comma separated
// values (a quoted phrase list on one line fails there with "One or more of your keywords are
// too long"), within YouTube's 500 characters. The topic and the typed searches first, then the
// kept vidIQ keywords in their rank order. A keyword that does not fit whole is left out.
export const CHANNEL_KEYWORDS_MAX = 500;
export function channelKeywords(a = {}, keywords = []) {
  const kept = (keywords ?? []).filter((k) => k?.keep !== false && k?.keyword);
  const words = uniq([clean(a.topic), ...searchesOf(a), ...kept.map((k) => k.keyword)].map((w) => String(w ?? "").replace(/[,"<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100)).filter(Boolean));
  const out = [];
  let len = 0;
  for (const w of words) {
    const add = (out.length ? 2 : 0) + w.length;
    if (len + add > CHANNEL_KEYWORDS_MAX) continue;
    out.push(w);
    len += add;
  }
  return out.join(", ");
}
