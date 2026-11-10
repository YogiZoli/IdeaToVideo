// edition.ts: the UI's words for the product and its levels, in one place
// (DECISIONS 67: white label later means changing this file and
// src-tauri/src/edition.rs). The plan itself (Solo or Agency) comes from the
// core in AppState.edition, never from a settings file.

import type { Edition } from "./api";
// the same switch as pages.ts (a value import between .ts files does not load in the Node tests)
const EDITOR: boolean = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ITV_APP === "editor";

export const PRODUCT = EDITOR ? "RecCut" : "IdeaToVideo";
export const MAIN_PRODUCT = "IdeaToVideo";
export const IDENTITY = "Identity";
export const IDENTITIES = "Identities";
// Always singular (Zoltan, 2026-10-01): "ONE Videos" is not English. Where
// a sentence needs a plural, it says "videos".
export const ONE_VIDEO = EDITOR ? "video" : "ONE Video";

/** The plan line in Settings, Plan. */
export function planText(e: Edition, count: number): string {
  const limit = e.identityLimit === null ? "unlimited Identities" : `${e.identityLimit} ${e.identityLimit === 1 ? IDENTITY : IDENTITIES}`;
  return `${e.tier} plan: ${limit}. You have ${count}.`;
}

/** Why New, Duplicate and Import are greyed out on a full plan. */
export function fullPlanText(e: Edition): string {
  return `The ${e.tier} plan includes ${e.identityLimit} ${e.identityLimit === 1 ? IDENTITY : IDENTITIES}. The Agency plan includes unlimited Identities.`;
}
