<script lang="ts">
  // StockKeys: the free stock sources' keys (docs/stock.md, DECISIONS 104),
  // Settings, Identity, Footage. Only the keys for now; the search that uses
  // them comes with the scene picture sources (docs/video-quality-plan.md 3).
  import { untrack } from "svelte";
  import type { AppState } from "../api";
  import KeyField from "../KeyField.svelte";
  import { SERVICE_KEY_URLS } from "../catalog";

  let { app }: { app: AppState } = $props();
  // the key status when the page opens; the fields keep it current after that
  let pixabay = $state(untrack(() => !!app.keys["pixabay"]));
  let coverr = $state(untrack(() => !!app.keys["coverr"]));
</script>

<section class="card">
  <h2>Stock photos and videos</h2>
  <p class="hint">Free stock pictures and clips for your scenes. Add a key for each source you want to use; the search that uses them comes with the next update.</p>
  <KeyField name="pixabay" label="Pixabay" scope="identity" keyUrl={SERVICE_KEY_URLS.pixabay} bind:isSet={pixabay} test={() => ({ command: "test-service", service: "pixabay" })} />
  <p class="hint">Photos and videos. Free to use, also commercially, no credit required (Pixabay Content License).</p>
  <KeyField name="coverr" label="Coverr" scope="identity" keyUrl={SERVICE_KEY_URLS.coverr} bind:isSet={coverr} test={() => ({ command: "test-service", service: "coverr" })} />
  <p class="hint">Videos. Coverr's API terms ask apps to show where the videos come from, and its free API access is not meant for commercial use: check them before you publish for money.</p>
</section>
