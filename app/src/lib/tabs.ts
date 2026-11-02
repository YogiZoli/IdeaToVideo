// tabs.ts: the steps of a ONE Video as tabs (Zoltan, 2026-10-05, DECISIONS
// 85), and the one word each tab shows. Pure functions, no Tauri imports, so
// the Node tests load it.
//   done      the step is approved (the avatar: approved or left out; the
//             video: rendered)
//   now       the first step not done yet: where the work is
//   next      a later step
//   optional  the avatar, when it is not the step at hand; the thumbnail
//             (DECISIONS 131) until one is picked: it never blocks the video
//   failed    the last attempt failed

export type TabId = "research" | "recording" | "script" | "voice" | "scenes" | "shots" | "avatar" | "preview" | "video" | "thumbnail";
export type TabState = "done" | "now" | "next" | "optional" | "failed";
type Gates = Record<string, { state: string } | undefined>;

export const TABS: { id: TabId; n: number; label: string; gate: string | null; commands: string[] }[] = [
  { id: "script", n: 1, label: "Script", gate: "script", commands: ["write-script", "save-script"] },
  { id: "voice", n: 2, label: "Voice and music", gate: "voice", commands: ["make-voice", "make-music", "set-music"] },
  { id: "scenes", n: 3, label: "Scenes", gate: "scenes", commands: ["make-scenes", "simple-scenes", "make-template-scenes", "simple-template-scenes", "refill-scene", "save-scenes"] },
  { id: "avatar", n: 4, label: "Avatar", gate: "avatar", commands: ["make-avatar", "avatar-layout", "remove-avatar"] },
  { id: "preview", n: 5, label: "Preview", gate: "review", commands: ["build-video"] },
  { id: "video", n: 6, label: "Your video", gate: null, commands: ["render-video"] },
  { id: "thumbnail", n: 7, label: "Thumbnail", gate: null, commands: ["thumbnail-make", "thumbnail-words"] },
];

// A Recorded video (runner/recorded): one tab for the words, the cuts and the plan.
export const RECORDED_TABS: typeof TABS = [
  { id: "recording", n: 1, label: "Recording", gate: "scenes", commands: ["recorded-transcribe", "recorded-apply-cuts", "recorded-plan", "recorded-plan-rule", "recorded-prepare"] },
  { id: "preview", n: 2, label: "Preview", gate: "review", commands: ["build-video"] },
  { id: "video", n: 3, label: "Your video", gate: null, commands: ["render-video"] },
  { id: "thumbnail", n: 4, label: "Thumbnail", gate: null, commands: ["thumbnail-make", "thumbnail-words"] },
];

// A channel's script video (docs/BUILD_PLAN.md phase 3): the Shot map after the
// Scenes, the Research first when this video has it on. An older video keeps TABS.
const RESEARCH_TAB: (typeof TABS)[number] = { id: "research", n: 0, label: "Research", gate: null, commands: ["research-make"] };
const SHOTS_TAB: (typeof TABS)[number] = { id: "shots", n: 0, label: "Shot map", gate: "scenes", commands: ["shot-map-make", "shot-flow-clip"] };
export function scriptTabs(research: boolean): typeof TABS {
  const list = TABS.flatMap((t) => (t.id === "scenes" ? [t, SHOTS_TAB] : [t]));
  return (research ? [RESEARCH_TAB, ...list] : list).map((t, i) => ({ ...t, n: i + 1 }));
}

function isDone(id: TabId, gates: Gates, hasVideo: boolean, hasThumbnail = false, researchApproved = false): boolean {
  const g = (k: string) => gates[k]?.state;
  switch (id) {
    case "research":
      return researchApproved;
    case "shots":
      return g("scenes") === "approved";
    case "recording":
      return g("scenes") === "approved";
    case "thumbnail":
      return hasThumbnail;
    case "avatar":
      return g("avatar") === "approved" || g("avatar") === "skipped";
    case "video":
      return hasVideo && g("review") === "approved";
    case "preview":
      return g("review") === "approved";
    default:
      return g(id) === "approved";
  }
}

/** The tab where the work is. The avatar counts only with a HeyGen key. */
function nowTab(gates: Gates, hasVideo: boolean, hasHeygen: boolean, list = TABS, researchApproved = false): TabId | null {
  for (const t of list) {
    if ((t.id === "avatar" && !hasHeygen) || t.id === "thumbnail") continue;
    if (!isDone(t.id, gates, hasVideo, false, researchApproved)) return t.id;
  }
  return null;
}

export function tabStates(gates: Gates, hasVideo: boolean, hasHeygen: boolean, hasThumbnail = false, list = TABS, researchApproved = false): Record<TabId, TabState> {
  const now = nowTab(gates, hasVideo, hasHeygen, list, researchApproved);
  const out = {} as Record<TabId, TabState>;
  for (const t of list) {
    const gate = t.gate ? gates[t.gate]?.state : undefined;
    if (isDone(t.id, gates, hasVideo, hasThumbnail, researchApproved)) out[t.id] = "done";
    else if (gate === "failed") out[t.id] = "failed";
    else if (t.id === now) out[t.id] = "now";
    else out[t.id] = t.id === "avatar" || t.id === "thumbnail" ? "optional" : "next";
  }
  return out;
}

/** The tab a ONE Video opens on: the step at hand, else the finished video. */
export function firstOpen(gates: Gates, hasVideo: boolean, hasHeygen: boolean, list = TABS, researchApproved = false): TabId {
  return nowTab(gates, hasVideo, hasHeygen, list, researchApproved) ?? "video";
}

/** The tab after an approved step. The avatar only with a HeyGen key. */
export function nextAfter(id: TabId, hasHeygen: boolean, list = TABS): TabId {
  // nothing is approved on Your video or Thumbnail: they stay where they are
  if (id === "video" || id === "thumbnail") return id;
  const i = list.findIndex((t) => t.id === id);
  const next = list[Math.min(list.length - 1, i + 1)].id;
  return next === "avatar" && !hasHeygen ? "preview" : next;
}

export const tabLabel = (id: TabId, list = TABS) => {
  const t = list.find((x) => x.id === id) ?? TABS.find((x) => x.id === id)!;
  return `${t.n}. ${t.label}`;
};
