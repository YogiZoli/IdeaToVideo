// notify.ts: a long job is done while the user works elsewhere (Zoltan,
// 2026-10-05, K10 c: yes, but the app never makes a sound). Only when the
// app is not in front: the taskbar button flashes, silently, until the app
// is opened.
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import { log } from "./logger";

export async function notifyDone(title: string, body: string) {
  if (typeof document !== "undefined" && document.hasFocus()) return;
  try {
    await getCurrentWindow().requestUserAttention(UserAttentionType.Informational);
    log("notified", { title, body: body.length });
  } catch {
    // a notice is a nice-to-have; never fail a job over it
  }
}
