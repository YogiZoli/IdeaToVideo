// cta/make.mjs: a segment made in the app with HeyGen (docs/wizards/cta.md,
// DECISIONS 78), in two steps because they use two keys:
//   1. segmentVoice: the narrator (ElevenLabs or Gemini) reads the sentence,
//      the same voice as the videos, into <identity>/segments/voice-*.mp3
//   2. segmentVideo: HeyGen makes a full-frame avatar video on that sound,
//      with the brand's background colour; it becomes a segment (addSegment)
// An upload needs neither: when the HeyGen credits run out, publishing goes on.

import fs from "node:fs";
import path from "node:path";
import { VOICE_PROVIDERS } from "../gates/voice/index.mjs";
import { speakable } from "../gates/voice/narration.mjs";
import * as heygen from "../providers/avatar/heygen.mjs";
import { duration } from "../audio.mjs";
import { segmentsDir, addSegment, incomingName, SEGMENT_MAX_SECONDS, SEGMENT_TEXT_MAX } from "./segments.mjs";
import { keywordInfo } from "./catalog.mjs";

export async function segmentVoice({ identityDir, narrator, apiKey, text, language = "en", fetchImpl, env = process.env }) {
  const provider = VOICE_PROVIDERS[narrator?.provider];
  if (!provider) throw new Error("Choose a narrator voice in Settings, Voice and avatar first.");
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) throw new Error("Write the sentence the segment says.");
  if (clean.length > SEGMENT_TEXT_MAX) throw new Error("The text is too long for a segment of at most 30 seconds.");
  const r = await provider.speak({ apiKey, fetchImpl, voiceId: narrator.voice, text: speakable(clean), languageCode: language });
  const dir = segmentsDir(identityDir);
  fs.mkdirSync(dir, { recursive: true });
  const name = `voice-${Date.now()}.${r.ext ?? "mp3"}`;
  fs.writeFileSync(path.join(dir, name), r.audio);
  const seconds = Math.round((await duration(path.join(dir, name), env)) * 10) / 10;
  if (seconds > SEGMENT_MAX_SECONDS) {
    fs.rmSync(path.join(dir, name), { force: true });
    throw new Error(`Read aloud it is ${Math.round(seconds)} s. A segment can be at most ${SEGMENT_MAX_SECONDS} s: shorten the sentence.`);
  }
  return { audio: name, seconds };
}

export async function segmentVideo({ identityDir, apiKey, lookId, audio, keyword, name, text = "", background = "#ffffff", engine: wantedEngine, lookEngines, fetchImpl = fetch, sleep, onProgress = () => {}, env = process.env }) {
  if (!lookId) throw new Error("Choose an avatar in Settings, Voice and avatar first.");
  const info = keywordInfo(keyword);
  if (!info) throw new Error("Pick the keyword this segment says.");
  const dir = segmentsDir(identityDir);
  const sound = path.join(dir, path.basename(String(audio ?? "")));
  const spokenText = String(text ?? "").trim();
  if (!/^voice-\d+\.(mp3|wav)$/.test(path.basename(sound)) || !fs.existsSync(sound)) throw new Error("Make the voice of the segment first.");
  onProgress({ step: "upload" });
  const assetId = await heygen.uploadAudio({ apiKey, file: sound, fetchImpl });
  const id = await heygen.createVideo({ apiKey, avatarId: lookId, audioAssetId: assetId, background, title: `IdeaToVideo segment ${info.keyword}`, format: "mp4", full: true, engine: heygen.chooseEngine(wantedEngine, lookEngines).engine, fetchImpl });
  const file = incomingName(".mp4");
  await heygen.waitAndDownload({ apiKey, id, out: path.join(dir, file), fetchImpl, ...(sleep ? { sleep } : {}), onStatus: (status) => onProgress({ step: "heygen", status }) });
  fs.rmSync(sound, { force: true });
  return addSegment({ identityDir, file, keyword: info.keyword, name, text: spokenText, source: "heygen", env });
}
