// footage/describe.mjs: "Describe it for me". The AI looks at a clip's three
// stills and writes what is on it in one or two plain sentences, the words
// the scene planner matches to the narration. The user can edit it after.
// Uses the user's own AI key; only the three small stills are sent.

import fs from "node:fs";
import path from "node:path";
import { chat } from "../providers/llm.mjs";
import { loadLibrary, footageDir, updateClip } from "./library.mjs";

const PROMPT = `These are three stills from one video clip (beginning, middle, end).
Describe what the clip shows, for someone choosing B-roll for a narrated video:
the setting, the people or objects, the action, the mood. One or two plain
sentences, at most 40 words, in English. No guesses about names or brands. Answer
with the description only.`;

export async function describeClip({ identityDir, id, llm }) {
  const clip = loadLibrary(identityDir).clips.find((c) => c.id === id);
  if (!clip) throw new Error("There is no such clip.");
  const images = (clip.stills ?? []).map((f) => path.join(footageDir(identityDir), f)).filter((f) => fs.existsSync(f));
  if (!images.length) throw new Error("This clip has no stills to look at. Write the description yourself.");
  const content = [{ type: "text", text: PROMPT }, ...images.map((f) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(f).toString("base64")}` } }))];
  const text = await chat({ ...llm, messages: [{ role: "user", content }], temperature: 0.3, maxTokens: 200 });
  const description = String(text).replace(/\s+/g, " ").replace(/^["']|["']$/g, "").trim().slice(0, 400);
  if (!description) throw new Error("The AI gave no description. Write it yourself.");
  return updateClip(identityDir, id, { description });
}
