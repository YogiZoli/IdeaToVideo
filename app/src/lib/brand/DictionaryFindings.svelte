<script lang="ts">
  // DictionaryFindings: the dictionary's machine check for one ONE Video
  // (gates 1 and 3): banned words and other spellings of preferred words.
  // Only shown when there is something; never blocks an approval.
  import type { DictFinding } from "../api";
  import { runner } from "../api";

  let { dir, version = 0, only }: { dir: string; version?: unknown; only?: "script" | "scene" } = $props();
  let findings = $state<DictFinding[]>([]);

  $effect(() => {
    void version;
    runner<{ findings: DictFinding[] }>("dictionary-check", { projectDir: dir })
      .then((r) => (findings = r.findings.filter((f) => !only || f.where.startsWith(only))))
      .catch(() => (findings = []));
  });

  const place = (w: string) => w.replace(/^script /, "").replace(/^scene /, "Scene ").replace(/sections\[(\d+)\]\.narration/, (_, n) => `section ${Number(n) + 1}`).replace(/^open\./, "opening, ").replace(/^own\./, "ending, ");
</script>

{#if findings.length}
  <div class="dict">
    <p class="head">Dictionary: {findings.length} {findings.length === 1 ? "word to look at" : "words to look at"}. You decide.</p>
    <ul>
      {#each findings as f, i (i)}
        <li>
          {#if f.kind === "banned"}
            "<b>{f.found}</b>" is on your banned list{f.instead ? `; say "${f.instead}" instead` : ""}
          {:else}
            "<b>{f.found}</b>" is written "{f.term}" in your dictionary
          {/if}
          <span class="where">({place(f.where)})</span>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .dict { border-left: 3px solid var(--warning, #b7791f); padding: 6px 12px; background: var(--warning-surface, #fff8e6); border-radius: 6px; }
  .head { margin: 0 0 4px; font-weight: 600; font-size: 14px; }
  ul { margin: 0; padding-left: 18px; font-size: 13px; }
  .where { color: var(--muted-foreground); }
</style>
