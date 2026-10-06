// identity.ts: the two levels of settings (DECISIONS 67, docs/identity.md 2-3).
// The App (config.json) holds what is the same for every Identity; an Identity
// (identity.json) holds its brand, voice, audience and the rest. The gates read
// one merged object, the effective settings: the Identity's fields, its AI
// override if it has one, else the App's AI. Pure functions, no Tauri
// imports, so the Node tests load it.

import type { AppConfig, Config, Identity, Llm, NewIdentity } from "./api";

/** The name of the first Identity (setup, and the move from one settings file). */
export const FIRST_IDENTITY_NAME = "My Identity";

/** App + Identity -> the effective settings every gate reads. */
export function effectiveConfig(app: AppConfig, ident: Identity): Config {
  return {
    name: ident.name,
    onboarded: app.onboarded,
    ui: app.ui,
    llm: { ...(ident.llm ?? app.llm) },
    brand: ident.brand,
    channel: { ...ident.channel },
    narrator: { ...ident.narrator },
    avatar: ident.avatar ?? { enabled: false },
    research: ident.research ?? { vidiq: false },
    defaults: { ...ident.defaults, autopilot: app.defaults?.autopilot ?? false },
  };
}

/** The Identity part of edited effective settings. `base`: the stored
 * Identity (keeps id, folder, the AI override) or nothing for a new one. */
export function identityFromConfig(c: Config, base: Identity | null, llm: Llm | null = base?.llm ?? null): Identity | NewIdentity {
  const fields = {
    name: (c.name ?? "").trim() || base?.name || FIRST_IDENTITY_NAME,
    llm,
    brand: c.brand,
    channel: c.channel,
    narrator: c.narrator,
    avatar: c.avatar,
    research: c.research,
    defaults: { scriptTemplate: c.defaults?.scriptTemplate, targetLengthMin: c.defaults?.targetLengthMin },
  };
  return base ? { ...base, ...fields } : fields;
}

/** The App part of edited effective settings (first setup). */
export function appFromConfig(c: Config, base: AppConfig | null): AppConfig {
  return {
    ...(base ?? {}),
    schema: 2,
    onboarded: c.onboarded ?? base?.onboarded,
    ui: c.ui ?? base?.ui ?? { language: "en" },
    llm: { ...c.llm },
    defaults: { autopilot: c.defaults?.autopilot ?? base?.defaults?.autopilot ?? false },
  };
}

/** "@handle" from a YouTube channel URL, for the Identity menu. */
export function youtubeHandle(url: string | null | undefined): string | null {
  const m = /youtube\.com\/(@[\w.-]+)/i.exec(url ?? "");
  return m ? m[1] : null;
}

/** Can one more Identity be made on this plan. */
export function roomForIdentity(count: number, limit: number | null): boolean {
  return limit === null || count < limit;
}

/** A free name for a copy: "VoxFlow copy", "VoxFlow copy 2". */
export function copyName(name: string, taken: string[]): string {
  const lower = taken.map((t) => t.toLowerCase());
  const base = `${name} copy`;
  if (!lower.includes(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!lower.includes(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}
