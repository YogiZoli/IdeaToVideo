<script lang="ts">
  // One progress bar for every long step (Zoltan, 2026-09-30: percent, time
  // left, "finishing now", and what to do meanwhile). The runner sends an
  // estimate at the start of a step (seconds, learned on this computer, see
  // runner/timings.mjs); where it can measure real progress it sends that too:
  //   render-video  hyperframes' own percent
  //   make-voice    part n of N, sentence k of K
  //   build-video   its phases (build, lint, check, stills, sheet)
  // Everything else fills by elapsed time against the estimate and never
  // claims 100% before the result is there.
  import { onDestroy } from "svelte";
  import { onProgress } from "./api";

  let { command, label = "" }: { command: string; label?: string } = $props();

  let expect = $state<number | null>(null);
  let started = $state(Date.now());
  let real = $state<number | null>(null);
  let floor = $state(0);
  let now = $state(Date.now());

  const BUILD_FLOORS: Record<string, number> = { build: 0, lint: 5, check: 12, snapshots: 72, sheet: 95 };
  const VOICE_TAIL: Record<string, number> = { joining: 92, mixing: 95, sentences: 99 };

  const unlisten = onProgress((p) => {
    if (p.command !== command) return;
    const s = p.progress as Record<string, unknown>;
    if (s.step === "estimate" && typeof s.expectSeconds === "number") {
      expect = s.expectSeconds;
      started = Date.now();
      real = null;
      floor = 0;
      return;
    }
    if (command === "render-video" && typeof s.percent === "number") real = s.percent;
    if (command === "make-voice") {
      if (s.step === "voice" && typeof s.block === "number" && typeof s.of === "number") {
        const inBlock = typeof s.sentence === "number" && typeof s.sentences === "number" ? s.sentence / s.sentences : 0;
        real = Math.round((((s.block as number) - 1 + inBlock) / (s.of as number)) * 90);
      } else if (typeof s.step === "string" && s.step in VOICE_TAIL) real = VOICE_TAIL[s.step];
    }
    if (command === "build-video" && typeof s.step === "string" && s.step in BUILD_FLOORS) floor = BUILD_FLOORS[s.step];
  });
  const timer = setInterval(() => (now = Date.now()), 500);
  onDestroy(() => {
    clearInterval(timer);
    unlisten.then((f) => f());
  });

  const elapsed = $derived((now - started) / 1000);
  const byTime = $derived(expect ? Math.min(95, (elapsed / expect) * 100) : 0);
  const percent = $derived(Math.round(Math.min(99, real ?? Math.max(floor, byTime))));
  // time left: from the real rate once there is enough of it, else the estimate
  const left = $derived(
    real !== null && real >= 5 && command === "render-video" ? (elapsed * (100 - real)) / real : expect ? Math.max(0, expect - elapsed) : null,
  );
  const late = $derived(expect !== null && elapsed > expect * 1.4);

  const fmt = (s: number) => (s >= 90 ? `${Math.round(s / 60)} minutes` : s >= 60 ? "a minute" : `${Math.max(5, Math.round(s / 5) * 5)} seconds`);
  const status = $derived(
    expect === null && real === null
      ? "Starting..."
      : late && real === null
        ? "Taking longer than usual. Still working..."
        : left !== null && left < 4
          ? "Finishing now..."
          : left !== null
            ? `About ${fmt(left)} left`
            : "",
  );
</script>

<div class="progress" role="status" aria-live="polite">
  <div class="line">
    <span class="label">{label}</span>
    <span class="pct">{percent}%</span>
  </div>
  <progress max="100" value={percent}></progress>
  <div class="line">
    <span class="hint">{status}</span>
  </div>
  <p class="hint">Keep the app open. It keeps your computer awake until this is done, and you can use other programs meanwhile.</p>
</div>

<style>
  .progress { display: grid; gap: 6px; margin-top: 10px; }
  .line { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; }
  .label { font-weight: 600; }
  .pct { font-variant-numeric: tabular-nums; }
  progress { width: 100%; height: 10px; }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 0; }
</style>
