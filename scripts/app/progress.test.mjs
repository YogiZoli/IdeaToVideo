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

test("the check-in: working, waiting for a service, seems stuck; the sleep; a busy service", async () => {
  const { fresh, apply, lifeText, pulseText, measure } = await import("../../app/src/lib/progressInfo.ts");
  const t = fresh("make-scenes", "C:/P/x");
  apply(t, { step: "estimate", expectSeconds: 30 });
  let now = Date.now();
  assert.deepEqual(lifeText(t, now), []);
  assert.equal(pulseText(t, now), "");
  apply(t, { step: "pulse", state: "waiting", busy: false, quiet: 120 });
  t.lastEvent = Date.now() - 120000;
  now = Date.now();
  assert.match(pulseText(t, now), /^Checked 0 s ago: waiting for the service$/);
  assert.match(lifeText(t, now)[0], /Waiting for the service: no answer for 2 min yet/);
  apply(t, { step: "pulse", state: "working", busy: true });
  assert.match(lifeText(t, Date.now())[0], /No new step for 2 min, but it is busy/);
  apply(t, { step: "pulse", state: "stuck" });
  apply(t, { step: "stalled" });
  assert.match(lifeText(t, Date.now())[0], /seems stuck.*press Stop/);
  assert.ok(Date.now() - t.lastEvent >= 120000, "check-ins are not news");
  apply(t, { step: "slept", seconds: 720 });
  assert.match(lifeText(t, Date.now())[0], /slept for 12 min during/);
  // a busy service says how long it waits, and the estimate grows by it
  apply(t, { step: "retry", waitSeconds: 30, message: "Gemini is busy (HTTP 503). Trying again in 30 s, round 2 of 4." });
  assert.match(t.phase, /Trying again in 30 s/);
  assert.equal(t.expect, 30 + 35);
  assert.ok(measure(t, Date.now()).percent < 99);
});

// RecCut reliability (DECISIONS 186): the top bar always says if the lid may close
import { lidState, wokeText, workPlace as placeOf } from "../../app/src/lib/progressInfo.ts";
test("the status line: idle, HeyGen only, local work, a run between steps", () => {
  assert.deepEqual(lidState([]), { busy: false, lid: true, text: "Nothing is running. You can close the laptop." });
  assert.equal(lidState(["recorded-avatar-bubble"]).lid, true, "HeyGen works on its own computers");
  assert.equal(lidState(["recorded-transcribe"]).lid, false);
  assert.equal(lidState(["recorded-avatar-bubble", "render-video"]).lid, false);
  assert.equal(lidState([], 1).lid, false, "a run between two steps still needs the laptop");
  assert.equal(placeOf("recorded-avatar-bubble"), "service");
});
test("after a sleep: nothing said when idle, what to do when a step was running", () => {
  assert.equal(wokeText(300, false, false), "");
  assert.match(wokeText(300, true, true), /goes on now/);
  assert.match(wokeText(300, true, false), /Go on from where it stopped/);
});
