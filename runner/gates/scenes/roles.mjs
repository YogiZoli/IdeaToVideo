// roles.mjs: what each library component is for, in the words the user sees
// (DECISIONS 55). The scene table groups components by role: the AI picks one
// per scene, the user may swap a row for another one of the same role, and
// nobody has to know what a "component" is.
//
// mainVar: the on-screen text the user can edit in the table (Custom). null
// when the component's content is not one line of text (numbers, lists).

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
  "kinetic-type-swap": { role: "statement", label: "One word changes", mainVar: null },
  "headline-slam": { role: "statement", label: "Headline lands hard", mainVar: "text" },
  "vox-annotate": { role: "emphasis", label: "Word circled with a note", mainVar: "text" },
  "marker-highlight": { role: "emphasis", label: "Word marked", mainVar: "text" },
  "count-up": { role: "proof", label: "Number counts up", mainVar: null },
  "chart-story": { role: "proof", label: "Chart", mainVar: null },
  "conic-progress-ring": { role: "proof", label: "Progress ring", mainVar: null },
  "grid-card-assemble": { role: "list", label: "Cards in a grid", mainVar: "items" },
  "constellation-hub": { role: "list", label: "Ideas around a center", mainVar: "nodes" },
  "whiteboard-ink": { role: "sketch", label: "Whiteboard sketch", mainVar: "caption" },
  "cta-close": { role: "closing", label: "Call to action", mainVar: "action_line" },
  "logo-brand-close": { role: "closing", label: "Name at the end", mainVar: "wordmark" },
};

export const roleOf = (component) => COMPONENTS[component]?.role ?? null;
