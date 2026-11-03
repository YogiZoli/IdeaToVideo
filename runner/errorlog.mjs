// errorlog.mjs: the full details of every error, in one log file (docs/AUDIT_REPORT.md). The
// user reads one sentence (friendly.mjs); here is what a person fixing it needs: the
// command, the raw message and the stack. Copy details reads the last entry back. Keys
// never get in: every value goes through redact(), and the request is not written.

import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./tools.mjs";
import { redact } from "./providers/llm.mjs";

const LIMIT = 2 * 1024 * 1024;
export const errorLogFile = (env = process.env) => path.join(dataDir(env), "logs", "errors.log");

export function logError({ command, message, error, secrets = [], env = process.env, now = new Date() }) {
  const clean = (t) => secrets.reduce((s, k) => redact(s, k), redact(t));
  const entry = { at: now.toISOString(), command, message: clean(message), raw: clean(error?.message ?? error ?? ""), stack: clean(error?.stack ?? ""), platform: process.platform, node: process.version };
  try {
    const file = errorLogFile(env);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > LIMIT) fs.renameSync(file, file.replace(/.log$/, ".old.log"));
    fs.appendFileSync(file, JSON.stringify(entry) + "\n");
  } catch {
    // a full or locked disk must not hide the error itself
  }
  return entry;
}

/** The newest entry, for Copy details. */
export function lastError(env = process.env) {
  const file = errorLogFile(env);
  try {
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    return { file, entry: JSON.parse(lines.at(-1)) };
  } catch {
    return { file, entry: null };
  }
}
