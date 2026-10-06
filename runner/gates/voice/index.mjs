// gates/voice: gate 2, Narrator Voice + music, approved as ONE artifact
// (the mix defines the final length). Writes into the project folder (SPEC 4.3):
//   audio/blocks/NN.mp3   one TTS call per script section
//   audio/vo.mp3          the narration alone (to judge the voice)
//   audio/vo_bgm.mp3      narration + music, -14 LUFS: the file under approval
//                         and the one the video uses
//   audio/stt.json        word timings { words:[{text,start,end,type}] } for
//                         sentences.mjs (step 3)
//   audio/voice.json      what was made: provider, voice, length, loudness
//
// Providers (docs/phase-2-plan.md step 6): ElevenLabs now; Gemini TTS after
// the measurement. The key comes in as apiKey and goes nowhere else.

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { narrationFromMarkdown, wordCount, speakable } from "./narration.mjs";
import * as elevenlabs from "../../providers/tts/elevenlabs.mjs";
import * as gemini from "../../providers/tts/gemini.mjs";
import { joinBlocks, mix, duration, clipAudio, silence } from "../../audio.mjs";
import * as elevenlabsMusic from "../../providers/music/elevenlabs.mjs";

export const VOICE_PROVIDERS = { elevenlabs, gemini };
// The ElevenLabs models gate 2 offers. Eleven v4 (2026-09-28) is the default
// since 2026-10-06 (Zoltan: clearly better, Hungarian works); Multilingual v2
// stays for a voice that sounds better with it.
export const ELEVEN_MODELS = { eleven_v4: "Eleven v4 (recommended)", eleven_multilingual_v2: "Multilingual v2 (older)" };

// The music file sits in the project (the Rust core's import_music copies it
// to audio/music.<ext>). Only that relative name comes in, never a free path.
export function musicPath(projectDir, rel) {
  if (!rel) return null;
  if (!/^audio\/music\.(mp3|wav|m4a|aac|ogg|flac)$/.test(rel)) throw new Error("Unexpected music file name.");
  const p = path.join(projectDir, rel);
  if (!fs.existsSync(p)) throw new Error("The music file is missing from the project. Choose it again.");
  return p;
}

