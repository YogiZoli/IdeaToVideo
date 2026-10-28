// feedback-1006.test.mjs: the fixes from Zoltan's test of 2026-10-06 with the
// c105d15 installer (feedback/2026-10-06/NOTES.md): the check stopping every
// build at constellation-hub, the Hungarian voice refused with v2, the avatar
// reset by the preview build, the raw Claude credit error.

import "./fixtures/test-catalog.mjs"; // the scene catalog fixture, before any scene module
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withoutCameraPage } from "./gates/review/index.mjs";
import { sceneOf } from "./gates/build/index.mjs";
import { speak, DEFAULT_MODEL } from "./providers/tts/elevenlabs.mjs";
import { friendlyError, bodyMessage } from "./providers/llm.mjs";
import { GATES, setGate } from "./project.mjs";

const CAM_PAGE = [
  `<div id="main">`,
  `    <div id="cam-1" class="itv-cam" style="position:absolute;inset:0;transform-origin:50% 50%">`,
  `      <div id="scene-1" class="clip" data-composition-id="constellation-hub" data-composition-src="a.html" data-start="0" data-duration="4" data-track-index="1"></div>`,
  `    </div>`,
  `</div>`,
  `      tl.fromTo("#cam-1", { x: 0, y: 0 }, { x: 1, duration: 4 }, 0);`,
  ``,
].join("\n");

test("check and stills see the page without the camera, and the built page comes back", async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "itv-cam-"));
  const index = path.join(out, "index.html");
  fs.writeFileSync(index, CAM_PAGE);
  const seen = await withoutCameraPage(out, (built) => {
    assert.equal(built, CAM_PAGE, "the callback gets the built page");
    return fs.readFileSync(index, "utf8");
  });
  assert.ok(!/itv-cam|#cam-/.test(seen), "the engine sees no camera wrapper");
  assert.equal(fs.readFileSync(index, "utf8"), CAM_PAGE, "the built page is back");
  await assert.rejects(
    withoutCameraPage(out, () => {
      throw new Error("check failed");
    }),
    /check failed/,
  );
  assert.equal(fs.readFileSync(index, "utf8"), CAM_PAGE, "back after a failure too");
  fs.rmSync(out, { recursive: true, force: true });
});

test("a check finding names its scene", () => {
  assert.equal(sceneOf({ sourceFile: "compositions/components/scene-9-constellation-hub.html" }), "Scene 9: ");
  assert.equal(sceneOf({ sourceFile: "compositions\\components\\scene-12-count-up.html" }), "Scene 12: ");
  assert.equal(sceneOf({ sourceFile: "index.html" }), "");
  assert.equal(sceneOf({}), "");
});

function fakeFetch(answers) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    return { ok: a.status === 200, status: a.status, json: async () => a.json, text: async () => JSON.stringify(a.json) };
  };
  f.calls = calls;
  return f;
}
const chars = [..."Szia"];
const AUDIO = { audio_base64: Buffer.from("mp3").toString("base64"), alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i / 10), character_end_times_seconds: chars.map((_, i) => i / 10 + 0.05) } };
const REFUSED = { detail: { status: "unsupported_language", message: "Model 'eleven_multilingual_v2' does not support language_code 'hu'." } };

test("ElevenLabs: v4 by default with the language code, v2 without it", async () => {
  assert.equal(DEFAULT_MODEL, "eleven_v4");
  const v4 = fakeFetch([{ status: 200, json: AUDIO }]);
  await speak({ apiKey: "k".repeat(20), fetchImpl: v4, voiceId: "v", text: "Szia", languageCode: "hu" });
  assert.equal(v4.calls[0].body.model_id, "eleven_v4");
  assert.equal(v4.calls[0].body.language_code, "hu");
  const v2 = fakeFetch([{ status: 200, json: AUDIO }]);
  await speak({ apiKey: "k".repeat(20), fetchImpl: v2, voiceId: "v", text: "Szia", languageCode: "hu", model: "eleven_multilingual_v2" });
  assert.equal(v2.calls[0].body.language_code, undefined);
});

test("ElevenLabs: a refused language code is tried once more without it", async () => {
  const f = fakeFetch([{ status: 400, json: REFUSED }, { status: 200, json: AUDIO }]);
  const r = await speak({ apiKey: "k".repeat(20), fetchImpl: f, voiceId: "v", text: "Szia", languageCode: "hu", sleep: async () => {} });
  assert.equal(r.audio.toString(), "mp3");
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].body.language_code, undefined);
  // any other 400 is not "try again later"
  const bad = fakeFetch([{ status: 400, json: { detail: { status: "bad_request", message: "nope" } } }]);
  await assert.rejects(speak({ apiKey: "k".repeat(20), fetchImpl: bad, voiceId: "v", text: "x", sleep: async () => {} }), (e) => /did not accept/.test(e.message) && !/later/.test(e.message));
});

test("AI errors: the provider's words, and an empty account said plainly", () => {
  const anthropic = `400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}`;
  assert.match(friendlyError("Claude", 400, anthropic), /no credit left/);
  assert.equal(bodyMessage(`[{"error":{"code":400,"message":"Invalid value","status":"INVALID_ARGUMENT"}}]`), "Invalid value");
  assert.equal(friendlyError("Gemini", 400, `{"error":{"message":"Bad model"}}`), "Gemini refused the request: Bad model");
  assert.equal(bodyMessage("plain text"), "plain text");
});

test("the avatar comes before the preview: building the preview keeps an approved avatar", () => {
  assert.deepEqual(GATES, ["script", "voice", "scenes", "avatar", "review"]);
  const approved = Object.fromEntries(GATES.map((g) => [g, { state: "approved" }]));
  const project = { schema: 1, id: "x", title: "x", status: "Scened", language: "hu", autopilot: false, createdAt: "2026-10-06T00:00:00Z", gates: approved };
  const building = setGate(project, "review", { state: "running" });
  assert.equal(building.gates.avatar.state, "approved");
  const newAvatar = setGate(project, "avatar", { state: "running" });
  assert.equal(newAvatar.gates.review.state, "todo", "a new avatar needs a new preview");
});
