// night.ts: what the Night shift's list says (DECISIONS 182). Pure, so the Node tests load it.

export type NightStatus = "queued" | "running" | "ready" | "waiting" | "failed";
export type NightItem = { dir: string; title: string; status: NightStatus; reason?: string; page?: "research" | "script" | "avatar" | "video" };
export type NightShift = { schema: "night-shift/1"; state: "running" | "stopped" | "done"; startedAt: string; finishedAt?: string | null; items: NightItem[] };
export type NightVideo = { dir: string; title: string; status: string; position: number | null; engine: string };
export type NightGroup = { key: string; title: string; videos: NightVideo[] };

export function newShift(videos: { dir: string; title: string }[], now = new Date().toISOString()): NightShift {
  return { schema: "night-shift/1", state: "running", startedAt: now, finishedAt: null, items: videos.map((v) => ({ dir: v.dir, title: v.title, status: "queued" })) };
}

/** After a restart: what was running goes on from its last finished step. */
export const nextItem = (s: NightShift): NightItem | null => s.items.find((i) => i.status === "running") ?? s.items.find((i) => i.status === "queued") ?? null;

export function counts(s: NightShift) {
  const by = (st: NightStatus) => s.items.filter((i) => i.status === st).length;
  return { total: s.items.length, ready: by("ready"), waiting: by("waiting"), failed: by("failed"), left: by("queued") + by("running"), done: by("ready") + by("waiting") + by("failed") };
}

/** Why a video stopped before the finished video, in one sentence, and the step that opens. */
export const WAITS: Record<"brief" | "offline" | "avatar", { reason: string; page: NightItem["page"] }> = {
  brief: { reason: "Its research brief is ready: read it, one click goes on.", page: "research" },
  offline: { reason: "No AI could write the script: write or paste it, then it goes on.", page: "script" },
  avatar: { reason: "Its avatar costs HeyGen credits, which the night shift never spends: say yes, or turn it off.", page: "avatar" },
};

export const STATUS_WORD: Record<NightStatus, string> = { queued: "In line", running: "Making it", ready: "Ready", waiting: "Waits for you", failed: "Failed" };

export function morningLine(s: NightShift): string {
  const c = counts(s);
  const parts = [`${c.ready} ready to watch`];
  if (c.waiting) parts.push(`${c.waiting} waiting for you`);
  if (c.failed) parts.push(`${c.failed} failed`);
  if (c.left) parts.push(`${c.left} not made`);
  return `${parts.join(", ")}.`;
}
