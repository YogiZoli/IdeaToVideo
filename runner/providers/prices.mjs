// prices.mjs: what an AI call costs, shown before it runs (DECISIONS 130:
// "show the cost of each paid AI call before it runs, as everywhere in the
// app"). USD per million tokens, input and output, as the providers list them.
//   Claude: Anthropic's price list (2026-10).
//   Gemini: third-party price pages (2026-10-28); Google's own page was not
//   reachable, so the app says "about" and marks them as a guess.
// A model not listed is priced like its provider's default model, marked
// as a guess. Thinking counts as output, so the estimate adds room for it.

export const PRICES = {
  "claude-fable-5-1": { in: 10, out: 50 },
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
  "gemini-3.5-flash": { in: 1.5, out: 9, guess: true },
  "gemini-3.8-flash": { in: 0.75, out: 3.75, guess: true },
  "gemini-3.1-flash-lite": { in: 0.25, out: 1.5, guess: true },
};
const PROVIDER_DEFAULT = { claude: "claude-sonnet-5-5", gemini: "gemini-3.5-flash" };
// Providers without a list here (OpenRouter, OpenAI, DeepSeek, Grok): a mid
// price, a guess, so the user still sees an order of size.
const UNKNOWN = { in: 2, out: 10, guess: true };

export function priceOf(provider, model) {
  if (PRICES[model]) return { model, ...PRICES[model] };
  const base = PRICES[PROVIDER_DEFAULT[provider]];
  return base ? { model, ...base, guess: true } : { model, ...UNKNOWN };
}

// Tokens of a text: about 4 characters each (English and code); an image
// sent at 768 px wide is about 500 tokens on the providers the app uses.
export const tokensOf = (chars) => Math.ceil(chars / 4);
export const IMAGE_TOKENS = 500;
// Reasoning models think before they answer; effort sets how much.
const THINKING = { low: 1.5, medium: 2.5, high: 4, xhigh: 5, max: 6 };

// { usd, low, high, tokensIn, tokensOut, guess } for calls of tokensIn in
// and tokensOut of visible answer. low and high span the usual spread.
export function estimateUsd({ provider, model, effort, tokensIn, tokensOut }) {
  const p = priceOf(provider, model);
  const out = Math.round(tokensOut * (THINKING[effort] ?? 2));
  const usd = (tokensIn * p.in + out * p.out) / 1e6;
  const r2 = (x) => Math.round(x * 100) / 100;
  return { usd: r2(usd), low: r2(usd * 0.6), high: r2(usd * 1.6), tokensIn, tokensOut: out, guess: Boolean(p.guess), model: p.model };
}

// "about $0.42 (between $0.25 and $0.67)", or "less than $0.01".
export function usdText(e) {
  if (e.high < 0.01) return "less than $0.01";
  const f = (x) => (x < 0.01 ? "$0.01" : `$${x.toFixed(2)}`);
  return `about ${f(e.usd)} (between ${f(e.low)} and ${f(e.high)})${e.guess ? "; the model's price per token is not confirmed, so this is a guess" : ""}`;
}
