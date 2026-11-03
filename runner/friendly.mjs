// friendly.mjs: what an error means, in words the user can act on (docs/AUDIT_REPORT.md).
// The user reads one plain sentence, never a stack trace, a code or "fetch failed". The
// raw error goes into the log file (errorlog.mjs) and behind the Copy details button.
// A sentence the app already wrote stays as it is.

const NETWORK = /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|UND_ERR|socket hang up|network error|getaddrinfo|certificate/i;
const TIMEOUT = /TimeoutError|aborted due to timeout|timed out|Nothing arrived for/i;
const FULL = /ENOSPC|no space left|not enough space|disk full|disk quota/i;
const LOCKED = /EACCES|EPERM|EBUSY|permission denied|access is denied|being used by another process/i;
const MISSING = /ENOENT|no such file/i;
const LONG_PATH = /ENAMETOOLONG/i;
const MEMORY = /ENOMEM|out of memory|allocation failed|heap limit/i;
const DAMAGED = /project\.json is not valid|refusing to save an invalid project\.json/i;
// what only a program should read: a stack, a JavaScript error, a system code
const RAW = /^(Type|Reference|Range|Syntax|Assertion|Eval|URI)?Error\b|\n\s+at\s|\bat .+:\d+:\d+|Cannot read propert|Cannot set propert|is not a function|is not defined|is not iterable|is not a constructor|Unexpected token|Unexpected end of|JSON at position|undefined \(reading|null \(reading|\bERR_[A-Z_]+\b|\bE[A-Z]{3,}\b:|\[object Object\]|^undefined$|^null$/;
const AGAIN = "Press the button again; if it happens again, use Copy details and send them.";
const MAX = 500;

export function friendlyMessage(error) {
  const raw = typeof error === "string" ? error : `${error?.name && error.name !== "Error" ? `${error.name}: ` : ""}${error?.message ?? error ?? ""}`;
  // what follows "Details:" is the engine's own output, for the log file
  const m = raw.replace(/^\s*(Uncaught\s+)?Error:\s*/, "").replace(/\s*Details:[\s\S]*$/, "").replace(/: fetch failed\./, ": no connection.").trim();
  // a sentence that already says what to do about the connection
  const said = /internet connection/i.test(m) && !RAW.test(m);
  if (!m) return `This step stopped without saying why. ${AGAIN}`;
  if (FULL.test(m)) return "The disk is full, so this step could not finish. Free up some space and press the button again; nothing is lost.";
  if (MEMORY.test(m)) return "This computer ran out of memory in this step. Close other programs and press the button again; nothing is lost.";
  if (LONG_PATH.test(m)) return "A file path is too long for this computer. Choose a shorter projects folder in Settings and press the button again.";
  if (/spawn.*(UNKNOWN|ENOENT|EACCES|EPERM|EINVAL)|spawn UNKNOWN/.test(m)) return "A program the app needs would not start. Check that your antivirus has not blocked it, or reinstall the app; the Health check in Settings shows which one.";
  if (DAMAGED.test(m)) return "This video's project file is damaged, so it cannot be opened. Restore it from a backup in Settings, or start the video again.";
  if (said) return m;
  if (TIMEOUT.test(m)) {
    const who = /Could not (?:reach|download) ([^:(]+)/.exec(m)?.[1]?.trim();
    return `${who ? `${who} did` : "The service did"} not answer in time. Check the internet connection and press the button again; nothing is lost.`;
  }
  if (NETWORK.test(m)) {
    const who = /Could not reach ([^:]+):/.exec(m)?.[1];
    return `${who ? `Could not reach ${who}. ` : ""}The internet connection may be down, or the service cannot be reached right now. Check the connection and press the button again; nothing is lost.`;
  }
  if (LOCKED.test(m)) return "A file this step needs is locked or not allowed. Close other programs that may hold it (a video player, a sync tool) and press the button again.";
  if (MISSING.test(m) && RAW.test(m)) return `A file this step needs is missing. Press the button again; if it happens again, start the step from its tab.`;
  if (/^The render failed/i.test(m)) return `The render stopped before it finished. ${AGAIN}`;
  if (/^ffmpeg failed/i.test(m)) return `The sound or video work on this computer stopped. Check that the file plays in a video player, then press the button again.`;
  if (RAW.test(m)) {
    // a sentence of ours with a program's words in the middle: ours stay, those go
    const head = /^([A-Z][^:\n]{10,160}):\s/.exec(m)?.[1];
    const tail = /[.!?]\s+([A-Z][^.!?\n]{5,120}[.!?])\s*$/.exec(m)?.[1];
    if (head && !RAW.test(head)) return `${head}.${tail && !RAW.test(tail) ? ` ${tail}` : ` ${AGAIN}`}`;
    return `Something went wrong inside the app in this step. ${AGAIN}`;
  }
  return m.length > MAX ? `${m.slice(0, MAX).replace(/\s+\S*$/, "")}...` : m;
}
