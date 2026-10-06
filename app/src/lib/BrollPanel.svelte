<script lang="ts">
  // BrollPanel: "Make B-roll clips" on the Scenes tab (docs/ai-broll.md 4,
  // DECISIONS 95, 98). Only when AI B-roll is on (Settings, Identity,
  // Footage). The AI picks a few sentences that name something visible and
  // writes a picture description for each (the user can change it, untick
  // it); above them the generator, the quality, the price and the video's
  // limit; one button orders them. The clips are made at HeyGen (the lid may
  // close), land in the video and in the AI B-roll library, and play under
  // their sentences, like your own footage. Never above the limit without a
  // yes; an order already placed is never placed again.
  import { onDestroy } from "svelte";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import ErrorBox from "./ErrorBox.svelte";
  import Progress from "./Progress.svelte";
  import type { AppState, BrollState, BrollItem } from "./api";
  import { runner, onProgress, errorText } from "./api";
  import { running } from "./work.svelte";
  import { llmFor } from "./llm";
  import { log } from "./logger";

  let { app, dir, tableChanged }: { app: AppState; dir: string; tableChanged: () => Promise<void> } = $props();

  const COMMANDS = ["broll-plan", "broll-make"];
  const job = $derived(running(dir, COMMANDS));
  let st = $state<BrollState | null>(null);
  let busy = $state(false);
  const locked = $derived(busy || !!job);
  let error = $state("");
  let note = $state("");
  let step = $state("");
  let account = $state<{ kind?: string; remaining?: number | null; currency?: string | null } | null>(null);
  let drafts = $state<Record<string, string>>({});
  let stamp = $state(Date.now());

  const stepLlm = $derived(llmFor(app.config, "scenes"));
  const plan = $derived(st?.plan ?? null);
  const est = $derived(st?.estimate ?? null);
  const isTest = $derived(st?.settings.generator === "test");
  const genLabel = $derived(st?.generators.find((g) => g.id === st?.settings.generator)?.label ?? "");
  const rate = $derived(st ? st.generators.find((g) => g.id === st!.settings.generator)?.usdPerSecond[st.settings.quality] ?? 0 : 0);

  async function load() {
    try {
      st = await runner<BrollState>("broll-state", { projectDir: dir });
      drafts = Object.fromEntries((st.plan?.items ?? []).map((i) => [i.id, i.prompt]));
    } catch (e) {
      error = errorText(e);
    }
  }
  $effect(() => {
    if (dir) load();
  });
  // the balance, only for the real generator and only with a plan to make
  $effect(() => {
    if (st?.settings.enabled && !isTest && plan?.items.length && app.keys["heygen"] && !account) {
      runner<{ account: typeof account }>("broll-balance", { service: "heygen" })
        .then((r) => (account = r.account))
        .catch(() => (account = null));
    }
  });
  // a job that finished while this tab was closed: show its result
  let hadJob = false;
  $effect(() => {
    if (job) hadJob = true;
    else if (hadJob && !busy) {
      hadJob = false;
      load();
      tableChanged();
    }
  });

  const unlisten = onProgress((p) => {
    if (p.command === "broll-plan") step = p.progress.step === "repairing" ? "Fixing a few problems in the B-roll plan..." : "The AI is choosing where clips go...";
    if (p.command === "broll-make") {
      const s = p.progress;
      if (s.step === "broll-order") step = `Ordering clip ${s.n} of ${s.of} (scene ${s.scene})...`;
      if (s.step === "broll-clip") step = `${isTest ? "Making test" : "HeyGen is making"} clip ${s.n} of ${s.of} (scene ${s.scene}, ${s.status ?? "waiting"})${s.reused ? ", ordered before, not paid again" : ""}...`;
    }
  });
  onDestroy(() => unlisten.then((f) => f()));

  async function run(command: string, request: Record<string, unknown>, label: string) {
    busy = true;
    error = "";
    step = label;
    try {
      const r = await runner<BrollState & { made?: number; fromLibrary?: number; kept?: number; failed?: { id: string; error: string }[] }>(command, { projectDir: dir, ...request });
      st = r;
      drafts = Object.fromEntries((r.plan?.items ?? []).map((i) => [i.id, i.prompt]));
      note = r.note ?? "";
      if (command === "broll-make") {
        const failed = r.failed?.length ?? 0;
        note = `${r.made ?? 0} clip${r.made === 1 ? "" : "s"} made${r.fromLibrary ? `, ${r.fromLibrary} from your library` : ""}${failed ? `, ${failed} failed (press Make again to order ${failed === 1 ? "it" : "them"} again)` : ""}${r.kept ? `, ${r.kept} ordered for an earlier plan went into your library` : ""}. They play under their sentences; build the preview again on the Preview tab.`;
        stamp = Date.now();
        account = null;
      }
      await tableChanged();
    } catch (e) {
      error = errorText(e);
      await load();
      await tableChanged();
    } finally {
      busy = false;
      step = "";
    }
  }

  async function makePlan() {
    if (plan?.items.length && !plan.stale && !(await ask("Plan the B-roll again? The list below is replaced. Clips already made stay in your library. This uses AI tokens.", { title: "Plan B-roll again", kind: "warning" }))) return;
    log("broll_plan", {});
    await run("broll-plan", { llm: stepLlm }, "Starting...");
  }

  const usd = (n: number) => `${n.toFixed(2)} USD`;
  const clipPrice = (i: BrollItem) => (isTest ? "free" : `about ${usd(Math.round(i.order * rate * 100) / 100)}`);

  async function make(ids: string[] | null = null) {
    const e = ids ? (await runner<{ estimate: typeof est }>("broll-estimate", { projectDir: dir, ids })).estimate! : est!;
    const n = e.items;
    if (!n && !e.fromLibrary) return;
    const what = isTest
      ? `Make ${n} test clip${n === 1 ? "" : "s"}? They are free test patterns, made on this computer.`
      : `Make ${n} clip${n === 1 ? "" : "s"} with ${genLabel} at ${st!.settings.quality}? ${e.pending ? `${e.pending} ${e.pending === 1 ? "was" : "were"} ordered before and ${e.pending === 1 ? "is" : "are"} picked up for free. ` : ""}It costs about ${usd(e.usd)} from your HeyGen API balance.${e.fromLibrary ? ` ${e.fromLibrary} more come${e.fromLibrary === 1 ? "s" : ""} from your library, free.` : ""}`;
    if (!(await ask(what, { title: "B-roll clips", kind: "info" }))) return;
    let allowOverCap = false;
    if (e.overCap) {
      if (!(await ask(`This is over the limit for this video: ${usd(e.capUsd)}, of which ${usd(e.spentUsd)} is spent. Together it would be about ${usd(e.spentUsd + e.usd)}. Make them anyway, this once? (You can change the limit in Settings, Identity, Footage.)`, { title: "Over the limit", kind: "warning" }))) return;
      allowOverCap = true;
    }
    log("broll_make", { clips: n, usd: e.usd, overCap: allowOverCap, test: isTest });
    await run("broll-make", { service: "heygen", ...(ids ? { ids } : {}), allowOverCap }, "Starting...");
  }

  async function saveDraft(i: BrollItem) {
    const text = (drafts[i.id] ?? "").trim();
    if (!text || text === i.prompt) return;
    try {
      st = await runner<BrollState>("broll-update", { projectDir: dir, id: i.id, prompt: text });
    } catch (e) {
      error = errorText(e);
    }
  }
  async function toggle(i: BrollItem, use: boolean) {
    try {
      st = await runner<BrollState>("broll-update", { projectDir: dir, id: i.id, use });
      await tableChanged();
    } catch (e) {
      error = errorText(e);
    }
  }
  // Asked first: a "no" leaves the clip made and in its place.
  async function again(i: BrollItem) {
    const price = isTest ? 0 : Math.round(i.order * rate * 100) / 100;
    if (!(await ask(isTest ? "Make this test clip again (free)?" : `Make this clip again with your description? It is a new order: about ${usd(price)} from your HeyGen API balance. The clip you have now stays in your library.`, { title: "Make again", kind: "info" }))) return;
    const spent = plan?.spentUsd ?? 0;
    let allowOverCap = false;
    if (price > 0 && spent + price > st!.settings.capUsd + 0.001) {
      if (!(await ask(`This is over the limit for this video: ${usd(st!.settings.capUsd)}, of which ${usd(spent)} is spent. Make it anyway, this once?`, { title: "Over the limit", kind: "warning" }))) return;
      allowOverCap = true;
    }
    try {
      st = await runner<BrollState>("broll-again", { projectDir: dir, id: i.id, prompt: drafts[i.id] ?? i.prompt });
    } catch (e) {
      error = errorText(e);
      return;
    }
    log("broll_again", { usd: price, overCap: allowOverCap, test: isTest });
    await run("broll-make", { service: "heygen", ids: [i.id], allowOverCap }, "Starting...");
  }
  async function remove(i: BrollItem) {
    try {
      st = await runner<BrollState>("broll-remove", { projectDir: dir, id: i.id });
      await tableChanged();
    } catch (e) {
      error = errorText(e);
    }
  }

  const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const STATE: Record<string, string> = { planned: "to make", ordered: "ordered, not downloaded yet", done: "made", failed: "failed" };
