// research/vidiq.mjs: keyword data from vidIQ (DECISIONS 42, 64), through
// vidIQ's MCP server with the user's own API key (made at
// app.vidiq.com/account/settings/mcp, MCP access only, revocable). vidIQ has
// no REST API; its MCP server speaks JSON-RPC over HTTP ("streamable HTTP"):
// initialize, then tools/call. Answers come as JSON or as an event stream.
//
// Tools used: vidiq_balance (0 credits, the key test) and
// vidiq_keyword_research in "research" mode (a seed keyword with its monthly
// searches, competition and score, plus up to 20 related keywords).

import { redact } from "../llm.mjs";

export const MCP_URL = "https://mcp.vidiq.com/mcp";
const PROTOCOL = "2025-06-18";

// One JSON-RPC message out of a JSON body or an SSE stream ("data: {...}").
export function readRpc(text, id) {
  const candidates = [];
  const t = String(text).trim();
  if (t.startsWith("{") || t.startsWith("[")) candidates.push(t);
  for (const line of t.split(/\r?\n/)) if (line.startsWith("data:")) candidates.push(line.slice(5).trim());
  for (const c of candidates) {
    try {
      const j = JSON.parse(c);
      for (const m of Array.isArray(j) ? j : [j]) if (m && m.id === id) return m;
    } catch {
      // not JSON: skip
    }
  }
  return null;
}

export class VidiqSession {
  constructor({ apiKey, fetchImpl = fetch, timeoutMs = 60000 }) {
    if (!apiKey) throw new Error("No vidIQ API key. Add it in Settings (make it at app.vidiq.com, Settings, MCP).");
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.session = null;
    this.nextId = 1;
  }

  async post(message) {
    let res;
    try {
      res = await this.fetchImpl(MCP_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "mcp-protocol-version": PROTOCOL,
          ...(this.session ? { "mcp-session-id": this.session } : {}),
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new Error(`Could not reach vidIQ: ${redact(e.message, this.apiKey)}`);
    }
    const sid = res.headers?.get?.("mcp-session-id");
    if (sid) this.session = sid;
    const text = redact(await res.text().catch(() => ""), this.apiKey);
    if (res.status === 401 || res.status === 403) throw new Error("vidIQ rejected the API key. Make a new one at app.vidiq.com (Settings, MCP) and add it in Settings.");
    if (res.status === 402) throw new Error("vidIQ says your plan has no access to this (HTTP 402).");
    if (res.status === 429) throw new Error("vidIQ rate limit reached. Try again in a minute.");
    if (!res.ok && res.status !== 202) throw new Error(`vidIQ answered with HTTP ${res.status}. Try again later.`);
    return text;
  }

  async request(method, params) {
    const id = this.nextId++;
    const text = await this.post({ jsonrpc: "2.0", id, method, params });
    const m = readRpc(text, id);
    if (!m) throw new Error("vidIQ gave an answer the app could not read.");
    if (m.error) throw new Error(`vidIQ: ${String(m.error.message ?? "error").slice(0, 200)}`);
    return m.result;
  }

  async open() {
    await this.request("initialize", { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "IdeaToVideo", version: "0.1" } });
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
    return this;
  }

  // A tool's result: its structured content if given, else the JSON block in
  // its text ("Keyword data (JSON): {...}"), else its Markdown tables (vidIQ's
  // answer since 2026-11: "### seedKeyword" with a table under it), else the text.
  async tool(name, args = {}) {
    const r = await this.request("tools/call", { name, arguments: args });
    if (r?.isError) throw new Error(`vidIQ: ${(r.content ?? []).map((c) => c.text).join(" ").slice(0, 200) || "the tool failed"}`);
    return readToolResult(r);
  }
}

