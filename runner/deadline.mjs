import { savedKeys } from "./providers/llm.mjs";

// deadline.mjs: a stuck AI step never blocks a video.
// ---- a stuck AI step (FIX_PLAN 2026-11-19, item 4, DECISIONS 190) ------------------------------
// Each AI step has a hard limit per try (ITV_AI_SCENES_SECONDS, default 90 s for a scene plan). The
// configured AI first, then the next saved key once, each without the long patient waits; so one
// step never waits much more than 3 minutes before the free path takes over.
export const AI_STEP_SECONDS = { scenes: 180 };
// the choices on Settings, AI (Zoltan, 2026-11-19: several videos at once are slower, so it is his to set)
export const WAIT_CHOICES = [90, 180, 300, 0];
export class DeadlineError extends Error {}
/** The limit of one AI try in seconds: the user's choice (llm.waitSeconds, 0 = no limit), else the env, else the default. */
export const aiStepSeconds = (step, env = process.env, chosen) => {
  if (chosen === 0) return Infinity;
  if (Number.isFinite(chosen) && chosen > 0) return Math.min(chosen, 3600);
  const n = Number(env[`ITV_AI_${step.toUpperCase()}_SECONDS`]);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 600) : AI_STEP_SECONDS[step];
};
export function aiTries(llm, apiKey, saved = savedKeys()) {
  const first = { provider: llm.provider, model: llm.model, effort: llm.effort ?? null, apiKey, patient: false };
  const next = saved.find((k) => k.provider !== llm.provider);
  return next ? [first, { provider: next.provider, model: next.model, effort: null, apiKey: next.apiKey, patient: false }] : [first];
}
export function withDeadline(work, seconds, message) {
  let timer;
  return Promise.race([
    Promise.resolve().then(work),
    new Promise((_, no) => {
      timer = setTimeout(() => no(new DeadlineError(message)), seconds * 1000);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Each try in turn, each within `seconds`: the first result wins. A try that times out or whose
 * AI gives up (`givesUp(e)`) is noted and the next one runs; any other error is thrown at once
 * (a scene table the checks refused is not a stuck AI). Returns { result, failed }; result null
 * when every try gave up, so the caller takes the free path.
 */
export async function firstInTime(tries, run, { seconds, givesUp = (e) => e instanceof DeadlineError, onGiveUp = () => {} } = {}) {
  const failed = [];
  for (let k = 0; k < tries.length; k++) {
    try {
      return { result: await withDeadline(() => run(tries[k]), seconds, `${tries[k].provider} did not finish within ${seconds} seconds`), failed };
    } catch (e) {
      if (!givesUp(e)) throw e;
      failed.push({ provider: tries[k].provider, message: e.message, timedOut: e instanceof DeadlineError });
      onGiveUp(e, tries[k], tries[k + 1] ?? null);
    }
  }
  return { result: null, failed };
}
