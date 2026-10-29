<script lang="ts">
  // PhotosPanel: the Identity's profile photos for the Thumbnail step
  // (DECISIONS 131). Added once per Identity, at most 3, kept in the
  // Identity's folder like the logo (and in its export). Remove asks first.
  // Shown on Identity, Voice & Avatar and on the Thumbnail tab.
  import { onMount } from "svelte";
  import { open, ask } from "@tauri-apps/plugin-dialog";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import { runner, errorText, importPhoto, removePhoto } from "./api";
  import { log } from "./logger";
  import ErrorBox from "./ErrorBox.svelte";

  let { changed = () => {}, compact = false }: { changed?: (count: number) => void; compact?: boolean } = $props();

  let photos = $state<{ name: string; file: string }[]>([]);
  let max = $state(3);
  let error = $state("");
  let busy = $state(false);
  let stamp = $state(Date.now());

  async function load() {
    try {
      const r = await runner<{ photos: { name: string; file: string }[]; max: number }>("thumbnail-photos", {});
      photos = r.photos;
      max = r.max;
      changed(photos.length);
    } catch (e) {
      error = errorText(e);
    }
  }
  onMount(load);

  async function add() {
    error = "";
    const path = await open({ multiple: false, directory: false, filters: [{ name: "Photo", extensions: ["jpg", "jpeg", "png", "webp"] }] });
    if (typeof path !== "string") return;
    busy = true;
    try {
      await importPhoto(path);
      log("photo_added", {});
      stamp = Date.now();
      await load();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }

  async function remove(name: string) {
    if (!(await ask("Remove this photo from the Identity? The file is deleted from the Identity's folder. Thumbnails already made stay.", { title: "Remove photo", kind: "warning" }))) return;
    busy = true;
    try {
      await removePhoto(name);
      log("photo_removed", {});
      await load();
    } catch (e) {
      error = errorText(e);
    } finally {
      busy = false;
    }
  }
</script>

<div class="photos" class:compact>
  {#if !compact}<p class="hint">Clear photos of your face, for thumbnails "with my face". Up to {max}: front, well lit, no sunglasses. More than one helps the AI keep your face. When you make a thumbnail with your face, these photos are sent to Google with your Gemini key.</p>{/if}
  <div class="row">
    {#each photos as p (p.name)}
      <figure>
        <img src={convertFileSrc(p.file) + `?t=${stamp}`} alt="Profile" />
        <button type="button" class="link" disabled={busy} onclick={() => remove(p.name)}>Remove</button>
      </figure>
    {/each}
    {#if photos.length < max}
      <button type="button" class="add" disabled={busy} onclick={add}>{photos.length ? "Add another photo" : "Add a photo"}</button>
    {/if}
  </div>
  {#if error}<ErrorBox message={error} context={{ step: "photos" }} />{/if}
</div>

<style>
  .photos { display: grid; gap: 8px; }
  .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-start; }
  figure { margin: 0; display: grid; gap: 4px; justify-items: center; }
  img { width: 96px; height: 96px; object-fit: cover; border-radius: 10px; border: 1px solid var(--border); }
  .compact img { width: 64px; height: 64px; }
  .add { height: 96px; min-width: 96px; }
  .compact .add { height: 64px; }
</style>
