// roles.mjs: what each library component is for, in the words the user sees
// (DECISIONS 55). The scene table groups components by role: the AI picks one
// per scene, the user may swap a row for another one of the same role, and
// nobody has to know what a "component" is.
//
// mainVar: the on-screen text the user can edit in the table (Custom). null
// when the component's content is not one line of text (numbers, lists).
// words: word limits per variable where the component is made for less than
// the general limit (MAX_WORDS). headline-slam shrinks a longer line until
// its fixed letter spacing crushes the letters (seen in the first real video).

export const ROLES = {
  opening: { label: "Opening or chapter", hint: "The start of the video, or a new section." },
  statement: { label: "Key line", hint: "The main claim of a sentence, big on screen." },
  emphasis: { label: "Emphasis", hint: "One word is the point." },
  proof: { label: "Number or chart", hint: "A number the narration says." },
  list: { label: "List or steps", hint: "Three to six things." },
  sketch: { label: "Sketch", hint: "A simple drawing for an idea." },
  closing: { label: "Closing", hint: "The call to action, or your name at the end." },
};

export const COMPONENTS = {
  "titlecard-lockup": { role: "opening", label: "Title card", mainVar: "wordmark" },
  "titlecard-calm": { role: "opening", label: "Quiet chapter title", mainVar: "headline" },
  "per-word-rise": { role: "statement", label: "Words rise in", mainVar: "text" },
  "kinetic-type-swap": { role: "statement", label: "One word changes", mainVar: null, words: { prefix: 3, suffix: 2 } },
  "headline-slam": { role: "statement", label: "Headline lands hard", mainVar: "text", words: { text: 3 } },
  "marker-highlight": { role: "emphasis", label: "Word marked", mainVar: "text" },
  "count-up": { role: "proof", label: "Number counts up", mainVar: null },
  "chart-story": { role: "proof", label: "Chart", mainVar: null },
  "conic-progress-ring": { role: "proof", label: "Progress ring", mainVar: null },
  "grid-card-assemble": { role: "list", label: "Cards in a grid", mainVar: "items" },
  "constellation-hub": { role: "list", label: "Ideas around a center", mainVar: "nodes" },
  "whiteboard-ink": { role: "sketch", label: "Whiteboard sketch", mainVar: "caption" },
  "cta-close": { role: "closing", label: "Call to action", mainVar: "action_line", words: { button_label: 3 } },
  // Retired (Zoltan, 2026-10-05, CTA K12): no longer planned or offered, old
  // scene tables that use it still build.
  "logo-brand-close": { role: "closing", label: "Name at the end", mainVar: "wordmark", retired: true },
};

export const roleOf = (component) => COMPONENTS[component]?.role ?? null;

// How often the picture changes, the Identity's choice in the Motion wizard
// (Zoltan, 2026-10-06: "not something I should decide for every user").
//   target  the Simple plan grows a scene until it lasts this long
//   longest the Simple plan never grows a scene past this
//   joined  the check sends back a scene of several sentences longer than this
//   rule    the planner's instruction
export const PACES = {
  calm: { label: "Calm", picture: "a new picture every 5 to 8 seconds", target: 5, longest: 9, joined: 10, rule: "A new picture every 5 to 8 seconds. Join sentences that belong together while the joined scene stays under 10 seconds. A scene is at least 2 seconds." },
  balanced: { label: "Balanced", picture: "a new picture every 3 to 5 seconds", target: 3, longest: 6, joined: 7, rule: "A new picture every 3 to 5 seconds. Give every sentence its own scene. Join only very short sentences that belong together, and only while the joined scene stays under 6 seconds. A scene is at least 2 seconds." },
  fast: { label: "Fast", picture: "a new picture every 2 to 4 seconds", target: 2, longest: 4, joined: 5, rule: "A new picture every 2 to 4 seconds. Give every sentence its own scene; join two sentences only when one of them is under 2 seconds. A scene is at least 2 seconds." },
};
export const DEFAULT_PACE = "balanced";
export const paceOf = (id) => PACES[id] ?? PACES[DEFAULT_PACE];
