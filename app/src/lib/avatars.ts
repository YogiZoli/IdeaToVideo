// avatars.ts: the HeyGen avatar list with its pictures, loaded once and
// early (Zoltan, 2026-10-05, K10 b: the app works ahead, but only for free).
// Reading the list costs nothing; the ONE Video starts it in the background
// when it opens, so the Avatar tab shows the pictures at once.
import { runner } from "./api";
import type { Group, Look } from "./LookPicker.svelte";

let cache: Promise<{ own: Group[]; stock: Look[] }> | null = null;

export function avatarLooks(fresh = false) {
  if (!cache || fresh) {
    cache = runner<{ own: Group[]; stock: Look[] }>("avatar-looks", { service: "heygen" }).catch((e) => {
      cache = null;
      throw e;
    });
  }
  return cache;
}
