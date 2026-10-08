<script lang="ts">
  // Gate 5 in the runner, the Avatar tab in the app, optional: an avatar says
  // the opening and/or the closing, lip-synced to your own narration
  // (DECISIONS 47, 61). Pick a person and a look (LookPicker), see the cost
  // estimate and your balance, make the clips, approve; or go on without an
  // avatar. The list with its pictures is loaded in the background when the
  // ONE Video opens (avatars.ts), so the tab is ready. Autopilot never adds
  // an avatar: it costs HeyGen credits.
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { ask } from "@tauri-apps/plugin-dialog";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { onDestroy } from "svelte";
  import ErrorBox from "./ErrorBox.svelte";
  import Advanced from "./Advanced.svelte";
  import Progress from "./Progress.svelte";
  import Needs from "./Needs.svelte";
  import LayoutPicker from "./LayoutPicker.svelte";
  import EnginePicker from "./EnginePicker.svelte";
  import { chooseEngine, engineLabel, type AvatarEngine } from "./avatarEngines";
  import LookPicker, { type Group, type Look } from "./LookPicker.svelte";
  import type { AvatarLayout, AppState, Gate } from "./api";
  import { runner, onProgress, errorText } from "./api";
  import { running } from "./work.svelte";
  import { avatarLooks } from "./avatars";
  import type { TabId } from "./tabs";

  type Segment = { name: string; label: string; start: number; duration: number; file?: string };
  type Plan = { segments: Segment[]; current: { lookId: string; engine?: AvatarEngine; format?: string; layout?: AvatarLayout; note?: string | null; segments: Segment[] } | null; estimate: { low: number; high: number }; estimates?: Record<string, { low: number; high: number; guess?: boolean }>; account: { kind?: string; remaining?: number | null; currency?: string | null; error?: string } | null };

  let { app, dir, gate, scenesApproved, look = "blue-professional", changed, goto }: { app: AppState; dir: string; gate?: Gate; scenesApproved: boolean; look?: string; changed: () => Promise<void>; goto: (t: TabId) => void } = $props();

  const hasKey = $derived(!!app.keys["heygen"]);
  const COMMANDS = ["make-avatar", "avatar-layout", "remove-avatar"];
  const job = $derived(running(dir, COMMANDS));
  let busy = $state(false);
  const locked = $derived(busy || !!job);

  let own = $state<Group[]>([]);
  let stock = $state<Look[]>([]);
  let plan = $state<Plan | null>(null);
  let lookId = $state("");
  // per video; starts from the clips already made, else the last used, else the Settings default (Avatar III when none)
  let engine = $state<AvatarEngine | undefined>();
  let which = $state<string[]>(["open", "close"]);
  let loading = $state(false);
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
  const allLooks = $derived([...own.flatMap((g) => g.looks), ...stock]);
  const chosenLook = $derived(allLooks.find((l) => l.id === lookId) ?? null);
  const picked = $derived(chooseEngine(engine, chosenLook?.engines));
  const rate = $derived((plan?.estimates?.[picked.engine] ?? plan?.estimate ?? { low: 0, high: 0 }) as { low: number; high: number; guess?: boolean });
  const approved = $derived(gate?.state === "approved");
  const skipped = $derived(gate?.state === "skipped");

  // "Previously used" (per Identity, runner last-used): the look this brand
  // used last is chosen.
  async function start() {
    loading = true;
    error = "";
    try {
      ({ own, stock } = await avatarLooks());
      plan = await runner<Plan>("avatar-plan", { projectDir: dir, service: "heygen" });
      let used: { lookId?: string; layout?: AvatarLayout; engine?: AvatarEngine } | undefined;
      try {
        used = (await runner<{ used: { avatar?: { lookId: string; layout?: AvatarLayout; engine?: AvatarEngine } } }>("last-used", {})).used.avatar;
      } catch {
        used = undefined;
      }
      const known = (id?: string | null) => !!id && allLooks.some((l) => l.id === id);
      lookId = plan.current?.lookId ?? (known(used?.lookId) ? used!.lookId! : null) ?? app.config?.avatar?.lookId ?? own.flatMap((g) => g.looks)[0]?.id ?? stock[0]?.id ?? "";
      const a = app.config?.avatar;
      engine = plan.current?.engine ?? used?.engine ?? a?.engine;
      layout = { ...(plan.current?.layout ?? used?.layout ?? { style: a?.style ?? "cutout", position: a?.position ?? "bottom-right", size: a?.size ?? "medium" }) };
    } catch (e) {
      error = errorText(e);
    } finally {
      loading = false;
    }
  }
  $effect(() => {
    if (scenesApproved && hasKey) start();
  });

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

  let clips = $state<HTMLElement>();
  async function make() {
    const cost = plan ? `about $${(rate.low * scale).toFixed(2)} to $${(rate.high * scale).toFixed(2)} with ${engineLabel(picked.engine)}` : "a few dollars";
    if (!(await ask(`${current ? "Make the avatar clips again? The ones you have now are replaced. " : ""}Make ${Math.round(seconds)} seconds of avatar video on HeyGen? It costs ${cost} from your HeyGen API balance.`, { title: "Avatar", kind: "info" }))) return;
    busy = true;
    error = "";
    step = "Starting...";
    try {
      await runner("make-avatar", { projectDir: dir, service: "heygen", lookId, lookName: chosenLook?.name ?? null, which, look, layout: { ...layout }, engine: picked.engine, lookEngines: chosenLook?.engines ?? [] });
      plan = await runner<Plan>("avatar-plan", { projectDir: dir, service: "heygen" });
      stamp = Date.now();
      await changed();
      setTimeout(() => clips?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
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
    if (!(await ask("Remove the avatar clips from this video? Making them again costs HeyGen credits.", { title: "Remove the avatar", kind: "warning" }))) return;
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

  async function skip() {
    busy = true;
    error = "";
    try {
      await runner("skip-gate", { projectDir: dir, gate: "avatar" });
      await changed();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  async function approve() {
    busy = true;
    try {
      await runner("approve-gate", { projectDir: dir, gate: "avatar" });
      await changed();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  const money = (a: Plan["account"]) =>
    !a || a.error ? (a?.error ?? "") : a.remaining === null || a.remaining === undefined ? "" : a.currency === "usd" ? `Your HeyGen API balance: $${a.remaining.toFixed(2)}.` : `Your HeyGen credits: ${a.remaining}.`;
</script>

<section class="card">
  <h2>4. Avatar <span class="opt">optional</span></h2>
  <p class="hint lead">An avatar can say the opening and the closing, lip-synced to your narration. It costs HeyGen credits; you see the price first. Without it the video is complete.</p>

  {#if !scenesApproved}
    <Needs text="The avatar clips are cut to the first and the last scene. Approve the scenes first." tab="scenes" {goto} />
  {:else if !hasKey}
    <p class="hint">An avatar needs a HeyGen API key (Settings). Without it, go on: the video is complete without an avatar.</p>
    <div class="actionbar">
      <span class="say">{skipped ? "Without an avatar. Next: 5. Preview." : "No HeyGen key: the video goes on without an avatar."}</span>
      <button type="button" class="primary" disabled={locked} onclick={() => (skipped ? goto("preview") : skip())}>{skipped ? "Go to 5. Preview" : "Continue without an avatar"}</button>
    </div>
  {:else}
    {#if loading}<Progress command="avatar-looks" label="Loading your avatars and their pictures (faster next time)" reveal={false} />{/if}
    {#if job === "make-avatar"}<Progress command="make-avatar" project={dir} label={step || "HeyGen is making the avatar clips"} />{/if}
    {#if error}<ErrorBox message={error} context={{ step: "avatar", provider: "heygen" }} />{/if}

    {#if own.length || stock.length}
      <div class="grid">
        <div>
          <div class="row"><span class="label grow">Who says it</span><button type="button" class="link" onclick={() => openUrl("https://app.heygen.com/avatars")}>Make or change avatars in HeyGen</button></div>
          <LookPicker {own} {stock} bind:value={lookId} disabled={locked} preview={showPreview} />
          <!-- svelte-ignore a11y_media_has_caption -->
          {#if preview}<video controls autoplay src={preview}></video>{/if}
        </div>
        {#if plan}
          <div>
            <EnginePicker bind:engine supported={chosenLook?.engines ?? null} disabled={locked} />
            <span class="label">Where and how big</span>
            <LayoutPicker bind:style={layout.style} bind:position={layout.position} bind:size={layout.size} disabled={locked} cutoutNote={current && current.format !== "webm" ? "The clips you have now are not transparent: a cut-out needs new clips." : ""} />
            {#if layoutChanged}<button type="button" disabled={locked} onclick={applyLayout}>Use this place and size (no new clips, free)</button>{/if}
            <span class="label">When it speaks</span>
            <div class="row wrap">
              {#each plan.segments as s}
                <label class="choice"><input type="checkbox" bind:group={which} value={s.name} disabled={locked} /> {s.label}: {s.duration.toFixed(1)} s</label>
              {/each}
            </div>
            <p class="hint">For {Math.round(seconds)} s with {engineLabel(picked.engine)}: about ${(rate.low * scale).toFixed(2)} to ${(rate.high * scale).toFixed(2)}{rate.guess ? " (a guess: HeyGen has not published this price)" : ""}, depending on the avatar. {money(plan.account)}</p>
            {#if current?.note}<p class="hint">{current.note}</p>{/if}
          </div>
        {/if}
      </div>
    {/if}

    {#if current}
      <div class="clips" bind:this={clips}>
        {#each current.segments as s}
          <!-- svelte-ignore a11y_media_has_caption -->
          <div><span class="label">{s.label}</span><video controls src={convertFileSrc(`${dir}/${s.file}`) + `?t=${stamp}`}></video></div>
        {/each}
      </div>
    {/if}

    <div class="actionbar">
      {#if approved}
        <span class="say"><b>Approved.</b> Next: 5. Preview.</span>
      {:else if skipped && !current}
        <span class="say"><b>Without an avatar.</b> You can still add one. Next: 5. Preview.</span>
      {:else if current}
        <span class="say">Watch the clips. Happy with them? Approve them.</span>
      {:else}
        <span class="say">Pick who says it, then make the clips. Or go on without an avatar.</span>
      {/if}
      {#if current || skipped || approved}
        <Advanced>
          {#if current}<button type="button" disabled={locked} onclick={remove}>Remove the avatar</button>{/if}
          <button type="button" disabled={locked || !lookId || !which.length || !plan} onclick={make}>{current ? "Make the clips again" : "Make the avatar clips"}</button>
        </Advanced>
      {:else}
        <!-- no default (DECISIONS 120): both ways side by side -->
        <button type="button" disabled={locked || !lookId || !which.length || !plan} onclick={make}>Make the avatar clips (HeyGen)</button>
        <button type="button" class="primary" disabled={locked} onclick={skip}>Continue without an avatar</button>
      {/if}
      {#if current && !approved}<button type="button" class="primary" disabled={locked} onclick={approve}>Approve and continue</button>{/if}
      {#if approved || (skipped && !current)}<button type="button" class="primary" onclick={() => goto("preview")}>Go to 5. Preview</button>{/if}
    </div>
  {/if}
</section>

<style>
  h2 { margin: 0 0 4px; font-size: 17px; }
  .opt { font-size: 12px; font-weight: 400; color: var(--muted-foreground); }
  .lead { margin: 0 0 12px; }
  /* the picker on top, full width; place, size and timing under it */
  .grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
  .row { display: flex; gap: 8px; align-items: center; }
  .wrap { flex-wrap: wrap; gap: 14px; margin-bottom: 6px; }
  .grow { flex: 1; }
  .choice { display: flex; gap: 6px; align-items: center; font-size: 14px; }
  .clips { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-top: 12px; scroll-margin-top: 10px; }
  .clips div { display: grid; gap: 4px; }
  video { width: 100%; max-height: 240px; border-radius: 8px; margin-top: 8px; background: #000; }
  .label { display: block; font-weight: 600; font-size: 14px; margin: 8px 0 4px; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
</style>