export function readToolResult(r) {
  if (r?.structuredContent) return r.structuredContent;
  const text = (r?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const at = text.indexOf("{");
  if (at >= 0) {
    try {
      return JSON.parse(text.slice(at, text.lastIndexOf("}") + 1));
    } catch {
      // not JSON: the tables below
    }
  }
  const tables = markdownTables(text);
  return Object.keys(tables).length ? { ...tables, text } : { text };
}

// A cell of a vidIQ table: "129361" and "+98.7%" are numbers, "<750" is a number with
// below set ("under 750"), "null", "none", "" and "-" are unknown (null, never 0).
export function cellValue(v) {
  const t = String(v ?? "").trim();
  if (!t || /^(null|none|n\/a|-|unknown)$/i.test(t)) return null;
  const m = /^([<>])?\s*([+-]?[\d,]*\.?\d+)\s*%?$/.exec(t);
  if (!m) return t;
  const n = Number(m[2].replace(/,/g, ""));
  if (!Number.isFinite(n)) return t;
  return m[1] === "<" ? { value: n, below: true } : n;
}

// The Markdown tables of an answer, by the "### name (count)" heading above each one.
// The first column and topMarkets stay text, the rest are read with cellValue.
export function markdownTables(text) {
  const out = {};
  let name = null;
  let head = null;
  const split = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const t = line.trim();
    const h = /^#{2,4}\s+([A-Za-z][\w ]*?)\s*(\(\d+\))?$/.exec(t);
    if (h) {
      name = h[1].trim().replace(/\s+(\w)/g, (_, c) => c.toUpperCase());
      head = null;
      continue;
    }
    if (!name || !t.startsWith("|")) {
      if (t) head = null;
      continue;
    }
    const cells = split(t);
    if (!head) {
      head = cells.map((c) => c.replace(/\s*\(.*\)$/, ""));
      out[name] = out[name] ?? [];
      continue;
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    const row = {};
    head.forEach((k, i) => (row[k] = i === 0 || k === "topMarkets" ? cells[i] ?? "" : cellValue(cells[i])));
    out[name].push(row);
  }
  // vidIQ shows the one seed row as a table too: the code reads it as one object
  if (Array.isArray(out.seedKeyword)) out.seedKeyword = out.seedKeyword[0] ?? null;
  return out;
}

// vidIQ wants a 2 letter country code. The wizard's Market answer is a name ("United States").
const COUNTRIES = { "united states": "US", usa: "US", "u.s.": "US", america: "US", "united states of america": "US", "united kingdom": "GB", uk: "GB", "great britain": "GB", britain: "GB", england: "GB", canada: "CA", australia: "AU", "new zealand": "NZ", ireland: "IE", india: "IN", germany: "DE", deutschland: "DE", austria: "AT", switzerland: "CH", france: "FR", spain: "ES", "españa": "ES", italy: "IT", portugal: "PT", brazil: "BR", brasil: "BR", mexico: "MX", "méxico": "MX", argentina: "AR", netherlands: "NL", "the netherlands": "NL", holland: "NL", belgium: "BE", sweden: "SE", norway: "NO", denmark: "DK", finland: "FI", poland: "PL", hungary: "HU", "magyarország": "HU", romania: "RO", "czech republic": "CZ", czechia: "CZ", slovakia: "SK", greece: "GR", turkey: "TR", "türkiye": "TR", russia: "RU", ukraine: "UA", japan: "JP", "south korea": "KR", korea: "KR", china: "CN", philippines: "PH", indonesia: "ID", malaysia: "MY", singapore: "SG", thailand: "TH", vietnam: "VN", pakistan: "PK", bangladesh: "BD", nigeria: "NG", kenya: "KE", "south africa": "ZA", egypt: "EG", "saudi arabia": "SA", "united arab emirates": "AE", uae: "AE", israel: "IL", colombia: "CO", chile: "CL", peru: "PE" };
export function countryCode(v) {
  const t = String(v ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return COUNTRIES[t.toLowerCase().replace(/\s+/g, " ")] ?? null;
}

// The key test: costs no credit.
export async function testVidiq({ apiKey, fetchImpl }) {
  const s = await new VidiqSession({ apiKey, fetchImpl }).open();
  const b = await s.tool("vidiq_balance");
  const credits = typeof b?.totalCredits === "number" ? `, ${b.totalCredits} credits left` : "";
  return { ok: true, message: `vidIQ key works${credits}.` };
}

const num = (x) => (typeof x === "number" ? x : x && typeof x.value === "number" ? x.value : null);
const round = (x) => (num(x) === null ? null : Math.round(num(x)));
const row = (k) => ({
  keyword: String(k.keyword).trim(),
  monthlySearches: round(k.estimatedMonthlySearch),
  ...(k.estimatedMonthlySearch?.below ? { monthlyBelow: true } : {}),
  volume: round(k.volume),
  competition: round(k.competition),
  score: round(k.overall),
  growthPct: round(k.searchDemandGrowthPct),
});

// Keyword ideas for a topic: the seed first, then the related ones by score.
export async function keywordIdeas({ apiKey, keyword, country, fetchImpl }) {
  const s = await new VidiqSession({ apiKey, fetchImpl }).open();
  const code = countryCode(country);
  const d = await s.tool("vidiq_keyword_research", { keyword: String(keyword).slice(0, 150), mode: "research", ...(code ? { country: code } : {}) });
  const seed = d?.seedKeyword ? [row(d.seedKeyword)] : [];
  const related = (d?.relatedKeywords ?? []).map(row).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  if (!seed.length && !related.length) throw new Error("vidIQ found no keyword data for this topic.");
  return { keywords: [...seed, ...related] };
}

// The ranking rule, one for every screen: the searches a new channel can win, that is
// monthly searches times (100 minus competition) / 100. A row with no searches number
// comes after every row with one; equal values go by lower competition, then by name.
export function rankValue(k) {
  if (typeof k?.monthlySearches !== "number") return null;
  const c = typeof k.competition === "number" ? Math.min(100, Math.max(0, k.competition)) : 50;
  return Math.round((k.monthlySearches * (100 - c)) / 100);
}
export function rankKeywords(list) {
  return [...list].sort((a, b) => {
    const [x, y] = [rankValue(a), rankValue(b)];
    if (x === null || y === null) return x === null && y === null ? String(a.keyword).localeCompare(String(b.keyword)) : x === null ? 1 : -1;
    return y - x || (a.competition ?? 100) - (b.competition ?? 100) || String(a.keyword).localeCompare(String(b.keyword));
  });
}

export const MAX_SEARCHES = 20;
export const CREDITS_PER_CALL = 5;
const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const rowsOf = (d) => [d?.seedKeyword, ...(d?.relatedKeywords ?? []), ...(d?.keywords ?? []), ...(d?.matchingTerms ?? []), ...(d?.questions ?? []), ...(d?.risingKeywords ?? []), ...(d?.rising ?? [])].filter((k) => k && typeof k.keyword === "string" && k.keyword.trim());

// The calls of the wizard's deep research: one research call with related keywords per
// typed search (at most 20), then matching terms and questions for the main topic, and
// rising keywords for it when asked.
export function plannedCalls({ searches = [], topic = "", rising = false } = {}) {
  const seen = new Set();
  const calls = [];
  for (const q of searches) {
    const t = String(q ?? "").trim().slice(0, 150);
    if (t && !seen.has(norm(t)) && calls.length < MAX_SEARCHES) {
      seen.add(norm(t));
      calls.push({ seed: t, args: { keyword: t, mode: "research", includeRelated: true, limit: 30 } });
    }
  }
  const main = String(topic ?? "").trim().slice(0, 150) || calls[0]?.seed || "";
  if (main) {
    calls.push({ seed: main, args: { keyword: main, mode: "matching_terms", limit: 30 } });
    calls.push({ seed: main, args: { keyword: main, mode: "questions", limit: 30 } });
    if (rising) calls.push({ seed: main, args: { mode: "rising", niche: main, limit: 50 } });
  }
  return calls;
}

// One session, the credits before and after. A call that fails is listed, the rest go on.
// Every number comes from vidIQ; a keyword found twice keeps the row that has numbers.
export async function deepResearch({ apiKey, searches = [], topic = "", country = null, rising = false, fetchImpl, onProgress = () => {} }) {
  const calls = plannedCalls({ searches, topic, rising });
  if (!calls.length) throw new Error("Type at least one search first.");
  const code = countryCode(country);
  const s = await new VidiqSession({ apiKey, fetchImpl }).open();
  const left = (b) => (typeof b?.totalCredits === "number" ? b.totalCredits : null);
  const before = left(await s.tool("vidiq_balance").catch(() => null));
  const rows = new Map();
  const failed = [];
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    onProgress({ step: "research", done: i, of: calls.length, seed: c.seed, mode: c.args.mode });
    try {
      const d = await s.tool("vidiq_keyword_research", { ...c.args, ...(code && c.args.mode !== "rising" ? { country: code } : {}) });
      for (const raw of rowsOf(d)) {
        const r = { ...row(raw), seed: c.seed, mode: c.args.mode };
        const k = norm(r.keyword);
        const had = rows.get(k);
        if (!had || (had.monthlySearches === null && r.monthlySearches !== null)) rows.set(k, r);
      }
    } catch (e) {
      failed.push(`${c.seed} (${c.args.mode}): ${e.message}`);
    }
  }
  const after = left(await s.tool("vidiq_balance").catch(() => null));
  const keywords = rankKeywords([...rows.values()]).map((k) => ({ ...k, rank: rankValue(k) }));
  if (!keywords.length) throw new Error(`vidIQ found no keyword data for these searches.${failed.length ? ` ${failed[0]}` : ""}`);
  return { keywords, failed, calls: calls.length, creditsBefore: before, creditsAfter: after, creditsUsed: before !== null && after !== null ? Math.max(0, before - after) : null };
}
