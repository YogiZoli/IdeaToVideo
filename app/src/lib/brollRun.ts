// brollRun.ts: the B-roll engine's search, step by step (runner/broll/engine.mjs,
// docs/BUILD_PLAN.md phase 1b). One key per command, so each source is its own
// command. Free only: nothing here orders a paid clip. A search cut off goes on
// from where it stopped; what is found is never searched again.
import { runner, errorText } from "./api";
import { errorCode } from "./errors";
import { log } from "./logger";

type Llm = { provider: string; model?: string | null; effort?: string | null };
type Plan = { finished?: boolean; stale?: boolean; items: unknown[] } | null;

export async function findBroll(dir: string, ai: Llm, keys: Record<string, boolean>, step: (s: string) => void, again = false) {
  const hasAi = !!keys[ai.provider];
  // One source that is down is only fewer clips: the next one still looks, the video
  // goes on, and the Preview says what was skipped. Only Stop ends the search.
  const note = async (kind: string, what: string, e: unknown) => {
    const text = errorText(e);
    if (errorCode(text) === "ITV-STOPPED") throw e;
    log("broll_source_failed", { what, error: text }, "warn");
    await runner("project-note", { projectDir: dir, kind, text: `${what} was skipped: ${text}` }).catch(() => {});
  };
  const { plan } = await runner<{ plan: Plan }>("broll-auto-state", { projectDir: dir });
  if (!again && plan?.finished && !plan.stale) return;
  if (again || !plan || plan.stale) {
    step("Choosing where B-roll goes");
    if (hasAi) await runner("broll-auto-plan", { projectDir: dir, llm: ai }).catch(async (e) => {
      await note("broll-plan", "The AI's B-roll plan", e);
      await runner("broll-auto-plan-rule", { projectDir: dir });
    });
    else await runner("broll-auto-plan-rule", { projectDir: dir });
  }
  step("Looking for free footage");
  if (hasAi) await runner("broll-auto-find-checked", { projectDir: dir, llm: ai }).catch(async (e) => {
    await note("broll-free", "The AI's look at the free footage", e);
    await runner("broll-auto-find", { projectDir: dir }).catch((e2) => note("broll-free", "The free footage search", e2));
  });
  else await runner("broll-auto-find", { projectDir: dir }).catch((e) => note("broll-free", "The free footage search", e));
  if (keys["pixabay"]) {
    step("Looking on Pixabay");
    await runner("broll-auto-pixabay", { projectDir: dir, service: "pixabay" }).catch((e) => note("broll-pixabay", "Pixabay", e));
  }
  await runner("broll-auto-finish", { projectDir: dir });
}
