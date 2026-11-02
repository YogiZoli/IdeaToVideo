# IdeaToVideo build plan

Goal: one app, two engines (Script and Recorded), channel presets, 0 USD per
video at runtime, fully copyright clean. ITV must not depend on Claude at
runtime: any AI key works, the default is the free Gemini model, render is
local.

**How to use this file.** Every session reads this file first, does only the
next phase with the status "todo", marks it done, and writes what comes next
under "Next step" at the bottom. Read the repo before writing code. Reuse
everything that exists, never rebuild what is already there.

## Clean room rules (valid for every phase)

- Build only from the specs in this file and your own knowledge. Never open,
  read or copy any third-party skill, code, prompt, style sheet or image,
  including the editor and faceless skills in Zoltan's `.claude\skills` folder
  and any "Vox" files in Downloads.
- Own preset names and own color palettes. No brand names, channel names or
  trademarks anywhere in the app or the output.
- Fonts: OFL licensed only, bundled with the app.
- Bundled models and libraries: MIT, Apache 2.0, BSD or OFL only. No GPL, no
  non-commercial licenses.
- External images: only CC0 or Public Domain, from Openverse (license filter
  cc0 and pdm), Wikimedia Commons (PD and CC0 only), Library of Congress ("no
  known restrictions") or US federal government works. Maps: Natural Earth,
  bundled. Every external asset is logged in the project's
  `assets_license.json` (source URL, license, author, date). Anything without
  a clear CC0 or PD license is rejected.
- Never show a recognizable real person. People and characters are drawn by
  code.
- Music and sound effects: synthesized by code, or Zoltan's own files in a
  per-channel folder. Never download music.
- Voice per channel: Zoltan's ElevenLabs clone, or local Kokoro TTS as the
  free default. Word-level timestamps from a local speech model, so every
  scene change lands on the right word.
- Avatar: HeyGen API, engine `avatar_iii` only, transparent output composited
  1:1 with no mask, resize or reposition.
- 16:9 only. No shorts. Never publish automatically.
- Build the Windows installer locally. Never trigger GitHub Actions (billing).

## The preset engine (the contract every preset follows)

A style preset is three things in one folder, `runner/presets/<id>/`:

1. **Style sheet:** `preset.json` holds the JSON tokens (colors, fonts, shape,
   texture). A style sheet PNG is rendered by code from those tokens.
2. **Scene templates:** 8 to 15 parameterized templates. Each one declares its
   parameters (type, word limit, required or not) and when it fits.
3. **Shot rules:** pacing, cut frequency, camera, character behaviour, sound.

At runtime the LLM only outputs scene JSON that fills the templates. The
prompt stays small and every answer is checked, repaired once, and otherwise
filled by a rule without AI, so a small free model handles it reliably.

A channel is an Identity plus one locked recipe (`<identity>/recipe.json`):
engine, style preset, voice, avatar on or off, music on or off, target length.

## Phases

### Phase 1: Channel Presets and preset engine

Status: done (2026-11-02, DECISIONS 132 to 136)

- On start Zoltan picks a channel. Each channel has one locked recipe: engine,
  style preset, voice, avatar on/off, music on/off, target length. Then one
  screen: idea or script in, video out, through the existing preview step,
  render, Publishing Card, Thumbnail Maker and PDT export.
- Move the Motion Wizard and the other start wizards behind an "Advanced"
  toggle. Do not delete them.
- "Week batch": generate 7 scripts for the selected channel in one run and
  queue them.
- Preset engine: a style preset = style sheet (JSON tokens plus a style sheet
  PNG rendered by code) + a library of 8 to 15 parameterized scene templates +
  shot rules (pacing, cut frequency, camera, character behaviour, sound). At
  runtime the LLM only outputs scene JSON that fills the templates; a small
  free model must handle it reliably.
- Asset license module and the free voice option, as in the rules.
- Preset 1 = the current HyperFrames motion graphics with Zoltan's zg-frames
  library, unchanged, as the default.

### Phase 2: Preset "Archive Collage" (documentary collage explainer)

Status: todo

Aged paper and map texture as the stage. Halftone black-and-white cutouts
(objects, places, code-drawn generic figures) with a rough light keyline and an
offset accent stroke. Giant stat numbers as hero elements. Map pins and route
lines on Natural Earth maps. Torn paper edges, print grain, matte finish. One
hot accent only for strokes, underlines and arrows; one secondary accent used
rarely. Layers at different depths with real parallax. Motion: spring pop-ups
with slight overshoot, staggered entrances, ticking counters, underline swipes,
one slow camera drift per scene, and a rare "alert" beat where the whole frame
floods to the accent color.

### Phase 3: Preset "Stick World" (what-if stories)

Status: todo

Light plain background, black stick figures, the hero marked by one
accent-colored item of clothing. Camera nearly still. Characters blink every
3.5 to 4 seconds, feet stay planted when walking. One short sentence per shot,
the narrator talks to "you". Big readable text for key numbers.

### Phase 4: Preset "Night Case File" (true story documentary)

Status: todo

Dark blue-black scenes, faceless figures glowing in one accent color, rooms and
streets built from simple shapes. Never show weapons, blood or violence: events
are implied by light flashes and sound. Date and place stamps, evidence board
scenes. Scripts are fact-checked and a sources list goes into the Publishing
Card.

### Phase 5: Preset "3D Explainer" (one strange question per video)

Status: todo

Simple 3D scenes rendered with three.js inside the composition: soft-shaded
objects, cutaway views, scale comparisons, bright clean materials, smooth camera
moves.

### Phase 6: Preset "Soft Clay Chronicle" (warm history documentary)

Status: todo

three.js scenes with a matte, hand-made clay look: rounded faceless figures,
subtle fingerprint texture, warm lamp light, old map table surfaces, a soft glow
on the object the story is about, a small date label in a corner.

### Phase 7: Recorded engine

Status: todo

Zoltan drops a finished recording. Local transcription with timestamps (checked
against the video), cut silences, filler words and repeated takes, then apply a
recorded preset:

- "Talking head documentary": B-roll from the allowed image sources, big words,
  chapter titles.
- "Screen share": layout switches between full face, split and big screen about
  every 8 seconds, zoom on clicks.
- "Profile Silhouette": side-angle take turned into a dark silhouette with rim
  light on a flat color background that changes at story beats, using a local
  Apache or MIT licensed person segmentation model.

Output goes into the same publishing tail. No transition sounds.

## Open decisions for Zoltan (found in Phase 1, nothing changed yet)

The rules above are stricter than what ITV already ships. These were not
touched, because each one changes how every video is made. The channel flow
avoids them where it can; the rest waits for his decision.

| What | Rule it meets | Where it stands |
|---|---|---|
| FFmpeg, the BtbN GPL build (libx264) | no GPL | Shipped next to the app, run as a separate program. Without GPL means another H.264 encoder (OpenH264 or the graphics card), a change to every render. |
| GSAP, its own "no charge" license | MIT, Apache, BSD or OFL only | The engine needs it. docs/gsap-license-question.md has the earlier decision. |
| libvips through sharp (LGPL), inside the engine | MIT, Apache, BSD or OFL only | Comes with HyperFrames, not used by ITV directly. |
| Non-OFL fonts | OFL only | library/fonts.json records no license per font. Not audited yet. Phase 2 must list only OFL fonts in its tokens. |
| The registry component `vox-annotate` | no brand names | Status "on" in library/catalog.json, so the catalog plan (Advanced) can still pick it. No preset template uses it. |
| Pixabay, Unsplash, AI B-roll, ElevenLabs Music | allowed sources, music, 0 USD | Still in the Advanced paths. A channel video's build refuses outside pictures without CC0 or PD proof; the channel flow never calls the others. |
| Gemini thumbnail pictures | 0 USD | Still a choice on the Thumbnail tab, with its price. Channel videos start on the free maker. |

Other findings:

- The Library of Congress puts a Cloudflare bot check in front of its JSON, so
  the app's search gets a 403 and says so. Decide whether to keep it as a source
  (its images often sit on Wikimedia Commons too). Openverse's server gave a 504
  on 2026-11-02 in a browser too: try it again before Phase 2 relies on it.

- The block `rail` in Zoltan's zg-frames library lands its last stop after the
  scene ends in any scene over 4.2 s (`autoRail`: 1.5 x length minus 2.1). The
  preset uses `grid-card-assemble` for steps instead. The canon was not changed.
- The block `highlighter` has a fixed second line ("in front of the slow step")
  that no variable reaches. The preset uses `marker-highlight` instead.
- Preset 1 uses the zg-frames blocks when the channel has the pack, which
  DECISIONS 130 had stopped planning. The Scenes tab's catalog plan is unchanged.

## What Phase 2 and later reuse

- A preset is one folder: `runner/presets/<id>/preset.json`, checked by
  `checkPreset`. The contract is in `runner/presets/index.mjs`.
- `use` names what draws a template: a bundled component, or `<pack>:<block>`.
  New hand-drawn templates should ship as a block pack (`runner/packs/`), which
  already has variables, roles and a build path. Phase 2 needs to let a preset
  bring its own pack from its folder (today `registerPacks` reads the Identity's).
- `ruleParams` in `runner/gates/scenes/templates.mjs` knows the Motion Frames
  template ids. A new preset adds its own rules there or names rule-fillable ids.
- Whisper is not in the app yet. Kokoro gives word times itself and ElevenLabs
  gives them with its audio, so Phase 7 is the first to need a local transcriber.
- Publishing Card sources (Phase 4): `video-publishing-card/1` takes optional blocks.

## Next step

Phase 2: Preset "Archive Collage". First, Zoltan's decisions on the table above
if he has made them.
