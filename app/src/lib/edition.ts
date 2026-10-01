// edition.ts: the UI's words for the product and its levels, in one place
// (DECISIONS 67: white label later means changing this file and
// src-tauri/src/edition.rs). The plan itself (Solo or Agency) comes from the
// core in AppState.edition, never from a settings file.

import type { Edition } from "./api";

export const PRODUCT = "IdeaToVideo";
export const IDENTITY = "Identity";
export const IDENTITIES = "Identities";
export const ONE_VIDEO = "ONE Video";
export const ONE_VIDEOS = "ONE Videos";

/** The plan line in Settings, App, Plan. */
export function planText(e: Edition, count: number): string {
  const limit = e.identityLimit === null ? "unlimited Identities" : `${e.identityLimit} ${e.identityLimit === 1 ? IDENTITY : IDENTITIES}`;
  return `${e.tier} plan: ${limit}. You have ${count}.`;
}

/** Why New, Duplicate and Import are greyed out on a full plan. */
export function fullPlanText(e: Edition): string {
  return `The ${e.tier} plan includes ${e.identityLimit} ${e.identityLimit === 1 ? IDENTITY : IDENTITIES}. The Agency plan includes unlimited Identities.`;
}
