<script lang="ts">
  // BubblePanel: the face bubble of a screen video, on the Recording tab (ITV Editor,
  // DECISIONS 184). A marked box: mark it again or skip. The avatar bubble: three ways,
  // and the paid one shows its price and spends nothing until the button is pressed.
  import { open as pickFile, save as saveFile } from "@tauri-apps/plugin-dialog";
  import { runner, errorText, type AppState } from "../api";
  import ErrorBox from "../ErrorBox.svelte";
  import BubbleMarker from "./BubbleMarker.svelte";

  type Box = { x: number; y: number; w: number; h: number };
  type Bubble = { mode: "camera" | "box" | "avatar"; box?: Box | null; skipped?: boolean; source?: string; state?: string; costUsd?: number };
  let { app, dir, bubble, screenFile, changed }: { app: AppState; dir: string; bubble: Bubble; screenFile: string; changed: () => Promise<void> } = $props();

  let error = $state("");
  let note = $state("");
  let marking = $state(false);
  let busy = $state("");
  let cost = $state<{ usd: number; seconds: number } | null>(null);
  let segments = $state<{ id: string; name: string; file: string }[] | null>(null);
  let segDir = $state("");
  let tool = $state("");

  const DEFAULT_BOX: Box = { x: 0.02, y: 0.62, w: 0.18, h: 0.32 };
  const lookId = $derived(app.config?.avatar?.lookId ?? null);
  const hasHeygen = $derived(!!app.keys["heygen"]);

  $effect(() => {
    if (bubble.mode === "avatar") runner<{ usd: number; seconds: number }>("recorded-bubble-cost", { projectDir: dir }).then((c) => (cost = c)).catch(() => (cost = null));
  });

  async function act(label: string, f: () => Promise<unknown>) {
    error = "";
    note = "";
    busy = label;
    try {
      await f();
      await changed();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }
  const mark = (box: Box | null) => act("Saving the box...", async () => {
    await runner("recorded-bubble-box", { projectDir: dir, box, skip: !box });
    marking = false;
    note = box ? "Saved. The pictures are prepared again with the zoom." : "Saved. This video does not zoom.";
  });
  const exportVoice = () => act("Saving the voice...", async () => {
    const out = await saveFile({ defaultPath: "voice-after-cuts.mp3", filters: [{ name: "Audio", extensions: ["mp3"] }] });
    if (!out) return;
    await runner("recorded-voice-export", { projectDir: dir, out });
    note = "Saved. Make a lip sync clip from this file in any tool, then bring it back here.";
  });
  const importClip = (source: "outside" | "heygen", file?: string) => act("Bringing the clip in...", async () => {
    const f = file ?? (await pickFile({ multiple: false, directory: false, filters: [{ name: "Video", extensions: ["mp4", "webm", "mov"] }] }));
    if (typeof f !== "string") return;
    await runner("recorded-bubble-clip", { projectDir: dir, file: f, source, tool });
    note = "The clip is in the bubble. Build the preview again to see it.";
  });
  const loadSegments = () => act("Loading your clips...", async () => {
    const r = await runner<{ segments: { id: string; name: string; file: string }[]; dir: string }>("segments-list", { identity: app.identity?.id });
    segments = r.segments;
    segDir = r.dir;
  });
  const makePaid = () => act("HeyGen is making the bubble. This takes a few minutes...", async () => {
    const r = await runner<{ made: boolean; error?: string }>("recorded-avatar-bubble", { projectDir: dir, lookId, approved: true, service: "heygen" });
    note = r.made ? "The avatar bubble is made. Build the preview again to see it." : `Not made, so this video is Screen only: ${r.error ?? ""}`;
  });
</script>

<section class="card bubble">
  <h3>The face bubble</h3>
  {#if error}<ErrorBox message={error} context={{ step: "bubble" }} />{/if}
  {#if note}<p class="good">{note}</p>{/if}
  {#if busy}<p class="busy" role="status">{busy}</p>{/if}

  {#if bubble.mode === "box"}
    {#if marking}
      <BubbleMarker file={screenFile} start={bubble.box ?? DEFAULT_BOX} done={(b) => mark(b)} skip={() => mark(null)} />
    {:else}
      <p class="hint">{bubble.box ? "Your bubble is marked: it stays in place while the screen zooms." : "The bubble is not marked, so this video does not zoom. Zooming would cut or move your face."}</p>
      <button type="button" disabled={!!busy} onclick={() => (marking = true)}>{bubble.box ? "Mark it again" : "Mark the bubble"}</button>
    {/if}
  {:else if bubble.mode === "avatar"}
    <p class="hint">{bubble.state === "made" ? "The avatar bubble is made." : bubble.state === "failed" ? "The avatar bubble was not made, so this video is Screen only. Try one of the ways below." : "Choose one way. Until then the video is Screen only."}</p>
    <div class="way">
      <b>1. Your HeyGen avatar speaks this video's voice</b>
      <span class="hint">Engine Avatar III. {cost ? `At most ${cost.usd.toFixed(2)} USD for ${Math.round(cost.seconds)} s.` : "The price shows after the cuts."} Nothing is spent until you press the button.</span>
      {#if !hasHeygen}<span class="stop">Needs your HeyGen key on Settings, Connections.</span>{:else if !lookId}<span class="stop">This Identity has no HeyGen avatar yet. Choose one on Identity, AI Avatar in IdeaToVideo.</span>{/if}
      <button type="button" class="primary" disabled={!!busy || !cost || !hasHeygen || !lookId} onclick={makePaid}>{cost ? `Make it at HeyGen, at most ${cost.usd.toFixed(2)} USD` : "Make it at HeyGen"}</button>
    </div>
    <div class="way">
      <b>2. A clip you already made in HeyGen</b>
      <span class="hint">One of this Identity's comment call clips, or any file you downloaded from HeyGen.</span>
      <div class="row">
        <button type="button" disabled={!!busy} onclick={loadSegments}>Choose from my clips</button>
        <button type="button" disabled={!!busy} onclick={() => importClip("heygen")}>Choose a file</button>
      </div>
      {#if segments}
        {#if !segments.length}<span class="hint">No clips yet.</span>{/if}
        {#each segments as s (s.id)}<button type="button" class="ghost" onclick={() => importClip("heygen", `${segDir}/${s.file}`)}>{s.name}</button>{/each}
      {/if}
    </div>
    <div class="way">
      <b>3. Any other tool, no API</b>
      <span class="hint">Save the cleaned voice (after the cuts, so the timing matches), make a lip sync clip from it, bring the clip back.</span>
      <input bind:value={tool} placeholder="Which tool made it (optional, for the license list)" aria-label="Tool name" />
      <div class="row">
        <button type="button" disabled={!!busy} onclick={exportVoice}>Save the voice</button>
        <button type="button" disabled={!!busy} onclick={() => importClip("outside")}>Bring the clip in</button>
      </div>
    </div>
  {/if}
</section>

<style>
  .bubble { display: grid; gap: 8px; }
  h3 { margin: 0; font-size: 16px; }
  .way { display: grid; gap: 6px; padding-top: 8px; border-top: 1px solid var(--border); }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 0; }
  .stop { font-size: 13px; color: var(--danger-text); }
  .good { font-size: 13px; color: var(--success); margin: 0; }
  .busy { font-size: 13px; margin: 0; }
</style>
