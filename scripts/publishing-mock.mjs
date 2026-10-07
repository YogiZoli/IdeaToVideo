#!/usr/bin/env node
// publishing-mock.mjs: a local stand-in for the publishing app's card
// endpoint (DECISIONS 115), the same contract the real one is built to:
//
//   POST /api/v1/cards   Authorization: Bearer <token>   body: the card
//   201 {"cardId", "url"} new, 200 the same cardId again (updated)
//   401 {"error"} wrong token, 400 {"error"} not a valid card
//
// Used by runner/publishing.test.mjs, and by hand to try "Send to
// Publishing" in the app:
//   node scripts/publishing-mock.mjs --port 8787 --token test-token
// then Settings, Publishing: http://localhost:8787 and the token.

import http from "node:http";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { validate, loadSchema } from "../runner/schema/validate.mjs";

// fail: a list of statuses the next requests answer with instead (500, ...).
export function startMock({ port = 0, token = "test-token", fail = [] } = {}) {
  const cards = new Map();
  const queue = [...fail];
  const server = http.createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (queue.length) return send(queue.shift(), { error: "The mock was told to fail." });
      if (req.method !== "POST" || req.url !== "/api/v1/cards") return send(404, { error: "Not found." });
      if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: "The token is not valid." });
      let card;
      try {
        card = JSON.parse(raw);
      } catch {
        return send(400, { error: "The card is not JSON." });
      }
      const errors = validate(card, loadSchema("video-publishing-card"));
      if (errors.length) return send(400, { error: `The card is not valid: ${errors[0]}` });
      const again = cards.has(card.cardId);
      cards.set(card.cardId, card);
      const { port: p } = server.address();
      send(again ? 200 : 201, { cardId: card.cardId, url: `http://localhost:${p}/cards/${card.cardId}` });
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, cards, url: `http://localhost:${server.address().port}`, close: () => new Promise((r) => server.close(r)) })));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { values } = parseArgs({ options: { port: { type: "string", default: "8787" }, token: { type: "string", default: "test-token" } } });
  const m = await startMock({ port: Number(values.port), token: values.token });
  console.log(`publishing mock on ${m.url}, token: ${values.token}`);
}
