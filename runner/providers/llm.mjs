// llm.mjs: the LLM integration (SPEC 5). Every provider but Claude speaks the
// OpenAI chat completions API; a provider is only a base URL, a key and a
// model name. Claude has its own connector (claude.mjs, DECISIONS 89), because
// its effort setting exists only on its own API.
//
// effort (DECISIONS 89): low, medium, high (Claude also xhigh, max), per
// step. Gemini and OpenAI take it as reasoning_effort, OpenRouter as
// reasoning.effort; DeepSeek and Grok get none. Above "high" counts as high
// where the provider stops there.
//
// The key comes in as an argument (the runner reads it from the env the Rust
// core sets from the OS keychain). It is never logged, never written to disk and
// never part of an error message: every message goes through redact().

import { claudeChat } from "./claude.mjs";

export const PROVIDERS = {
  // overloaded (5xx) after the retries: the same request once more on the
  // other Gemini model, before the user sees an error (Zoltan, 2026-10-01)
  gemini: { label: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", model: "gemini-3.5-flash", jsonMode: true, fallbackModels: ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-3.1-flash-lite"] },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1/", model: "openrouter/auto", jsonMode: true },
  claude: { label: "Claude", baseUrl: "https://api.anthropic.com/v1/", model: "claude-sonnet-5-5", jsonMode: false, native: true },
  openai: { label: "ChatGPT (OpenAI API)", baseUrl: "https://api.openai.com/v1/", model: null, jsonMode: true },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/", model: "deepseek-chat", jsonMode: true },
  grok: { label: "Grok (xAI)", baseUrl: "https://api.x.ai/v1/", model: null, jsonMode: true },
};

export class LlmError extends Error {
  constructor(message, { status, retryable = false } = {}) {
    super(message);
    this.name = "LlmError";
    this.status = status;
    this.retryable = retryable;
  }
}

export function redact(text, apiKey) {
  let s = String(text ?? "");
  if (apiKey && apiKey.length >= 8) s = s.split(apiKey).join("[key]");
  return s.replace(/\b(sk|AIza|xai|or)-?[A-Za-z0-9_\-]{16,}\b/g, "[key]");
}

function endpoint(baseUrl) {
  return new URL("chat/completions", baseUrl.endsWith("/") ? baseUrl : baseUrl + "/").toString();
}

