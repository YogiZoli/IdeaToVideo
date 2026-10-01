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
