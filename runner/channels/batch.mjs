// channels/batch.mjs: "Week batch" (docs/BUILD_PLAN.md, DECISIONS 136). Seven
// video ideas for one channel from one small AI call, then one script each, in
// one run. Each becomes a ONE Video with its queue place, waiting for its voice;
// nothing is rendered or published by the batch. A script that fails does not
// stop the others: it stays in the queue, marked, and can be written again.
// Pasted texts (`given`) skip the ideas: 7 notes give 7 scripts (phase 3).

import fs from "node:fs";
import path from "node:path";
import { chat, extractJson } from "../providers/llm.mjs";
import { loadProject } from "../project.mjs";
import { loadBrief } from "../research/index.mjs";

export const WEEK = 7;

export function ideaMessages({ channel = {}, name = "", theme = "", language = "en", count = WEEK, avoid = [] }) {
  return [
    {
      role: "system",
      content: `You plan a week of YouTube videos for one channel. Answer with one JSON object only: {"videos":[{"title":"...","angle":"..."}]} with exactly ${count} videos. Each title is a specific video in ${language}, at most 12 words. Each angle is one sentence on what makes this video worth watching. No two videos say the same thing. Never name a real person, brand or channel.`,
    },
    {
      role: "user",
      content: `Channel: ${name}\nAudience: ${channel.audience || "not set"}\nAbout: ${channel.profile || "not set"}${theme ? `\nThis week's theme: ${theme}` : ""}${avoid.length ? `\nAlready made, do not repeat:\n- ${avoid.slice(0, 40).join("\n- ")}` : ""}`,
    },
  ];
}

/** The AI's answer as exactly `count` different ideas, or a sentence why not. */
export function cleanIdeas(answer, { count = WEEK, avoid = [] } = {}) {
  const seen = new Set(avoid.map((t) => String(t).trim().toLowerCase()));
  const out = [];
  for (const v of Array.isArray(answer?.videos) ? answer.videos : []) {
    const title = String(v?.title ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    out.push({ title, angle: String(v?.angle ?? "").replace(/\s+/g, " ").trim().slice(0, 400) });
    if (out.length === count) break;
  }
  return out;
}

export async function weekIdeas({ llm, channel, name, theme, language, count = WEEK, avoid = [], onProgress = () => {} }) {
  onProgress({ step: "ideas", provider: llm.provider });
  const messages = ideaMessages({ channel, name, theme, language, count, avoid });
  let ideas = [];
  for (let round = 0; round < 2 && ideas.length < count; round++) {
    const text = await chat({ ...llm, messages, json: true, temperature: 0.8 });
    try {
      const more = cleanIdeas(extractJson(text), { count, avoid: [...avoid, ...ideas.map((i) => i.title)] });
      ideas = [...ideas, ...more].slice(0, count);
    } catch {
      // an answer that is not JSON counts as an empty round
    }
    messages.push({ role: "assistant", content: text }, { role: "user", content: `That gave ${ideas.length} of ${count} different videos. Answer with the JSON object again, with ${count} different videos.` });
  }
  if (ideas.length < count) throw new Error(`The AI gave ${ideas.length} of ${count} different video ideas. Press Week batch again.`);
  return ideas;
}

/**
 * The run: the ideas, then for each a project (`create`) and its script
 * (`write`). Both come in from main.mjs, the same code the single video uses.
 */
export async function runWeekBatch({ llm, channel, name, theme, language, count = WEEK, avoid = [], given = null, create, write, batchId = new Date().toISOString().slice(0, 16), onProgress = () => {} }) {
  const ideas = given ?? (await weekIdeas({ llm, channel, name, theme, language, count, avoid, onProgress }));
  const videos = [];
  for (const [i, idea] of ideas.entries()) {
    onProgress({ step: "batch-script", n: i + 1, of: ideas.length, title: idea.title });
    const { dir, id } = create({ title: idea.title, idea, queue: { batch: batchId, position: i + 1, of: ideas.length, ...(idea.angle ? { angle: idea.angle } : {}) } });
    try {
      await write({ dir, idea });
      videos.push({ id, dir, title: idea.title, ok: true });
    } catch (e) {
      // kept in the queue: the failed gate says why, and it can be written again
      videos.push({ id, dir, title: idea.title, ok: false, error: String(e.message).slice(0, 300) });
    }
  }
  return { batch: batchId, videos, written: videos.filter((v) => v.ok).length, failed: videos.filter((v) => !v.ok).length };
}

/** The channel's queue, oldest batch first, in order. Read from each project. */
export function listQueue(projectsDir) {
  if (!projectsDir || !fs.existsSync(projectsDir)) return [];
  const out = [];
  for (const name of fs.readdirSync(projectsDir)) {
    const dir = path.join(projectsDir, name);
    try {
      const p = loadProject(dir);
      if (!p.queue) continue;
      const rendered = p.render?.state === "done" && p.gates?.review?.state === "approved";
      if (rendered) continue;
      out.push({ dir, id: p.id, title: p.title, status: p.status, script: p.gates?.script?.state ?? "todo", error: p.gates?.script?.error ?? null, running: !!p.autopilotRun, research: p.start?.research ? (loadBrief(dir)?.state ?? "none") : null, ...p.queue });
    } catch {
      // not a project folder: skip it
    }
  }
  return out.sort((a, b) => String(a.batch).localeCompare(String(b.batch)) || a.position - b.position);
}
