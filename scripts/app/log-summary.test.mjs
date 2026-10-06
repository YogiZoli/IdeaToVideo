// The log summary (docs/backup.md 8): errors grouped by code, the user's
// clicks and screens in words, only the asked sessions.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readEvents, summarize, describe, defaultDir } from "../log-summary.mjs";

test("summary groups errors and tells the story of the last session", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itv-logs-"));
  const ev = (o) => JSON.stringify({ src: "core", level: "info", ...o });
  const lines = [
    ev({ ts: "2026-10-01T10:00:00.000Z", session: "old", seq: 1, event: "app_start", version: "0.1.0", os: "windows", arch: "x86_64", tier: "Agency" }),
    ev({ ts: "2026-10-02T09:00:00.000Z", session: "new", seq: 1, event: "app_start", version: "0.1.0", os: "windows", arch: "x86_64", tier: "Agency" }),
    ev({ ts: "2026-10-02T09:00:01.000Z", session: "new", seq: 2, event: "screen", src: "ui", from: "start", to: "videos" }),
    ev({ ts: "2026-10-02T09:00:05.000Z", session: "new", seq: 3, event: "click", src: "ui", what: "Plan scenes", where: "3. Scene table", screen: "video/x" }),
    ev({ ts: "2026-10-02T09:00:06.000Z", session: "new", seq: 4, event: "run_start", src: "runner", command: "make-scenes", job: { identityName: "Zoltan Gero", project: "C:/P/Zoltan Gero/x" } }),
    ev({ ts: "2026-10-02T09:00:20.000Z", session: "new", seq: 5, event: "run_progress", src: "runner", level: "warn", command: "make-scenes", progress: { step: "fallback", to: "gemini-3.8-flash", status: 503 } }),
    ev({ ts: "2026-10-02T09:00:50.000Z", session: "new", seq: 6, event: "run_failed", src: "runner", level: "error", command: "make-scenes", ms: 44000, message: "Gemini is overloaded or having problems right now (HTTP 503)." }),
    ev({ ts: "2026-10-02T09:00:51.000Z", session: "new", seq: 7, event: "error_shown", src: "ui", level: "error", code: "ITV-HTTP-503", message: "Gemini is overloaded or having problems right now (HTTP 503).", screen: "video/x" }),
    "not json",
  ];
  fs.writeFileSync(path.join(dir, "2026-10-01.jsonl"), lines[0] + "\n");
  fs.writeFileSync(path.join(dir, "2026-10-02.jsonl"), lines.slice(1).join("\n") + "\n");

  const events = readEvents(dir);
  assert.equal(events.length, 9);
  const text = summarize(events);
  assert.ok(text.includes("Session new") && !text.includes("Session old"), "only the last session by default");
  assert.match(text, /ITV-HTTP-503 x1 .*run_failed/);
  assert.match(text, /click "Plan scenes" in 3\. Scene table @video\/x/);
  assert.match(text, /make-scenes: fallback \(HTTP 503\) -> gemini-3\.8-flash/);
  assert.match(text, /make-scenes 44 s \(failed\)/);
  assert.equal(readEvents(dir, "2026-10-02").length, 8);
  assert.ok(summarize(events, { sessions: 2 }).includes("Session old"));
  assert.equal(describe({ event: "call", ok: true }), null, "successful calls stay out of the story");
  assert.ok(defaultDir({ LOCALAPPDATA: "C:/L" }, "win32").split(path.sep).join("/").endsWith("C:/L/app.ideatovideo.desktop/logs"));
});
