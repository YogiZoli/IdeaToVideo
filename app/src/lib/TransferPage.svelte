<script lang="ts">
  // Settings, Import & Export (D4, DECISIONS 119, 168): the files that belong to the
  // Identity as a whole. The Identity first, then one row each: what it carries,
  // Import, Export. A course or playlist went to the Playlist menu, a HeyGen clip to
  // Wizards, CTA, a publishing card to the Publishing menu, Back up now to Settings,
  // Backup. Your look's import and export come from Settings (they also write the
  // Identity's light logo). One Import takes both kinds of look file. Below them, every
  // import and every export of the whole app in one list (transferList.ts, DECISIONS 175).
  import { onMount } from "svelte";
  import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import type { AppState, BrandState, BrandCard } from "./api";
  import { runner, errorText, exportDiagnostics, readTokensFile } from "./api";
  import { fileName } from "./brand";
  import { log } from "./logger";
  import type { PageId } from "./pages";
  import { IMPORTS, EXPORTS, type TransferRow } from "./transferList";
  import { EDITOR } from "./pages";
  import ErrorBox from "./ErrorBox.svelte";
  import IdentityTransfer from "./IdentityTransfer.svelte";

  let {
    app,
    saved,
    busy: outerBusy = false,
    importCard,
    exportCardFile,
    goto,
  }: {
    app: AppState;
    saved: (s: AppState, text: string) => void;
    busy?: boolean;
    importCard: (path: string) => void;
    exportCardFile: () => void;
    goto: (page: PageId) => void;
  } = $props();

  let busy = $state("");
  let message = $state("");
  let error = $state("");
  let path = $state("");

  type Pack = { id: string; name: string };
  let packs = $state<Pack[]>([]);
  let packId = $state("");

  async function loadLists() {
    try {
      packs = (await runner<{ packs: Pack[] }>("packs-list", {})).packs;
      if (!packs.some((p) => p.id === packId)) packId = packs[0]?.id ?? "";
    } catch {
      packs = [];
    }
  }
  onMount(loadLists);

  async function run(label: string, work: () => Promise<void>) {
    busy = label;
    message = "";
    error = "";
    path = "";
    try {
      await work();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = "";
    }
  }

  // A look file: this app's own (.zip, .json), or a .css from another design tool, whose
  // colors and fonts become this Identity's look; the logo and the name on screen stay
  // (docs/wizards/brand.md).
  async function lookIn() {
    const file = await open({ multiple: false, directory: false, filters: [{ name: "Your look", extensions: ["zip", "json", "css"] }] });
    if (typeof file !== "string") return;
    if (!/\.css$/i.test(file)) return importCard(file);
    await run("Reading the file...", async () => {
      const text = await readTokensFile(file);
      const r = await runner<{ card: BrandCard; fonts: string[] }>("brand-import", { text, fileName: fileName(file) });
      const now = await runner<BrandState>("brand-state", {});
      await runner("brand-save", { card: { ...r.card, logo: now.card.logo, nameplate: now.card.nameplate } });
      log("brand_tokens_imported", { fonts: r.fonts.length });
      message = `Imported from ${fileName(file)}. New videos of this Identity use this look.${r.fonts.length ? ` Fonts the app does not ship were replaced by free look-alikes: ${[...new Set(r.fonts)].join(", ")}.` : ""} Check it in Wizards, Design.`;
    });
  }

  async function packIn() {
    const file = await open({ multiple: false, directory: false, filters: [{ name: "IdeaToVideo pack", extensions: ["itvpack"] }] });
    if (typeof file !== "string") return;
    await run("Checking and importing the pack...", async () => {
      const r = await runner<{ id: string; name: string; blocks: number }>("pack-import", { file });
      log("pack_imported", { id: r.id, blocks: r.blocks });
      message = `Imported: ${r.name}, ${r.blocks} scene types. Turn them on or off in Wizards, Scenes.`;
      await loadLists();
    });
  }

  async function packOut() {
    const file = await saveDialog({ title: "Export pack", defaultPath: `${packId}.itvpack`, filters: [{ name: "IdeaToVideo pack", extensions: ["itvpack"] }] });
    if (!file) return;
    await run("Exporting the pack...", async () => {
      path = (await runner<{ file: string }>("pack-export", { id: packId, file })).file;
      log("pack_exported", { id: packId });
      message = "Pack exported.";
    });
  }

  async function diagnostics() {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const file = await saveDialog({ title: "Export diagnostics", defaultPath: `IdeaToVideo-diagnostics-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.zip`, filters: [{ name: "Zip", extensions: ["zip"] }] });
    if (!file) return;
    await run("Exporting...", async () => {
      path = await exportDiagnostics(file);
      message = "Saved. Send this file to the person helping you; it holds no key, no video and no script text.";
    });
  }

  const off = $derived(!!busy || outerBusy);
