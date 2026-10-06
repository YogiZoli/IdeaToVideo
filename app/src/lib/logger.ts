// logger.ts: the UI's half of the local log (docs/backup.md B). Rather more
// than less (Zoltan, 2026-10-01): every click with its label and where it
// was, every choice that changed (its value when it is a choice, only the
// field and the length for typed text, nothing at all for a key field), every
// screen change, errors on screen and the ones that never reached it, window
// focus, and every call into the core with its time. The core writes the
// file and masks anything that looks like a key.

import { invoke } from "@tauri-apps/api/core";

export type Level = "info" | "warn" | "error";

let screen = "start";
let identity: string | null = null;

/** Writes one event. Never throws, never waits. */
export function log(event: string, data: Record<string, unknown> = {}, level: Level = "info") {
  try {
    invoke("log_event", { level, event, data: { screen, identity, ...data } }).catch(() => {});
  } catch {
    // outside Tauri (tests, ui-mock without the command): nothing to do
  }
}

/** Where the user is, in words: "settings/identity", "video/2026-10-01_x/voice". */
export function setScreen(name: string, extra: Record<string, unknown> = {}) {
  if (name === screen) return;
  const from = screen;
  screen = name;
  log("screen", { from, to: name, ...extra });
}

export function setIdentity(id: string | null) {
  identity = id;
}

const short = (s: string | null | undefined, n = 80) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "..." : t;
};

/** The heading of the card or page an element sits in. */
function whereOf(el: Element): string {
  const card = el.closest("section, .card, .pop, nav, header, .wizard, .progress");
  let h = card?.querySelector("h1, h2, h3, .gname, legend")?.textContent;
  // a grouped menu (Settings): the group the item is listed under, not the first one
  if (card?.tagName === "NAV") {
    let s = el.closest("nav > *")?.previousElementSibling ?? null;
    while (s && !s.querySelector(".gname") && !s.classList.contains("gname")) s = s.previousElementSibling;
    h = s ? (s.querySelector(".gname") ?? s).textContent : h;
  }
  const page = document.querySelector(".page h1, .wizard h1, main h1")?.textContent;
  return [short(page, 40), short(h, 40)].filter(Boolean).join(" > ");
}

function labelOf(el: Element): string {
  const input = el as HTMLInputElement;
  if (input.id) {
    const l = document.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent;
    if (l) return short(l, 60);
  }
  const wrap = el.closest("label")?.textContent;
  return short(wrap || el.getAttribute("aria-label") || el.getAttribute("name") || input.id || el.tagName.toLowerCase(), 60);
}

/** Global listeners, once, at app start. */
export function installLogger() {
  window.addEventListener("error", (e) => log("ui_error", { message: e.message, file: e.filename, line: e.lineno, col: e.colno, stack: short(e.error?.stack, 1500) }, "error"));
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    log("ui_unhandled", { message: typeof r === "string" ? r : r?.message ?? String(r), stack: short(r?.stack, 1500) }, "error");
  });
  document.addEventListener(
    "click",
    (e) => {
      const el = (e.target as Element)?.closest?.("button, a, [role=menuitem], summary, input[type=checkbox], input[type=radio]");
      if (!el) return;
      const b = el as HTMLButtonElement;
      log("click", {
        what: el.tagName === "INPUT" ? labelOf(el) : short(b.textContent || el.getAttribute("aria-label") || el.getAttribute("title"), 80),
        kind: el.tagName.toLowerCase(),
        disabled: !!b.disabled,
        where: whereOf(el),
      });
    },
    true,
  );
  document.addEventListener(
    "change",
    (e) => {
      const el = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (!el?.tagName) return;
      const field = labelOf(el);
      const where = whereOf(el);
      if (el instanceof HTMLInputElement && el.type === "password") return log("field_changed", { field, where, key: true });
      if (el instanceof HTMLSelectElement) return log("choice_changed", { field, where, value: el.value });
      if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) return log("choice_changed", { field, where, checked: el.checked, value: el.value });
      if (el instanceof HTMLInputElement && el.type === "file") return log("file_picked", { field, where, files: el.files?.length ?? 0 });
      log("field_changed", { field, where, length: el.value.length });
    },
    true,
  );
  document.addEventListener("visibilitychange", () => log("window", { visible: document.visibilityState === "visible" }));
  window.addEventListener("resize", debounce(() => log("window", { width: window.innerWidth, height: window.innerHeight }), 1500));
  log("ui_start", { width: window.innerWidth, height: window.innerHeight, language: navigator.language, userAgent: short(navigator.userAgent, 200) });
}

function debounce(fn: () => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

/** Which settings fields changed, by path. Values only for choices that are
 * not the user's own text (provider, model, preset, language, voice...). */
const PLAIN_FIELDS = /(provider|model|preset|contentLanguage|voice|enabled|style|position|size|vidiq|scriptTemplate|targetLengthMin|autopilot|level|auto|activeIdentity|lookId)$/;
export function changedPaths(before: unknown, after: unknown, at = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  if (isObj(before) && isObj(after)) {
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) Object.assign(out, changedPaths(before[k], after[k], at ? `${at}.${k}` : k));
    return out;
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return out;
  out[at] = PLAIN_FIELDS.test(at) ? { from: before ?? null, to: after ?? null } : { changed: true, length: typeof after === "string" ? after.length : undefined };
  return out;
}
