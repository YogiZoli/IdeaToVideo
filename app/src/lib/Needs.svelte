<script lang="ts">
  // A tab whose step needs an earlier one: says what is missing and takes
  // the user there in one click (Zoltan, 2026-10-05: every tab can be
  // opened, none is a dead end).
  import { tabLabel, type TabId } from "./tabs";
  let { text, tab, goto }: { text: string; tab: TabId; goto: (t: TabId) => void } = $props();
</script>

<div class="needs">
  <p>{text}</p>
  <button type="button" class="primary" onclick={() => goto(tab)}>Go to {tabLabel(tab)}</button>
</div>

<style>
  .needs { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; padding: 14px 16px; border-radius: 10px; background: var(--muted); }
  .needs p { margin: 0; flex: 1; min-width: 220px; }
</style>
