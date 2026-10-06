// retry.mjs: patience with a busy service (Zoltan, 2026-10-06: the run must
// be reliable). A voice is read sentence by sentence or block by block: one
// overloaded answer (5xx), one rate limit (429) or one dropped connection
// used to fail the whole narration. Now such a call waits and tries again,
// about three minutes in all, and the bar says so. A refused key, a refused
// request or an unknown voice is not tried again: waiting does not fix it.

/** An error worth waiting for: the service may answer a little later. */
export class BusyError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = "BusyError";
    this.status = status;
    this.transient = true;
  }
}

/** Seconds between tries (about three minutes in all). */
export const WAITS = [3, 8, 15, 25, 35, 45, 60];

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs fn until it answers, or a non-transient error, or the waits run out.
 * onRetry({ attempt, of, waitSeconds, status, message }) before each wait.
 */
export async function patiently(fn, { label = "The service", onRetry = () => {}, sleep = defaultSleep, waits = WAITS } = {}) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!e?.transient || i >= waits.length) throw e;
      const why = e.status ? `HTTP ${e.status}` : "no connection";
      try {
        onRetry({ attempt: i + 1, of: waits.length, waitSeconds: waits[i], status: e.status ?? "network", message: `${label} is busy (${why}). Trying again in ${waits[i]} s (${i + 1} of ${waits.length}).` });
      } catch {
        // a listener never breaks the call
      }
      await sleep(waits[i] * 1000);
    }
  }
}

/** Is this HTTP status worth a wait? */
export const busyStatus = (status) => status === 429 || status === 408 || status >= 500;
