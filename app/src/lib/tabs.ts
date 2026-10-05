// tabs.ts: the steps of a ONE Video as tabs (Zoltan, 2026-10-05, DECISIONS
// 85), and the one word each tab shows. Pure functions, no Tauri imports, so
// the Node tests load it.
//   done      the step is approved (the avatar: approved or left out; the
//             video: rendered)
//   now       the first step not done yet: where the work is
//   next      a later step
//   optional  the avatar, when it is not the step at hand
//   failed    the last attempt failed

export type TabId = "script" | "voice" | "scenes" | "avatar" | "preview" | "video";
export type TabState = "done" | "now" | "next" | "optional" | "failed";
type Gates = Record<string, { state: string } | undefined>;

export const TABS: { id: TabId; n: number; label: string; gate: string | null; commands: string[] }[] = [
  { id: "script", n: 1, label: "Script", gate: "script", commands: ["write-script", "save-script"] },
  { id: "voice", n: 2, label: "Voice and music", gate: "voice", commands: ["make-voice", "make-music", "set-music"] },
  { id: "scenes", n: 3, label: "Scenes", gate: "scenes", commands: ["make-scenes", "simple-scenes", "refill-scene", "save-scenes"] },
  { id: "avatar", n: 4, label: "Avatar", gate: "avatar", commands: ["make-avatar", "avatar-layout", "remove-avatar"] },
  { id: "preview", n: 5, label: "Preview", gate: "review", commands: ["build-video"] },
  { id: "video", n: 6, label: "Your video", gate: null, commands: ["render-video"] },
];

function isDone(id: TabId, gates: Gates, hasVideo: boolean): boolean {
  const g = (k: string) => gates[k]?.state;
  switch (id) {
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
function nowTab(gates: Gates, hasVideo: boolean, hasHeygen: boolean): TabId | null {
  for (const t of TABS) {
    if (t.id === "avatar" && !hasHeygen) continue;
    if (!isDone(t.id, gates, hasVideo)) return t.id;
  }
  return null;
}

export function tabStates(gates: Gates, hasVideo: boolean, hasHeygen: boolean): Record<TabId, TabState> {
  const now = nowTab(gates, hasVideo, hasHeygen);
  const out = {} as Record<TabId, TabState>;
  for (const t of TABS) {
    const gate = t.gate ? gates[t.gate]?.state : undefined;
    if (isDone(t.id, gates, hasVideo)) out[t.id] = "done";
    else if (gate === "failed") out[t.id] = "failed";
    else if (t.id === now) out[t.id] = "now";
    else out[t.id] = t.id === "avatar" ? "optional" : "next";
  }
  return out;
}

/** The tab a ONE Video opens on: the step at hand, else the finished video. */
export function firstOpen(gates: Gates, hasVideo: boolean, hasHeygen: boolean): TabId {
  return nowTab(gates, hasVideo, hasHeygen) ?? "video";
}

/** The tab after an approved step. The avatar only with a HeyGen key. */
export function nextAfter(id: TabId, hasHeygen: boolean): TabId {
  const i = TABS.findIndex((t) => t.id === id);
  const next = TABS[Math.min(TABS.length - 1, i + 1)].id;
  return next === "avatar" && !hasHeygen ? "preview" : next;
}

export const tabLabel = (id: TabId) => {
  const t = TABS.find((x) => x.id === id)!;
  return `${t.n}. ${t.label}`;
};
