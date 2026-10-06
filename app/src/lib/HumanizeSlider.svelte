<script lang="ts">
  // The natural-voice pass after the script (DECISIONS 88): Off, Light,
  // Strong, as a slider. Settings, Brand Voice for the Identity; the Script
  // tab for one video. Off by default: each pass is one more AI call.
  type Level = "off" | "light" | "strong";
  const LEVELS: Level[] = ["off", "light", "strong"];
  const SAY: Record<Level, string> = {
    off: "Off. The script as the AI writes it, no extra AI call.",
    light: "Light. Takes out the patterns that sound machine-written and varies the rhythm. One extra AI call, a few cents.",
    strong: "Strong. Light, plus a spoken, personal delivery: you and I, a question to the viewer, a concrete example. One extra AI call, a few cents.",
  };
  let { value = $bindable(), id = "humanize", disabled = false, compact = false }: { value?: Level | null; id?: string; disabled?: boolean; compact?: boolean } = $props();
  const index = $derived(Math.max(0, LEVELS.indexOf(value ?? "off")));
</script>

<div class="slider" class:compact>
  <label for={id}>Natural voice</label>
  <div class="row">
    <input {id} type="range" min="0" max="2" step="1" value={index} {disabled} oninput={(e) => (value = LEVELS[Number((e.currentTarget as HTMLInputElement).value)])} aria-valuetext={value ?? "off"} />
    <div class="ticks" aria-hidden="true">
      {#each LEVELS as l, i}<span class:on={i === index}>{l[0].toUpperCase() + l.slice(1)}</span>{/each}
    </div>
  </div>
  {#if !compact}<p class="hint">{SAY[value ?? "off"]} It makes the script read like a person talking. Nothing can promise a video gets past any filter: what counts for YouTube is your own value, so add your own angle on the Script tab when you can.</p>{:else}<p class="hint">{SAY[value ?? "off"]}</p>{/if}
</div>

<style>
  .slider { display: grid; gap: 4px; margin: 10px 0; }
  label { font-weight: 600; }
  .row { display: grid; gap: 2px; max-width: 320px; }
  input { width: 100%; accent-color: var(--primary); }
  .ticks { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted-foreground); }
  .ticks .on { color: var(--foreground); font-weight: 700; }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 0; }
  .compact label { font-size: 14px; }
</style>
