#!/usr/bin/env node
// log-summary.mjs: the local log in a few lines (docs/backup.md 8). Claude
// reads this first, then opens only the details it needs: errors and
// warnings grouped by code, slow and failed steps, what the user clicked and
// saw last. Read-only; the log stays where it is.
//
// Usage:
//   node scripts/log-summary.mjs                  the last session
//   node scripts/log-summary.mjs --sessions 3     the last three sessions
//   node scripts/log-summary.mjs --since 2026-10-01
//   node scripts/log-summary.mjs --tail 60        more of the last events
//   node scripts/log-summary.mjs --dir <logs>     another log folder
// Default folder: Windows %LOCALAPPDATA%/app.ideatovideo.desktop/logs,
// macOS ~/Library/Application Support/app.ideatovideo.desktop/logs.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { errorCode } from "../app/src/lib/errors.ts";

export const IDENTIFIER = "app.ideatovideo.desktop";

export function defaultDir(env = process.env, platform = process.platform) {
  if (platform === "win32") return path.join(env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), IDENTIFIER, "logs");
  if (platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", IDENTIFIER, "logs");
  return path.join(env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), IDENTIFIER, "logs");
}

export function readEvents(dir, since = null) {
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && (!since || f.slice(0, 10) >= since))
    .sort();
  const out = [];
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        out.push({ ts: f.slice(0, 10), level: "warn", event: "unreadable_line", src: "log" });
      }
    }
  }
  return out;
}

const clock = (ts) => String(ts ?? "").slice(11, 19);
const cut = (s, n = 140) => {
  const t = String(s ?? "").replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n) + "..." : t;
};

/** One readable line per event. */
export function describe(e) {
  const where = e.screen ? ` @${e.screen}` : "";
  switch (e.event) {
    case "click":
      return `click "${cut(e.what, 60)}"${e.disabled ? " (disabled)" : ""}${e.where ? ` in ${cut(e.where, 60)}` : ""}${where}`;
    case "screen":
      return `screen ${e.from} -> ${e.to}`;
    case "choice_changed":
      return `choice "${e.field}" = ${e.value ?? ""}${e.checked !== undefined ? ` (${e.checked ? "on" : "off"})` : ""}${where}`;
    case "field_changed":
      return `typed in "${e.field}"${e.key ? " (key field)" : ` (${e.length} chars)`}${where}`;
    case "run_start":
      return `run ${e.command}${e.job?.identityName ? ` [${e.job.identityName}]` : ""}${e.job?.project ? ` ${path.basename(e.job.project)}` : ""}`;
    case "run_progress":
      return `  ${e.command}: ${e.progress?.step ?? "?"}${e.progress?.message ? ` ${cut(e.progress.message, 100)}` : ""}${e.progress?.status ? ` (HTTP ${e.progress.status})` : ""}${e.progress?.to ? ` -> ${typeof e.progress.to === "string" ? e.progress.to : "the next model"}` : ""}${e.progress?.waitSeconds ? `, next try in ${e.progress.waitSeconds} s` : ""}${e.progress?.seconds && e.progress?.step === "slept" ? ` ${e.progress.seconds} s` : ""}${e.progress?.percent !== undefined ? ` ${Math.round(e.progress.percent)}%` : ""}`;
    case "run_end":
      return `done ${e.command} in ${(e.ms / 1000).toFixed(1)} s`;
    case "run_failed":
      return `FAILED ${e.command} after ${(e.ms / 1000).toFixed(1)} s${e.stopped ? " (stopped)" : ""}: ${cut(e.message, 200)}${e.stderr ? `
               stderr: ${cut(e.stderr, 400)}` : ""}`;
    case "error_shown":
      return `ERROR on screen [${e.code}]: ${cut(e.message, 200)}${where}`;
    case "call":
      return e.ok ? null : `call ${e.cmd}${e.command ? ` ${e.command}` : ""} failed: ${cut(e.error, 160)}`;
    default: {
      const rest = Object.fromEntries(Object.entries(e).filter(([k]) => !["ts", "session", "seq", "src", "level", "event", "screen", "identity"].includes(k)));
      const s = JSON.stringify(rest);
      return `${e.event}${s !== "{}" ? " " + cut(s, 180) : ""}${where}`;
    }
  }
}

