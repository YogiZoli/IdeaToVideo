// errors.ts: a short, stable code for every error message, so a tester's
// screenshot tells us the cause at a glance (ITV-<area>-<detail>). Built from
// the message text the runner and the Rust core already produce; never
// includes a key (those messages never contain one).

export function errorCode(message: string): string {
  const m = message.toLowerCase();
  const http = /http (\d{3})/.exec(m)?.[1];
  if (m.includes("rejected the api key")) return "ITV-KEY-401";
  if (m.includes("no api key set")) return "ITV-KEY-NONE";
  if (m.includes("does not know this model")) return "ITV-LLM-404";
  if (m.includes("quota") || m.includes("rate limit")) return "ITV-LLM-429";
  if (m.includes("empty answer") || m.includes("empty suggestion")) return "ITV-LLM-EMPTY";
  if (m.includes("did not pass the checks")) return "ITV-SCRIPT-CHECK";
  if (m.includes("could not reach")) return "ITV-NET";
  if (http) return `ITV-HTTP-${http}`;
  if (m.includes("runner") || m.includes("bundled node")) return "ITV-RUN";
  if (m.includes("keychain")) return "ITV-KEYCHAIN";
  if (m.includes("settings not saved") || m.includes("config.json")) return "ITV-CONFIG";
  if (m.includes("folder")) return "ITV-FS";
  return "ITV-ERR";
}

export type ErrorContext = { step?: string; provider?: string; model?: string };

export function detailLine(message: string, version: string, ctx: ErrorContext = {}, at = new Date()): string {
  const llm = ctx.provider ? `${ctx.provider}${ctx.model ? "/" + ctx.model : ""}` : null;
  const when = at.toISOString().slice(0, 16).replace("T", " ");
  return [errorCode(message), `v${version}`, ctx.step, llm, when].filter(Boolean).join(" · ");
}
