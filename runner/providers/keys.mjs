// keys.mjs: "Test key" for the non-LLM services (PRD 5). Each check is one
// cheap read-only request that needs a valid key and costs no credit.

import { redact } from "./llm.mjs";
import { testVidiq } from "./research/vidiq.mjs";

const CHECKS = {
  elevenlabs: { label: "ElevenLabs", url: "https://api.elevenlabs.io/v1/user", header: "xi-api-key" },
  heygen: { label: "HeyGen", url: "https://api.heygen.com/v3/users/me", header: "x-api-key" },
};

export const KEY_SERVICES = [...Object.keys(CHECKS), "vidiq"];

export async function testServiceKey({ service, apiKey, fetchImpl = fetch, timeoutMs = 30000 }) {
  // vidIQ has no REST API: its test is an MCP call (0 credits)
  if (service === "vidiq") return testVidiq({ apiKey, fetchImpl });
  const c = CHECKS[service];
  if (!c) throw new Error(`Unknown service: ${service}`);
  if (!apiKey) throw new Error(`No API key set for ${c.label}. Add it in Settings.`);
  let res;
  try {
    res = await fetchImpl(c.url, { headers: { [c.header]: apiKey }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new Error(`Could not reach ${c.label}: ${redact(e.message, apiKey)}`);
  }
  if (res.ok) return { ok: true, message: `${c.label} key works.` };
  // The provider's reason (e.g. ElevenLabs "missing_permissions" on a scoped
  // key) tells the user what to fix. Redacted and cut short, never the raw body.
  const reason = redact(providerReason(await res.text().catch(() => "")), apiKey);
  const why = reason ? ` (${reason})` : "";
  if (res.status === 401 || res.status === 403) throw new Error(`${c.label} rejected the API key${why}. Check the key and its permissions.`);
  throw new Error(`${c.label} answered with HTTP ${res.status}${why}. Try again later.`);
}

function providerReason(body) {
  try {
    const j = JSON.parse(body);
    const d = j.detail ?? j.error ?? j;
    return [d?.status, d?.code, d?.message].filter((x) => typeof x === "string" && x).join(": ").slice(0, 200);
  } catch {
    return "";
  }
}