export function summarize(events, { sessions = 1, tail = 30 } = {}) {
  const order = [...new Set(events.map((e) => e.session).filter(Boolean))];
  const pick = new Set(order.slice(-sessions));
  const lines = [];
  for (const sid of order.filter((s) => pick.has(s))) {
    const ev = events.filter((e) => e.session === sid);
    const start = ev.find((e) => e.event === "app_start");
    const ready = ev.find((e) => e.event === "app_ready");
    const errors = ev.filter((e) => e.level === "error");
    const warns = ev.filter((e) => e.level === "warn");
    lines.push(`Session ${sid}`);
    lines.push(`  started ${ev[0]?.ts ?? "?"}${start ? `, v${start.version} ${start.os}/${start.arch}, ${start.tier}` : ""}${ready ? `, ${ready.identities} Identities, active ${ready.active ?? "none"}` : ""}`);
    lines.push(`  ${ev.length} events, ${errors.length} errors, ${warns.length} warnings, last ${ev.at(-1)?.ts ?? "?"}`);

    const group = (list) => {
      const g = new Map();
      for (const e of list) {
        const msg = e.message ?? e.error ?? e.progress?.message ?? e.event;
        const code = e.code ?? (typeof msg === "string" ? errorCode(msg) : "ITV-ERR");
        const key = `${code} ${e.event} ${cut(msg, 120)}`;
        const x = g.get(key) ?? { code, event: e.event, msg, n: 0, first: e.ts, last: e.ts, screen: e.screen };
        x.n++;
        x.last = e.ts;
        g.set(key, x);
      }
      return [...g.values()];
    };
    if (errors.length) {
      lines.push("  Errors:");
      for (const x of group(errors)) lines.push(`    ${x.code} x${x.n} (${clock(x.first)}${x.n > 1 ? `-${clock(x.last)}` : ""}) ${x.event}: ${cut(x.msg, 200)}${x.screen ? ` @${x.screen}` : ""}`);
    }
    if (warns.length) {
      lines.push("  Warnings:");
      for (const x of group(warns)) lines.push(`    x${x.n} (${clock(x.first)}${x.n > 1 ? `-${clock(x.last)}` : ""}) ${x.event}: ${cut(x.msg, 160)}`);
    }
    const runs = ev.filter((e) => e.event === "run_end" || e.event === "run_failed");
    const slow = runs.filter((e) => e.ms > 30000).sort((a, b) => b.ms - a.ms).slice(0, 8);
    if (slow.length) {
      lines.push("  Slow steps:");
      for (const e of slow) lines.push(`    ${e.command} ${(e.ms / 1000).toFixed(0)} s${e.event === "run_failed" ? " (failed)" : ""} at ${clock(e.ts)}`);
    }
    const shown = ev.map((e) => [e, describe(e)]).filter(([, d]) => d);
    lines.push(`  Last ${Math.min(tail, shown.length)} events:`);
    for (const [e, d] of shown.slice(-tail)) lines.push(`    ${clock(e.ts)} ${e.level === "error" ? "E" : e.level === "warn" ? "W" : " "} ${d}`);
    lines.push("");
  }
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: a } = parseArgs({ options: { dir: { type: "string" }, since: { type: "string" }, sessions: { type: "string" }, tail: { type: "string" } } });
  const dir = a.dir ?? defaultDir();
  const events = readEvents(dir, a.since ?? null);
  if (!events.length) {
    console.log(`No log yet in ${dir}`);
    process.exit(0);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
  console.log(`Log: ${dir} (${files.length} files, ${(bytes / 1024).toFixed(0)} KB)\n`);
  console.log(summarize(events, { sessions: a.since ? 1000 : Number(a.sessions ?? 1), tail: Number(a.tail ?? 30) }));
}
