// channelwizard/index.mjs: where the YouTube Brand Channel Wizard keeps things (DECISIONS 174).
//   <identity>/channel-wizard.json   the answers and the texts so far, so nothing is lost
//   <identity>/traffic-card.md       the card, the same one the Import makes (planner/traffic-card.mjs)
// No AI and no network here; the AI's texts come from gates/channel (suggest-channel).

import fs from "node:fs";
import path from "node:path";
import { writeAtomic } from "../project.mjs";
import { cardPath, parseTrafficCard, saveCard, sections } from "../planner/traffic-card.mjs";
import { PHASES, QUESTIONS, PATH_NOTE, buildKit, cardMarkdown, checklist, checklistText, fieldsFrom, missingAnswers } from "./kit.mjs";

export const DRAFT_FILE = "channel-wizard.json";
const draftPath = (identityDir) => path.join(identityDir, DRAFT_FILE);
const needDir = (identityDir) => {
  if (!identityDir) throw new Error("No Identity to keep the wizard's answers with.");
};
const today = () => new Date().toISOString().slice(0, 10);
const object = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

function cleanDraft({ answers, texts, keywords, checks } = {}) {
  return { schema: 1, answers: object(answers), texts: object(texts), keywords: Array.isArray(keywords) ? keywords.filter((k) => k?.keyword) : [], checks: object(checks) };
}

export function loadDraft(identityDir) {
  needDir(identityDir);
  try {
    return cleanDraft(JSON.parse(fs.readFileSync(draftPath(identityDir), "utf8")));
  } catch {
    return null; // none yet, or damaged: the wizard starts empty
  }
}

export function saveDraft(identityDir, draft) {
  needDir(identityDir);
  const d = cleanDraft(draft);
  writeAtomic(draftPath(identityDir), JSON.stringify(d, null, 2));
  return d;
}

// The research of the card this Identity already keeps: it stays in the new card.
export function keptResearch(identityDir) {
  const p = cardPath(identityDir);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf8");
    const card = parseTrafficCard(raw);
    const h2 = sections(raw, 2);
    const kept = { keywordRows: card.keywords.map((k) => ({ ...k, seed: "" })) };
    for (const name of ["pillars", "playlists", "competitors", "outliers", "gaps", "video list", "notes"]) {
      const text = (h2.get(name) ?? []).join("\n").trim();
      if (text && !/^_.*_$/.test(text)) kept[name] = text;
    }
    return { kept, keywords: card.keywords.length, playlists: card.playlists.length, videos: card.videos.length };
  } catch {
    return null; // a card that cannot be read has nothing to keep; the preview says a card is replaced
  }
}

const markdownOf = (identityDir, draft) => cardMarkdown({ ...draft, kept: keptResearch(identityDir)?.kept ?? {}, today: today() });

export function wizardState(identityDir) {
  const k = identityDir ? keptResearch(identityDir) : null;
  return { questions: QUESTIONS, phases: PHASES, draft: identityDir ? loadDraft(identityDir) : null, hasCard: !!identityDir && fs.existsSync(cardPath(identityDir)), kept: k && { keywords: k.keywords, playlists: k.playlists, videos: k.videos } };
}

// Everything the kit and the Save screens show. Writes nothing.
export function wizardKit(identityDir, { channel = {}, ...input } = {}) {
  needDir(identityDir);
  const d = cleanDraft(input);
  const k = keptResearch(identityDir);
  return {
    ...buildKit(d.answers, d.texts),
    checklist: checklist(d.answers),
    checklistText: checklistText(d.answers, d.checks),
    pathNote: PATH_NOTE,
    fields: fieldsFrom(d.answers, channel, d.texts),
    missing: missingAnswers(d.answers),
    markdown: markdownOf(identityDir, d),
    hasCard: fs.existsSync(cardPath(identityDir)),
    kept: k && { keywords: k.keywords, playlists: k.playlists, videos: k.videos },
  };
}

// Save: the card with the Identity and the answers next to it. The fields are saved by the core,
// after the user's ticks on the preview.
export function wizardSave(identityDir, input = {}) {
  needDir(identityDir);
  const d = saveDraft(identityDir, input);
  return saveCard(identityDir, { text: markdownOf(identityDir, d) });
}

export function wizardExport(identityDir, { file, ...input } = {}) {
  needDir(identityDir);
  if (!file || !/\.md$/i.test(file)) throw new Error("Choose a file name that ends in .md.");
  const md = markdownOf(identityDir, cleanDraft(input));
  parseTrafficCard(md); // never hand out a card the app itself could not read
  writeAtomic(file, md);
  return { file };
}
