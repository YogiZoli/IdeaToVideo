<script lang="ts">
  // The default avatar look for new videos (Settings), with the same picker
  // as the Avatar tab (LookPicker, DECISIONS 85): first the person, then the
  // look; the user's own avatars and HeyGen's stock ones on two tabs. The
  // list with its pictures is loaded once per app run (avatars.ts).
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { errorText, runner } from "./api";
  import { avatarLooks } from "./avatars";
  import LookPicker, { type Group, type Look } from "./LookPicker.svelte";
  import Progress from "./Progress.svelte";

  // no fallback on the bindable (see VoicePicker): lookId starts undefined
  let { lookId = $bindable(), keySet }: { lookId?: string | null; keySet: boolean } = $props();

  let own = $state<Group[]>([]);
  let stock = $state<Look[]>([]);
  let loading = $state(false);
  let error = $state("");
  let preview = $state<string | null>(null);

  async function load() {
    loading = true;
    error = "";
    try {
      ({ own, stock } = await avatarLooks());
    } catch (e) {
      error = errorText(e);
    } finally {
      loading = false;
    }
  }
  $effect(() => {
    if (keySet) load();
  });

  async function showPreview(l: Look) {
    if (!l.video) return;
    try {
      preview = convertFileSrc((await runner<{ file: string }>("avatar-preview", { url: l.video })).file);
    } catch (e) {
      error = errorText(e);
    }
  }
</script>

<div class="field">
  <span class="label">Default avatar</span>
  {#if !keySet}
    <p class="hint">Save your HeyGen key above, then your avatars appear here.</p>
  {:else if loading}
    <Progress command="avatar-looks" label="Loading your HeyGen avatars and their pictures (faster next time)" reveal={false} />
  {:else}
    <LookPicker {own} {stock} bind:value={lookId} preview={showPreview} />
    <!-- svelte-ignore a11y_media_has_caption -->
    {#if preview}<video controls autoplay src={preview}></video>{/if}
    <div class="row">
      {#if lookId}<button type="button" class="ghost" onclick={() => (lookId = null)}>No default: choose for each video</button>{/if}
    </div>
    <p class="hint">Used for new videos; you can still change it on the Avatar tab of each video. Make or change avatars in HeyGen: they show up here.</p>
  {/if}
  {#if error}<p class="bad">{error}</p>{/if}
</div>

<style>
  .field { display: grid; gap: 6px; margin: 10px 0 14px; }
  .label { font-weight: 600; }
  .row { display: flex; gap: 8px; }
  video { width: 100%; max-height: 240px; border-radius: 8px; background: #000; }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 0; }
  .bad { color: var(--danger-text); font-size: 13px; margin: 0; }
</style>
