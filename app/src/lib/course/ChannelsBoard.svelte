<script lang="ts">
  // The Channels board on Home (DECISIONS 127): one row per Identity and
  // playlist (or course). Videos done "X of N", the next video and the step
  // it is at, Sent to Publishing, and the Uploaded tick. "Open" goes to that
  // Identity and that video, which opens on its step (tabs.ts firstOpen).
  // Reads the course groups of every Identity's folder; stores nothing.
  import { onMount } from "svelte";
  import type { AppState } from "../api";
  import { runner } from "../api";
  import type { BoardPlaylist, BoardVideo } from "./board";
  import { stepText, day } from "./board";
  import UploadTick from "./UploadTick.svelte";

  let { app, openFor }: { app: AppState; openFor: (identityId: string, dir: string) => void } = $props();

  type Row = { identityId: string; identity: string; p: BoardPlaylist };
  let rows = $state<Row[] | null>(null);
  let failed = $state<string[]>([]);
  let openRow = $state<string | null>(null);
  const hasHeygen = $derived(!!app.keys["heygen"]);

  const folderOf = (folder: string) => `${app.projectsRoot.replace(/[\\/]+$/, "")}/${folder}`;

  async function load() {
    const out: Row[] = [];
    const bad: string[] = [];
    await Promise.all(
      app.identities.map(async (i) => {
        try {
          const r = await runner<{ playlists: BoardPlaylist[] }>("channel-board", { projectsDir: folderOf(i.folder) });
          for (const p of r.playlists) out.push({ identityId: i.id, identity: i.name, p });
        } catch {
          bad.push(i.name);
        }
      }),
    );
    out.sort((a, b) => a.identity.localeCompare(b.identity) || a.p.title.localeCompare(b.p.title));
    rows = out;
    failed = bad;
  }
  onMount(load);

  const nextOf = (p: BoardPlaylist): BoardVideo | null => p.videos.find((v) => v.id === p.next) ?? null;
  // the first finished video not ticked Uploaded yet, in playlist order
  const toUpload = (p: BoardPlaylist): BoardVideo | null => p.videos.find((v) => v.done && !v.upload) ?? null;
  const key = (r: Row) => `${r.identityId}/${r.p.slug}`;
  function uploaded(r: Row, v: BoardVideo, u: BoardVideo["upload"]) {
    v.upload = u;
    r.p.uploaded = r.p.videos.filter((x) => x.upload).length;
  }
</script>

{#if rows && (rows.length || failed.length)}
  <section class="card">
    <div class="head"><h2>Channels</h2><button type="button" class="ghost" onclick={load}>Refresh</button></div>
    <div class="scroll">
      <table>
        <thead><tr><th>Channel</th><th>Playlist</th><th>Done</th><th>Next video</th><th>Step</th><th>Sent</th><th>Uploaded</th><th></th></tr></thead>
        <tbody>
          {#each rows as r (key(r))}
            {@const next = nextOf(r.p)}
            {@const up = toUpload(r.p)}
            <tr>
              <td>{r.identity}</td>
              <td>{r.p.title}</td>
              <td class="n">{r.p.done} of {r.p.total}</td>
              <td class="t">{next ? `${next.position}. ${next.title}` : r.p.done === r.p.total ? "All done" : "None imported"}</td>
              <td>{next ? stepText(next, hasHeygen) : ""}</td>
              <td>{next ? (next.sentAt ? `Yes, ${day(next.sentAt)}` : "No") : ""}</td>
              <td class="n">{r.p.uploaded} of {r.p.total}</td>
              <td class="acts">
                {#if next?.dir}<button type="button" class="primary" onclick={() => openFor(r.identityId, next.dir!)}>Open</button>{/if}
                <button type="button" class="ghost" onclick={() => (openRow = openRow === key(r) ? null : key(r))}>{openRow === key(r) ? "Hide" : "Videos"}</button>
              </td>
            </tr>
            {#if openRow === key(r)}
              <tr class="more"><td colspan="8">
                {#if up}<p class="hint">Next to upload: {up.position}. {up.title}</p>{/if}
                <ol>
                  {#each r.p.videos as v (v.id)}
                    <li value={v.position}>
                      <div class="v">
                        <span class="t">{v.title}</span>
                        <span class="hint">{stepText(v, hasHeygen)}{v.sentAt ? `, sent ${day(v.sentAt)}` : ""}</span>
                        {#if v.dir}<button type="button" class="ghost" onclick={() => openFor(r.identityId, v.dir!)}>Open</button>{/if}
                      </div>
                      {#if v.dir && (v.done || v.upload)}<UploadTick dir={v.dir} compact changed={(u) => uploaded(r, v, u)} />{/if}
                    </li>
                  {/each}
                </ol>
              </td></tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
    {#if failed.length}<p class="hint">Could not read the videos of: {failed.join(", ")}.</p>{/if}
  </section>
{/if}

<style>
  .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  h2 { margin: 0; font-size: 17px; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
  th { text-align: left; font-weight: 600; color: var(--muted-foreground); padding: 6px; }
  td { padding: 8px 6px; border-top: 1px solid var(--border); vertical-align: top; }
  .n { white-space: nowrap; }
  .t { max-width: 260px; overflow: hidden; text-overflow: ellipsis; }
  .acts { display: flex; gap: 6px; justify-content: flex-end; }
  .more td { background: var(--muted); }
  ol { margin: 0; padding-left: 22px; display: grid; gap: 8px; }
  .v { display: flex; gap: 10px; align-items: center; }
  .v .t { flex: 1; }
  .hint { font-size: 13px; color: var(--muted-foreground); margin: 0; }
</style>
