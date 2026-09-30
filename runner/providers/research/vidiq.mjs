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
  // its text ("Keyword data (JSON): {...}"), else the text itself.
  async tool(name, args = {}) {
    const r = await this.request("tools/call", { name, arguments: args });
    if (r?.isError) throw new Error(`vidIQ: ${(r.content ?? []).map((c) => c.text).join(" ").slice(0, 200) || "the tool failed"}`);
    if (r?.structuredContent) return r.structuredContent;
    const text = (r?.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    const at = text.indexOf("{");
    if (at >= 0) {
      try {
        return JSON.parse(text.slice(at, text.lastIndexOf("}") + 1));
      } catch {
        // fall through
      }
    }
    return { text };
  }
}

// The key test: costs no credit.
export async function testVidiq({ apiKey, fetchImpl }) {
  const s = await new VidiqSession({ apiKey, fetchImpl }).open();
  const b = await s.tool("vidiq_balance");
  const credits = typeof b?.totalCredits === "number" ? `, ${b.totalCredits} credits left` : "";
  return { ok: true, message: `vidIQ key works${credits}.` };
}

const round = (x) => (typeof x === "number" ? Math.round(x) : null);
const row = (k) => ({
  keyword: k.keyword,
  monthlySearches: k.estimatedMonthlySearch ?? null,
  volume: round(k.volume),
  competition: round(k.competition),
  score: round(k.overall),
  growthPct: round(k.searchDemandGrowthPct),
});

// Keyword ideas for a topic: the seed first, then the related ones by score.
export async function keywordIdeas({ apiKey, keyword, country, fetchImpl }) {
  const s = await new VidiqSession({ apiKey, fetchImpl }).open();
  const d = await s.tool("vidiq_keyword_research", { keyword: String(keyword).slice(0, 150), mode: "research", ...(country ? { country } : {}) });
  const seed = d?.seedKeyword ? [row(d.seedKeyword)] : [];
  const related = (d?.relatedKeywords ?? []).map(row).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  if (!seed.length && !related.length) throw new Error("vidIQ found no keyword data for this topic.");
  return { keywords: [...seed, ...related] };
}
