// tabs.ts: the steps of a ONE Video as tabs (Zoltan, 2026-10-05, DECISIONS
// 85; Research first and the Shot map for every video, the Thumbnail out to
// Publishing, 2026-11-04, DECISIONS 169), and the one word each tab shows. Pure
// functions, no Tauri imports, so the Node tests load it.
//   done      the step is approved (the avatar: approved or left out; the
//             video: rendered)
//   now       the first step not done yet: where the work is
//   next      a later step
//   optional  the avatar, when it is not the step at hand; the research, when
//             this video does not wait for it
//   failed    the last attempt failed

export type TabId = "research" | "recording" | "script" | "voice" | "scenes" | "shots" | "avatar" | "preview" | "video";
export type TabState = "done" | "now" | "next" | "optional" | "failed";
type Gates = Record<string, { state: string } | undefined>;
export type Tab = { id: TabId; n: number; label: string; gate: string | null; commands: string[]; optional?: boolean };

// Every script video has these, in this order. The research never blocks: it is
// the step at hand only for a video that waits for its brief (videoTabs).
export const TABS: Tab[] = [
  { id: "research", n: 1, label: "Research", gate: null, commands: ["research-make", "keyword-ideas"], optional: true },
  { id: "script", n: 2, label: "Script", gate: "script", commands: ["write-script", "save-script"] },
  { id: "voice", n: 3, label: "Voice and music", gate: "voice", commands: ["make-voice", "make-music", "set-music"] },
  { id: "scenes", n: 4, label: "Scenes", gate: "scenes", commands: ["make-scenes", "simple-scenes", "make-template-scenes", "simple-template-scenes", "refill-scene", "save-scenes"] },
  { id: "shots", n: 5, label: "Shot map", gate: "scenes", commands: ["shot-map-make", "shot-flow-clip"] },
  { id: "avatar", n: 6, label: "Avatar", gate: "avatar", commands: ["make-avatar", "avatar-layout", "remove-avatar"] },
  { id: "preview", n: 7, label: "Preview", gate: "review", commands: ["build-video"] },
  { id: "video", n: 8, label: "Your video", gate: null, commands: ["render-video"] },
];

// A Recorded video (runner/recorded): one tab for the words, the cuts and the plan.
export const RECORDED_TABS: Tab[] = [
  { id: "recording", n: 1, label: "Recording", gate: "scenes", commands: ["recorded-transcribe", "recorded-apply-cuts", "recorded-plan", "recorded-plan-rule", "recorded-prepare"] },
  { id: "preview", n: 2, label: "Preview", gate: "review", commands: ["build-video"] },
  { id: "video", n: 3, label: "Your video", gate: null, commands: ["render-video"] },
];

/** A script video's tabs. `research`: this video starts with its research. */
export function videoTabs(research: boolean): Tab[] {
  return TABS.map((t) => (t.id === "research" ? { ...t, optional: !research } : t));
}

function isDone(id: TabId, gates: Gates, hasVideo: boolean, researchApproved = false): boolean {
  const g = (k: string) => gates[k]?.state;
  switch (id) {
    case "research":
      return researchApproved;
    case "shots":
      return g("scenes") === "approved";
    case "recording":
      return g("scenes") === "approved";
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
    if ((t.id === "avatar" && !hasHeygen) || t.optional) continue;
    if (!isDone(t.id, gates, hasVideo, researchApproved)) return t.id;
  }
  return null;
}

export function tabStates(gates: Gates, hasVideo: boolean, hasHeygen: boolean, list = TABS, researchApproved = false): Record<TabId, TabState> {
  const now = nowTab(gates, hasVideo, hasHeygen, list, researchApproved);
  const out = {} as Record<TabId, TabState>;
  for (const t of list) {
    const gate = t.gate ? gates[t.gate]?.state : undefined;
    if (isDone(t.id, gates, hasVideo, researchApproved)) out[t.id] = "done";
    else if (gate === "failed") out[t.id] = "failed";
    else if (t.id === now) out[t.id] = "now";
    else out[t.id] = t.id === "avatar" || t.optional ? "optional" : "next";
  }
  return out;
}

/** The tab a ONE Video opens on: the step at hand, else the finished video. */
export function firstOpen(gates: Gates, hasVideo: boolean, hasHeygen: boolean, list = TABS, researchApproved = false): TabId {
  return nowTab(gates, hasVideo, hasHeygen, list, researchApproved) ?? "video";
}

/** The tab after an approved step. The avatar only with a HeyGen key. */
export function nextAfter(id: TabId, hasHeygen: boolean, list = TABS): TabId {
  // nothing is approved on Your video: it stays where it is
  if (id === "video") return id;
  const i = list.findIndex((t) => t.id === id);
  const next = list[Math.min(list.length - 1, i + 1)].id;
  return next === "avatar" && !hasHeygen ? "preview" : next;
}

export const tabLabel = (id: TabId, list = TABS) => {
  const t = list.find((x) => x.id === id) ?? TABS.find((x) => x.id === id)!;
  return `${t.n}. ${t.label}`;
};

/**
 * Today's video on Home (DECISIONS 173): the one to go on with. A queued video first, in
 * its order, then a lesson of a playlist, in its order, then the newest one not finished.
 */
export type Unfinished = { dir: string; title: string; createdAt?: string; gates?: Record<string, { state: string } | undefined>; render?: { state?: string } | null; queue?: { position: number } | null; series?: { playlistPosition?: number | null } | null; recipe?: { engine?: string } | null };
export function nextVideo<T extends Unfinished>(list: T[], hasHeygen: boolean): { video: T; step: string; others: number } | null {
  const open = list.filter((v) => v.render?.state !== "done");
  if (!open.length) return null;
  const rank = (v: T) => (v.queue ? [0, v.queue.position] : v.series ? [1, v.series.playlistPosition ?? 999] : [2, 0]);
  const [video] = [...open].sort((a, b) => rank(a)[0] - rank(b)[0] || rank(a)[1] - rank(b)[1] || String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
  const tabs = video.recipe?.engine === "recorded" ? RECORDED_TABS : TABS;
  return { video, step: tabLabel(firstOpen(video.gates ?? {}, false, hasHeygen, tabs), tabs), others: open.length - 1 };
}