export async function makeVoice({ projectDir, narrator, apiKey, music = null, language, env = process.env, fetchImpl, sleep, onProgress = () => {} }) {
  const provider = VOICE_PROVIDERS[narrator?.provider];
  if (!provider) throw new Error(`This Narrator Voice is not available yet: ${narrator?.provider}. Choose ElevenLabs in Settings.`);
  const md = path.join(projectDir, "script.md");
  if (!fs.existsSync(md)) throw new Error("There is no script yet. Write and approve the script first.");
  const blocks = narrationFromMarkdown(fs.readFileSync(md, "utf8"));
  if (!blocks.length) throw new Error("The script has no text to read aloud.");

  const audioDir = path.join(projectDir, "audio");
  const blockDir = path.join(audioDir, "blocks");
  fs.rmSync(blockDir, { recursive: true, force: true });
  fs.mkdirSync(blockDir, { recursive: true });
  // Blocks a failed run already read (and paid for) are kept until the voice
  // is done, so pressing the button again reads only the rest (2026-10-06).
  // A finished voice clears them: "make the voice again" is a new reading.
  const cacheDir = path.join(audioDir, "blocks-cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  const model = narrator.provider !== "elevenlabs" ? null : ELEVEN_MODELS[narrator.model] ? narrator.model : elevenlabs.DEFAULT_MODEL;

  const files = [];
  const blockWords = [];
  let reused = 0;
  for (let i = 0; i < blocks.length; i++) {
    onProgress({ step: "voice", block: i + 1, of: blocks.length });
    const args = {
      voiceId: narrator.voice,
      // ElevenLabs only: the model chosen at gate 2, else the default (Eleven v4)
      ...(model ? { model } : {}),
      text: speakable(blocks[i].text),
      previousText: blocks[i - 1] && speakable(blocks[i - 1].text),
      nextText: blocks[i + 1] && speakable(blocks[i + 1].text),
      languageCode: language,
    };
    const key = createHash("sha256").update(JSON.stringify({ v: 1, provider: narrator.provider, ...args })).digest("hex").slice(0, 32);
    const meta = path.join(cacheDir, `${key}.json`);
    let r = null;
    try {
      const m = JSON.parse(fs.readFileSync(meta, "utf8"));
      r = { audio: fs.readFileSync(path.join(cacheDir, `${key}.${m.ext}`)), words: m.words, ext: m.ext };
      reused++;
    } catch {
      r = null;
    }
    if (!r) {
      r = await provider.speak({
        apiKey,
        fetchImpl,
        ...args,
        onSentence: (n, of) => onProgress({ step: "voice", block: i + 1, of: blocks.length, sentence: n, sentences: of }),
        onRetry: (x) => onProgress({ step: "retry", ...x }),
        ...(sleep ? { sleep } : {}),
      });
      const ext = r.ext ?? "mp3";
      fs.writeFileSync(path.join(cacheDir, `${key}.${ext}`), r.audio);
      fs.writeFileSync(meta, JSON.stringify({ ext, words: r.words }));
    }
    const f = path.join(blockDir, `${String(i + 1).padStart(2, "0")}.${r.ext ?? "mp3"}`);
    fs.writeFileSync(f, r.audio);
    files.push(f);
    blockWords.push(r.words);
  }

  onProgress({ step: "joining" });
  const vo = path.join(audioDir, "vo.mp3");
  const { items, blockAt, inserts, tail } = await withInserts({ projectDir, blocks, files, audioDir, env });
  const { offsets } = await joinBlocks(items, vo, { env });
  const words = blockWords.flatMap((ws, i) => ws.map((w) => ({ ...w, start: round3(w.start + offsets[blockAt[i]]), end: round3(w.end + offsets[blockAt[i]]) })));
  const placed = inserts.map((x) => ({ ...x.call, start: offsets[x.at], end: round3(offsets[x.at] + x.seconds) }));
  const tailAt = tail ? { start: offsets[tail.at], seconds: tail.seconds } : null;
  fs.writeFileSync(path.join(audioDir, "stt.json"), JSON.stringify({ words }, null, 2) + "\n");

  onProgress({ step: "mixing" });
  const out = path.join(audioDir, "vo_bgm.mp3");
  const m = await mix({ vo, bgm: music, out, env });
  const info = { provider: narrator.provider, voice: narrator.voice, blocks: blocks.length, words: wordCount(blocks), music: music ? path.basename(music) : null, ...m, inserts: placed, endScreen: tailAt };
  fs.writeFileSync(path.join(audioDir, "voice.json"), JSON.stringify(info, null, 2) + "\n");
  fs.rmSync(cacheDir, { recursive: true, force: true });
  return { ...info, reused };
}

const round3 = (x) => Math.round(x * 1000) / 1000;

// The comment-call segments and the end-screen tail (docs/wizards/cta.md,
// DECISIONS 78), as extra pieces between the narration blocks: a segment's
// own sound goes in after its section (start: after OPEN, middle: after the
// highest-value section, end: after OWN), and the tail, silence for YouTube's
// end screen, last. The music runs on under all of them like under the voice.
export function insertAfter(blocks, script) {
  const n = blocks.length;
  const open = blocks.findIndex((b) => /^open$/i.test(b.heading));
  const hv = (script?.sections ?? []).findIndex((x) => x.highestValue);
  const mid = hv >= 0 ? blocks.findIndex((b) => b.heading.startsWith(`${hv + 1}.`)) : -1;
  return { start: open >= 0 ? open : 0, middle: mid >= 0 ? mid : Math.floor((n - 1) / 2), end: n - 1 };
}

// The pieces to join, where each narration block sits among them, and where
// the segments and the tail sit.
async function withInserts({ projectDir, blocks, files, audioDir, env }) {
  const sj = path.join(projectDir, "script.json");
  const script = fs.existsSync(sj) ? JSON.parse(fs.readFileSync(sj, "utf8")) : null;
  const after = insertAfter(blocks, script);
  const items = [];
  const blockAt = [];
  const inserts = [];
  let tail = null;
  for (let i = 0; i < files.length; i++) {
    blockAt.push(items.length);
    items.push(files[i]);
    for (const call of script?.segmentCalls ?? []) {
      if (after[call.slot] !== i) continue;
      const clip = path.join(projectDir, call.file);
      if (!fs.existsSync(clip)) throw new Error(`The segment for ${call.keyword} is missing from the project. Write the script again at gate 1.`);
      const a = await clipAudio(clip, path.join(audioDir, `segment-${call.slot}.mp3`), env);
      inserts.push({ at: items.length, seconds: a.seconds, call: { slot: call.slot, keyword: call.keyword, temperature: call.temperature, file: call.file, seconds: a.seconds, text: call.text ?? null } });
      items.push(a.file);
    }
  }
  const seconds = Number(script?.endScreen) || 0;
  if (seconds > 0) {
    tail = { at: items.length, seconds };
    items.push(await silence(seconds, path.join(audioDir, "end-screen.mp3"), env));
  }
  return { items, blockAt, inserts, tail };
}

// A short sample in the content language, for voices without a ready-made
// preview (Gemini). Cached by voice and language.
const SAMPLE_TEXT = {
  en: "Hi! This is how I sound when I read your video.",
  hu: "Szia! Így szólok, amikor felolvasom a videód szövegét.",
  de: "Hallo! So klinge ich, wenn ich dein Video vorlese.",
};

export async function voiceSample({ narrator, apiKey, language = "en", dir, fetchImpl }) {
  const provider = VOICE_PROVIDERS[narrator?.provider];
  if (!provider) throw new Error(`No voice samples for ${narrator?.provider}.`);
  const lang = SAMPLE_TEXT[language] ? language : "en";
  const file = path.join(dir, `${narrator.provider}-${String(narrator.voice).replace(/[^A-Za-z0-9_-]/g, "")}-${lang}.wav`);
  if (fs.existsSync(file)) return file;
  const mp3 = file.replace(/\.wav$/, ".mp3");
  if (fs.existsSync(mp3)) return mp3; // ElevenLabs samples are mp3: cached too, never paid twice
  const r = await provider.speak({ apiKey, fetchImpl, voiceId: narrator.voice, text: SAMPLE_TEXT[lang] });
  fs.mkdirSync(dir, { recursive: true });
  const out = r.ext === "wav" ? file : file.replace(/\.wav$/, ".mp3");
  fs.writeFileSync(out, r.audio);
  return out;
}

// Music made for this video (ElevenLabs Music), after the narration exists, so
// it fits the length. Writes audio/music.mp3 and mixes again. Needs the
// ElevenLabs key, which is why it is its own runner command.
export async function makeMusic({ projectDir, apiKey, prompt, env = process.env, fetchImpl, onProgress = () => {} }) {
  const vo = path.join(projectDir, "audio", "vo.mp3");
  if (!fs.existsSync(vo)) throw new Error("Make the voice first; the music is made to its length.");
  const seconds = await duration(vo, env);
  onProgress({ step: "music", seconds: elevenlabsMusic.musicSeconds(seconds) });
  const buf = await elevenlabsMusic.compose({ apiKey, fetchImpl, prompt: prompt || undefined, seconds });
  const audioDir = path.join(projectDir, "audio");
  for (const f of fs.readdirSync(audioDir)) if (f.startsWith("music.")) fs.rmSync(path.join(audioDir, f), { force: true });
  const music = path.join(audioDir, "music.mp3");
  fs.writeFileSync(music, buf);
  onProgress({ step: "mixing" });
  const m = await mix({ vo, bgm: music, out: path.join(audioDir, "vo_bgm.mp3"), env });
  const infoFile = path.join(audioDir, "voice.json");
  const info = { ...(fs.existsSync(infoFile) ? JSON.parse(fs.readFileSync(infoFile, "utf8")) : {}), ...m, music: "music.mp3", musicSource: "elevenlabs-music", musicLabel: "Made for this video (ElevenLabs Music)", musicPrompt: prompt || elevenlabsMusic.DEFAULT_PROMPT };
  fs.writeFileSync(infoFile, JSON.stringify(info, null, 2) + "\n");
  return info;
}

// Change the music of an existing narration without reading it again: none,
// or the user's own file already imported as audio/music.<ext>. ElevenLabs
// Music has its own command (makeMusic), because it needs a key.
export async function setMusic({ projectDir, music, env = process.env, onProgress = () => {} }) {
  const audioDir = path.join(projectDir, "audio");
  const vo = path.join(audioDir, "vo.mp3");
  if (!fs.existsSync(vo)) throw new Error("Make the voice first; the music goes under it.");
  let bgm = null;
  let source = "none";
  let label = null;
  if (music?.kind === "file") {
    bgm = musicPath(projectDir, music.path);
    source = "file";
    label = path.basename(bgm);
  } else if (music?.kind !== "none") {
    throw new Error("Choose your own music file, or no music.");
  }
  onProgress({ step: "mixing" });
  const m = await mix({ vo, bgm, out: path.join(audioDir, "vo_bgm.mp3"), env });
  const infoFile = path.join(audioDir, "voice.json");
  const info = { ...(fs.existsSync(infoFile) ? JSON.parse(fs.readFileSync(infoFile, "utf8")) : {}), ...m, music: bgm ? path.basename(bgm) : null, musicSource: source, musicLabel: label };
  fs.writeFileSync(infoFile, JSON.stringify(info, null, 2) + "\n");
  return info;
}
