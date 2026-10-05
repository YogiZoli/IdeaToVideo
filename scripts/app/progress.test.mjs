// The progress bar (Zoltan, 2026-10-01): it froze at 95% past the estimate,
// and did not say what was happening or what it costs.
import test from "node:test";
import assert from "node:assert/strict";
import { percentByTime, phaseText, costText, adviceText, clock } from "../../app/src/lib/progressInfo.ts";

test("past the estimate the bar keeps moving, never reaches 100", () => {
  assert.equal(percentByTime(50, 100), 47.5);
  const a = percentByTime(110, 100), b = percentByTime(150, 100), c = percentByTime(1000, 100);
  assert.ok(a > 95 && b > a && c > b && c < 99);
});

test("every long step says what it uses, and local steps say they use nothing", () => {
  for (const cmd of ["build-video", "render-video", "set-music"]) assert.match(costText(cmd), /No AI tokens and no credits/);
  assert.match(costText("write-script"), /AI tokens/);
  assert.match(costText("make-voice", "elevenlabs"), /ElevenLabs/);
  assert.match(costText("make-avatar"), /HeyGen credits/);
  assert.match(adviceText("render-video"), /sleep/);
});

test("phases in words, and the clock", () => {
  assert.equal(phaseText("make-voice", "mixing"), "Mixing voice and music");
  assert.equal(phaseText("x", "nope"), null);
  assert.equal(clock(65), "1:05");
});

// 2026-10-06: the bar says per step whether the lid may close, and what is
// going on when a step is quiet or the computer slept.
test("the lid: closed for HeyGen, open for the rest", async () => {
  const { adviceText, workPlace } = await import("../../app/src/lib/progressInfo.ts");
  assert.equal(workPlace("make-avatar"), "service");
  assert.match(adviceText("make-avatar"), /You may close the lid/);
  assert.equal(workPlace("make-voice"), "online");
  assert.match(adviceText("make-voice"), /lid open.*parts already read are kept/);
  assert.equal(workPlace("render-video"), "local");
  assert.match(adviceText("render-video"), /lid open.*runs on this computer/);
});

test("signs of life: quiet but alive, silent, slept, and a busy service", async () => {
  const { fresh, apply, lifeText, measure } = await import("../../app/src/lib/progressInfo.ts");
  const t = fresh("make-scenes", "C:/P/x");
  apply(t, { step: "estimate", expectSeconds: 30 });
  const now = Date.now();
  assert.deepEqual(lifeText(t, now), []);
  t.lastEvent = now - 120000;
  t.alive = now - 10000;
  assert.match(lifeText(t, now)[0], /No news for 2 min, but it is alive/);
  t.alive = now - 200000;
  assert.match(lifeText(t, now)[0], /No sign of life for 3 min 20 s.*5 minutes/);
  apply(t, { step: "slept", seconds: 720 });
  assert.match(lifeText(t, Date.now())[0], /slept for 12 min during/);
  // a heartbeat changes nothing but the time of life
  const before = { ...t };
  apply(t, { step: "alive" });
  assert.equal(t.phase, before.phase);
  // a busy service says how long it waits, and the estimate grows by it
  apply(t, { step: "retry", waitSeconds: 30, message: "Gemini is busy (HTTP 503). Trying again in 30 s, round 2 of 4." });
  assert.match(t.phase, /Trying again in 30 s/);
  assert.equal(t.expect, 30 + 35);
  assert.ok(measure(t, Date.now()).percent < 99);
});
