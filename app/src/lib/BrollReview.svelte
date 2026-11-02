<script lang="ts">
  // BrollReview: the B-roll on the Preview tab (docs/BUILD_PLAN.md phase 1b). Every
  // clip with its source, license and price, a Remove, and the one place where
  // paid clips are approved: which scenes, what each costs, the total against the
  // channel's limits. Nothing is spent until the button is pressed.
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import ErrorBox from "./ErrorBox.svelte";
  import Progress from "./Progress.svelte";
  import type { AppState, BrollReviewState, BrollEngineItem } from "./api";
  import { runner, errorText, openSourceLink } from "./api";
  import { running } from "./work.svelte";
  import { llmFor } from "./llm";
  import { log } from "./logger";
  import { findBroll } from "./brollRun";

  let { app, dir, changed, locked = false }: { app: AppState; dir: string; changed: () => Promise<void>; locked?: boolean } = $props();

  const COMMANDS = ["broll-auto-plan", "broll-auto-plan-rule", "broll-auto-find", "broll-auto-find-checked", "broll-auto-pixabay", "broll-paid-approve"];
  const job = $derived(running(dir, COMMANDS));
  let st = $state<BrollReviewState | null>(null);
  let busy = $state(false);
  let error = $state("");
  let note = $state("");
  let step = $state("");
  let credits = $state<{ credits: number | null; usd: number | null } | null>(null);
  const off = $derived(busy || !!job || locked);
  const plan = $derived(st?.plan ?? null);
  const paid = $derived(st?.paid ?? null);
  const rows = $derived((plan?.items ?? []).filter((i) => i.use));
  const wanted = $derived(rows.filter((i) => i.paidWanted && !(i.source === "ai" && i.state === "done")));
  const hasKie = $derived(!!app.keys["kie"]);

  async function load() {
    try {
      st = await runner<BrollReviewState>("broll-auto-state", { projectDir: dir });
    } catch (e) {
      error = errorText(e);
    }
  }
  onMount(load);

  // the balance is a free request, and only when a price is on the screen
  $effect(() => {
    if (wanted.length && hasKie && !credits) {
      runner<{ account: { credits: number | null; usd: number | null } }>("kie-balance", { service: "kie" })
        .then((r) => (credits = r.account))
        .catch(() => {});
    }
  });

  const SOURCE: Record<string, string> = { archive: "Public domain film", still: "Free still, moved in 2.5D", pixabay: "Pixabay", ai: "AI clip", flow: "Google Flow (Veo), own generation" };
  const priceOf = (i: BrollEngineItem) => (i.paidTier === "video" ? paid!.clipUsd : paid!.imageUsd);
  const sourceOf = (i: BrollEngineItem) => (i.source === "ai" && i.aiTier === "image" ? "AI picture, moved in 2.5D" : (SOURCE[i.source ?? ""] ?? i.source));
  const thumb = (i: BrollEngineItem) => {
    const c = st?.clips[i.id];
    return c?.stills?.[0] && st?.footageDir ? convertFileSrc(`${st.footageDir}/${c.stills[0]}`) : null;
  };

  async function act(fn: () => Promise<void>) {
    busy = true;
    error = "";
    note = "";
    try {
      await fn();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
      step = "";
    }
  }
  const find = (again: boolean) =>
    act(async () => {
      log("broll_engine_find", { again });
      await findBroll(dir, llmFor(app.config, "scenes"), app.keys, (s) => (step = s), again);
      await load();
      await changed();
    });
  const toggle = (i: BrollEngineItem, on: boolean, tier: string = i.paidTier ?? "image") => act(async () => void (st = await runner<BrollReviewState>("broll-paid-toggle", { projectDir: dir, id: i.id, on, tier })));
  const remove = (i: BrollEngineItem) =>
    act(async () => {
      st = await runner<BrollReviewState>("broll-auto-remove", { projectDir: dir, id: i.id });
      await changed();
    });
  const savePrompt = (i: BrollEngineItem, prompt: string) => act(async () => void (st = await runner<BrollReviewState>("broll-prompt-save", { projectDir: dir, id: i.id, prompt })));
  const approve = () =>
    act(async () => {
      log("broll_paid_approved", { clips: paid!.clips, usd: paid!.totalUsd });
      step = "Kie AI is making the clips";
      const r = await runner<BrollReviewState & { made?: number; failed?: { error: string }[] }>("broll-paid-approve", { projectDir: dir, service: "kie", quotedUsd: paid!.totalUsd });
      st = r;
      credits = null;
      const failed = r.failed?.length ?? 0;
      note = `${r.made ?? 0} clip${r.made === 1 ? "" : "s"} made${failed ? `, ${failed} failed and not charged: ${r.failed![0].error}` : ""}. Build the preview again to see them.`;
      await changed();
    });
