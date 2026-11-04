<script lang="ts">
  // ChannelWizard: the YouTube Brand Channel Wizard (DECISIONS 174), for the active Identity, in the
  // shared WizardShell. The same 13 questions as Zoltan's lead magnet, one per screen, then keywords
  // (optional), the kit and Save. The questions and everything made from the answers come from the
  // runner (channelwizard/kit.mjs). With an AI key the "Write it with AI" buttons write a first text
  // from a few words (suggest-channel); with none, everything still works by hand. This wizard never
  // calls YouTube: the user pastes the texts in themselves. Not the Design wizard (colors and fonts).
  import { onMount, onDestroy } from "svelte";
  import { save as saveDialog } from "@tauri-apps/plugin-dialog";
  import type { AppState, Config } from "../api";
  import { runner, errorText } from "../api";
  import { errorCode } from "../errors";
  import { LANGUAGES } from "../catalog";
  import { aiWithKey, llmFor } from "../llm";
  import { log } from "../logger";
  import WizardShell from "../wizard/WizardShell.svelte";
  import WizardMap from "../wizard/WizardMap.svelte";
  import ErrorBox from "../ErrorBox.svelte";
  import Progress from "../Progress.svelte";
  import KeywordIdeas from "../planner/KeywordIdeas.svelte";

  type Field = { field: string; label: string; now: string; value: string; editable: boolean };
  type Question = { id: string; short: string; phase: number; type: string; key?: string; ai?: boolean; title: string; why: string; label?: string; ph?: string; opts?: string[][] };
  type Kept = { keywords: number; playlists: number; videos: number } | null;
  type Kw = { keyword: string; volume: number | null; competition: string; score: number | null; seed: string };
  type KitTexts = { names: string; tagline: string; description: string; about: string; links: string; logoPrompt: string; bannerPrompt: string };
  type Kit = { auto: KitTexts; kit: KitTexts; name: string; handles: string[]; checklist: { name: string; items: { id: string; text: string; path: string }[] }[]; checklistText: string; pathNote: string; fields: Field[]; missing: string[]; markdown: string; hasCard: boolean; kept: Kept };

  let { app, config, onclose, onsaved, goto }: {
    app: AppState;
    config: Config;
    onclose: () => void;
    // the ticked fields, for the Identity's own settings, and a sentence for the page
    onsaved: (fields: { field: string; value: string }[], text: string) => void;
    goto: (page: "connections") => void;
  } = $props();

  let questions = $state<Question[]>([]);
  let phases = $state<string[]>([]);
  let a = $state<Record<string, string>>({});
  let texts = $state<Record<string, string>>({});
  let keywords = $state<Kw[]>([]);
  let checks = $state<Record<string, boolean>>({});
  let take = $state<Record<string, boolean>>({});
  let kit = $state<Kit | null>(null);
  let step = $state(0);
  let loaded = $state(false);
  let busy = $state(false);
  let writing = $state("");
  let error = $state("");
  let note = $state("");
  let copied = $state("");

  const steps = $derived([...questions.map((q) => ({ id: q.id, title: q.short })), { id: "keywords", title: "Keywords" }, { id: "kit", title: "Your kit" }, { id: "save", title: "Preview and save" }]);
  const current = $derived(steps[step]?.id ?? "");
  const q = $derived(questions[step] as Question | undefined);
  // any saved key will do: chat() goes on to the next one too
  const ai = $derived(aiWithKey(llmFor(config, "texts"), app.keys));
  const hasWords = $derived(Object.values(a).some((v) => typeof v === "string" && v.trim()));
  const search = $derived((a.phrases ?? "").split(/\r?\n/)[0]?.trim() || a.topic || "");

  const input = () => ({ answers: $state.snapshot(a), texts: $state.snapshot(texts), keywords: $state.snapshot(keywords), checks: $state.snapshot(checks) });

  onMount(async () => {
    try {
      const s = await runner<{ questions: Question[]; phases: string[]; draft: { answers: Record<string, string>; texts: Record<string, string>; keywords: Kw[]; checks: Record<string, boolean> } | null }>("channel-wizard-state", {});
      questions = s.questions;
      phases = s.phases;
      a = { lang: config.channel.contentLanguage ?? "en", color: "#17C05B", youtube: config.channel.youtubeUrl ?? "", ...(s.draft?.answers ?? {}) };
      texts = s.draft?.texts ?? {};
      keywords = s.draft?.keywords ?? [];
      checks = s.draft?.checks ?? {};
      loaded = true;
    } catch (e) {
      error = errorText(e);
    }
  });

  // The answers stay with the Identity as they are typed, so Close never loses them.
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  async function flush() {
    if (!dirty) return;
    dirty = false;
    clearTimeout(timer);
    try {
      await runner("channel-wizard-draft", input());
    } catch (e) {
      log("channel_wizard_draft_failed", { error: String(e) }, "warn");
    }
  }
  function changed() {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(flush, 800);
  }
  onDestroy(flush);

  function close() {
    flush();
    onclose();
  }

  async function refresh() {
    try {
      const k = await runner<Kit>("channel-wizard-kit", { ...input(), channel: $state.snapshot(config.channel) });
      kit = k;
      // first sight of a field: an empty one is ticked, one you already filled is not
      for (const f of k.fields) if (take[f.field] === undefined) take[f.field] = !f.now;
    } catch (e) {
      error = errorText(e);
    }
  }
  // the kit and the preview always show the answers as they are now
  $effect(() => {
    if (current === "kit" || current === "save") refresh();
  });
  $effect(() => {
    if (current) flush();
  });

  // Write it with AI: the words stay in the DATA block (gates/channel), the text comes back to edit.
  async function write(field: string, words: string, put: (text: string) => void) {
    if (!ai) return;
    writing = field;
    error = "";
    note = "";
    try {
      const r = await runner<{ text: string; warning?: string }>("suggest-channel", { llm: ai, field, words, answers: $state.snapshot(a), channel: $state.snapshot(config.channel) });
      put(r.text);
      note = r.warning ?? "";
      changed();
      log("channel_wizard_ai", { field, chars: r.text.length });
    } catch (e) {
      const t = errorText(e);
      if (errorCode(t) !== "ITV-STOPPED") error = t;
    } finally {
      writing = "";
    }
  }

  async function writeKit(k: keyof KitTexts) {
    await write(k, kit?.kit[k] ?? "", (text) => (texts[k] = text));
    refresh();
  }
  const FIELD_TEXT: Record<string, string> = { audience: "audienceText", brandVoice: "voiceText", profile: "profileText" };
  async function writeField(f: Field) {
    await write(FIELD_TEXT[f.field], f.value, (text) => (texts[FIELD_TEXT[f.field]] = text));
    refresh();
  }

  function found(list: { keyword: string; monthlySearches: number | null; competition: number | null; score: number | null }[], seed: string) {
    const known = new Set(keywords.map((k) => k.keyword.toLowerCase()));
    keywords = [...keywords, ...list.filter((k) => !known.has(k.keyword.toLowerCase())).map((k) => ({ keyword: k.keyword, volume: k.monthlySearches, competition: k.competition === null ? "" : String(k.competition), score: k.score, seed }))];
    changed();
  }

  async function copy(id: string, text: string) {
    error = "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // a window without clipboard rights: the older way still works
      const box = document.createElement("textarea");
      box.value = text;
      box.style.position = "fixed";
      box.style.opacity = "0";
      document.body.appendChild(box);
      box.select();
      const ok = document.execCommand("copy");
      box.remove();
      if (!ok) {
        error = "The text could not be copied. Select it and copy it by hand.";
        return;
      }
    }
    copied = id;
    setTimeout(() => { if (copied === id) copied = ""; }, 1600);
    log("channel_wizard_copy", { what: id });
  }

  async function download() {
    const name = `${(app.identity?.name ?? "channel").replace(/[\\/:*?"<>|]+/g, " ").trim() || "channel"}-traffic-card.md`;
    const file = await saveDialog({ title: "Evergreen Traffic Card", defaultPath: name, filters: [{ name: "Traffic Card", extensions: ["md"] }] });
    if (typeof file !== "string") return;
    error = "";
    try {
      await runner("channel-wizard-export", { ...input(), file });
      note = `Saved as ${file}.`;
    } catch (e) {
      error = errorText(e);
    }
  }

  async function save() {
    if (current !== "save") {
      step = steps.length - 1;
      return;
    }
    busy = true;
    error = "";
    try {
      await refresh();
      await runner("channel-wizard-save", input());
      dirty = false;
      const fields = (kit?.fields ?? []).filter((f) => take[f.field]).map((f) => ({ field: f.field, value: f.value }));
      log("channel_wizard_saved", { fields: fields.map((f) => f.field), keywords: keywords.length });
      onsaved(fields, `Your Evergreen Traffic Card is saved${fields.length ? ` and ${fields.length} ${fields.length === 1 ? "field" : "fields"} of this Identity filled` : ""}. The Playlist Planner reads the card.`);
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  const KIT_ROWS: { id: keyof KitTexts; title: string; hint: string; rows: number; ai: boolean }[] = [
    { id: "names", title: "Channel name ideas", hint: "One per line. The first line also makes the handle ideas and goes into the image prompts. Search a name on YouTube and Google before you take it.", rows: 5, ai: true },
    { id: "tagline", title: "Tagline", hint: "One sentence, on your banner.", rows: 2, ai: true },
    { id: "description", title: "Channel description", hint: "The short version, for the first lines and for anywhere a sentence or two is enough.", rows: 3, ai: true },
    { id: "about", title: "About text", hint: "The long version, for the Description box of your YouTube channel. It holds 1000 characters.", rows: 9, ai: true },
    { id: "links", title: "Links section", hint: "Add them by hand in YouTube, your free gift first.", rows: 5, ai: false },
    { id: "bannerPrompt", title: "Banner image prompt", hint: "Paste it into any image tool you like. This app makes no picture.", rows: 9, ai: false },
    { id: "logoPrompt", title: "Logo image prompt", hint: "The same. On a personal channel your own photo works as the picture too.", rows: 9, ai: false },
  ];
</script>

{#snippet writing_bar(field: string)}
  {#if writing === field}<Progress command="suggest-channel" label="The AI is writing a first text" reveal={false} />{/if}
{/snippet}
{#snippet ai_button(field: string, label: string, run: () => void, off: boolean)}
  {#if ai}<button type="button" disabled={busy || !!writing || off} onclick={run}>{writing === field ? "Writing..." : label}</button>{/if}
{/snippet}

{#if !loaded}
  <div class="loading">
    {#if error}<ErrorBox message={error} context={{ step: "channel-wizard" }} />{:else}<p class="hint">Loading...</p>{/if}
    <button type="button" onclick={onclose}>Close</button>
  </div>
{:else}
  <WizardShell title={`YouTube Brand Channel Wizard: ${app.identity?.name ?? ""}`} {steps} bind:step busy={busy || !!writing} saveLabel={current === "save" ? "Save" : "Preview and save"} onsave={save} oncancel={close}>
    {#if error}<ErrorBox message={error} context={{ step: "channel-wizard" }} />{/if}
    {#if note}<p class="note">{note}</p>{/if}

    {#if q}
      {#if step === 0}<WizardMap current="brandchannel" />{/if}
      <p class="for">Phase {q.phase} of {phases.length}: {phases[q.phase - 1]}</p>
      <h2>{q.title}</h2>
      <p class="hint">{q.why}</p>
      {#if q.type === "text" || q.type === "area"}
        <label class="field" for={`f-${q.id}`}><span>{q.label}</span></label>
        {#if q.type === "text"}
          <input id={`f-${q.id}`} placeholder={q.ph} value={a[q.key!] ?? ""} oninput={(e) => { a[q!.key!] = e.currentTarget.value; changed(); }} />
        {:else}
          <textarea id={`f-${q.id}`} rows="4" placeholder={q.ph} value={a[q.key!] ?? ""} oninput={(e) => { a[q!.key!] = e.currentTarget.value; changed(); }}></textarea>
        {/if}
        {#if ai}
          <div class="row">
            {@render ai_button(q.key!, "Write it with AI", () => write(q!.key!, a[q!.key!] ?? "", (t) => (a[q!.key!] = t)), !hasWords)}
            {#if !hasWords}<span class="hint">Type a few words first.</span>{/if}
          </div>
          {@render writing_bar(q.key!)}
        {:else}
          <p class="hint">No AI key is saved, so you write this yourself, and everything else works the same. <button type="button" class="link" onclick={() => goto("connections")}>Add a key in Settings, Connections</button></p>
        {/if}
      {:else if q.type === "market"}
        <label class="field"><span>Language of your videos</span>
          <select value={a.lang} onchange={(e) => { a.lang = e.currentTarget.value; changed(); }}>
            {#each LANGUAGES as l (l.code)}<option value={l.code}>{l.label}</option>{/each}
          </select>
        </label>
        <label class="field"><span>Main country of your viewers</span>
          <input placeholder="United States" value={a.country ?? ""} oninput={(e) => { a.country = e.currentTarget.value; changed(); }} />
        </label>
      {:else if q.type === "links"}
        {#each [["gift", "Your free gift or opt-in page"], ["course", "Your course page"], ["site", "Your website"], ["youtube", "Your YouTube channel, if it already exists"]] as [k, label] (k)}
          <label class="field"><span>{label}</span>
            <input type="url" placeholder="https://" value={a[k] ?? ""} oninput={(e) => { a[k] = e.currentTarget.value; changed(); }} />
          </label>
        {/each}
      {:else}
        <div class="opts">
          {#each q.opts ?? [] as [value, label, sub] (value)}
            <button type="button" class="opt" class:on={a[q.key!] === value} aria-pressed={a[q.key!] === value} onclick={() => { a[q!.key!] = value; changed(); }}>
              <b>{label}</b>{#if sub}<span>{sub}</span>{/if}
            </button>
          {/each}
        </div>
        {#if q.type === "face" && a.face}
          <label class="field"><span>{a.face === "brand" ? "The brand name" : "Your name, as viewers should see it"}</span>
            <input value={a.name ?? ""} oninput={(e) => { a.name = e.currentTarget.value; changed(); }} />
          </label>
        {/if}
        {#if q.type === "look"}
          <label class="field color"><span>Your main brand color</span>
            <input type="color" value={a.color} oninput={(e) => { a.color = e.currentTarget.value; changed(); }} />
            <span class="hint">No brand color yet? Keep this one and change it later. For the colors and fonts of your videos, see the Design wizard.</span>
          </label>
        {/if}
      {/if}
    {:else if current === "keywords"}
      <h2>What do people search for?</h2>
      <p class="hint">Optional: skip it with Next. It uses your vidIQ key and asks first, because it uses credits. What you find goes into your card, and the Playlist Planner starts from it. Without it the card has the searches you typed, with no numbers.</p>
      <KeywordIdeas {app} topic={search} goto={(id) => goto(id)} onfound={found} />
      {#if keywords.length}
        <p class="good">{keywords.length} {keywords.length === 1 ? "keyword goes" : "keywords go"} into your card. <button type="button" class="link" onclick={() => { keywords = []; changed(); }}>Remove them</button></p>
      {/if}
    {:else if current === "kit"}
      <h2>Your channel kit</h2>
      <p class="hint">Nothing here touches YouTube: you copy these texts and paste them in yourself. Edit anything.</p>
      {#if !ai}<p class="hint">No AI key is saved, so these are made from your answers.</p>{:else if a.lang !== "en"}<p class="hint">Until the AI writes them, the texts made from your answers have English sentences around your words.</p>{/if}
      {#if kit?.missing.length}<p class="note">Still empty: {kit.missing.join(", ")}. The texts leave those parts out.</p>{/if}
      {#if kit}
        {#each KIT_ROWS as r (r.id)}
          <section class="card kit">
            <div class="head"><h3>{r.title}</h3>
              <div class="row">
                {#if r.ai}{@render ai_button(r.id, "Write it with AI", () => writeKit(r.id), false)}{/if}
                {#if texts[r.id]?.trim()}<button type="button" class="ghost" disabled={!!writing} onclick={() => { delete texts[r.id]; changed(); refresh(); }}>Back to my answers</button>{/if}
                <button type="button" onclick={() => copy(r.id, kit!.kit[r.id])}>{copied === r.id ? "Copied" : "Copy"}</button>
              </div>
            </div>
            <p class="hint">{r.hint}</p>
            <textarea rows={r.rows} aria-label={r.title} value={kit.kit[r.id]} oninput={(e) => { texts[r.id] = e.currentTarget.value; changed(); }} onchange={refresh}></textarea>
            {#if r.ai}{@render writing_bar(r.id)}{/if}
          </section>
          {#if r.id === "names"}
            <section class="card kit">
              <div class="head"><h3>Handle ideas</h3><button type="button" onclick={() => copy("handles", kit!.handles.join("\n"))}>{copied === "handles" ? "Copied" : "Copy"}</button></div>
              <p class="hint">Made from the first name above. YouTube says which ones are still free when you claim one.</p>
              <ul class="handles">{#each kit.handles as h (h)}<li>{h}</li>{/each}</ul>
            </section>
          {/if}
        {/each}
        <section class="card kit">
          <div class="head"><h3>Checklist</h3><button type="button" onclick={() => copy("checklist", kit!.checklistText)}>{copied === "checklist" ? "Copied" : "Copy"}</button></div>
          <p class="hint">{kit.pathNote}</p>
          {#each kit.checklist as p, i (p.name)}
            <h4>Phase {i + 1}: {p.name}</h4>
            <ul class="checks">
              {#each p.items as it (it.id)}
                <li><label><input type="checkbox" checked={!!checks[it.id]} onchange={(e) => { checks[it.id] = e.currentTarget.checked; changed(); }} /> {it.text}</label><span class="hint">{it.path}</span></li>
              {/each}
            </ul>
          {/each}
        </section>
      {:else}
        <p class="hint">Loading...</p>
      {/if}
    {:else if current === "save" && kit}
      <h2>What Save changes</h2>
      <p class="hint">Nothing is overwritten until you click Save. Tick what your answers should fill in this Identity. A field you already filled is not ticked.</p>
      {#if kit.fields.length}
        <ul class="fields">
          {#each kit.fields as f (f.field)}
            <li class="card">
              <div class="head">
                <label><input type="checkbox" checked={!!take[f.field]} onchange={(e) => (take[f.field] = e.currentTarget.checked)} /> <b>{f.label}</b></label>
                {#if f.editable}{@render ai_button(FIELD_TEXT[f.field], "Write it with AI", () => writeField(f), false)}{/if}
              </div>
              {#if f.editable}
                <textarea rows="3" aria-label={f.label} value={f.value} oninput={(e) => { texts[FIELD_TEXT[f.field]] = e.currentTarget.value; changed(); }} onchange={refresh}></textarea>
                {@render writing_bar(FIELD_TEXT[f.field])}
              {:else}
                <span class="v">{f.value}</span>
              {/if}
              {#if f.now}<span class="hint">Now: {f.now}</span>{/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="hint">Your answers change no field of this Identity.</p>
      {/if}
      <section class="card kit">
        <h3>Evergreen Traffic Card</h3>
        {#if kit.hasCard}
          <p class="hint">This Identity already has a card: Save replaces it.{#if kit.kept && (kit.kept.keywords || kit.kept.playlists || kit.kept.videos)} Its research stays in the new card: {kit.kept.keywords} keywords, {kit.kept.playlists} playlists, {kit.kept.videos} video ideas.{/if}</p>
        {:else}
          <p class="hint">Save keeps the card with this Identity. The Playlist Planner reads it, and you can see it in Identity, YouTube Channel & Audience.</p>
        {/if}
        <div class="row">
          <button type="button" disabled={busy} onclick={download}>Download as .md</button>
          <button type="button" onclick={() => copy("card", kit!.markdown)}>{copied === "card" ? "Copied" : "Copy"}</button>
        </div>
      </section>
    {/if}
  </WizardShell>
{/if}

<style>
  .loading { display: grid; gap: 12px; padding: 24px; justify-items: start; }
  h2 { margin: 0; }
  h3, h4 { margin: 0; }
  h4 { margin-top: 10px; font-size: 14px; }
  .for { margin: 0; font-size: 13px; color: var(--muted-foreground); }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 0; }
  .note { margin: 0; font-size: 13px; padding: 8px 12px; border-radius: 8px; background: var(--primary-surface); color: var(--primary-surface-foreground); }
  .good { color: var(--success); font-size: 13px; margin: 0; }
  .field { display: grid; gap: 4px; }
  .field > span:first-child { font-weight: 600; font-size: 14px; }
  .field.color input { width: 64px; height: 36px; padding: 2px; }
  input:not([type="checkbox"]):not([type="color"]), textarea, select { width: 100%; box-sizing: border-box; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .head { display: flex; justify-content: space-between; gap: 8px; align-items: center; flex-wrap: wrap; }
  .opts { display: grid; gap: 8px; }
  .opt { display: grid; gap: 2px; justify-content: stretch; text-align: left; padding: 10px 14px; min-height: 0; font-weight: 400; }
  .opt span { color: var(--muted-foreground); font-size: 13px; }
  .opt.on { background: var(--primary-surface); color: var(--primary-surface-foreground); border-color: var(--primary); }
  .opt.on span { color: inherit; }
  .kit { display: grid; gap: 8px; }
  .handles { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 14px; }
  .checks, .fields { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .checks li, .fields li { display: grid; gap: 4px; }
  .checks .hint { padding-left: 24px; overflow-wrap: anywhere; }
  .v { font-size: 13px; overflow-wrap: anywhere; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
</style>
