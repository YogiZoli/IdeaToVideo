// googlecloud.mjs: Google Cloud Text-to-Speech with the user's own key (DECISIONS 194), the default
// voice for every language Google speaks. Google's list has no Khmer (checked 2026-11-19): Khmer
// goes to Azure. Standard voices are free for the first 4 million characters a month (Google's
// pricing page); after the free part Google bills the user's own Cloud project.
//   listVoices  the voices for a language, best first
//   speak       one block of text -> WAV bytes + word timings (cloudvoice.mjs)

import { readJson } from "../../net.mjs";
import { redact } from "../llm.mjs";
import { BusyError, busyStatus } from "../retry.mjs";
import { bySentence } from "./cloudvoice.mjs";

const BASE = "https://texttospeech.googleapis.com/v1";
const TIMEOUT_MS = 60000;

async function call(path, { apiKey, fetchImpl = fetch, body }) {
  if (!apiKey) throw new Error("No API key set for Google Cloud Text-to-Speech. Add it in Settings, Connections.");
  let res;
  try {
    res = await fetchImpl(BASE + path, { method: body ? "POST" : "GET", headers: { "x-goog-api-key": apiKey, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new BusyError(`Could not reach Google Cloud: ${redact(e.message, apiKey)}`);
  }
  if (res.ok) return readJson(res, "Google Cloud");
  const t = redact(await res.text().catch(() => ""), apiKey);
  let msg = "";
  try {
    msg = String(JSON.parse(t).error?.message ?? "").slice(0, 200);
  } catch {
    msg = "";
  }
  const why = msg ? ` (${msg})` : "";
  if (res.status === 401 || res.status === 403) throw new Error(`Google Cloud refused the key${why}. Check that the key is right and that Text-to-Speech is turned on for its project.`);
  if (busyStatus(res.status)) throw new BusyError(`Google Cloud answered with HTTP ${res.status}${why}. The app kept trying for about three minutes. Try again later.`, { status: res.status });
  throw new Error(`Google Cloud did not accept the request (HTTP ${res.status})${why}.`);
}

// best first: Chirp 3 HD, then Neural2 and WaveNet, then Standard
const RANK = [/Chirp3-HD/i, /Neural2/i, /Wavenet/i, /Standard/i];
const rank = (name) => {
  const i = RANK.findIndex((rx) => rx.test(name));
  return i < 0 ? RANK.length : i;
};

export async function listVoices({ apiKey, fetchImpl, language = "en" } = {}) {
  const j = await call(`/voices?languageCode=${encodeURIComponent(language)}`, { apiKey, fetchImpl });
  return (j.voices ?? [])
    .filter((v) => v.name)
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))
    .map((v) => ({ id: v.name, name: v.name, gender: String(v.ssmlGender ?? "").toLowerCase() || null, languages: v.languageCodes ?? [], own: false, previewUrl: null }));
}

/** The language code of a Google voice name: "hu-HU-Chirp3-HD-Kore" -> "hu-HU". */
export const languageOf = (voiceId) => /^([a-z]{2,3}-[A-Z]{2})/.exec(String(voiceId))?.[1] ?? null;

export async function speak({ apiKey, fetchImpl, voiceId, text, languageCode, onSentence, onRetry, sleep }) {
  if (!voiceId) throw new Error("Choose a Google Cloud voice on the Voice tab.");
  const lang = languageOf(voiceId) ?? languageCode;
  const once = async (sentence) => {
    const j = await call("/text:synthesize", { apiKey, fetchImpl, body: { input: { text: sentence }, voice: { languageCode: lang, name: voiceId }, audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24000 } } });
    if (!j.audioContent) throw new Error("Google Cloud returned no audio.");
    return Buffer.from(j.audioContent, "base64");
  };
  return bySentence({ text, once, label: "Google Cloud", onSentence, onRetry, sleep });
}
