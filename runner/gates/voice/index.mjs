// gates/voice: gate 2, Narrator Voice + music, approved as ONE artifact
// (AUDIO.md Rule 1). Writes into the project folder (SPEC 4.3):
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
import { narrationFromMarkdown, wordCount } from "./narration.mjs";
import * as elevenlabs from "../../providers/tts/elevenlabs.mjs";
import * as gemini from "../../providers/tts/gemini.mjs";
import { joinBlocks, mix, duration } from "../../audio.mjs";
import * as elevenlabsMusic from "../../providers/music/elevenlabs.mjs";

export const VOICE_PROVIDERS = { elevenlabs, gemini };

// The music file sits in the project (the Rust core's import_music copies it
// to audio/music.<ext>). Only that relative name comes in, never a free path.
export function musicPath(projectDir, rel) {
  if (!rel) return null;
  if (!/^audio\/music\.(mp3|wav|m4a|aac|ogg|flac)$/.test(rel)) throw new Error("Unexpected music file name.");
  const p = path.join(projectDir, rel);
  if (!fs.existsSync(p)) throw new Error("The music file is missing from the project. Choose it again.");
  return p;
}

export async function makeVoice({ projectDir, narrator, apiKey, music = null, language, env = process.env, fetchImpl, onProgress = () => {} }) {
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

  const files = [];
  const blockWords = [];
  for (let i = 0; i < blocks.length; i++) {
    onProgress({ step: "voice", block: i + 1, of: blocks.length });
    const r = await provider.speak({
      apiKey,
      fetchImpl,
      voiceId: narrator.voice,
      text: blocks[i].text,
      previousText: blocks[i - 1]?.text,
      nextText: blocks[i + 1]?.text,
      languageCode: language,
      onSentence: (n, of) => onProgress({ step: "voice", block: i + 1, of: blocks.length, sentence: n, sentences: of }),
    });
    const f = path.join(blockDir, `${String(i + 1).padStart(2, "0")}.${r.ext ?? "mp3"}`);
    fs.writeFileSync(f, r.audio);
    files.push(f);
    blockWords.push(r.words);
  }

  onProgress({ step: "joining" });
  const vo = path.join(audioDir, "vo.mp3");
  const { offsets } = await joinBlocks(files, vo, { env });
  const words = blockWords.flatMap((ws, i) => ws.map((w) => ({ ...w, start: round3(w.start + offsets[i]), end: round3(w.end + offsets[i]) })));
  fs.writeFileSync(path.join(audioDir, "stt.json"), JSON.stringify({ words }, null, 2) + "\n");

  onProgress({ step: "mixing" });
  const out = path.join(audioDir, "vo_bgm.mp3");
  const m = await mix({ vo, bgm: music, out, env });
  const info = { provider: narrator.provider, voice: narrator.voice, blocks: blocks.length, words: wordCount(blocks), music: music ? path.basename(music) : null, ...m };
  fs.writeFileSync(path.join(audioDir, "voice.json"), JSON.stringify(info, null, 2) + "\n");
  return info;
}

const round3 = (x) => Math.round(x * 1000) / 1000;

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
  const info = { ...(fs.existsSync(infoFile) ? JSON.parse(fs.readFileSync(infoFile, "utf8")) : {}), ...m, music: "music.mp3", musicSource: "elevenlabs-music", musicPrompt: prompt || elevenlabsMusic.DEFAULT_PROMPT };
  fs.writeFileSync(infoFile, JSON.stringify(info, null, 2) + "\n");
  return info;
}