// The provider's own words from an error body, not the raw JSON around them:
// {"error":{"message":...}} (OpenAI style, Anthropic), [{"error":{...}}]
// (Gemini), {"message":...}; the Anthropic SDK puts the status in front
// ("400 {...}"). Anything else as it came.
export function bodyMessage(body) {
  const text = String(body ?? "").replace(/^\d{3}\s+(?=[[{])/, "");
  try {
    const j = JSON.parse(text);
    const e = Array.isArray(j) ? j[0]?.error : j?.error;
    const m = (typeof e === "string" ? e : e?.message) ?? j?.message;
    if (typeof m === "string" && m.trim()) return m.trim();
  } catch {
    // not JSON
  }
  return text;
}

// The message the user sees, per HTTP status. No response body text for auth
// errors, the provider sometimes echoes part of the key back.
export function friendlyError(label, status, body) {
  if (status === 401 || status === 403) return `${label} rejected the API key. Check it in Settings.`;
  if (status === 429) return `${label} quota ran out or the rate limit was hit. Wait a little, or switch provider in Settings.`;
  if (status === 404) return `${label} does not know this model. Check the model name in Settings.`;
  if (status === 400 || status === 402) {
    const said = bodyMessage(body);
    // Anthropic: 400 "Your credit balance is too low" (Zoltan's test, 2026-10-06);
    // others answer 402 or say "billing", "insufficient", "quota".
    if (status === 402 || /credit balance|billing|insufficient|payment|top.?up/i.test(said)) return `${label} says the account has no credit left. Add credit on the ${label} website, or choose another AI in Settings.`;
    return `${label} refused the request: ${said.slice(0, 300)}`;
  }
  if (status >= 500) return `${label} is overloaded or having problems right now (HTTP ${status}). The app kept trying for about three minutes, on every model it has for ${label}. Wait a few minutes and press the button again; nothing is lost.`;
  return `${label} answered with HTTP ${status}.`;
}

// Retries and model switches are reported to whoever listens (main.mjs turns
// them into progress lines, so the app's log shows them; docs/backup.md B).
let listener = null;
export function onLlmEvent(fn) {
  listener = fn;
}
const report = (e) => {
  try {
    listener?.(e);
  } catch {
    // a listener must never break a call
  }
};

// When a service is overloaded, it usually is for a minute or two (Zoltan's
// tests, 2026-10-05: Gemini 503 and 429 on every model at once). After every
// model of the provider failed, the app waits and goes round again, these
// many seconds, about three minutes in all, and says so on the bar. Only
// then the user sees an error.
export const ROUND_WAITS = [15, 30, 45, 60];

// Overloaded (5xx), out of quota or rate-limited (429), or not reachable.
const transient = (err) => err instanceof LlmError && (err.status >= 500 || err.status === 429 || (err.status === undefined && err.retryable));
const why = (err) => (err.status ? `HTTP ${err.status}` : "no connection");

// One chat completion. Each model gets 3 quick tries (chatOnce); a busy or
// out-of-quota model hands over to the provider's other models (Gemini
// counts the free quota per model, DECISIONS 72, K5); when all of them
// failed, a wait (ROUND_WAITS) and another round. `patient: false` (a key
// test) and `noFallback` answer at once.
export async function chat(opts) {
  const p = PROVIDERS[opts.provider];
  const first = opts.model || p?.model;
  const models = [first, ...(opts.noFallback ? [] : (p?.fallbackModels ?? []).filter((m) => m !== first))];
  const waits = opts.patient === false || opts.noFallback ? [] : ROUND_WAITS;
  const sleep = opts.sleep ?? defaultSleep;
  let last;
  for (let round = 0; ; round++) {
    for (let i = 0; i < models.length; i++) {
      if (i > 0) {
        report({ step: "fallback", provider: opts.provider, from: models[i - 1], to: models[i], status: last?.status });
        opts.onFallback?.(models[i]);
      }
      try {
        return await chatOnce({ ...opts, model: models[i] });
      } catch (e) {
        // only a busy model hands over; a rejected key or request does not
        if (!transient(e) || (i === 0 && round === 0 && opts.noFallback)) throw e;
        last = e;
      }
    }
    if (round >= waits.length) throw last;
    const label = p?.label ?? opts.provider;
    report({ step: "retry", provider: opts.provider, status: last.status ?? "network", round: round + 1, of: waits.length, waitSeconds: waits[round], message: `${label} is busy (${why(last)}). Trying again in ${waits[round]} s, round ${round + 1} of ${waits.length}.` });
    await sleep(waits[round] * 1000);
  }
}

// The effort field each OpenAI-compatible provider understands.
const EFFORT_FIELD = { gemini: "reasoning_effort", openai: "reasoning_effort", openrouter: "reasoning" };
export function effortFields(provider, effort) {
  const field = EFFORT_FIELD[provider];
  if (!field || !effort) return {};
  const e = effort === "xhigh" || effort === "max" ? "high" : effort;
  if (!["low", "medium", "high"].includes(e)) return {};
  return field === "reasoning" ? { reasoning: { effort: e } } : { [field]: e };
}

async function chatOnce({ provider, apiKey, model, effort = null, messages, json = false, maxTokens, allowEmpty = false, temperature = 0.7, fetchImpl = fetch, sleep = defaultSleep, timeoutMs = 120000, claudeClient = null }) {
  const p = PROVIDERS[provider];
  if (!p) throw new LlmError(`Unknown provider: ${provider}`);
  if (!apiKey) throw new LlmError(`No API key set for ${p.label}. Add it in Settings.`);
  const useModel = model || p.model;
  if (!useModel) throw new LlmError(`Pick a model for ${p.label} in Settings.`);

  if (p.native) {
    // the SDK retries 429, 5xx and network errors itself (twice)
    const text = await claudeChat({
      apiKey,
      model: useModel,
      messages,
      maxTokens,
      effort,
      temperature,
      client: claudeClient,
      errors: (e) => {
        if (e?.refusal) return new LlmError(e.message, { status: 200 });
        const status = typeof e?.status === "number" ? e.status : undefined;
        if (status) return new LlmError(friendlyError(p.label, status, redact(e.message, apiKey)), { status, retryable: status === 429 || status >= 500 });
        return new LlmError(`Could not reach ${p.label}: ${redact(e?.message, apiKey)}`, { retryable: true });
      },
    });
    if (!allowEmpty && (typeof text !== "string" || text.trim() === "")) throw new LlmError(`${p.label} returned an empty answer.`);
    return text;
  }

  const body = { model: useModel, messages, temperature, ...effortFields(provider, effort) };
  if (maxTokens) body.max_tokens = maxTokens;
  if (json && p.jsonMode) body.response_format = { type: "json_object" };

  const attempts = 3;
  let lastError;
  for (let i = 0; i < attempts; i++) {
    let res;
    try {
      res = await fetchImpl(endpoint(p.baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      lastError = new LlmError(`Could not reach ${p.label}: ${redact(e.message, apiKey)}`, { retryable: true });
      report({ step: "retry", provider, model: useModel, attempt: i + 1, of: attempts, status: "network" });
      if (i < attempts - 1) await sleep(backoffMs(i));
      continue;
    }
    if (res.ok) {
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!allowEmpty && (typeof text !== "string" || text.trim() === "")) throw new LlmError(`${p.label} returned an empty answer.`);
      return text;
    }
    const text = redact(await res.text().catch(() => ""), apiKey);
    const retryable = res.status === 429 || res.status >= 500;
    lastError = new LlmError(friendlyError(p.label, res.status, text), { status: res.status, retryable });
    report({ step: "retry", provider, model: useModel, attempt: i + 1, of: attempts, status: res.status });
    if (!retryable) throw lastError;
    if (i < attempts - 1) await sleep(retryAfterMs(res) ?? backoffMs(i));
  }
  throw lastError;
}

// A tiny request that proves the key and the model work ("Test key").
export async function testKey(opts) {
  // No tight max_tokens: reasoning models (Gemini 3.x) spend a small budget on
  // thinking and return empty content. A 200 already proves key and model.
  await chat({ ...opts, messages: [{ role: "user", content: "Reply with the single word OK." }], allowEmpty: true, temperature: 0, patient: false });
  return { ok: true, message: `${PROVIDERS[opts.provider].label} key works.` };
}

// Models sometimes wrap JSON in a ```json fence or add a sentence around it.
export function extractJson(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in the answer");
  return JSON.parse(candidate.slice(start, end + 1));
}

const backoffMs = (i) => 1000 * 2 ** i;
function retryAfterMs(res) {
  const v = Number(res.headers?.get?.("retry-after"));
  return Number.isFinite(v) && v > 0 ? Math.min(v, 30) * 1000 : undefined;
}
function defaultSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