</script>

<section class="broll">
  <h2>B-roll</h2>
  {#if job || step}<Progress command={job ?? "broll-auto-find"} project={dir} label={step || "Working on the B-roll"} />{/if}
  {#if error}<ErrorBox message={error} context={{ step: "broll-review" }} />{/if}
  {#if note}<p class="saved">{note}</p>{/if}

  {#if !plan || plan.stale}
    <p class="hint">{plan?.stale ? "This B-roll was found for an earlier voice." : "No B-roll yet for this video."} The search uses free sources first and spends nothing.</p>
    <button type="button" disabled={off} onclick={() => find(!!plan)}>Find B-roll</button>
  {:else}
    <p class="hint">{rows.filter((i) => i.state === "done").length} of {rows.length} stretches have a clip. Look at each one: an old film can show people, and a real person's face must not be in the video. Press Remove on any that does.</p>
    <ul class="rows">
      {#each rows as i (i.id)}
        <li>
          {#if thumb(i)}<img src={thumb(i)} alt="" />{:else}<span class="empty">no clip</span>{/if}
          <div class="body">
            <p class="said"><b>Scene {i.scene + 1}.</b> {i.said}</p>
            {#if i.state === "done"}
              <p class="meta">
                {sourceOf(i)}, {i.license ?? "license not recorded"}{i.author ? `, ${i.author}` : ""}, {(i.usd ?? 0) > 0 ? `${(i.usd ?? 0).toFixed(2)} USD` : "0 USD"}{i.source !== "ai" && !i.checked ? ", not looked at by the AI" : ""}
                {#if i.sourceUrl}<button type="button" class="link" onclick={() => openSourceLink(dir, i.sourceUrl!).catch((e) => (error = errorText(e)))}>source</button>{/if}
              </p>
            {:else if i.state === "none"}
              <p class="meta">Nothing free fits "{i.query}", so the animated scene stays here.{i.overBudget ? " A paid clip would go over the channel's limit." : ""}</p>
            {/if}
            {#if paid?.on && i.hero && i.prompt && !(i.source === "ai" && i.state === "done")}
              <label class="tick"><input type="checkbox" checked={!!i.paidWanted} disabled={off} onchange={(e) => toggle(i, e.currentTarget.checked)} /> Use a paid clip here, {priceOf(i).toFixed(2)} USD</label>
              {#if i.paidWanted}
                <div class="tiers">
                  <label><input type="radio" name="tier-{i.id}" checked={i.paidTier !== "video"} disabled={off} onchange={() => toggle(i, true, "image")} /> AI picture, moved in 2.5D here, {paid.imageUsd.toFixed(2)} USD</label>
                  <label class:dim={i.seconds > 5}><input type="radio" name="tier-{i.id}" checked={i.paidTier === "video"} disabled={off || i.seconds > 5} onchange={() => toggle(i, true, "video")} /> AI video, {paid.clipUsd.toFixed(2)} USD{i.seconds > 5 ? " (a video clip is 5 seconds, this stretch is longer)" : ""}</label>
                </div>
                <textarea rows="3" aria-label="Picture description" value={i.prompt} disabled={off} onchange={(e) => savePrompt(i, e.currentTarget.value)}></textarea>
              {/if}
            {/if}
          </div>
          {#if i.state === "done"}<button type="button" class="ghost" disabled={off} onclick={() => remove(i)}>Remove</button>{/if}
        </li>
      {/each}
    </ul>
    {#if paid && wanted.length}
      <div class="approve">
        <h3>Waiting for your approval</h3>
        <p>Scene{wanted.length === 1 ? "" : "s"} {wanted.map((i) => i.scene + 1).join(", ")} would use paid clips: {wanted.filter((i) => i.paidTier !== "video").length} moved picture{wanted.filter((i) => i.paidTier !== "video").length === 1 ? "" : "s"} at {paid.imageUsd.toFixed(2)} USD, {wanted.filter((i) => i.paidTier === "video").length} video{wanted.filter((i) => i.paidTier === "video").length === 1 ? "" : "s"} at {paid.clipUsd.toFixed(2)} USD = <b>{paid.totalUsd.toFixed(2)} USD</b>.</p>
        <p class="hint">Pictures: {paid.imageLabel}. Videos: {paid.label} at {paid.quality}.</p>
        <p class="hint">This video: {paid.spentVideoUsd.toFixed(2)} of {paid.maxPerVideoUsd.toFixed(2)} USD spent. This month: {paid.spentMonthUsd.toFixed(2)} of {paid.maxPerMonthUsd.toFixed(2)} USD spent.{credits?.usd !== null && credits?.usd !== undefined ? ` Kie AI balance: about ${credits.usd.toFixed(2)} USD.` : ""}</p>
        {#if !hasKie}<p class="warn">Add your Kie AI key in Settings, Connections.</p>{/if}
        {#if paid.over}<p class="warn">That is over this channel's limit. Untick some, or raise the limits in its recipe.</p>{/if}
        <button type="button" class="primary" disabled={off || paid.over || !hasKie} onclick={approve}>Approve and spend {paid.totalUsd.toFixed(2)} USD</button>
        <p class="hint">Nothing is spent until you press this. A clip Kie AI cannot make is not charged, and its free clip stays. When a picture fails, its row offers the video, for a new yes.</p>
      </div>
    {/if}
    <button type="button" class="ghost" disabled={off} onclick={() => find(true)}>Find B-roll again</button>
  {/if}
</section>

<style>
  .broll { margin: 16px 0; padding-top: 14px; border-top: 1px solid var(--border); }
  .broll h2 { margin: 0 0 6px; font-size: 16px; }
  .rows { list-style: none; margin: 10px 0; padding: 0; display: grid; gap: 10px; }
  .rows li { display: grid; grid-template-columns: 128px minmax(0, 1fr) auto; gap: 12px; align-items: start; }
  .rows img, .empty { width: 128px; height: 72px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border); }
  .empty { display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--muted-foreground); }
  .said { margin: 0; font-size: 14px; }
  .meta { margin: 4px 0 0; font-size: 13px; color: var(--muted-foreground); overflow-wrap: anywhere; }
  .tick { display: flex; gap: 8px; align-items: center; margin-top: 6px; font-size: 14px; }
  .tiers { display: grid; gap: 4px; margin: 4px 0 0 24px; font-size: 13px; }
  .tiers label { display: flex; gap: 6px; align-items: center; }
  .dim { color: var(--muted-foreground); }
  textarea { width: 100%; margin-top: 6px; font-size: 13px; box-sizing: border-box; }
  .approve { margin: 12px 0; padding: 12px; border: 1px solid var(--primary); border-radius: 8px; }
  .approve h3 { margin: 0 0 6px; font-size: 15px; }
  .approve p { margin: 0 0 8px; font-size: 14px; }
  .hint { margin: 6px 0; font-size: 13px; color: var(--muted-foreground); }
  .warn { color: var(--danger-text, #a5161b); font-size: 13px; }
  .saved { color: var(--success, #1f7a3a); font-weight: 600; }
  .link { border: none; background: none; padding: 0 2px; color: var(--primary); text-decoration: underline; font-size: inherit; cursor: pointer; }
  @media (max-width: 760px) { .rows li { grid-template-columns: 1fr; } }
</style>
