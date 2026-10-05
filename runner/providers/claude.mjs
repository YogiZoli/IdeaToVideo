// claude.mjs: the native Claude connector (Zoltan, 2026-10-05, DECISIONS 89).
// Every other provider speaks the OpenAI chat completions API (llm.mjs);
// Claude's effort setting exists only on its own Messages API, so Claude goes
// through the official Anthropic SDK. The same contract as llm.mjs chatOnce:
// messages in, the answer's text out, LlmError with a friendly message.
//
//   effort      low, medium, high, xhigh, max (output_config.effort); Haiku
//               4.5 has none. Claude Opus 5.5's default is medium, so the
//               app always sends the one the user picked.
//   thinking    left out: the current models think adaptively by default
//               (Opus 5.5 and Sonnet 5.5 reject turning it off).
//   sampling    left out: the current models reject a custom temperature.
//   refusals    a declined request (stop_reason "refusal") is retried on the
//               model Anthropic recommends, server-side (fallbacks "default",
//               beta server-side-fallback-2026-07-01), on the models that
//               take it; a refusal that stays is an error the user can read.
// The key is passed in, never logged; errors go through redact().

import Anthropic from "@anthropic-ai/sdk";

// The models the app offers for Claude, and which take an effort.
export const CLAUDE_MODELS = {
  "claude-fable-5-1": { label: "Claude Fable 5.1", efforts: ["low", "medium", "high", "xhigh", "max"], fallback: true },
  "claude-opus-5-5": { label: "Claude Opus 5.5", efforts: ["low", "medium", "high", "xhigh", "max"], fallback: true },
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5", efforts: ["low", "medium", "high", "xhigh", "max"], fallback: true },
  "claude-haiku-4-5": { label: "Claude Haiku 4.5", efforts: [], fallback: false },
};
const OLD_SAMPLING = new Set(["claude-haiku-4-5"]);

// A message part in the OpenAI shape (the shared callers write that) in
// Claude's shape: text stays, a data-URL image becomes a base64 image block.
function part(p) {
  if (typeof p === "string" || p?.type !== "image_url") return p;
  const m = /^data:([^;]+);base64,(.*)$/s.exec(p.image_url?.url ?? "");
  return m ? { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } } : { type: "text", text: "[image]" };
}

/** The request body for one call. Exported for the tests. */
export function claudeRequest({ model, messages, maxTokens, effort, temperature }) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const turns = messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: Array.isArray(m.content) ? m.content.map(part) : m.content }));
  const known = CLAUDE_MODELS[model];
  // thinking counts against max_tokens and cannot be turned off on the
  // current models: a short answer still gets room to think
  const body = { model, max_tokens: Math.max(maxTokens || 32000, 8000), messages: turns };
  if (system) body.system = system;
  // an effort the model does not take is left out, never sent
  const efforts = known ? known.efforts : ["low", "medium", "high", "xhigh", "max"];
  if (effort && efforts.includes(effort)) body.output_config = { effort };
  if (OLD_SAMPLING.has(model) && typeof temperature === "number") body.temperature = temperature;
  if (known?.fallback) {
    body.betas = ["server-side-fallback-2026-07-01"];
    body.fallbacks = "default";
  }
  return body;
}

/** The answer's text, or an error the user can read. Exported for the tests. */
export function claudeText(message) {
  if (message?.stop_reason === "refusal") {
    const why = message.stop_details?.category ? ` (${message.stop_details.category})` : "";
    return { error: `Claude declined this request${why}. Try again with other words, or pick another model for this step in Settings.` };
  }
  const text = (message?.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return { text };
}

/**
 * One Claude call through the SDK. `errors` turns an SDK error into the
 * app's LlmError (llm.mjs passes its own, so messages stay the same for
 * every provider). `client` lets the tests pass a stand-in.
 */
export async function claudeChat({ apiKey, model, messages, maxTokens, effort, temperature, timeoutMs = 600000, client = null, errors }) {
  const sdk = client ?? new Anthropic({ apiKey, maxRetries: 2, timeout: timeoutMs });
  const body = claudeRequest({ model, messages, maxTokens, effort, temperature });
  let message;
  try {
    // streamed: long answers with thinking can take minutes
    message = await sdk.beta.messages.stream(body).finalMessage();
  } catch (e) {
    throw errors(e);
  }
  const r = claudeText(message);
  if (r.error) throw errors(Object.assign(new Error(r.error), { refusal: true }));
  return r.text;
}

export { Anthropic };
