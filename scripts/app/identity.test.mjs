// The two levels of settings (docs/identity.md 2-3): what the gates read is
// the Identity over the App, the AI override wins, and saving splits the
// edited settings back without mixing the levels.
import test from "node:test";
import assert from "node:assert/strict";
import { effectiveConfig, identityFromConfig, appFromConfig, youtubeHandle, roomForIdentity, copyName, FIRST_IDENTITY_NAME } from "../../app/src/lib/identity.ts";

const app = { schema: 2, onboarded: true, ui: { language: "en" }, llm: { provider: "gemini", model: "gemini-3.5-flash" }, projectsDir: null, activeIdentity: "vox", defaults: { autopilot: true } };
const ident = {
  schema: 1, id: "vox", name: "VoxFlow", folder: "VoxFlow", llm: null,
  brand: { preset: "coral", logo: null },
  channel: { audience: "founders", contentLanguage: "hu" },
  narrator: { provider: "elevenlabs", voice: "abc" },
  defaults: { scriptTemplate: "ownership", targetLengthMin: 6 },
};

test("effective settings: the Identity's fields, the App's AI unless overridden", () => {
  const c = effectiveConfig(app, ident);
  assert.equal(c.name, "VoxFlow");
  assert.equal(c.channel.audience, "founders");
  assert.deepEqual(c.llm, app.llm);
  assert.deepEqual(c.defaults, { scriptTemplate: "ownership", targetLengthMin: 6, autopilot: true });
  assert.deepEqual(c.avatar, { enabled: false }, "missing parts get their defaults");
  const own = effectiveConfig(app, { ...ident, llm: { provider: "claude", model: "claude-sonnet-5" } });
  assert.equal(own.llm.provider, "claude");
  own.llm.model = "changed";
  assert.equal(app.llm.model, "gemini-3.5-flash", "the merge does not share objects with the App");
});

test("saving splits the settings back into the Identity and the App", () => {
  const c = effectiveConfig(app, ident);
  c.channel.audience = "coaches";
  c.name = "  VoxFlow HU ";
  const i = identityFromConfig(c, ident);
  assert.equal(i.id, "vox");
  assert.equal(i.folder, "VoxFlow", "the core renames the folder, not the UI");
  assert.equal(i.name, "VoxFlow HU");
  assert.equal(i.channel.audience, "coaches");
  assert.equal(i.llm, null, "the App's AI does not become an override");
  assert.equal("autopilot" in i.defaults, false);
  const fresh = identityFromConfig({ ...c, name: "" }, null);
  assert.equal(fresh.name, FIRST_IDENTITY_NAME);
  assert.equal(fresh.id, undefined);
  const a = appFromConfig({ ...c, onboarded: true }, null);
  assert.deepEqual(a, { schema: 2, onboarded: true, ui: { language: "en" }, llm: app.llm, defaults: { autopilot: true } });
  assert.equal("channel" in a, false);
});

test("small helpers", () => {
  assert.equal(youtubeHandle("https://www.youtube.com/@zoltangero"), "@zoltangero");
  assert.equal(youtubeHandle(null), null);
  assert.equal(youtubeHandle("https://example.com"), null);
  assert.equal(roomForIdentity(1, 1), false);
  assert.equal(roomForIdentity(0, 1), true);
  assert.equal(roomForIdentity(99, null), true);
  assert.equal(copyName("VoxFlow", []), "VoxFlow copy");
  assert.equal(copyName("VoxFlow", ["voxflow copy"]), "VoxFlow copy 2");
});
