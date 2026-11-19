// language/screen.mjs: the words on screen in another language than the voice (DECISIONS 189,
// finished 2026-11-19). The scene plan is made from the voice's sentences, so its texts are in the
// voice's language. When the video's screen language differs, every text field of the plan is
// translated in one AI call: a template's text params (then its component's variables are made
// again from them), and a comment call's line. Never what is not text: a drawn object's name, a
// place, a number, the comment keyword. The words before are kept (`screenSource`), so a second
// run translates from them again. No AI: the words stay, and the Preview tab says so.

import fs from "node:fs";
import path from "node:path";
import { aiTranslate } from "./translate.mjs";
import { videoLanguages, languageLabel } from "./index.mjs";
import { loadPreset, resolveTemplates } from "../presets/index.mjs";
import { toScene } from "../gates/scenes/templates.mjs";

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

// the text params of a template: words with a limit, not an object, a place or a number
const textParams = (template) => Object.entries(template?.params ?? {}).filter(([, p]) => p.maxWords && !["object", "place", "number"].includes(p.type)).map(([id]) => id);

/** Every text of a table that is shown on screen: [{ row, kind, id, text }]. */
export function screenTexts(table, templates) {
  const out = [];
  (table.scenes ?? []).forEach((sc, row) => {
    const src = sc.screenSource ?? sc;
    const t = templates.find((x) => x.id === sc.template);
    if (t && src.params) {
      for (const id of textParams(t)) if (typeof src.params[id] === "string" && src.params[id].trim()) out.push({ row, kind: "param", id, text: src.params[id] });
    } else if (sc.component === "cta-close" && typeof src.vars?.action_line === "string") {
      out.push({ row, kind: "var", id: "action_line", text: src.vars.action_line });
    }
  });
  return out;
}

/** The table with the translated texts in place; `texts[k]` belongs to `items[k]`. Pure. */
export function applyScreenTexts(table, templates, items, texts) {
  const scenes = (table.scenes ?? []).map((sc) => ({ ...sc }));
  items.forEach((it, k) => {
    const sc = scenes[it.row];
    sc.screenSource ??= { params: sc.params ? { ...sc.params } : undefined, vars: { ...(sc.vars ?? {}) } };
    if (it.kind === "param") sc.params = { ...(sc.params ?? {}), [it.id]: texts[k] };
    else sc.vars = { ...(sc.vars ?? {}), [it.id]: texts[k] };
  });
  for (const sc of scenes) {
    const t = templates.find((x) => x.id === sc.template);
    if (t && sc.screenSource && sc.params) sc.vars = { ...sc.vars, ...toScene(t, sc.params, { from: sc.from, to: sc.to ?? sc.from }).vars };
  }
  return { ...table, scenes };
}

/** Translates the plan's on-screen words when the screen language is not the voice's. */
export async function translateScreen({ projectDir, llm, env = process.env }) {
  const project = readJson(path.join(projectDir, "project.json"));
  const langs = videoLanguages(project);
  if (langs.screen === langs.voice) return { translated: 0, skipped: "same language" };
  const file = path.join(projectDir, "scenes.json");
  const table = readJson(file);
  const preset = loadPreset(project.recipe?.preset ?? "motion-frames");
  const templates = resolveTemplates(preset, { env });
  const items = screenTexts(table, templates);
  if (!items.length) return { translated: 0, skipped: "no text" };
  const texts = await aiTranslate({ llm, units: items.map((i) => i.text), from: langs.voice, to: langs.screen });
  const next = applyScreenTexts(table, templates, items, texts);
  fs.writeFileSync(`${file}.part`, JSON.stringify({ ...next, screenLanguage: langs.screen }, null, 2) + "\n");
  fs.renameSync(`${file}.part`, file);
  return { translated: items.length, language: languageLabel(langs.screen) };
}
