// llm.mjs: the one LLM integration (SPEC 5). Every provider speaks the OpenAI
// chat completions API; a provider is only a base URL, a key and a model name.
//
// The key comes in as an argument (the runner reads it from the env the Rust
// core sets from the OS keychain). It is never logged, never written to disk and
// never part of an error message: every message goes through redact().

export const PROVIDERS = {
  gemini: { label: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", model: "gemini-3.8-flash", jsonMode: true },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1/", model: "openrouter/auto", jsonMode: true },
  claude: { label: "Claude", baseUrl: "https://api.anthropic.com/v1/", model: "claude-sonnet-5", jsonMode: false },
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

// The message the user sees, per HTTP status. No response body text for auth
// errors, the provider sometimes echoes part of the key back.
export function friendlyError(label, status, body) {
  if (status === 401 || status === 403) return `${label} rejected the API key. Check it in Settings.`;
  if (status === 429) return `${label} quota ran out or the rate limit was hit. Wait a little, or switch provider in Settings.`;
  if (status === 404) return `${label} does not know this model. Check the model name in Settings.`;
  if (status === 400) return `${label} refused the request: ${String(body).slice(0, 300)}`;
  if (status >= 500) return `${label} is having problems right now (HTTP ${status}). Try again later.`;
  return `${label} answered with HTTP ${status}.`;
}

// One chat completion. Retries 429 and 5xx (and network errors) with
// exponential backoff, 3 attempts in total (SPEC 5). Returns the text content.
export async function chat({ provider, apiKey, model, messages, json = false, maxTokens, allowEmpty = false, temperature = 0.7, fetchImpl = fetch, sleep = defaultSleep, timeoutMs = 120000 }) {
  const p = PROVIDERS[provider];
  if (!p) throw new LlmError(`Unknown provider: ${provider}`);
  if (!apiKey) throw new LlmError(`No API key set for ${p.label}. Add it in Settings.`);
  const useModel = model || p.model;
  if (!useModel) throw new LlmError(`Pick a model for ${p.label} in Settings.`);

  const body = { model: useModel, messages, temperature };
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
    if (!retryable) throw lastError;
    if (i < attempts - 1) await sleep(retryAfterMs(res) ?? backoffMs(i));
  }
  throw lastError;
}

// A tiny request that proves the key and the model work ("Test key").
export async function testKey(opts) {
  // No tight max_tokens: reasoning models (Gemini 3.x) spend a small budget on
  // thinking and return empty content. A 200 already proves key and model.
  await chat({ ...opts, messages: [{ role: "user", content: "Reply with the single word OK." }], allowEmpty: true, temperature: 0 });
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
