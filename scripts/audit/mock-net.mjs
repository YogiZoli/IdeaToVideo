// mock-net.mjs: loaded into the runner with --import by scripts/audit/run.mjs. Replaces the
// whole network: no call of a test run ever leaves this computer, so nothing is paid.
//   ITV_AUDIT_NET      JSON { "<service>": mode, "*": mode }, default everything "down"
//   ITV_AUDIT_NETLOG   a file that gets one line per call (the address without its query)
//   ITV_AUDIT_FREE     pretend the disk has this many free bytes
// Modes: ok, garbage, empty, down, timeout, or an HTTP status such as 401, 429, 500.
// Long waits of the retry rules go by at once, so a test takes seconds, not minutes.

import fs from "node:fs";

const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...rest) => realTimeout(fn, ms >= 1000 ? 5 : ms, ...rest);

if (process.env.ITV_AUDIT_FREE) {
  const free = Number(process.env.ITV_AUDIT_FREE);
  fs.statfsSync = () => ({ bsize: 1, bavail: free, bfree: free, blocks: free });
}

const SERVICES = [
  [/generativelanguage\.googleapis/, "gemini"],
  [/api\.anthropic/, "claude"],
  [/openrouter\.ai/, "openrouter"],
  [/api\.openai/, "openai"],
  [/api\.deepseek/, "deepseek"],
  [/api\.x\.ai/, "grok"],
  [/api\.elevenlabs/, "elevenlabs"],
  [/heygen/, "heygen"],
  [/kie\.ai/, "kie"],
  [/pixabay/, "pixabay"],
  [/unsplash/, "unsplash"],
  [/vidiq/, "vidiq"],
  [/pdt\.test/, "publishing"],
  [/gstatic/, "internet"],
];

const modes = JSON.parse(process.env.ITV_AUDIT_NET || "{}");
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function answer(service, mode, url) {
  if (mode === "garbage") return new Response("<html>not what you asked for</html>", { status: 200 });
  if (mode === "empty") return json(200, {});
  if (mode !== "ok") {
    const status = Number(mode);
    return json(status, { error: { message: `mock ${status} from ${service}` }, message: `mock ${status} from ${service}` }, status === 429 ? { "retry-after": "1" } : {});
  }
  if (service === "publishing") return json(201, { cardId: "mock", id: "mock", url: "https://pdt.test/cards/mock" });
  if (service === "internet") return new Response(null, { status: 204 });
  if (service === "claude") return json(200, { id: "m", type: "message", role: "assistant", model: "x", stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: "text", text: '{"value":"A plain answer.","text":"A plain answer."}' }] });
  if (/models$/.test(url)) return json(200, { data: [{ id: "gpt-mock", created: 2 }, { id: "grok-mock", created: 1 }] });
  return json(200, { choices: [{ message: { content: '{"value":"A plain answer.","text":"A plain answer."}' } }] });
}

globalThis.fetch = async (input, init = {}) => {
  const url = String(input?.url ?? input);
  if (init.signal?.aborted) throw init.signal.reason ?? new DOMException("aborted", "AbortError");
  const service = SERVICES.find(([re]) => re.test(url))?.[1] ?? "other";
  const mode = String(modes[service] ?? modes["*"] ?? "down");
  if (process.env.ITV_AUDIT_NETLOG) fs.appendFileSync(process.env.ITV_AUDIT_NETLOG, `${init.method ?? "GET"} ${service} ${mode} ${url.split("?")[0]}\n`);
  if (mode === "down") throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
  if (mode === "timeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  return answer(service, mode, url);
};
