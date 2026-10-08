// publishing.mjs: "Send to Publishing" (Zoltan, 2026-10-07, D4, DECISIONS
// 115). The Video Publishing Card of a rendered video goes to the user's
// publishing app:
//
//   POST {url}/api/v1/cards   Authorization: Bearer <token>   body: the card
//   200 or 201 {"cardId", "url"}   the card is there (sent again: updated)
//   4xx {"error"}                  a sentence for the user
//   5xx, no answer                 a problem on the way: try again
//
// The request goes from the runner, never from the window, so the window's
// CSP stays closed. The address is the user's (Settings, Connections): https
// only, plain http only for this computer (localhost), so the token never
// travels unencrypted. The token comes from the OS keychain like every key.

import fs from "node:fs";

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const TIMEOUT_MS = 30000;

// The publishing app's address, checked: an origin with an optional path
// prefix, no query, no password in it. Returns the clean base or throws.
export function checkUrl(raw) {
  const text = String(raw ?? "").trim();
  if (!text) throw new Error("Set the Publishing address in Settings, Connections first.");
  let u;
  try {
    u = new URL(text);
  } catch {
    throw new Error("The Publishing address is not a web address. It starts with https://");
  }
  const local = LOCAL.has(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) throw new Error("The Publishing address must start with https:// (plain http only for localhost).");
  if (u.username || u.password) throw new Error("The Publishing address must not contain a user name or password. Put the token in its own field.");
  if (u.search || u.hash) throw new Error("The Publishing address must not have a ? or # part.");
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

// The link the publishing app sends back: shown as a link only when it
// points to the same place (no other host can be opened through it).
export function sameOrigin(link, base) {
  try {
    const a = new URL(link);
    return (a.protocol === "https:" || a.protocol === "http:") && a.origin === new URL(base).origin ? a.href : null;
  } catch {
    return null;
  }
}

// Sends the card. Returns { ok: true, cardId, url, status } or
// { ok: false, retry, message, status }; never throws on a server's answer.
export async function sendCard({ url, token, cardFile, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  const base = checkUrl(url);
  if (!token) return { ok: false, retry: false, status: null, message: "Save the Publishing token in Settings, Connections first." };
  if (!/\.card\.json$/i.test(String(cardFile ?? "")) || !fs.existsSync(cardFile)) return { ok: false, retry: false, status: null, message: "This video has no publishing card. Render it again." };
  const card = fs.readFileSync(cardFile, "utf8");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(`${base}/api/v1/cards`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` }, body: card, signal: ctl.signal });
  } catch (e) {
    const why = e?.name === "AbortError" ? "it did not answer in 30 seconds" : "it could not be reached";
    return { ok: false, retry: true, status: null, message: `The publishing app at ${new URL(base).host}: ${why}. Check the address and your internet connection, then try again.` };
  } finally {
    clearTimeout(timer);
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.status === 200 || res.status === 201) {
    if (!body || typeof body.cardId !== "string") return { ok: false, retry: true, status: res.status, message: "The publishing app answered, but not with a card. Try again, or check the address." };
    return { ok: true, status: res.status, cardId: body.cardId, url: typeof body.url === "string" ? sameOrigin(body.url, base) : null, updated: res.status === 200 };
  }
  if (res.status >= 400 && res.status < 500) {
    const said = typeof body?.error === "string" && body.error.trim() ? body.error.trim().slice(0, 300) : null;
    const plain = res.status === 401 || res.status === 403 ? "The publishing app did not accept the token. Check it in Settings, Connections." : res.status === 404 ? "The publishing app has no card address there. Check the Publishing address in Settings." : `The publishing app refused the card (${res.status}).`;
    return { ok: false, retry: false, status: res.status, message: said ?? plain };
  }
  return { ok: false, retry: true, status: res.status, message: `The publishing app had a problem (${res.status}). Try again in a minute.` };
}
