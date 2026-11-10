<script lang="ts">
  // NewRecording: ITV Editor's "A new recording" on Home (DECISIONS 184). What did you
  // record? Six choices in Zoltan's order; each asks only for its own files. The run
  // then goes as before: words on this computer, cuts by rule, the AI only improves the
  // plan, it stops at the Preview, nothing is published by itself.
  import { open as pickFile } from "@tauri-apps/plugin-dialog";
  import type { AppState } from "../api";
  import { runner, errorText } from "../api";
  import { log } from "../logger";
  import ErrorBox from "../ErrorBox.svelte";
  import BubbleMarker from "./BubbleMarker.svelte";
  import { KINDS, slotsFor, kindMissing, DEFAULT_BOX, type KindId, type Box } from "./kinds";

  let { app, openProject }: { app: AppState; openProject: (dir: string) => void } = $props();

  let kind = $state<KindId>("screen");
  let oneFile = $state(false);
  let files = $state<Record<string, string>>({});
  let title = $state("");
  let broll = $state(false);
  let marking = $state(false);
  let box = $state<Box | null>(null);
  let skipped = $state(false);
  let starting = $state(false);
  let error = $state("");

  const slots = $derived(slotsFor(kind, oneFile));
  const missing = $derived(kindMissing(kind, files, oneFile));
  const needsMark = $derived(kind === "screen-bubble" && oneFile && !!files.screen && !box && !skipped);
  const VIDEO = [{ name: "Video", extensions: ["mp4", "mov", "m4v", "mkv", "webm", "avi"] }];
  const nameOf = (f: string) => f.split(/[\\/]/).pop();

  function choose(k: KindId) {
    kind = k;
    files = {};
    box = null;
    skipped = false;
    marking = false;
  }
  async function pick(slot: string) {
    const f = await pickFile({ multiple: false, directory: false, filters: VIDEO });
    if (typeof f !== "string") return;
    files = { ...files, [slot]: f };
    if (kind === "screen-bubble" && oneFile && slot === "screen") {
      box = null;
      skipped = false;
      marking = true;
    }
  }
  async function start() {
    if (missing || starting || needsMark) return;
    starting = true;
    error = "";
    try {
      const keep = Object.fromEntries(slots.map((s) => s.id).filter((id) => files[id]).map((id) => [id, files[id]]));
      const mark = kind === "screen-bubble" && oneFile ? (box ? { box } : { skip: true }) : kind === "screen-avatar" ? { source: "heygen" } : null;
      const r = await runner<{ id: string; dir: string }>("recorded-video-new", { projectsDir: app.projectsDir, identity: app.identity?.id, language: app.config?.channel.contentLanguage ?? "en", files: keep, title, kind, mark, broll });
      await runner("autopilot-mark", { projectDir: r.dir, on: true });
      log("recorded_video", { kind, oneFile, broll, files: Object.keys(keep) });
      files = {};
      title = "";
      box = null;
      openProject(r.dir);
    } catch (e) {
      error = errorText(e);
    } finally {
      starting = false;
    }
  }
</script>

<section class="card make">
  <h2>A new recording</h2>
  <p class="hint">Words, cuts and render all happen on this computer. Your files are read, never changed.</p>
  {#if error}<ErrorBox message={error} context={{ step: "new-recording" }} />{/if}

  <h3>What did you record?</h3>
  <div class="kinds" role="radiogroup" aria-label="What did you record?">
    {#each KINDS as k, i (k.id)}
      <label class="kind" class:on={kind === k.id}>
        <input type="radio" name="kind" checked={kind === k.id} onchange={() => choose(k.id)} />
        <span><b>{i + 1}. {k.label}</b><span class="hint">{k.hint}</span></span>
      </label>
    {/each}
  </div>

  {#if kind === "screen-bubble"}
    <div class="opts" role="radiogroup" aria-label="How many files">
      <label><input type="radio" name="way" checked={!oneFile} onchange={() => { oneFile = false; files = {}; box = null; skipped = false; }} /> Two files, screen and camera: the app draws the bubble</label>
      <label><input type="radio" name="way" checked={oneFile} onchange={() => { oneFile = true; files = {}; box = null; skipped = false; }} /> One file that already has the bubble in it</label>
    </div>
  {/if}

  <div class="slots">
    {#each slots as s (s.id)}
      <div class="slot">
        <div class="what"><b>{s.label}</b><span class="hint">{files[s.id] ? nameOf(files[s.id]) : s.hint}</span></div>
        {#if files[s.id]}<button type="button" class="ghost" onclick={() => { const { [s.id]: _, ...rest } = files; files = rest; }}>Remove</button>{/if}
        <button type="button" onclick={() => pick(s.id)}>{files[s.id] ? "Change" : "Choose a file"}</button>
      </div>
    {/each}
  </div>

  {#if kind === "screen-bubble" && oneFile && files.screen}
    {#if marking}
      <BubbleMarker file={files.screen} start={box ?? DEFAULT_BOX} done={(b) => { box = b; skipped = false; marking = false; }} skip={() => { box = null; skipped = true; marking = false; }} />
    {:else}
      <p class="hint">{box ? "The bubble is marked: it stays in place while the screen zooms." : "The bubble is not marked, so this video will not zoom: zooming would cut or move your face."} <button type="button" class="link" onclick={() => (marking = true)}>{box ? "Mark it again" : "Mark the bubble"}</button></p>
    {/if}
  {/if}

  {#if kind === "screen-avatar"}
    <p class="hint">After the cuts you choose where the face comes from: your HeyGen avatar (its price shows first, nothing is spent before you press the button), a clip already made in HeyGen, or a lip sync clip from any tool. If none is made, the video is Screen only.</p>
  {/if}

  <label class="check"><input type="checkbox" bind:checked={broll} /> Use my own Footage clips as B-roll in this video</label>
  <input bind:value={title} aria-label="Working title" placeholder="Working title (optional)" />
  <p class="hint">What you type here stays. Empty: the file's name, and with an AI key the AI gives it a title from what you said.</p>
  <div class="actions">
    <span class="hint">{missing ?? (needsMark ? "Mark the bubble, or skip it." : "It stops at the preview for your approval. Nothing is ever published by itself.")}</span>
    <button type="button" class="primary big" disabled={starting || !!missing || needsMark} onclick={start}>{starting ? "Starting..." : "Edit the recording"}</button>
  </div>
</section>

<style>
  .make { display: grid; gap: 8px; }
  h2 { margin: 0; font-size: 17px; }
  h3 { margin: 8px 0 0; font-size: 15px; }
  .kinds { display: grid; gap: 6px; }
  .kind { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; }
  .kind.on { border-color: var(--primary); background: var(--primary-surface); }
  .kind > span { display: grid; gap: 2px; }
  .opts { display: grid; gap: 4px; font-size: 14px; }
  .opts label, .check { display: flex; gap: 8px; align-items: center; font-size: 14px; }
  .slots { display: grid; gap: 8px; }
  .slot { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; padding: 8px 0; border-top: 1px solid var(--border); }
  .what { display: grid; gap: 2px; min-width: 0; }
  .make > input { width: 100%; box-sizing: border-box; }
  .actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .big { font-size: 16px; padding: 10px 22px; white-space: nowrap; }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 0; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; min-height: 0; }
</style>
