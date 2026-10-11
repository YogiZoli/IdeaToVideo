<script lang="ts">
  // Gate 1, the script: Recommended (the AI writes it), Custom (edit it, or
  // write or paste your own: no AI needed, Zoltan 2026-10-05: "when Gemini is
  // out of tokens I cannot go on"), Approve. The comment calls and the vidIQ
  // keyword ideas sit above the script.
  import { ask } from "@tauri-apps/plugin-dialog";
  import { onDestroy, untrack } from "svelte";
  import ErrorBox from "./ErrorBox.svelte";
  import Advanced from "./Advanced.svelte";
  import Progress from "./Progress.svelte";
  import DictionaryFindings from "./brand/DictionaryFindings.svelte";
  import VideoCalls from "./cta/VideoCalls.svelte";
  import Packaging from "./Packaging.svelte";
  import HumanizeSlider from "./HumanizeSlider.svelte";
  import StepModel from "./StepModel.svelte";
  import { llmFor } from "./llm";
  import type { AppState, Gate, CtaProfile, CtaSlot } from "./api";
  import { runner, onProgress, errorText } from "./api";
  import { pendingHeygen, makeHeygenClip, priceText } from "./cta/clips";
  import { running } from "./work.svelte";

  type Kw = { keyword: string; monthlySearches: number | null; competition: number | null; score: number | null; growthPct: number | null };
  let {
    app,
    dir,
    title,
    gate,
    markdown,
    briefLength,
    hasBrief,
    fromCourse = false,
    calls,
    changed,
    saved,
    goto,
    openPage,
  }: {
    app: AppState;
    dir: string;
    title: string;
    gate?: Gate;
    markdown: string | null;
    briefLength?: number;
    hasBrief: boolean;
    fromCourse?: boolean;
    calls: { slot: CtaSlot; keyword: string; temperature: string }[] | null;
    changed: () => Promise<void>;
    saved: (s: AppState) => void;
    goto?: (t: "voice") => void;
    openPage?: (page: "cta" | "connections" | "voice") => void;
  } = $props();

  const COMMANDS = ["write-script", "save-script", "keyword-ideas"];
  const job = $derived(running(dir, COMMANDS));
  let busy = $state(false);
  const locked = $derived(busy || !!job);

  let draft = $state(untrack(() => markdown ?? ""));
  $effect(() => {
    // a new script from the runner replaces the draft
    draft = markdown ?? "";
  });
  let length = $state(untrack(() => briefLength ?? app.config?.defaults?.targetLengthMin ?? 8));
  let error = $state("");
  let notice = $state("");
  let step = $state("");
  // "Write it myself": the empty editor without an AI script
  let own = $state(false);

  const dirty = $derived(draft !== (markdown ?? "") && draft.trim() !== "");
  const stepLlm = $derived(llmFor(app.config, "script"));
  const llmContext = $derived({ step: "script", provider: stepLlm.provider, model: stepLlm.model });
  const approved = $derived(gate?.state === "approved");

  const unlisten = onProgress((p) => {
    if (p.command !== "write-script") return;
    step = p.progress.step === "repairing" ? "Fixing a few style problems..." : "Writing the script...";
  });
  onDestroy(() => unlisten.then((f) => f()));

  // Optional (DECISIONS 64): keyword ideas from vidIQ for the title.
  let keywords = $state<Kw[]>([]);
  let keyword = $state("");
  let kwBusy = $state(false);
  const canVidiq = $derived(!!app.keys["vidiq"] && app.config?.research?.vidiq !== false);
  async function keywordIdeas() {
    kwBusy = true;
    error = "";
    try {
      keywords = (await runner<{ keywords: Kw[] }>("keyword-ideas", { service: "vidiq", keyword: title })).keywords;
    } catch (e) {
      error = errorText(e);
    } finally {
      kwBusy = false;
    }
  }

  // Optional (DECISIONS 88): the creator's own story or opinion for this
  // video, and the natural-voice pass, the Identity's level unless changed.
  let angle = $state("");
  let humanize = $state<"off" | "light" | "strong">(untrack(() => app.config?.channel.humanize ?? "off"));

  // This video's own comment calls, null = the Identity's.
  let ownCalls = $state<CtaProfile | null>(null);

  let result = $state<HTMLElement>();
  async function writeRecommended() {
    if (markdown && !(await ask("Write a new script? The current one and every later step will be replaced. This uses AI tokens.", { title: "Write again", kind: "warning" }))) return;
    busy = true;
    error = "";
    notice = "";
    step = "Starting...";
    try {
      await heygenClips();
      const r = await runner<{ words: number; humanizeNote?: string | null }>("write-script", {
        projectDir: dir,
        llm: stepLlm,
        input: { topic: title, targetLengthMin: length, humanize, ...(angle.trim() ? { angle: angle.trim() } : {}), ...(keyword ? { keyword } : {}), ...(ownCalls ? { cta: $state.snapshot(ownCalls) } : {}) },
        channel: app.config!.channel,
      });
      notice = `Script ready, ${r.words} words. Read it, change what you like, then approve it below.${r.humanizeNote ? ` ${r.humanizeNote}` : ""}`;
      await changed();
      setTimeout(() => result?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) {
      error = errorText(e);
      await changed();
    } finally {
      busy = false;
      step = "";
    }
  }

  // "Generate with HeyGen" (Wizards, CTA; D5, DECISIONS 119): a keyword of
  // this script without a clip yet gets it now, before the script, so the
  // script leaves that call to the clip. Asked first, with the price; no or
  // an error: the narrator says it this time.
  async function heygenClips() {
    const pend = await pendingHeygen(app, ownCalls ? ($state.snapshot(ownCalls) as never) : null).catch(() => []);
    if (!pend.length) return;
    const engine = app.identity?.avatar?.engine ?? app.config?.avatar?.engine ?? null;
    const list = pend.map((p) => `${p.keyword} (${priceText(p.text, engine)})`).join(", ");
    if (!(await ask(`HeyGen makes the comment call clip for ${list} first, then the script is written. It takes a few minutes and uses HeyGen credits. Make it now? No: the narrator says it this time.`, { title: "Generate with HeyGen", kind: "info" }))) return;
    for (const p of pend) {
      step = `HeyGen makes the ${p.keyword} clip. This takes a few minutes...`;
      try {
        await makeHeygenClip(app, p.keyword, p.text);
      } catch (e) {
        notice = `The ${p.keyword} clip could not be made, so the narrator says it: ${errorText(e)}`;
      }
    }
  }

  async function saveCustom() {
    busy = true;
    error = "";
    try {
      await runner("save-script", { projectDir: dir, markdown: draft });
      notice = "Your script is saved.";
      own = false;
      await changed();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  async function approve() {
    busy = true;
    error = "";
    try {
      if (dirty) await runner("save-script", { projectDir: dir, markdown: draft });
      await runner("approve-gate", { projectDir: dir, gate: "script" });
      await changed();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  const words = $derived(draft.trim() ? draft.trim().split(/\s+/).length : 0);
  const editing = $derived(markdown !== null || own || gate?.state === "failed");
</script>

<section class="card">
  <h2>1. Script</h2>
  <p class="hint lead">What the narrator will say. The AI writes it from your title, your Audience and your Brand Voice, or you write it yourself.</p>

  <StepModel {app} step="script" {saved} disabled={locked} />
  <div class="controls">
    <label for="len">Length</label>
    <input id="len" type="number" min="1" max="30" bind:value={length} disabled={locked} />
    <span class="hint">minutes</span>
  </div>

  <VideoCalls {app} bind:own={ownCalls} used={calls} disabled={locked} {openPage} />

  <details class="angle">
    <summary>Your own angle and natural voice <span class="hint">(optional{angle.trim() ? ", angle added" : ""}{humanize !== "off" ? `, natural voice ${humanize}` : ""})</span></summary>
    <label for="angle" class="label">Your own angle</label>
    <textarea id="angle" rows="3" bind:value={angle} disabled={locked} placeholder="A story, an opinion or an example of yours for this topic, in a few sentences. The AI builds the script around it. Leave it empty if you like."></textarea>
    <HumanizeSlider bind:value={humanize} id="humanize-video" disabled={locked} compact />
  </details>

  {#if canVidiq}
    <div class="controls">
      <span class="hint grow">{keyword ? `Keyword for the script: "${keyword}"` : "Optional: pick a search keyword for the script."}</span>
      <button type="button" disabled={kwBusy || locked} onclick={keywordIdeas}>{kwBusy ? "Asking vidIQ..." : "Keyword ideas (vidIQ)"}</button>
    </div>
    {#if keywords.length}
      <div class="kwbox">
        <table class="kw">
          <thead><tr><th>Keyword</th><th>Monthly searches</th><th>Competition</th><th>Score</th><th></th></tr></thead>
          <tbody>
            {#each keywords.slice(0, 12) as k}
              <tr class:on={keyword === k.keyword}>
                <td>{k.keyword}</td>
                <td>{k.monthlySearches?.toLocaleString("en-US") ?? ""}</td>
                <td>{k.competition ?? ""}</td>
                <td>{k.score ?? ""}</td>
                <td><button type="button" class="ghost" onclick={() => (keyword = keyword === k.keyword ? "" : k.keyword)}>{keyword === k.keyword ? "Chosen" : "Use"}</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="hint">Score: vidIQ's opportunity score (higher is better). Competition: how many videos target it (lower is easier).</p>
    {/if}
  {/if}

  {#if job === "write-script"}<Progress command="write-script" project={dir} label={step || "Writing the script"} />{/if}
  {#if error}
    <ErrorBox message={error} context={llmContext} />
    {#if !markdown}<p class="hint">You can go on without the AI: click "Write it myself" and paste or type your script.</p>{/if}
  {:else if gate?.state === "failed" && gate.error}
    <ErrorBox message={`Last attempt failed: ${gate.error}`} context={llmContext} />
  {/if}
  {#if notice && !error}<p class="good">{notice}</p>{/if}

  {#if editing}
    <div bind:this={result}>
      <label for="script" class="label">Script {markdown ? "(you can edit it)" : "(write or paste it here)"}</label>
      <textarea id="script" bind:value={draft} disabled={locked} spellcheck="true" placeholder={"## Opening\nWhat the narrator says first...\n\n## Main part\n...\n\n## Closing\n..."}></textarea>
      <p class="hint">{words} words, about {Math.max(1, Math.round(words / 150))} minute{Math.round(words / 150) > 1 ? "s" : ""} of narration. Lines starting with ## are section titles; they are not read aloud.</p>
      <DictionaryFindings {dir} version={markdown} only="script" />
      {#if markdown}<Packaging {app} {dir} version={markdown} disabled={locked} {changed} />{/if}
    </div>
  {:else}
    <p class="hint">Click "Write script" and the AI writes it in about a minute{fromCourse ? ", from the course lesson (its hook, what to teach, the exercise, the check and the closing line)" : hasBrief ? ", from the Video Brief Card too" : ""}. Your landing page link goes into the YouTube description, never into the narration. No AI at hand? Write it yourself.</p>
  {/if}

  <div class="actionbar">
    {#if approved && !dirty}
      <span class="say"><b>Approved.</b> Next: 2. Voice and music.</span>
    {:else if editing}
      <span class="say">Read it through. Happy with it? Approve it, and the voice comes next.</span>
    {:else}
      <span class="say">The first step: the words of your video.</span>
    {/if}
    {#if !editing}
      <Advanced><button type="button" disabled={locked} onclick={() => (own = true)}>Write it myself</button></Advanced>
      <button type="button" class="primary" disabled={locked} onclick={writeRecommended}>Write script (Recommended)</button>
    {:else}
      <Advanced>
        <button type="button" disabled={locked} onclick={writeRecommended}>{markdown ? "Write a new one with AI" : "Write it with AI"}</button>
        {#if dirty}<button type="button" disabled={locked} onclick={saveCustom}>Save my edits</button>{/if}
      </Advanced>
      {#if !approved || dirty}
        <button type="button" class="primary" disabled={locked || !draft.trim()} onclick={approve}>Approve and continue</button>
      {:else}
        <button type="button" class="primary" onclick={() => goto?.("voice")}>Go to 2. Voice and music</button>
      {/if}
    {/if}
  </div>
</section>

<style>
  h2 { margin: 0 0 4px; font-size: 17px; }
  .lead { margin: 0 0 12px; }
  .controls { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
  .controls input { width: 70px; }
  .grow { flex: 1; }
  .kwbox { max-height: 240px; overflow: auto; }
  .angle { margin: 4px 0 10px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; }
  .angle summary { cursor: pointer; font-weight: 600; font-size: 14px; }
  .angle textarea { width: 100%; height: auto; min-height: 70px; font-family: inherit; font-size: 14px; }
  .kw { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 6px; }
  .kw th { text-align: left; color: var(--muted-foreground); font-weight: 600; padding: 4px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--surface); }
  .kw td { padding: 4px; border-bottom: 1px solid var(--border); }
  .kw tr.on { background: var(--primary-surface); }
  .label { display: block; font-weight: 600; font-size: 14px; margin: 12px 0 6px; }
  /* the script scrolls in its own box, so the page fits one screen */
  textarea { width: 100%; height: max(220px, calc(100vh - 470px)); font-family: var(--font-mono); font-size: 13px; line-height: 1.5; resize: vertical; }
  .hint { color: var(--muted-foreground); font-size: 13px; }
  .good { color: var(--success); }
</style>
