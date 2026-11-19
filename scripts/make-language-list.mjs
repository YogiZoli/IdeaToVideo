#!/usr/bin/env node
// make-language-list.mjs: app/src/lib/voiceLanguages.ts from runner/language/index.mjs, so the
// window and the runner never disagree on which voice speaks which language (DECISIONS 195).
// A test checks the file is current:  node scripts/make-language-list.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_LANGUAGES, speakersOf, PROVIDER_LABEL, LANGUAGE_LABELS } from "../runner/language/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = path.join(ROOT, "app", "src", "lib", "voiceLanguages.ts");

export function languageList() {
  return CONTENT_LANGUAGES.map((code) => {
    const who = [...new Set(speakersOf(code).map((s) => s.provider))];
    return { code, label: LANGUAGE_LABELS[code], voices: who.map((p) => (p === "heygen" ? "HeyGen (avatar video)" : PROVIDER_LABEL[p])) };
  });
}

export function source() {
  return `// voiceLanguages.ts: written by scripts/make-language-list.mjs from runner/language/index.mjs. Do not edit.
// Every content language the app offers, and which voice services speak it (DECISIONS 195).
export const VOICE_LANGUAGES: { code: string; label: string; voices: string[] }[] = ${JSON.stringify(languageList(), null, 2)};
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(OUT, source());
  console.log(`${languageList().length} languages -> ${OUT}`);
}
