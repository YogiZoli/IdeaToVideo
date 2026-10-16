// clips.ts: where the clip of a comment keyword comes from (D5, DECISIONS
// 119). Four sources, always choosable on Wizards, CTA:
//   upload    the segment the user uploaded
//   previous  a HeyGen clip made or imported before (it is the segment)
//   heygen    HeyGen makes it at the start of the next video, then it is kept
//   narrator  the narrator says the call, no avatar (the CTA scene)
// No source wins by itself (Zoltan, 2026-10-08, DECISIONS 120): a clip
// there is plays, else the narrator; HeyGen only when it is chosen. Each
// ONE Video chooses its own at gate 1 (VideoCalls): upload, previous,
// heygen-new or none.
// Stored in the CTA profile's modes: upload and previous are "segment",
// narrator "narrator", heygen "heygen"; "auto" means the default.
import type { AppState, CtaMode, CtaSegment } from "../api";
import { runner } from "../api";
import { avatarLooks } from "../avatars";
import { chooseEngine, type AvatarEngine } from "../avatarEngines";

export type ClipSource = "upload" | "previous" | "heygen" | "narrator";

export const SOURCE_LABEL: Record<ClipSource, string> = {
  upload: "Your uploaded clip",
  previous: "Previously used HeyGen clip",
  heygen: "Generate with HeyGen",
  narrator: "Narrator (no avatar)",
};

const segSource = (seg: CtaSegment | null): ClipSource | null => (!seg ? null : seg.source === "upload" ? "upload" : "previous");

/** HeyGen can make a clip: a key and an avatar look. */
export const heygenReady = (app: AppState) => !!app.keys["heygen"] && !!(app.identity?.avatar?.lookId ?? app.config?.avatar?.lookId);

export function defaultSource(seg: CtaSegment | null, _heygen = false): ClipSource {
  return segSource(seg) ?? "narrator";
}

/** The source a place uses now, from its saved mode. */
export function effectiveSource(mode: CtaMode | undefined, seg: CtaSegment | null, heygen: boolean): ClipSource {
  if (mode === "narrator") return "narrator";
  if (mode === "segment") return segSource(seg) ?? "narrator";
  if (mode === "heygen") return segSource(seg) ?? (heygen ? "heygen" : "narrator");
  if (mode === "heygen-new") return heygen ? "heygen" : (segSource(seg) ?? "narrator");
  if (mode === "upload") return seg?.source === "upload" ? "upload" : "narrator";
  if (mode === "previous") return seg && seg.source !== "upload" ? "previous" : "narrator";
  return defaultSource(seg, heygen);
}

export const modeFor = (s: ClipSource): CtaMode => (s === "narrator" ? "narrator" : s === "heygen" ? "heygen" : "segment");

/** Which sources can be picked now; the others are greyed out. */
export function available(seg: CtaSegment | null, heygen: boolean): Record<ClipSource, boolean> {
  const own = segSource(seg);
  return { upload: own === "upload", previous: own === "previous", heygen: heygen && !own, narrator: true };
}

// HeyGen's public API prices per minute (avatarEngines.ts).
const RATES: Record<AvatarEngine, [number, number]> = { avatar_iii: [0.6, 0.99], avatar_iv: [2.31, 4.83], avatar_v: [2.31, 4.83] };

// A full call written by the user (it names the keyword itself) is spoken word for word
// (Zoltan, 2026-10-16); a short "what they get" still goes into the default sentence.
export const callText = (keyword: string, gets: string) =>
  new RegExp(`\\b${keyword}\\b`).test(gets) ? gets.trim() : `Comment ${keyword} below and I'll send you ${gets}.`;

/** About what one clip of this sentence costs, as a sentence. */
export function priceText(text: string, engine: AvatarEngine | undefined | null): string {
  const seconds = Math.max(3, text.split(/\s+/).filter(Boolean).length / 2.5);
  const [lo, hi] = RATES[engine ?? "avatar_iii"] ?? RATES.avatar_iii;
  const usd = (n: number) => `$${Math.max(0.01, n).toFixed(2)}`;
  return `about ${usd((lo * seconds) / 60)} to ${usd((hi * seconds) / 60)}, made once and used in every video`;
}

/** HeyGen makes the clip: the narrator reads the sentence, HeyGen puts the avatar on it. */
export async function makeHeygenClip(app: AppState, keyword: string, text: string, name = ""): Promise<CtaSegment> {
  const lookId = app.identity?.avatar?.lookId ?? app.config?.avatar?.lookId ?? null;
  const v = await runner<{ audio: string; seconds: number }>("segment-voice", { narrator: app.config?.narrator ?? null, text, language: app.config?.channel.contentLanguage ?? "en" });
  const looks = await avatarLooks().catch(() => null);
  const lookEngines = looks ? [...looks.own.flatMap((g) => g.looks), ...looks.stock].find((l) => l.id === lookId)?.engines ?? [] : [];
  const r = await runner<{ segment: CtaSegment }>("segment-make", { service: "heygen", lookId, audio: v.audio, keyword, name, text, engine: chooseEngine(app.identity?.avatar?.engine ?? app.config?.avatar?.engine, lookEngines).engine, lookEngines });
  return r.segment;
}

export type Pending = { keyword: string; text: string };

/**
 * The places of the next script whose source is "Generate with HeyGen" and
 * that have no clip yet: made before the script is written, so the script
 * leaves the call to the clip (nothing is said twice).
 */
type Calls = { slots: Record<string, string | null>; modes?: Record<string, string>; offers?: Record<string, string> };
export async function pendingHeygen(app: AppState, own: Calls | null = null): Promise<Pending[]> {
  if (!heygenReady(app)) return [];
  const st = await runner<{ profile: Calls | null; start: Calls; segments: CtaSegment[]; options: { keywords: { keyword: string; gets: string }[] } }>("cta-state", {});
  const p = own ?? st.profile ?? st.start;
  const out: Pending[] = [];
  for (const slot of ["start", "middle", "end"]) {
    const k = p.slots[slot];
    if (!k || out.some((x) => x.keyword === k)) continue;
    const seg = st.segments.find((s) => s.keyword === k) ?? null;
    const mode = p.modes?.[slot] as CtaMode | undefined;
    // heygen: only a missing clip; heygen-new: a new one even if there is one
    // never over an uploaded clip: one clip per keyword, and a new one replaces the old
    if (mode === "heygen-new" ? seg?.source === "upload" : effectiveSource(mode, seg, true) !== "heygen") continue;
    const info = st.options.keywords.find((x) => x.keyword === k);
    // a video's own gate-1 choice carries no offers: the Identity's saved call text still applies (2026-10-16)
    out.push({ keyword: k, text: callText(k, p.offers?.[k] ?? st.profile?.offers?.[k] ?? info?.gets ?? "the details") });
  }
  return out;
}
