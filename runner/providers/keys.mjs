// keys.mjs: "Test key" for the non-LLM services (PRD 5). Each check is one
// cheap read-only request that needs a valid key and costs no credit.

import * as googlecloud from "./tts/googlecloud.mjs";
import * as azure from "./tts/azure.mjs";
import { redact } from "./llm.mjs";
import { testVidiq } from "./research/vidiq.mjs";
import { balance as kieBalance } from "../generate/kie.mjs";

const CHECKS = {
  elevenlabs: { label: "ElevenLabs", url: "https://api.elevenlabs.io/v1/user", header: "xi-api-key" },
  heygen: { label: "HeyGen", url: "https://api.heygen.com/v3/users/me", header: "x-api-key" },
  // Stock (docs/stock.md, DECISIONS 104, 108): one search of three results. Pixabay
  // takes the key only as a query parameter, so the address is built with it
  // and every message is redacted.
  pixabay: { label: "Pixabay", url: (k) => `https://pixabay.com/api/?key=${encodeURIComponent(k)}&q=office&per_page=3` },
  // Unsplash (DECISIONS 117): the Access Key in the header, one photo listed
  // (one of the 50 Demo-mode requests an hour).
  unsplash: { label: "Unsplash", url: "https://api.unsplash.com/photos?per_page=1", header: "Authorization", prefix: "Client-ID " },
};

export const KEY_SERVICES = [...Object.keys(CHECKS), "vidiq", "kie"];

export async function testServiceKey({ service, apiKey, fetchImpl = fetch, timeoutMs = 30000 }) {
  // vidIQ has no REST API: its test is an MCP call (0 credits)
  if (service === "vidiq") return testVidiq({ apiKey, fetchImpl });
  // Kie AI answers HTTP 200 to many failures: its balance call reads the code (free)
  if (service === "kie") {
    const b = await kieBalance({ apiKey, fetchImpl });
    return { ok: true, message: `Kie AI key works${b.credits === null ? "" : `: ${b.credits} credits, about ${b.usd.toFixed(2)} USD`}.` };
  }
  // the two cloud voices (DECISIONS 194): listing the voices is free and proves the key
  if (service === "googlecloud") {
    const n = (await googlecloud.listVoices({ apiKey, fetchImpl, language: "en" })).length;
    return { ok: true, message: `Google Cloud key works: ${n} English voices.` };
  }
  if (service === "azure") {
    const n = (await azure.listVoices({ apiKey, fetchImpl, language: "km" })).length;
    return { ok: true, message: `Azure key works: ${n} Khmer voice${n === 1 ? "" : "s"}.` };
  }
  const c = CHECKS[service];
  if (!c) throw new Error(`Unknown service: ${service}`);
  if (!apiKey) throw new Error(`No API key set for ${c.label}. Add it in Settings.`);
  let res;
  try {
    const url = typeof c.url === "function" ? c.url(apiKey) : c.url;
    res = await fetchImpl(url, { headers: c.header ? { [c.header]: c.bearer ? `Bearer ${apiKey}` : `${c.prefix ?? ""}${apiKey}` } : {}, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new Error(`Could not reach ${c.label}: ${redact(e.message, apiKey)}`);
  }
  if (res.ok) return { ok: true, message: `${c.label} key works.` };
  // The provider's reason (e.g. ElevenLabs "missing_permissions" on a scoped
  // key) tells the user what to fix. Redacted and cut short, never the raw body.
  const reason = redact(providerReason(await res.text().catch(() => "")), apiKey);
  const why = reason ? ` (${reason})` : "";
  if (res.status === 429 || (res.status === 403 && res.headers?.get?.("x-ratelimit-remaining") === "0")) throw new Error(`${c.label} accepted the key, but its hourly request limit is used up. Try again in an hour.`);
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
