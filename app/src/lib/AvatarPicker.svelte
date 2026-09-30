<script lang="ts">
  // The default avatar look for new videos (Settings), from the user's own
  // HeyGen avatars (characters and their looks), then HeyGen's stock looks.
  // Names only, no pictures, so it loads fast; the avatar step shows the
  // pictures and previews.
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { runner, errorText } from "./api";

  type Look = { id: string; name: string };
  type Group = { id: string; name: string; note: string | null; looks: Look[] };
  // no fallback on the bindable (see VoicePicker): lookId starts undefined
  let { lookId = $bindable(), keySet }: { lookId?: string | null; keySet: boolean } = $props();

  let own = $state<Group[]>([]);
  let stock = $state<Look[]>([]);
  let loading = $state(false);
  let error = $state("");

  async function load() {
    loading = true;
    error = "";
    try {
      ({ own, stock } = await runner<{ own: Group[]; stock: Look[] }>("avatar-looks", { service: "heygen", previews: false }));
      const all = [...own.flatMap((g) => g.looks), ...stock];
      if (!all.some((l) => l.id === lookId)) lookId = own.flatMap((g) => g.looks)[0]?.id ?? "";
    } catch (e) {
      error = errorText(e);
    } finally {
      loading = false;
    }
  }
  $effect(() => {
    if (keySet) load();
  });
</script>

<div class="field">
  <label for="avatar-look">Default avatar</label>
  {#if !keySet}
    <p class="hint">Save your HeyGen key above, then your avatars appear here.</p>
  {:else if loading}
    <p class="hint">Loading your HeyGen avatars...</p>
  {:else}
    <div class="row">
      <select id="avatar-look" value={lookId ?? ""} onchange={(e) => (lookId = (e.currentTarget as HTMLSelectElement).value || null)}>
        <option value="">Choose at the avatar step of each video</option>
        {#each own as g}
          <optgroup label={`${g.name}${g.note ? ` (${g.note})` : ""}`}>{#each g.looks as l}<option value={l.id}>{l.name}</option>{/each}</optgroup>
        {/each}
        {#if stock.length}
          <optgroup label="HeyGen stock avatars">{#each stock as l}<option value={l.id}>{l.name}</option>{/each}</optgroup>
        {/if}
      </select>
      <button type="button" class="ghost" onclick={() => openUrl("https://app.heygen.com/avatars")}>Open HeyGen</button>
    </div>
    {#if !own.length}<p class="hint">This key sees no avatar of your own. If you have avatars in the HeyGen app, make the API key in the workspace where they are.</p>{/if}
    <p class="hint">Your own avatars come straight from your HeyGen account, grouped by character. Make or change them in HeyGen.</p>
  {/if}
  {#if error}<p class="bad">{error}</p>{/if}
</div>

<style>
  .field { display: grid; gap: 6px; margin: 10px 0 14px; }
  .row { display: flex; gap: 8px; }
  .row select { flex: 1; }
  .hint { color: var(--muted-foreground); font-size: 13px; margin: 0; }
  .bad { color: var(--danger-text); font-size: 13px; margin: 0; }
</style>
