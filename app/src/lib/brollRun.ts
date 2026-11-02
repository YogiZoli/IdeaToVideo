// brollRun.ts: the B-roll engine's search, step by step (runner/broll/engine.mjs,
// docs/BUILD_PLAN.md phase 1b). One key per command, so each source is its own
// command. Free only: nothing here orders a paid clip. A search cut off goes on
// from where it stopped; what is found is never searched again.
import { runner } from "./api";

type Llm = { provider: string; model?: string | null; effort?: string | null };
type Plan = { finished?: boolean; stale?: boolean; items: unknown[] } | null;

export async function findBroll(dir: string, ai: Llm, keys: Record<string, boolean>, step: (s: string) => void, again = false) {
  const hasAi = !!keys[ai.provider];
  const { plan } = await runner<{ plan: Plan }>("broll-auto-state", { projectDir: dir });
  if (!again && plan?.finished && !plan.stale) return;
  if (again || !plan || plan.stale) {
    step("Choosing where B-roll goes");
    if (hasAi) await runner("broll-auto-plan", { projectDir: dir, llm: ai });
    else await runner("broll-auto-plan-rule", { projectDir: dir });
  }
  step("Looking for free footage");
  if (hasAi) await runner("broll-auto-find-checked", { projectDir: dir, llm: ai });
  else await runner("broll-auto-find", { projectDir: dir });
  if (keys["pixabay"]) {
    step("Looking on Pixabay");
    await runner("broll-auto-pixabay", { projectDir: dir, service: "pixabay" });
  }
  await runner("broll-auto-finish", { projectDir: dir });
}
