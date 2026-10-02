<script lang="ts">
  // BrandWizard: the Identity's look, saved as its Brand Identity Card
  // (docs/wizards/brand.md 5). Seven screens in the shared WizardShell. The
  // live picture follows every click; the real stills are made on the last
  // screen with the same chain as gate 4. Only the app's own fonts (all with
  // every letter of the content languages); no logo in the videos (K2).
  import { onMount } from "svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import type { AppState, BrandCard, BrandState, CardColors, Still } from "../api";
  import { runner, importLogo, errorText, readTokensFile, HYPERFRAMES_GROUP } from "../api";
  import { ensureFonts } from "./fontsDom";
  import { contrastReport, deriveFrom, fontPairs, previewFamily, paletteFromPixels, normHex, SAMPLE_LINE, COLOR_ROLES, fileName } from "../brand";
  import { log } from "../logger";
  import WizardShell from "../wizard/WizardShell.svelte";
  import BrandMini from "./BrandMini.svelte";
  import ErrorBox from "../ErrorBox.svelte";

  let { app, onclose, onsaved }: { app: AppState; onclose: () => void; onsaved: (card: BrandCard, lightLogo: string | null) => void } = $props();

  const STEPS = [
    { id: "start", title: "Start" },
    { id: "logo", title: "Logo" },
    { id: "colors", title: "Colors" },
    { id: "fonts", title: "Fonts" },
    { id: "shapes", title: "Shapes" },
    { id: "name", title: "Name on screen" },
    { id: "preview", title: "Preview and save" },
  ];
  const language = $derived(app.config?.channel.contentLanguage ?? "en");

  let st = $state<BrandState | null>(null);
  let card = $state<BrandCard | null>(null);
  let step = $state(0);
  let busy = $state(false);
  let error = $state("");
  let lightLogo = $state<string | null>(null);
  let darkLogo = $state<string | null>(null);
  let logoPalette = $state<string[]>([]);
  let stills = $state<Still[]>([]);
  let stamp = $state(Date.now());
  let advanced = $state(false);
  let group = $state(HYPERFRAMES_GROUP);
  let search = $state("");
  let notice = $state("");

  const report = $derived(card ? contrastReport(card) : []);
  // pairs and ready palettes come from the HyperFrames presets (a short list);
  // the gallery offers every look, by group and by name
  const hyperframes = $derived(st?.presets.filter((p) => p.group === HYPERFRAMES_GROUP) ?? []);
  const pairs = $derived(fontPairs(hyperframes));
  const groups = $derived(st ? [...new Set(st.presets.map((p) => p.group))] : []);
  const shown = $derived.by(() => {
    if (!st) return [];
    const q = search.trim().toLowerCase();
    return q ? st.presets.filter((p) => p.label.toLowerCase().includes(q) || p.group.toLowerCase().includes(q)) : st.presets.filter((p) => p.group === group);
  });
  const families = $derived(st?.fonts.map((f) => f.family) ?? []);
  const url = (p: string | null) => (p ? `${convertFileSrc(p)}?v=${stamp}` : null);
  const join = (dir: string, name: string) => `${dir}${dir.includes("\\") ? "\\" : "/"}${name}`;

  onMount(async () => {
    try {
      st = await runner<BrandState>("brand-state", {});
      card = $state.snapshot(st.card) as BrandCard;
      card.nameplate ??= { name: app.identity?.name ?? "", title: "", url: "" };
      if (st.brandDir) {
        lightLogo = card.logo?.light ? join(st.brandDir, card.logo.light) : (app.config?.brand?.logo ?? null);
        darkLogo = card.logo?.dark ? join(st.brandDir, card.logo.dark) : null;
      }
      ensureFonts(st);
      if (lightLogo) readPalette(lightLogo);
    } catch (e) {
      error = errorText(e);
    }
  });

  // "Import tokens.css": a design system's tokens (Claude Design,
  // open-design, shadcn...) become the card to edit; nothing is saved yet.
  async function importTokens() {
    error = "";
    notice = "";
    const path = await open({ multiple: false, directory: false, filters: [{ name: "Design tokens", extensions: ["css"] }] });
    if (typeof path !== "string") return;
    try {
      const text = await readTokensFile(path);
      const r = await runner<{ card: BrandCard; fonts: string[] }>("brand-import", { text, fileName: fileName(path) });
      const keep = { logo: card!.logo, nameplate: card!.nameplate };
      card = { ...r.card, ...keep };
      log("brand_tokens_imported", { fonts: r.fonts.length });
      notice = `Imported from ${fileName(path)}.${r.fonts.length ? ` Fonts the app does not ship were replaced by free look-alikes: ${[...new Set(r.fonts)].join(", ")}.` : ""} Check it on the next screens, then Save.`;
    } catch (e) {
      error = errorText(e);
    }
  }

  function usePreset(id: string) {
    const p = st!.presets.find((x) => x.id === id)!;
    const keep = { logo: card!.logo, nameplate: card!.nameplate };
    card = { ...($state.snapshot(p.card) as BrandCard), ...keep };
    log("choice_changed", { field: "Brand preset", value: id });
  }

  // The logo's main colours, read in the webview (no network, no runner).
  function readPalette(path: string) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 96;
        c.height = Math.max(1, Math.round((96 * img.naturalHeight) / Math.max(1, img.naturalWidth)));
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        logoPalette = paletteFromPixels(ctx.getImageData(0, 0, c.width, c.height).data);
      } catch {
        logoPalette = [];
      }
    };
    img.src = url(path)!;
  }

  async function chooseLogo(variant: "light" | "dark") {
    error = "";
    const path = await open({ multiple: false, directory: false, filters: [{ name: "Logo", extensions: ["png", "jpg", "jpeg", "svg", "webp"] }] });
    if (typeof path !== "string") return;
    try {
      const stored = await importLogo(path, false, variant);
      stamp = Date.now();
      card!.logo = { ...card!.logo, [variant]: fileName(stored) };
      if (variant === "light") {
        lightLogo = stored;
        readPalette(stored);
      } else darkLogo = stored;
    } catch (e) {
      error = errorText(e);
    }
  }

  function removeLogo(variant: "light" | "dark") {
    card!.logo = { ...card!.logo, [variant]: null };
    if (variant === "light") {
      lightLogo = null;
      logoPalette = [];
    } else darkLogo = null;
  }

  // The three main fields; the rest follows (deriveFrom), unless edited by hand.
  function setMain(role: "background" | "primary" | "secondary", hex: string) {
    const v = normHex(hex);
    if (!v || !card) return;
    const c = card.colors;
    const next = { background: c.background, primary: c.primary, secondary: c.secondary, [role]: v };
    card.colors = deriveFrom(next);
    if (card.source?.kind === "preset") card.source = { kind: "scratch" };
  }

  function setColor(role: keyof CardColors, hex: string) {
    const v = normHex(hex);
    if (v && card) card.colors = { ...card.colors, [role]: v };
  }

  function usePalette(colors: CardColors) {
    card!.colors = { ...colors };
  }

  async function preview() {
    busy = true;
    error = "";
    try {
      const r = await runner<{ stills: Still[] }>("brand-preview", { card: $state.snapshot(card), language });
      stills = r.stills;
      stamp = Date.now();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  async function save() {
    busy = true;
    error = "";
    try {
      // the card belongs to the Identity: its name, whatever preset it started from (source tells that)
      const toSave = { ...($state.snapshot(card) as BrandCard), name: app.identity?.name || card!.name || "Brand" };
      const r = await runner<{ card: BrandCard }>("brand-save", { card: toSave });
      log("brand_saved", { preset: r.card.source?.preset ?? r.card.source?.kind ?? "scratch" });
      onsaved(r.card, card!.logo?.light ? lightLogo : null);
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  const LABELS: Record<keyof CardColors, string> = {
    background: "Background", text: "Text", muted: "Quiet text", surface: "Cards", border: "Card borders", primary: "Main color", secondary: "Second color", tertiary: "Third color",
  };
</script>

{#if !card || !st}
  <div class="loading">
    {#if error}<ErrorBox message={error} context={{ step: "brand" }} />{:else}<p class="hint">Loading your look...</p>{/if}
    <button type="button" onclick={onclose}>Close</button>
  </div>
{:else}
  <WizardShell title={`Brand wizard: ${app.identity?.name ?? ""}`} steps={STEPS} bind:step {busy} onsave={save} oncancel={onclose}>
    {#snippet aside()}
      <BrandMini card={card!} {language} />
      <ul class="checks">
        {#each report as r (r.id)}
          <li class:bad={!r.ok}>{r.ok ? "Readable" : "Hard to read"}: {r.label.toLowerCase()} ({r.ratio}:1)</li>
        {/each}
      </ul>
    {/snippet}

    {#if error}<ErrorBox message={error} context={{ step: "brand" }} />{/if}
    {#if notice}<p class="good">{notice}</p>{/if}

    {#if step === 0}
      <p class="lead">Your videos get this look: colors, fonts and shapes. Start from a preset, from your logo's colors, or from what you have now.</p>
      <div class="starts">
        <button type="button" class="start" onclick={() => (step = 1)}><b>From my logo</b><span>Upload your logo, then pick colors from it.</span></button>
        <button type="button" class="start" onclick={() => { card!.source = { kind: "scratch" }; step = 2; }}><b>From scratch</b><span>Start from your current look and change it.</span></button>
        <button type="button" class="start" onclick={importTokens}><b>Import tokens.css</b><span>From Claude Design, open-design or any design system's tokens file.</span></button>
      </div>
      <h2>Or pick a look</h2>
      <div class="filter">
        <select bind:value={group} aria-label="Group" disabled={!!search.trim()}>
          {#each groups as g (g)}<option value={g}>{g} ({st.presets.filter((p) => p.group === g).length})</option>{/each}
        </select>
        <input bind:value={search} placeholder="Search all {st.presets.length} looks" aria-label="Search looks" />
      </div>
      <div class="gallery">
        {#each shown as p (p.id)}
          <button type="button" class="preset" class:chosen={card.source?.preset === p.id} onclick={() => usePreset(p.id)}>
            <BrandMini card={{ ...p.card, nameplate: { name: p.label, title: p.group } }} {language} small />
            <span>{p.label}</span>
          </button>
        {/each}
      </div>
      {#if !shown.length}<p class="hint">No look matches "{search}".</p>{/if}
      <p class="hint">HyperFrames presets by HeyGen (Apache-2.0). The styles come from open-design (Apache-2.0): colors, corners and shapes only; brand fonts are replaced by free look-alikes. {st.styleNote}</p>
    {:else if step === 1}
      <p class="lead">Your logo is not shown in your videos. It is kept on your Brand Identity Card for your other tools, for example a landing page, and the Colors screen suggests colors from it.</p>
      <div class="logos">
        {#each [{ v: "light", label: "For light backgrounds", path: lightLogo }, { v: "dark", label: "For dark backgrounds (optional)", path: darkLogo }] as l (l.v)}
          <div class="logo card">
            <span class="label">{l.label}</span>
            <div class="logobox" class:darkbox={l.v === "dark"}>
              {#if l.path}<img src={url(l.path)} alt="" />{:else}<span class="hint">No logo yet</span>{/if}
            </div>
            <div class="row">
              <button type="button" onclick={() => chooseLogo(l.v as "light" | "dark")}>{l.path ? "Change" : "Choose file"}</button>
              {#if l.path}<button type="button" class="ghost" onclick={() => removeLogo(l.v as "light" | "dark")}>Remove</button>{/if}
            </div>
          </div>
        {/each}
      </div>
      <p class="hint">PNG, JPG, SVG or WebP, up to 5 MB. A logo with a transparent background works best.</p>
    {:else if step === 2}
      <p class="lead">Three colors are enough. The app works out the rest and checks that every text stays readable.</p>
      <div class="mains">
        {#each [["background", "Background"], ["primary", "Main color"], ["secondary", "Second color"]] as [role, label] (role)}
          <label class="color">
            <span>{label}</span>
            <span class="row">
              <input type="color" value={card.colors[role as keyof CardColors]} oninput={(e) => setMain(role as "background", e.currentTarget.value)} />
              <input class="hex" value={card.colors[role as keyof CardColors]} onchange={(e) => setMain(role as "background", e.currentTarget.value)} maxlength="7" />
            </span>
          </label>
        {/each}
      </div>
      {#if logoPalette.length}
        <h2>From your logo</h2>
        <div class="swatches">
          {#each logoPalette as hex (hex)}
            <div class="sw">
              <span class="chip" style="background:{hex}"></span>
              <button type="button" class="ghost tiny" onclick={() => setMain("primary", hex)}>Main</button>
              <button type="button" class="ghost tiny" onclick={() => setMain("secondary", hex)}>Second</button>
            </div>
          {/each}
        </div>
      {/if}
      <h2>Ready combinations</h2>
      <div class="palettes">
        {#each hyperframes as p (p.id)}
          <button type="button" class="palette" onclick={() => usePalette(p.card.colors)} title={p.label}>
            <span class="chip" style="background:{p.card.colors.background}"></span>
            <span class="chip" style="background:{p.card.colors.primary}"></span>
            <span class="chip" style="background:{p.card.colors.secondary}"></span>
            <span class="pl">{p.label}</span>
          </button>
        {/each}
      </div>
      <h2>Readability</h2>
      <ul class="report">
        {#each report as r (r.id)}
          <li class:bad={!r.ok}>
            <span>{r.label}: {r.ratio}:1 (needs {r.min}:1)</span>
            {#if !r.ok && r.fix}<button type="button" class="tiny" onclick={() => setColor(r.fg, r.fix!)}>Fix</button>{/if}
          </li>
        {/each}
      </ul>
      <details bind:open={advanced}>
        <summary>Advanced: every color</summary>
        <div class="all">
          {#each COLOR_ROLES as role (role)}
            <label class="color">
              <span>{LABELS[role]}</span>
              <span class="row">
                <input type="color" value={card.colors[role]} oninput={(e) => setColor(role, e.currentTarget.value)} />
                <input class="hex" value={card.colors[role]} onchange={(e) => setColor(role, e.currentTarget.value)} maxlength="7" />
              </span>
            </label>
          {/each}
        </div>
      </details>
    {:else if step === 3}
      <p class="lead">A font for titles and one for text. Every font here has all the letters of your videos' language.</p>
      <h2>Pairs from the presets</h2>
      <div class="pairs">
        {#each pairs as p (p.display + p.body)}
          <button type="button" class="pair" class:chosen={card.fonts.display.family === p.display && card.fonts.body.family === p.body} onclick={() => (card!.fonts = { ...card!.fonts, display: { family: p.display, source: "bundled" }, body: { family: p.body, source: "bundled" } })}>
            <span class="pd" style="font-family:{previewFamily(p.display)}">{p.display}</span>
            <span class="pb" style="font-family:{previewFamily(p.body)}">{SAMPLE_LINE[language] ?? SAMPLE_LINE.en}</span>
            <span class="hint">{p.body}, from {p.from}</span>
          </button>
        {/each}
      </div>
      <h2>Or choose each</h2>
      <div class="pick">
        {#each [["display", "Title font"], ["body", "Text font"]] as [k, label] (k)}
          <label class="field">
            <span>{label}</span>
            <select value={card.fonts[k as "display"].family} onchange={(e) => (card!.fonts = { ...card!.fonts, [k]: { family: e.currentTarget.value, source: "bundled" } })}>
              {#each families as f (f)}<option value={f}>{f}</option>{/each}
            </select>
            <span class="sample" style="font-family:{previewFamily(card.fonts[k as 'display'].family)}">{SAMPLE_LINE[language] ?? SAMPLE_LINE.en}</span>
          </label>
        {/each}
      </div>
    {:else if step === 4}
      <p class="lead">Corners and cards. Small things, but they set the mood.</p>
      <h2>Corners</h2>
      <div class="opts">
        {#each [["none", "Square"], ["small", "Small"], ["medium", "Medium"], ["large", "Round"]] as [v, label] (v)}
          <label class="opt" class:chosen={card.shape.corners === v}>
            <input type="radio" name="corners" checked={card.shape.corners === v} onchange={() => (card!.shape = { ...card!.shape, corners: v as "none" })} />
            <span class="shape" style="border-radius:{({ none: 0, small: 4, medium: 9, large: 16 } as Record<string, number>)[v]}px"></span>{label}
          </label>
        {/each}
      </div>
      <h2>Cards</h2>
      <div class="opts">
        {#each [["flat", "Flat"], ["border", "With a border"], ["shadow", "With a shadow"]] as [v, label] (v)}
          <label class="opt" class:chosen={card.shape.cards === v}>
            <input type="radio" name="cards" checked={card.shape.cards === v} onchange={() => (card!.shape = { ...card!.shape, cards: v as "flat" })} />
            <span class="shape {v}"></span>{label}
          </label>
        {/each}
      </div>
    {:else if step === 5}
      <p class="lead">Shown in the closing scene of your videos, and used by the CTA wizard.</p>
      <label class="field"><span>Name</span><input bind:value={card.nameplate!.name} maxlength="80" placeholder="Example: Anna Smith, or your brand" /></label>
      <label class="field"><span>Title</span><input bind:value={card.nameplate!.title} maxlength="120" placeholder="Example: Business coach for local shops" /></label>
      <label class="field"><span>Short web address</span><input bind:value={card.nameplate!.url} maxlength="200" placeholder="Example: annasmith.com" /></label>
    {:else if step === 6}
      <p class="lead">The real preview: five scenes of a sample video with your look, made the same way as your videos (about 20 seconds).</p>
      <div class="row">
        <button type="button" class="primary" disabled={busy} onclick={preview}>{busy ? "Making the preview..." : stills.length ? "Make it again" : "Make the real preview"}</button>
      </div>
      {#if stills.length}
        <div class="stills">
          {#each stills as s (s.file)}<img src={url(s.file)} alt={`Scene ${s.scene}`} />{/each}
        </div>
      {/if}
      {#if report.some((r) => !r.ok)}
        <p class="bad">Some text may be hard to read. The Colors screen can fix it with one click.</p>
      {/if}
      <p class="hint">Save keeps this look for every new video of this Identity. A video that is already built keeps its look until you build it again at 4. Review and render.</p>
    {/if}
  </WizardShell>
{/if}

<style>
  .loading { padding: 24px; display: grid; gap: 12px; justify-items: start; }
  .lead { margin: 0; }
  h2 { margin: 8px 0 0; font-size: 16px; }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 0; }
  .bad { color: var(--destructive, #b42318); }
  .row { display: flex; gap: 8px; align-items: center; }
  .starts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .filter { display: flex; gap: 8px; }
  .filter input { flex: 1; min-width: 0; }
  .good { color: var(--success); margin: 0; }
  .start { display: grid; gap: 4px; text-align: left; padding: 14px; justify-items: start; }
  .start span { font-size: 13px; color: var(--muted-foreground); }
  .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
  .preset { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; padding: 6px; width: 100%; border-radius: 10px; border: 2px solid transparent; background: none; font-size: 13px; justify-items: stretch; }
  .preset.chosen, .pair.chosen, .opt.chosen { border-color: var(--primary); }
  .logos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .logo { display: grid; gap: 8px; }
  .label { font-weight: 600; font-size: 14px; }
  .logobox { height: 110px; display: grid; place-items: center; border-radius: 8px; background: #f4f4f4; padding: 10px; }
  .logobox.darkbox { background: #1b1b1b; }
  .logobox img { max-height: 90px; max-width: 100%; object-fit: contain; }
  .mains, .all { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .all { grid-template-columns: repeat(2, 1fr); margin-top: 10px; }
  .color { display: grid; gap: 4px; font-size: 14px; }
  label.color input[type="color"] { width: 44px; min-height: 40px; padding: 2px; border-radius: 6px; }
  .hex { width: 110px; font-family: var(--font-mono, monospace); }
  .swatches { display: flex; flex-wrap: wrap; gap: 12px; }
  .sw { display: grid; justify-items: center; gap: 2px; }
  .chip { display: inline-block; width: 28px; height: 28px; border-radius: 6px; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12); }
  .tiny { padding: 2px 8px; font-size: 12px; min-height: 0; }
  .palettes { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .palette { display: flex; gap: 4px; align-items: center; padding: 6px; font-size: 12px; }
  .pl { margin-left: 4px; text-align: left; }
  .report { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .report li { display: flex; gap: 10px; align-items: center; font-size: 14px; }
  .report li.bad, .checks li.bad { color: var(--destructive, #b42318); }
  .checks { list-style: none; padding: 0; margin: 10px 0 0; font-size: 12px; color: var(--muted-foreground); display: grid; gap: 2px; }
  .pairs { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
  .pair { display: grid; gap: 4px; text-align: left; width: 100%; justify-content: stretch; padding: 10px; border: 2px solid var(--border); border-radius: 10px; background: var(--surface); justify-items: start; }
  .pd { font-size: 24px; font-weight: 700; line-height: 1.1; }
  .pb { font-size: 15px; }
  .pick { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .field { display: grid; gap: 6px; font-size: 14px; }
  .sample { font-size: 20px; }
  .opts { display: flex; flex-wrap: wrap; gap: 10px; }
  .opt { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border: 2px solid var(--border); border-radius: 10px; cursor: pointer; }
  .opt input { display: none; }
  .shape { width: 34px; height: 24px; background: var(--muted, #ddd); display: inline-block; }
  .shape.border { background: transparent; border: 2px solid var(--foreground); border-radius: 4px; }
  .shape.shadow { background: var(--surface); box-shadow: 0 3px 8px rgba(0, 0, 0, 0.25); border-radius: 4px; }
  .shape.flat { border-radius: 4px; }
  .stills { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
  .stills img { width: 100%; border-radius: 6px; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1); }
</style>
