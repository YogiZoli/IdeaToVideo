import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expectSeconds, recordTiming, timed, DEFAULTS } from "./timings.mjs";

const envFor = () => ({ ITV_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "itv-timings-")) });

test("before any run: the measured defaults, never under the minimum", () => {
  const env = envFor();
  assert.equal(expectSeconds("scenes", 11, { env }), Math.round(DEFAULTS.scenes.perUnit * 11));
  assert.equal(expectSeconds("scenes", 1, { env }), DEFAULTS.scenes.min);
  assert.throws(() => expectSeconds("nope", 1, { env }), /No timing/);
});

test("the estimate learns from this computer: median of the last five", () => {
  const env = envFor();
  for (const s of [10, 20, 30, 40, 50, 60]) recordTiming("build", s, 10, { env });
  // kept: 2, 3, 4, 5, 6 s per scene; median 4
  assert.equal(expectSeconds("build", 10, { env }), 40);
  recordTiming("build", 0, 10, { env });
  recordTiming("build", 10, 0, { env });
  assert.equal(expectSeconds("build", 10, { env }), 40, "empty runs are not learned");
});

test("timed: tells the UI first, records after", async () => {
  const env = envFor();
  const events = [];
  const r = await timed("refill", 1, (e) => events.push(e), async () => new Promise((ok) => setTimeout(() => ok("done"), 30)), { env });
  assert.equal(r, "done");
  assert.deepEqual(events[0], { event: "progress", step: "estimate", timing: "refill", expectSeconds: DEFAULTS.refill.min > DEFAULTS.refill.perUnit ? DEFAULTS.refill.min : DEFAULTS.refill.perUnit });
  assert.ok(JSON.parse(fs.readFileSync(path.join(env.ITV_DATA_DIR, "timings.json"), "utf8")).refill.length === 1);
});
