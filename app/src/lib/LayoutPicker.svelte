<script lang="ts">
  // Where and how the avatar sits: style, corner, size, with a small picture
  // of the frame showing it. Used in Settings (the default) and at the avatar
  // step (per video). No fallbacks on the bindables: a config without these
  // yet is undefined, and the picker shows the defaults.
  import type { AvatarStyle, AvatarPosition, AvatarSize } from "./api";

  let {
    style = $bindable(),
    position = $bindable(),
    size = $bindable(),
    cutoutNote = "",
    disabled = false,
  }: { style?: AvatarStyle; position?: AvatarPosition; size?: AvatarSize; cutoutNote?: string; disabled?: boolean } = $props();

  const s = $derived(style ?? "cutout");
  const p = $derived(position ?? "bottom-right");
  const z = $derived(size ?? "medium");

  const STYLES: [AvatarStyle, string][] = [
    ["cutout", "Cut-out (transparent background)"],
    ["circle", "Circle"],
    ["card", "Card"],
    ["full", "Full screen"],
  ];
  const POSITIONS: [AvatarPosition, string][] = [
    ["bottom-right", "Bottom right"],
    ["bottom-left", "Bottom left"],
    ["top-right", "Top right"],
    ["top-left", "Top left"],
  ];
  const SIZES: [AvatarSize, string][] = [
    ["small", "Small"],
    ["medium", "Medium"],
    ["large", "Large"],
  ];

  // the same boxes as the assembler (runner/gates/build/assemble.mjs), in %
  const BOX: Record<string, { ratio: number; h: Record<string, number>; edge: number }> = {
    cutout: { ratio: 3 / 4, h: { small: 0.42, medium: 0.56, large: 0.7 }, edge: 0 },
    circle: { ratio: 1, h: { small: 0.24, medium: 0.32, large: 0.42 }, edge: 0.04 },
    card: { ratio: 4 / 5, h: { small: 0.34, medium: 0.44, large: 0.56 }, edge: 0.04 },
  };
  const shape = $derived.by(() => {
    if (s === "full") return "left:0;top:0;width:100%;height:100%;border-radius:6px";
    const b = BOX[s];
    const h = b.h[z] * 100;
    const w = (b.h[z] * b.ratio * 1080 * 100) / 1920;
    const [v, hz] = p.split("-");
    return `${v}:${b.edge * 100}%;${hz}:3%;width:${w}%;height:${h}%;border-radius:${s === "circle" ? "50%" : s === "card" ? "8px" : "40% 40% 0 0"}`;
  });
</script>

<div class="layout">
  <div class="fields">
    <label>Avatar style
      <select value={s} onchange={(e) => (style = (e.currentTarget as HTMLSelectElement).value as AvatarStyle)} {disabled}>
        {#each STYLES as [v, l]}<option value={v}>{l}</option>{/each}
      </select>
    </label>
    {#if s !== "full"}
      <label>Place
        <select value={p} onchange={(e) => (position = (e.currentTarget as HTMLSelectElement).value as AvatarPosition)} {disabled}>
          {#each POSITIONS as [v, l]}<option value={v}>{l}</option>{/each}
        </select>
      </label>
      <label>Size
        <select value={z} onchange={(e) => (size = (e.currentTarget as HTMLSelectElement).value as AvatarSize)} {disabled}>
          {#each SIZES as [v, l]}<option value={v}>{l}</option>{/each}
        </select>
      </label>
    {/if}
  </div>
  <div class="frame" aria-label="Where the avatar will be">
    <span class="line"></span><span class="line short"></span>
    <span class="avatar {s}" style={shape}></span>
  </div>
  <p class="hint">
    {#if s === "cutout"}Only the person, on your video's background. Needs a look with background removal at HeyGen; if yours has none, the app uses a card and tells you.{cutoutNote ? ` ${cutoutNote}` : ""}
    {:else if s === "circle"}The face in a circle. Works with every look.
    {:else if s === "card"}A small card with rounded corners. Works with every look.
    {:else}The avatar fills the whole frame during the opening and the closing.{/if}
  </p>
</div>

<style>
  .layout { display: grid; grid-template-columns: 1fr 200px; gap: 12px; align-items: start; margin: 8px 0; }
  .fields { display: grid; gap: 8px; }
  .fields label { display: grid; gap: 4px; font-size: 13px; font-weight: 600; }
  .frame { position: relative; width: 200px; aspect-ratio: 16 / 9; background: var(--muted); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .line { position: absolute; left: 12%; top: 38%; width: 50%; height: 8%; background: var(--border); border-radius: 4px; }
  .line.short { top: 52%; width: 32%; }
  .avatar { position: absolute; background: var(--primary); opacity: 0.85; }
  .avatar.circle { box-shadow: 0 0 0 2px var(--primary-surface); }
  .hint { grid-column: 1 / -1; color: var(--muted-foreground); font-size: 13px; margin: 0; }
</style>