</script>

{#if st?.settings.enabled}
  <section class="broll">
    <h3>B-roll clips (AI)</h3>
    <p class="hint">Short clips that show what a sentence says, made by AI for this video. At most every third scene gets one, never the first, the last or a comment call. {isTest ? "Test mode: free test patterns instead of real clips." : `${genLabel}, ${st.settings.quality}.`}</p>
    {#if job}<Progress command={job} project={dir} label={step || "Working on the B-roll"} />{/if}
    {#if error}<ErrorBox message={error} context={{ step: "broll", provider: stepLlm.provider, model: stepLlm.model }} />{/if}
    {#if note}<p class="saved">{note}</p>{/if}

    {#if !plan}
      <div class="bar">
        <span class="say">The AI picks the sentences and writes a picture description for each. You see the list and the price before anything is ordered.</span>
        <button type="button" class="primary" disabled={locked} onclick={makePlan}>Make B-roll clips</button>
      </div>
    {:else if plan.stale}
      <p class="warn">This B-roll plan was made for an earlier voice. Plan it again; clips already made stay in your library and can be used again for free.</p>
      <div class="bar"><button type="button" class="primary" disabled={locked} onclick={makePlan}>Plan B-roll again</button></div>
    {:else if !plan.items.length}
      <p class="hint">No sentence of this video names something a clip could show, so no clip is planned.</p>
      <div class="bar"><button type="button" disabled={locked} onclick={makePlan}>Plan B-roll again</button></div>
    {:else}
      <div class="money">
        {#if est?.items || est?.fromLibrary}
          <span>To make: <b>{est.items}</b> clip{est.items === 1 ? "" : "s"}{est.fromLibrary ? `, ${est.fromLibrary} from your library (free)` : ""}, {isTest ? "free" : `about ${usd(est.usd)}`}</span>
        {:else}
          <span>Nothing left to make.</span>
        {/if}
        {#if !isTest}<span>Limit for this video: {usd(st.settings.capUsd)}, spent {usd(plan.spentUsd ?? 0)}, left {usd(est?.leftUsd ?? 0)}</span>{/if}
        {#if !isTest && account && account.remaining !== null && account.remaining !== undefined}<span>HeyGen balance: {account.currency === "usd" ? usd(Number(account.remaining)) : `${account.remaining} ${account.currency ?? ""}`}</span>{/if}
        {#if est?.overCap}<span class="over">Over the limit: the app asks before ordering.</span>{/if}
      </div>
      <ul class="items">
        {#each plan.items as i (i.id)}
          {@const clip = st.clips[i.id]}
          <li class:off={!i.use}>
            <div class="head">
              <label><input type="checkbox" checked={i.use} disabled={locked} onchange={(e) => toggle(i, (e.currentTarget as HTMLInputElement).checked)} /> Scene {i.scene + 1}, {clock(i.start)}, {Math.round(i.seconds * 10) / 10} s</label>
              <span class="state {i.state}">{i.library && i.state !== "done" ? "from your library, free" : STATE[i.state]}{i.state !== "done" && !i.library ? `, ${i.order} s, ${clipPrice(i)}` : ""}</span>
            </div>
            <p class="said">"{i.said}"</p>
            {#if i.state === "done" && i.file}
              <video controls muted preload="metadata" src={convertFileSrc(`${dir}/${i.file}`) + `?t=${stamp}`}></video>
            {:else if i.state === "done" && clip?.stills?.length && st.footageDir}
              <img class="still" src={convertFileSrc(`${st.footageDir}/${clip.stills[1] ?? clip.stills[0]}`)} alt="" />
            {/if}
            <textarea rows="3" maxlength="2000" disabled={locked || i.state === "ordered"} bind:value={drafts[i.id]} onblur={() => saveDraft(i)} aria-label="Picture description for scene {i.scene + 1}"></textarea>
            {#if i.state === "failed" && i.error}<p class="warn">{i.error}</p>{/if}
            {#if i.state === "done"}
              <div class="bar">
                {#if clip?.generated?.test}<span class="tag">test clip</span>{/if}
                <span class="spacer"></span>
                <button type="button" disabled={locked} onclick={() => again(i)}>Make again ({clipPrice(i)})</button>
                <button type="button" class="ghost" disabled={locked} onclick={() => remove(i)}>Remove</button>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
      <div class="bar">
        <span class="say">{est?.items ? "Change a description or untick a clip, then make them." : "All chosen clips are made and in the scene table."}</span>
        <button type="button" disabled={locked} onclick={makePlan}>Plan again</button>
        {#if est?.items || est?.fromLibrary}
          <button type="button" class="primary" disabled={locked || (!isTest && !app.keys["heygen"])} onclick={() => make()}>{isTest ? `Make ${est.items} test clip${est.items === 1 ? "" : "s"} (free)` : `Make ${est.items} clip${est.items === 1 ? "" : "s"} (about ${usd(est.usd)})`}</button>
        {/if}
      </div>
      {#if !isTest && !app.keys["heygen"]}<p class="warn">No HeyGen key: add it in Settings, Identity, Voice and avatar.</p>{/if}
    {/if}
  </section>
{/if}

<style>
  .broll { margin-top: 18px; padding-top: 12px; border-top: 1px solid var(--border); }
  h3 { margin: 0 0 4px; font-size: 15px; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
  .bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 10px; }
  .say { flex: 1; font-size: 13px; }
  .spacer { flex: 1; }
  .money { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 10px 0; padding: 8px 10px; border-radius: 8px; background: var(--muted); font-size: 13px; }
  .over { color: var(--danger-text, #a5161b); font-weight: 600; }
  .items { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .items li { display: grid; gap: 6px; padding: 10px; border: 1px solid var(--border); border-radius: 8px; }
  .items li.off { opacity: 0.55; }
  .head { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 600; }
  .head label { display: flex; gap: 6px; align-items: center; }
  .state { font-weight: 400; color: var(--muted-foreground); }
  .state.done { color: var(--success, #1f7a3a); font-weight: 600; }
  .state.failed { color: var(--danger-text, #a5161b); font-weight: 600; }
  .said { margin: 0; font-size: 13px; font-style: italic; }
  video, .still { width: 100%; max-width: 420px; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 6px; background: #000; }
  textarea { width: 100%; font-size: 13px; }
  .warn { margin: 4px 0 0; font-size: 13px; color: var(--danger-text, #a5161b); }
  .saved { padding: 8px 12px; border-radius: 8px; background: var(--success-surface, #e7f6ec); color: var(--success, #1f7a3a); font-weight: 600; font-size: 13px; }
  .tag { display: inline-block; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: var(--muted); color: var(--muted-foreground); }
</style>
