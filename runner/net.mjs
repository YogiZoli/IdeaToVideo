// net.mjs: the patience of a free read from the network (docs/AUDIT_REPORT.md). A GET or
// HEAD that meets a dropped connection, a timeout, a rate limit or a busy server is
// tried again a few times, with a growing wait. A POST is never repeated here: it
// can create something that costs money, and paid calls have their own rules.
// `signal` stays with the caller, because each try needs a fresh one: pass it as a
// function, or the options are used as they are for every try.

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const TRIES = 3;
const isBusy = (status) => status === 408 || status === 429 || status >= 500;

function waitFor(res, i) {
  const asked = Number(res?.headers?.get?.("retry-after"));
  return Number.isFinite(asked) && asked > 0 ? Math.min(asked, 30) * 1000 : 1000 * 3 ** i;
}

/** A fetch that tries a free read again. What it finally returns or throws is the last try's. */
export function retrying(fetchImpl = fetch, { tries = TRIES, sleep = defaultSleep } = {}) {
  return async (url, options = {}) => {
    const method = String(options.method ?? "GET").toUpperCase();
    const again = method === "GET" || method === "HEAD";
    for (let i = 0; ; i++) {
      const last = !again || i >= tries - 1;
      try {
        const signal = typeof options.timeout === "number" ? AbortSignal.timeout(options.timeout) : options.signal;
        const { timeout: _timeout, ...rest } = options;
        const res = await fetchImpl(url, { ...rest, ...(signal ? { signal } : {}) });
        if (last || !isBusy(res.status)) return res;
        await sleep(waitFor(res, i));
      } catch (e) {
        if (last) throw e;
        await sleep(waitFor(null, i));
      }
    }
  };
}

/** The answer as JSON. A proxy or a captive portal can answer 200 with a web page: that is a sentence. */
export async function readJson(res, label) {
  try {
    return await res.json();
  } catch {
    throw new Error(`${label} answered with something the app could not read. Try again later, or check your connection.`);
  }
}

/**
 * A timeout for a big download: it does not limit the whole download, only how long
 * nothing arrives. touch() on every piece, done() at the end.
 */
export function stallGuard(ms = 60000) {
  const c = new AbortController();
  let timer = null;
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => c.abort(new DOMException(`Nothing arrived for ${Math.round(ms / 1000)} s.`, "TimeoutError")), ms);
    timer.unref?.();
  };
  touch();
  return { signal: c.signal, touch, done: () => clearTimeout(timer) };
}
