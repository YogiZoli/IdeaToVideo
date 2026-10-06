import { test } from "node:test";
import assert from "node:assert/strict";
import { readRpc, keywordIdeas, testVidiq, MCP_URL } from "./providers/research/vidiq.mjs";
import { testServiceKey } from "./providers/keys.mjs";

const KEY = "vq-test-0123456789abcdef";

test("JSON-RPC answers are read from plain JSON and from an event stream", () => {
  assert.deepEqual(readRpc('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}', 1).result, { ok: true });
  assert.deepEqual(readRpc('event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"x":1}}\n\n', 2).result, { x: 1 });
  assert.equal(readRpc('data: {"jsonrpc":"2.0","id":3,"result":{}}', 9), null);
});

// A stand-in for mcp.vidiq.com: session id on initialize, then the tools.
function fakeServer({ sse = false, status = 200, toolText } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, body });
    const reply = (o) => {
      const text = sse ? `event: message\ndata: ${JSON.stringify(o)}\n\n` : JSON.stringify(o);
      return { ok: status < 300, status, headers: { get: (h) => (h === "mcp-session-id" ? "sess-1" : null) }, text: async () => text };
    };
    if (status !== 200) return reply({});
    if (body.method === "initialize") return reply({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18" } });
    if (body.method === "notifications/initialized") return { ok: true, status: 202, headers: { get: () => null }, text: async () => "" };
    if (body.params?.name === "vidiq_balance") return reply({ jsonrpc: "2.0", id: body.id, result: { structuredContent: { totalCredits: 4100 } } });
    return reply({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: toolText }] } });
  };
  impl.calls = calls;
  return impl;
}

test("the key test costs no credit and says how many are left", async () => {
  const f = fakeServer({ sse: true });
  assert.deepEqual(await testVidiq({ apiKey: KEY, fetchImpl: f }), { ok: true, message: "vidIQ key works, 4100 credits left." });
  assert.equal(f.calls[0].url, MCP_URL);
  assert.equal(f.calls[0].headers.authorization, `Bearer ${KEY}`);
  assert.equal(f.calls[2].headers["mcp-session-id"], "sess-1", "the session id goes with every later call");
  assert.equal(f.calls[2].body.params.name, "vidiq_balance");
  assert.equal((await testServiceKey({ service: "vidiq", apiKey: KEY, fetchImpl: fakeServer() })).ok, true, "wired into Test key");
});

test("keyword ideas: the seed first, then the related ones by score", async () => {
  const data = {
    seedKeyword: { keyword: "faceless youtube video", estimatedMonthlySearch: 11930, volume: 60.8, competition: 44.5, overall: 58.7, searchDemandGrowthPct: -45.8 },
    relatedKeywords: [
      { keyword: "make money on youtube", estimatedMonthlySearch: 66734, competition: 50, overall: 63.2 },
      { keyword: "youtube automation", estimatedMonthlySearch: 2689310, competition: 44.3, overall: 79.9 },
    ],
  };
  const f = fakeServer({ toolText: `Research for **x** found 2 related suggestions.\n\nKeyword data (JSON):\n${JSON.stringify(data)}` });
  const r = await keywordIdeas({ apiKey: KEY, keyword: "faceless youtube video", fetchImpl: f });
  assert.deepEqual(r.keywords.map((k) => [k.keyword, k.score]), [["faceless youtube video", 59], ["youtube automation", 80], ["make money on youtube", 63]]);
  assert.deepEqual(f.calls[2].body.params, { name: "vidiq_keyword_research", arguments: { keyword: "faceless youtube video", mode: "research" } });
});

test("a rejected key is said plainly and never shown", async () => {
  await assert.rejects(testVidiq({ apiKey: KEY, fetchImpl: fakeServer({ status: 401 }) }), (e) => /rejected the API key/.test(e.message) && !e.message.includes(KEY));
});
