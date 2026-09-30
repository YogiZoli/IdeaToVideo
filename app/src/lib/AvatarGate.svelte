<script lang="ts">
  // Gate 5, optional: an avatar says the opening and/or the closing, full
  // screen, lip-synced to your own narration (DECISIONS 47, 61). Pick a look
  // from your HeyGen account (your own avatars first), see the cost estimate
  // and your balance, make the clips, then build again at 4 and render.
  // Autopilot never does this: it costs HeyGen credits.
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import ErrorBox from "./ErrorBox.svelte";
  import Progress from "./Progress.svelte";
  import LayoutPicker from "./LayoutPicker.svelte";
  import type { AvatarLayout } from "./api";
  import type { AppState, Gate } from "./api";
  import { runner, onProgress, errorText } from "./api";
  import { onDestroy } from "svelte";

  type Look = { id: string; name: string; type: string; gender: string | null; image: string | null; video: string | null };
  type Group = { id: string; name: string; image: string | null; status: string; note: string | null; looks: Look[] };
  type Segment = { name: string; label: string; start: number; duration: number; file?: string };
  type Plan = { segments: Segment[]; current: { lookId: string; format?: string; layout?: AvatarLayout; note?: string | null; segments: Segment[] } | null; estimate: { low: number; high: number }; account: { kind?: string; remaining?: number | null; currency?: string | null; error?: string } | null };

  let { app, dir, gate, scenesApproved, look = "blue-professional", changed }: { app: AppState; dir: string; gate?: Gate; scenesApproved: boolean; look?: string; changed: () => Promise<void> } = $props();

  const hasKey = $derived(!!app.keys["heygen"]);
  let open = $state(false);
  let own = $state<Group[]>([]);
  let stock = $state<Look[]>([]);
  let plan = $state<Plan | null>(null);
  let lookId = $state("");
  let which = $state<string[]>(["open", "close"]);
  let busy = $state(false);
  let step = $state("");
  let error = $state("");
  let preview = $state<string | null>(null);
  // per video; starts from the clips already made, else the Settings default
  let layout = $state<Partial<AvatarLayout>>({});
  let stamp = $state(Date.now());

  const current = $derived(plan?.current ?? null);
  const layoutChanged = $derived(!!current?.layout && (layout.style !== current.layout.style || layout.position !== current.layout.position || layout.size !== current.layout.size));
  const seconds = $derived((plan?.segments ?? []).filter((s) => which.includes(s.name)).reduce((n, s) => n + s.duration, 0));
  const scale = $derived(plan && plan.segments.length ? seconds / plan.segments.reduce((n, s) => n + s.duration, 0) : 1);

  let command = $state("make-avatar");

  async function start() {
    open = true;
    busy = true;
    command = "avatar-looks";
    error = "";
    step = "Loading your avatars and their pictures (faster next time)...";
    try {
      ({ own, stock } = await runner<{ own: Group[]; stock: Look[] }>("avatar-looks", { service: "heygen" }));
      plan = await runner<Plan>("avatar-plan", { projectDir: dir, service: "heygen" });
      lookId = plan.current?.lookId ?? app.config?.avatar?.lookId ?? own.flatMap((g) => g.looks)[0]?.id ?? stock[0]?.id ?? "";
      const a = app.config?.avatar;
      layout = { ...(plan.current?.layout ?? { style: a?.style ?? "cutout", position: a?.position ?? "bottom-right", size: a?.size ?? "medium" }) };
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
      step = "";
      command = "make-avatar";
    }
  }

  async function showPreview(l: Look) {
    if (!l.video) return;
    try {
      preview = convertFileSrc((await runner<{ file: string }>("avatar-preview", { url: l.video })).file);
    } catch (e) {
      error = errorText(e);
    }
  }

  const unlisten = onProgress((p) => {
    if (p.command !== "make-avatar") return;
    const s = p.progress;
    if (s.step === "upload") step = `Sending the ${String(s.segment).toLowerCase()} narration to HeyGen...`;
    if (s.step === "heygen") step = `HeyGen is making the ${String(s.segment).toLowerCase()} clip (${s.status ?? "waiting"})...`;
  });
  onDestroy(() => unlisten.then((f) => f()));

  async function make() {
    const cost = plan ? `about $${(plan.estimate.low * scale).toFixed(2)} to $${(plan.estimate.high * scale).toFixed(2)}` : "a few dollars";
    if (!(await ask(`Make ${Math.round(seconds)} seconds of avatar video on HeyGen? It costs ${cost} from your HeyGen API balance.`, { title: "Avatar", kind: "info" }))) return;
    busy = true;
    error = "";
    step = "Starting...";
    try {
      await runner("make-avatar", { projectDir: dir, service: "heygen", lookId, which, look, layout: { ...layout } });
      plan = await runner<Plan>("avatar-plan", { projectDir: dir, service: "heygen" });
      stamp = Date.now();
      await changed();
    } catch (e) {
      error = errorText(e);
      await changed();
    } finally {
      busy = false;
      step = "";
    }
  }

  // a new place, size or style for the clips already made: no HeyGen cost
  async function applyLayout() {
    busy = true;
    error = "";
    try {
      await runner("avatar-layout", { projectDir: dir, layout: { ...layout } });
      plan = await runner<Plan>("avatar-plan", { projectDir: dir, service: "heygen" });
      await changed();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  async function remove() {
    busy = true;
    try {
      await runner("remove-avatar", { projectDir: dir });
      plan = plan ? { ...plan, current: null } : plan;
      await changed();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  async function approve() {
    try {
      await runner("approve-gate", { projectDir: dir, gate: "avatar" });
      await changed();
    } catch (e) {
      error = errorText(e);
    }
  }

  const money = (a: Plan["account"]) =>
    !a || a.error ? (a?.error ?? "") : a.remaining === null || a.remaining === undefined ? "" : a.currency === "usd" ? `Your HeyGen API balance: $${a.remaining.toFixed(2)}.` : `Your HeyGen credits: ${a.remaining}.`;
</script>

<section class="card">
  <div class="head">
    <h2>5. Avatar (optional)</h2>
    {#if gate}<span class="pill {gate.state}">{gate.state}</span>{/if}
  </div>

  {#if !scenesApproved}
    <p class="hint">Approve the scene table first. The avatar is optional: without it the video is complete.</p>
  {:else if !hasKey}
    <p class="hint">An avatar can say the opening and the closing of your video, in your own narration. It needs a HeyGen API key (Settings) and costs HeyGen credits. Without it the video is complete.</p>
  {:else if !open}
    <div class="actions">
      <span class="hint grow">An avatar can say the opening and the closing, full screen, lip-synced to your narration. It costs HeyGen credits; you see the price first. Autopilot never adds it.</span>
      <button type="button" onclick={start}>{current ? "Change the avatar" : "Add an avatar"}</button>
    </div>
  {:else}
    {#if busy}{#key command}<Progress {command} label={step || "Working"} />{/key}{/if}
    {#if error}<ErrorBox message={error} context={{ step: "avatar", provider: "heygen" }} />{/if}

    {#if own.length || stock.length}
      <div class="actions">
        <span class="label grow">Your avatars</span>
        <button type="button" class="ghost" onclick={() => openUrl("https://app.heygen.com/avatars")}>Open HeyGen</button>
      </div>
      <p class="hint">These come straight from your HeyGen account. Make or change avatars in HeyGen; they show up here.</p>
      {#if !own.length}<p class="hint">This API key sees no avatar of your own. If you have avatars in the HeyGen app, the key probably belongs to another HeyGen workspace: make the API key in the workspace where your avatars are. Meanwhile you can pick a HeyGen stock avatar below.</p>{/if}
      {#each own as g (g.id)}
        <div class="group">
          <div class="ghead">
            {#if g.image}<img src={convertFileSrc(g.image)} alt="" />{/if}
            <strong>{g.name}</strong>
            {#if g.note}<span class="hint">({g.note})</span>{:else}<span class="hint">{g.looks.length} look{g.looks.length === 1 ? "" : "s"}</span>{/if}
          </div>
          {#each g.looks as l (l.id)}
            <label class="row-look" class:on={lookId === l.id}>
              <input type="radio" bind:group={lookId} value={l.id} disabled={busy} />
              {#if l.image}<img src={convertFileSrc(l.image)} alt="" loading="lazy" />{/if}
              <span class="grow">{l.name}</span>
              {#if l.video}<button type="button" class="ghost" onclick={() => showPreview(l)}>Preview</button>{/if}
            </label>
          {/each}
        </div>
      {/each}
      {#if stock.length}
        <details>
          <summary class="label">HeyGen stock avatars</summary>
          <div class="looks">
            {#each stock as l (l.id)}
              <label class="look" class:on={lookId === l.id}>
                <input type="radio" bind:group={lookId} value={l.id} disabled={busy} />
                {#if l.image}<img src={convertFileSrc(l.image)} alt={l.name} loading="lazy" />{:else}<span class="noimg">{l.name}</span>{/if}
                <span class="name">{l.name}</span>
                {#if l.video}<button type="button" class="ghost" onclick={() => showPreview(l)}>Preview</button>{/if}
              </label>
            {/each}
          </div>
        </details>
      {/if}
      <!-- svelte-ignore a11y_media_has_caption -->
      {#if preview}<video controls autoplay src={preview}></video>{/if}
    {/if}

    {#if plan}
      <LayoutPicker bind:style={layout.style} bind:position={layout.position} bind:size={layout.size} disabled={busy} cutoutNote={current && current.format !== "webm" ? "The clips you have now are not transparent: a cut-out needs new clips." : ""} />
      {#if current?.note}<p class="hint">{current.note}</p>{/if}
      <div class="row">
        {#each plan.segments as s}
          <label class="choice"><input type="checkbox" bind:group={which} value={s.name} disabled={busy} /> {s.label}: {s.duration.toFixed(1)} s</label>
        {/each}
      </div>
      <p class="hint">Estimate for {Math.round(seconds)} s: about ${(plan.estimate.low * scale).toFixed(2)} to ${(plan.estimate.high * scale).toFixed(2)}, depending on the avatar. {money(plan.account)}</p>
      <div class="actions">
        {#if current}<button type="button" class="ghost" disabled={busy} onclick={remove}>Remove the avatar</button>{/if}
        {#if layoutChanged}<button type="button" disabled={busy} onclick={applyLayout}>Use this place and size (no new clips)</button>{/if}
        <button type="button" class="primary" disabled={busy || !lookId || !which.length} onclick={make}>{current ? "Make the clips again" : "Make the avatar clips"}</button>
      </div>
    {/if}

    {#if current}
      <div class="clips">
        {#each current.segments as s}
          <!-- svelte-ignore a11y_media_has_caption -->
          <div><span class="label">{s.label}</span><video controls src={convertFileSrc(`${dir}/${s.file}`) + `?t=${stamp}`}></video></div>
        {/each}
      </div>
      <p class="hint">Next: build again at 4. Review and render, then render. The clips cover the first and the last scene.</p>
      <div class="actions">
        <button type="button" class="primary" disabled={busy || gate?.state === "approved"} onclick={approve}>{gate?.state === "approved" ? "Approved" : "Approve the avatar"}</button>
      </div>
    {/if}
  {/if}
</section>

<style>
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  h2 { margin: 0; font-size: 17px; }
  .actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 10px; }
  .grow { flex: 1; }
  .row { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 10px; }
  .choice { display: flex; gap: 6px; align-items: center; font-size: 14px; }
  .looks { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; max-height: 420px; overflow: auto; }
  .look { display: grid; gap: 4px; padding: 6px; border-radius: 8px; background: var(--muted); font-size: 12px; cursor: pointer; border: 2px solid transparent; }
  .look.on { border-color: var(--primary); }
  .look input { position: absolute; opacity: 0; }
  .look img, .noimg { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; display: grid; place-items: center; background: var(--border); }
  .name { font-weight: 600; }
  .group { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; display: grid; gap: 6px; }
  .ghead { display: flex; gap: 8px; align-items: center; }
  .ghead img { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
  .row-look { display: flex; gap: 10px; align-items: center; padding: 4px 6px; border-radius: 6px; cursor: pointer; font-size: 14px; }
  .row-look.on { background: var(--primary-surface); }
  .row-look img { width: 56px; height: 56px; border-radius: 6px; object-fit: cover; }
  details { margin-top: 8px; }
  .clips { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-top: 12px; }
  .clips div { display: grid; gap: 4px; }
  video { width: 100%; border-radius: 8px; margin-top: 8px; }
  .label { font-weight: 600; font-size: 14px; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
  .pill { font-size: 12px; padding: 3px 10px; border-radius: 99px; background: var(--muted); color: var(--muted-foreground); }
  .pill.approved { background: var(--success-surface); color: var(--success); }
  .pill.pending { background: var(--primary-surface); color: var(--primary-surface-foreground); }
  .pill.failed { background: var(--danger-surface); color: var(--danger-text); }
</style>
