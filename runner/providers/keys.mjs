// keys.mjs: "Test key" for the non-LLM services (PRD 5). Each check is one
// cheap read-only request that needs a valid key and costs no credit.

import { redact } from "./llm.mjs";

const CHECKS = {
  elevenlabs: { label: "ElevenLabs", url: "https://api.elevenlabs.io/v1/user", header: "xi-api-key" },
  heygen: { label: "HeyGen", url: "https://api.heygen.com/v2/user/remaining_quota", header: "x-api-key" },
};

export const KEY_SERVICES = Object.keys(CHECKS);

export async function testServiceKey({ service, apiKey, fetchImpl = fetch, timeoutMs = 30000 }) {
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
  if (res.status === 401 || res.status === 403) throw new Error(`${c.label} rejected the API key. Check it in Settings.`);
  throw new Error(`${c.label} answered with HTTP ${res.status}. Try again later.`);
}
