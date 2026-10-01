// keystate.svelte.ts: where each key is saved (the App, the active
// Identity's own, both or none), shared by every KeyField on screen. Only
// booleans: the UI never sees a key.

import { keyStatus, type KeySource } from "./api";

export const keySources = $state<Record<string, KeySource>>({});

export function setKeySources(s: Record<string, KeySource>) {
  for (const k of Object.keys(keySources)) delete keySources[k];
  Object.assign(keySources, s);
}

/** Reloads from the keychain; returns the effective "can use" booleans. */
export async function refreshKeySources(): Promise<Record<string, boolean>> {
  const r = await keyStatus();
  setKeySources(r.keySources);
  return r.keys;
}
