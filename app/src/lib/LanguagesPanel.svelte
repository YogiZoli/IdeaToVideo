<script lang="ts">
  // The three languages of a video, on the Script tab (FIX_PLAN 2026-11-19, item 3, DECISIONS 189):
  // what the voice speaks, the captions, the words on screen. Each is the Identity's content
  // language unless changed here. One that differs from the script's language gets a translation,
  // made with the AI or typed by hand, sentence by sentence, and approved here before the voice.
  import type { AppState } from "./api";
  import { runner, errorText } from "./api";
  import { llmFor, aiWithKey } from "./llm";
  import { LANGUAGES, languageOption } from "./catalog";
  import ErrorBox from "./ErrorBox.svelte";

  let { app, dir, narrator = null }: { app: AppState; dir: string; narrator?: { provider: string; voice?: string | null; model?: string | null } | null } = $props();

  type Unit = { src: string; text: string };
  type Translation = { units: Unit[]; approved: boolean; by: string; stale?: boolean } | null;
  type State = {
    languages: { source: string; voice: string; captions: string; screen: string };
    labels: Record<string, string>;
    need: string[];
    units: string[];
    translations: Record<string, Translation>;
    voiceProblem: string | null;
    checkedOn: string;
  };
  let st = $state<State | null>(null);
  let drafts = $state<Record<string, string[]>>({});
  let busy = $state("");
  let error = $state("");
  let saved = $state("");
  const label = (l: string) => st?.labels[l] ?? LANGUAGES.find((x) => x.code === l)?.label ?? l;
  const ai = $derived(aiWithKey(llmFor(app.config, "script"), app.keys));

  async function load() {
    try {
      st = await runner<State>("languages-state", { projectDir: dir, narrator });
      const d: Record<string, string[]> = {};
      for (const [l, t] of Object.entries(st.translations)) d[l] = st.units.map((_, k) => (t && !t.stale ? (t.units[k]?.text ?? "") : ""));
      drafts = d;
    } catch (e) {
      error = errorText(e);
    }
  }
  load();

  async function set(key: "source" | "voice" | "captions" | "screen", value: string) {
    error = "";
    saved = "";
    try {
      await runner("languages-set", { projectDir: dir, languages: { [key]: value } });
      await load();
    } catch (e) {
      error = errorText(e);
    }
  }

  async function translate(lang: string) {
    if (!ai) return;
    busy = lang;
    error = "";
    try {
      await runner("translation-make", { projectDir: dir, llm: ai, lang });
      await load();
      saved = `The ${label(lang)} translation is ready. Read it, change what is wrong, then approve it.`;
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }

  async function save(lang: string, approve: boolean) {
    busy = lang;
    error = "";
    try {
      await runner("translation-save", { projectDir: dir, lang, texts: $state.snapshot(drafts[lang]), approve });
      await load();
      saved = approve ? `The ${label(lang)} translation is approved.` : `The ${label(lang)} translation is saved.`;
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }

  // a whole translation pasted at once: one sentence per line
  function paste(lang: string, text: string) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    drafts[lang] = st!.units.map((_, k) => lines[k] ?? drafts[lang][k] ?? "");
  }
</script>

{#if st}
  <section class="card langs">
    <h3>Languages</h3>
    <p class="hint">The script is written once, in {label(st.languages.source)}. Each of these can be another language: it then gets a translation you look over here.</p>
    <div class="grid">
      {#each [["voice", "The voice speaks"], ["captions", "The captions"], ["screen", "The words on screen"], ["source", "The script is written in"]] as [key, text] (key)}
        <label>
          <span>{text}</span>
          <select value={st.languages[key as "voice"]} onchange={(e) => set(key as "voice", e.currentTarget.value)}>
            {#each LANGUAGES as l (l.code)}<option value={l.code}>{languageOption(l)}</option>{/each}
          </select>
        </label>
      {/each}
    </div>
    {#if st.voiceProblem}<p class="warn">{st.voiceProblem} Choose another voice on the Voice tab, or another language for the voice. Checked on {st.checkedOn}.</p>{/if}
    {#if saved}<p class="ok">{saved}</p>{/if}
    {#if error}<ErrorBox message={error} context={{ step: "languages" }} />{/if}

    {#each Object.entries(st.translations) as [lang, t] (lang)}
      <div class="tr">
        <div class="head">
          <h4>{label(lang)} translation {t?.approved && !t.stale ? "(approved)" : t?.stale ? "(the script changed: make it again)" : ""}</h4>
          <div class="row">
            <button type="button" disabled={!!busy || !ai} title={ai ? "" : "No AI key: type or paste the sentences"} onclick={() => translate(lang)}>{busy === lang ? "Translating..." : "Translate with AI"}</button>
            <button type="button" disabled={!!busy} onclick={() => save(lang, false)}>Save</button>
            <button type="button" class="primary" disabled={!!busy || (drafts[lang] ?? []).some((x) => !x.trim())} onclick={() => save(lang, true)}>Approve</button>
          </div>
        </div>
        <details>
          <summary>Paste the whole translation, one sentence per line</summary>
          <textarea rows="5" aria-label={`Paste the ${label(lang)} translation`} onchange={(e) => paste(lang, e.currentTarget.value)}></textarea>
        </details>
        <ol>
          {#each st.units as src, k (k)}
            <li>
              <span class="src">{src}</span>
              <textarea rows="2" lang={lang} bind:value={drafts[lang][k]} aria-label={`Sentence ${k + 1} in ${label(lang)}`}></textarea>
            </li>
          {/each}
        </ol>
      </div>
    {/each}
  </section>
{/if}

<style>
  .langs { display: grid; gap: 10px; }
  h3, h4 { margin: 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
  .grid label { display: grid; gap: 4px; font-size: 13px; }
  .grid span { font-weight: 600; }
  .hint { margin: 0; font-size: 13px; color: var(--muted-foreground); }
  .warn { margin: 0; padding: 8px 12px; border-radius: 8px; background: var(--warning-surface); color: var(--warning-text); font-size: 14px; }
  .ok { margin: 0; font-size: 14px; color: var(--success); }
  .tr { display: grid; gap: 8px; border-top: 1px solid var(--border); padding-top: 10px; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .row { display: flex; gap: 6px; }
  ol { margin: 0; padding-left: 22px; display: grid; gap: 8px; }
  li { display: grid; gap: 4px; }
  .src { font-size: 13px; color: var(--muted-foreground); }
  textarea { width: 100%; font-family: inherit; }
</style>
