// azure.mjs: Microsoft Azure Speech with the user's own key (DECISIONS 194), for the languages Google
// does not speak, Khmer first (km-KH-PisethNeural, km-KH-SreymomNeural). The free F0 tier gives
// 500,000 characters of neural voice a month (Azure's pricing page); a Microsoft forum answer says
// commercial use of the output needs the paid tier, so the app says so where the key is added.
// The key is saved as "region:key", for example "southeastasia:abc123": Azure's address depends
// on the region of the Speech resource.

import { readJson } from "../../net.mjs";
import { redact } from "../llm.mjs";
import { BusyError, busyStatus } from "../retry.mjs";
import { bySentence } from "./cloudvoice.mjs";

const TIMEOUT_MS = 60000;

/** "region:key" -> { region, key }. A key without a region is refused with a sentence that says how. */
export function splitKey(apiKey) {
  const m = /^\s*([a-z0-9]+)\s*:\s*(\S+)\s*$/i.exec(String(apiKey ?? ""));
  if (!m) throw new Error("The Azure key is saved as region:key, for example southeastasia:abc123. The region is on the Speech resource's page in the Azure portal.");
  return { region: m[1].toLowerCase(), key: m[2] };
}

async function call(url, { key, fetchImpl = fetch, body }) {
  let res;
  try {
    res = await fetchImpl(url, { method: body ? "POST" : "GET", headers: { "Ocp-Apim-Subscription-Key": key, "User-Agent": "IdeaToVideo", ...(body ? { "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm" } : {}) }, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new BusyError(`Could not reach Azure: ${redact(e.message, key)}`);
  }
  if (res.ok) return res;
  const why = redact(await res.text().catch(() => ""), key).slice(0, 200);
  if (res.status === 401 || res.status === 403) throw new Error("Azure refused the key. Check the key and its region (region:key).");
  if (busyStatus(res.status)) throw new BusyError(`Azure answered with HTTP ${res.status}. The app kept trying for about three minutes. Try again later.`, { status: res.status });
  throw new Error(`Azure did not accept the request (HTTP ${res.status})${why ? ` (${why})` : ""}.`);
}

export async function listVoices({ apiKey, fetchImpl, language = "en" } = {}) {
  const { region, key } = splitKey(apiKey);
  const res = await call(`https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`, { key, fetchImpl });
  const all = await readJson(res, "Azure");
  const want = String(language).toLowerCase();
  return (Array.isArray(all) ? all : [])
    .filter((v) => String(v.Locale ?? "").toLowerCase().startsWith(`${want}-`))
    .map((v) => ({ id: v.ShortName, name: `${v.LocalName ?? v.DisplayName ?? v.ShortName} (${v.Locale})`, gender: String(v.Gender ?? "").toLowerCase() || null, languages: [v.Locale], own: false, previewUrl: null }));
}

const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
export const localeOf = (voiceId) => /^([a-z]{2,3}-[A-Z]{2})/.exec(String(voiceId))?.[1] ?? "en-US";

export async function speak({ apiKey, fetchImpl, voiceId, text, onSentence, onRetry, sleep }) {
  if (!voiceId) throw new Error("Choose an Azure voice on the Voice tab.");
  const { region, key } = splitKey(apiKey);
  const locale = localeOf(voiceId);
  const once = async (sentence) => {
    const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${xml(voiceId)}">${xml(sentence)}</voice></speak>`;
    const res = await call(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, { key, fetchImpl, body: ssml });
    return Buffer.from(await res.arrayBuffer());
  };
  return bySentence({ text, once, label: "Azure", onSentence, onRetry, sleep });
}