</script>

{#if message}<p class="good">{message}{#if path} <button type="button" class="link" onclick={() => revealItemInDir(path)}>Show in folder</button>{/if}</p>{/if}
{#if error}<ErrorBox message={error} context={{ step: "import-export" }} />{/if}
{#if busy}<p class="busy">{busy}</p>{/if}

{#if !EDITOR}
<section class="card top">
  <h2>Identity</h2>
  <IdentityTransfer {app} {saved} {off} />
</section>
{/if}

<section class="card">
  <h2>{EDITOR ? "For the person helping you" : "Parts of it"}</h2>
  <div class="rows">
    {#if !EDITOR}
    <div class="r">
      <div><b>Your look</b><span>Only the look of this Identity: colors, fonts, shapes, name on screen and logos. The whole Identity above has this and everything else. Import replaces the look: a file saved here, or a .css file from another design tool (your logo stays then). Export saves a .zip.</span></div>
      <div class="acts"><button type="button" disabled={off} onclick={lookIn}>Import</button><button type="button" disabled={off} onclick={exportCardFile}>Export</button></div>
    </div>
    <div class="r">
      <div><b>Extra scene designs (.itvpack)</b><span>New kinds of scenes someone designed, in one file. You do not make these in the Scenes wizard: the wizard only chooses among the scenes you have, and these add more. Turn them on or off there.</span>
        {#if packs.length}<select bind:value={packId} aria-label="Pack to export">{#each packs as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select>{/if}
      </div>
      <div class="acts"><button type="button" disabled={off} onclick={packIn}>Import</button><button type="button" disabled={off || !packId} onclick={packOut}>Export</button></div>
    </div>
    {/if}
    <div class="r">
      <div><b>Diagnostics</b><span>One zip with the log, the settings and every ONE Video's state, for the person helping you. No key, no video, no script text.</span></div>
      <div class="acts"><span class="na">Export only</span><button type="button" disabled={off} onclick={diagnostics}>Export</button></div>
    </div>
  </div>
</section>

{#snippet list(title: string, note: string, rows: TransferRow[])}
  <section class="card">
    <h2>{title}</h2>
    <p class="hint">{note}</p>
    <div class="scroll">
      <table>
        <thead><tr><th>What</th><th>Form</th><th>Where</th><th></th></tr></thead>
        <tbody>
          {#each rows as r (r.what)}
            <tr>
              <td><b>{r.what}</b></td>
              <td class="soft">{r.files}</td>
              <td class="soft">{r.where}</td>
              <td class="go">{#if r.page}<button type="button" class="ghost" onclick={() => goto(r.page!)}>Open</button>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
{/snippet}

{@render list("Everything you can import", "All of it, wherever it is done. No import ever brings an API key.", IMPORTS)}
{@render list("Everything you can export", "All of it, wherever it is done. No export ever holds an API key.", EXPORTS)}

<style>
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: var(--muted-foreground); font-weight: 600; padding: 6px; }
  td { padding: 6px; border-top: 1px solid var(--border); vertical-align: top; }
  .soft { color: var(--muted-foreground); }
  .go { text-align: right; white-space: nowrap; }
  h2 { margin: 0 0 8px; font-size: 17px; }
  .top { border-width: 2px; }
  .rows { display: grid; }
  .r { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px 0; border-top: 1px solid var(--border); }
  .r:first-child { border-top: none; padding-top: 0; }
  .r > div:first-child { display: grid; gap: 4px; }
  .r span { font-size: 13px; color: var(--muted-foreground); }
  .r select { max-width: 360px; }
  .acts { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
  .acts button { min-width: 84px; }
  .na { font-size: 12px; min-width: 84px; text-align: center; }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 0 0 8px; }
  .good { color: var(--success); margin: 0; word-break: break-word; }
  .busy { font-weight: 600; margin: 0; }
  .link { border: none; background: none; padding: 0; color: var(--primary); text-decoration: underline; cursor: pointer; font-size: inherit; font-family: inherit; min-height: 0; }
</style>
