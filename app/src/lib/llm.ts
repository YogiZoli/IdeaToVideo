// llm.ts: which AI model and effort each step uses (Zoltan, 2026-10-05,
// DECISIONS 89). Settings has one AI for everything; with "Choose a model for
// each step" on, three steps get their own:
//   script  the script and its natural-voice pass (needs the most brainpower)
//   scenes  the scene plan and the scene changes
//   texts   YouTube texts, the Settings suggestions, footage descriptions
// The voice, music and avatar have their own services, and the build, the
// preview and the render use no AI at all.
// A change on a tab ("Change" next to "AI: ...") is saved into the Identity's
// settings, so the next video starts with it: what was used last.
// Pure functions, no Tauri imports.

import type { Config, Llm, StepLlm, LlmStep } from "./api";
import { LLM_PROVIDERS, modelChoices, effortChoices, EFFORT_LABELS } from "./catalog";

export const STEPS: { id: LlmStep; label: string; hint: string }[] = [
  { id: "script", label: "Script", hint: "Writing the script and the natural voice. The most demanding step." },
  { id: "scenes", label: "Scenes", hint: "Planning the scenes and changing one." },
  { id: "texts", label: "Small texts", hint: "YouTube title, description and tags, suggestions in Settings, footage descriptions." },
];

/** The model and effort a step uses. */
export function llmFor(config: Pick<Config, "llm"> | null | undefined, step: LlmStep): StepLlm {
  const base = config?.llm ?? { provider: "gemini", model: "gemini-3.5-flash" };
  const own = base.perStep ? base.steps?.[step] : undefined;
  const pick = own ?? base;
  return { provider: pick.provider, model: pick.model, effort: pick.effort ?? null };
}

/** "Claude Opus 5.5, High effort", "Gemini 3.5 Flash". */
export function describeLlm(l: StepLlm): string {
  const provider = LLM_PROVIDERS.find((p) => p.id === l.provider);
  const model = modelChoices(l.provider).find((m) => m.id === l.model)?.label ?? `${provider?.label ?? l.provider} ${l.model}`;
  const effort = l.effort && effortChoices(l.provider, l.model).includes(l.effort) ? `, ${EFFORT_LABELS[l.effort]} effort` : "";
  return `${model}${effort}`;
}

/** The AI settings with one step set (and per-step turned on). */
export function withStep(base: Llm, step: LlmStep, l: StepLlm): Llm {
  return { ...base, perStep: true, steps: { ...(base.steps ?? {}), [step]: { provider: l.provider, model: l.model, effort: l.effort ?? null } } };
}
