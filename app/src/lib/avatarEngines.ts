// avatarEngines.ts: the three HeyGen avatar engines the app can order with
// (DECISIONS 100, 101). The same rule as runner/providers/avatar/heygen.mjs
// chooseEngine: the wanted engine if the look takes it, else the cheapest it
// does take. Prices are HeyGen's public API prices per minute (2026-10, help
// page "HeyGen API pricing explained"); Avatar V's was not published there.
export type AvatarEngine = "avatar_iii" | "avatar_iv" | "avatar_v";

export const DEFAULT_ENGINE: AvatarEngine = "avatar_iii";

export const ENGINES: { id: AvatarEngine; label: string; price: string; blurb: string }[] = [
  { id: "avatar_iii", label: "Avatar III", price: "about $0.60 to $0.99 a minute", blurb: "The cheapest. Good for most videos." },
  { id: "avatar_iv", label: "Avatar IV", price: "about $2.31 to $4.83 a minute", blurb: "More natural motion and expression. About four times the price of III." },
  { id: "avatar_v", label: "Avatar V", price: "price not published, estimated like IV", blurb: "HeyGen's newest, the highest fidelity. Only some looks take it." },
];

export const engineLabel = (e: AvatarEngine) => ENGINES.find((x) => x.id === e)?.label ?? e;

/** The engine to order with, and a plain sentence when it is not the wanted one. */
export function chooseEngine(wanted: AvatarEngine | undefined | null, supported: string[] | undefined | null): { engine: AvatarEngine; note: string | null } {
  const want = ENGINES.some((x) => x.id === wanted) ? (wanted as AvatarEngine) : DEFAULT_ENGINE;
  const list = (supported ?? []).filter((e) => ENGINES.some((x) => x.id === e));
  if (!list.length || list.includes(want)) return { engine: want, note: null };
  const engine = ENGINES.find((x) => list.includes(x.id))!.id;
  return { engine, note: `This look does not work with ${engineLabel(want)} at HeyGen, so ${engineLabel(engine)} is used.` };
}
