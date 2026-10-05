<script lang="ts">
  // An error the user can act on, plus a grey diagnostic line (code, version,
  // step, provider, time) and "Copy details" for bug reports.
  import { getVersion } from "@tauri-apps/api/app";
  import { detailLine, errorCode, type ErrorContext } from "./errors";
  import { log } from "./logger";

  let { message, context = {} }: { message: string; context?: ErrorContext } = $props();

  let version = $state("?");
  getVersion().then((v) => (version = v)).catch(() => {});
  const at = new Date();
  const detail = $derived(detailLine(message, version, context, at));
  let copied = $state(false);
  // A step the user stopped is no error: said calmly, logged as info.
  const calm = $derived(errorCode(message) === "ITV-STOPPED");
  // every error the user saw goes into the local log, with its code
  $effect(() => {
    log("error_shown", { message, code: errorCode(message), context }, calm ? "info" : "error");
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${message}\n${detail}`);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      copied = false;
    }
  }
</script>

<div class="errorbox" class:calm role="alert">
  <p class="message">{message}</p>
  <div class="detail">
    <code>{detail}</code>
    <button type="button" class="link" onclick={copy}>{copied ? "Copied" : "Copy details"}</button>
  </div>
</div>

<style>
  .errorbox { background: var(--danger-surface); border: 1px solid var(--danger-border); border-radius: var(--radius-md); padding: var(--space-4) var(--space-5); display: grid; gap: var(--space-2); }
  .calm { background: var(--surface-alt); border-color: var(--border); }
  .calm .message { color: var(--foreground); }
  .message { margin: 0; color: var(--danger-text); font-size: var(--text-sm); line-height: var(--lh-sm); white-space: pre-wrap; }
  .detail { display: flex; gap: var(--space-4); align-items: center; flex-wrap: wrap; }
  code { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--muted-foreground); }
</style>
