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
  trademarks anywhere in the app or the output. Never use "Vox" or any other
  brand name in the app, titles or descriptions.
- Fonts: OFL licensed only, bundled with the app.
- Bundled models and libraries: MIT, Apache 2.0, BSD or OFL only. No GPL, no
  non-commercial licenses.
- External images and video: CC0 or Public Domain, from Openverse (license
  filter cc0 and pdm), Wikimedia Commons (PD and CC0 only), Library of Congress
  ("no known restrictions"), the Prelinger Archives on the Internet Archive
  (only an item that itself says public domain or CC0), NASA media or other US
  federal government works. Maps: Natural Earth, bundled.
- Two named exceptions to CC0 or PD: Pixabay (logged as "free license, not CC0")
  and Kie AI outputs (logged with model and prompt). No Pexels anywhere.
- Never use a source that requires attribution or a credit line. Sources that ask
  for attribution are rejected. Nothing about sources ever goes into the YouTube
  description.
- Every external asset, from any source, is logged in the project's
  `assets_license.json`: source URL or model name, license or terms, author,
  prompt (for AI), cost, date. Anything else without a clear license is rejected.
- AI prompts never name a real person, brand, logo, character or artist.
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

### Phase 1b: B-roll engine

Status: done (2026-11-02, DECISIONS 137). Not tried yet: a real paid clip (it needs
Zoltan's yes on the Preview tab) and a real AI on the plan and the frame check.

Moving video, not just stills, shared by every style preset and the Recorded
engine. For each scene that needs B-roll, the cheapest source that fits, in this
order:

a) Public Domain or CC0 video: Prelinger Archives on the Internet Archive, NASA
   media, Wikimedia Commons (PD and CC0 only).
b) Free animation of a still: a CC0 or Public Domain photo, depth estimated locally
   with Depth Anything V2 Small (Apache 2.0, downloaded once), a 2.5D parallax
   camera move (push in, drift, orbit) as a 4 to 6 second clip. Local, 0 USD.
c) Pixabay video and images, through the integration and key ITV already has.
   Logged as "free license, not CC0".
d) AI video via Kie AI (paid): image-to-video or text-to-video, 4 to 6 second clips,
   only for hero moments. The cheapest suitable model, its cost per clip in the UI.
   Prompts never name a real person, brand, logo, character or artist.

Budget for d): off by default. Per channel: a toggle, a max USD per video, a max
USD per month. The preview step shows which scenes would use paid clips and the
total cost; nothing is spent until Zoltan approves.

**Kie AI's terms on commercial use of outputs (read 2026-11-02).** The Terms of
Use (kie.ai/terms-of-use, NEXUSAI SERVICES LLC, last updated 2026-10-26) do **not**
say who owns AI-generated outputs and do not address their commercial use. They
cover "User Content", of which the user keeps ownership, granting a worldwide,
non-exclusive, royalty-free license to operate and improve the services; content
must not infringe third-party rights. They do not mention the terms of the
third-party models Kie AI resells. The only statement on commercial use is
marketing copy on the Seedance 1.0 page (kie.ai/bytedance/seedance-v1): a
"Commercial use" tag and "Fully licensed for business use". So: allowed according
to the product page, not granted in the terms. **Open for Zoltan:** ask
support@kie.ai for written confirmation before a paid clip goes into a monetized
video. The ledger records model, prompt, cost and date for every clip.

**The model:** Seedance 1.0 Lite (`bytedance/v1-lite-text-to-video`,
`bytedance/v1-lite-image-to-video`). Kie AI's price list, 2026-11-02: 2, 4.5 and 10
credits a second at 480p, 720p and 1080p, 1 credit is about 0.005 USD, a failed task
is not charged. A 5 second clip: 0.05, 0.12 (the default, 720p; exactly 0.1125,
shown rounded up) and 0.25 USD. The cheapest per second on that list that gives a
16:9 clip of about 5 seconds.

**Built on what was there:** `runner/broll/engine.mjs` uses the same `broll.json`
plan, order file (`pending.json`), footage library and scene table `footage` list
as the Scenes tab's panel. A parallax clip is a HyperFrames composition rendered by
the engine (about 70 s a clip on this computer), never a frame engine of our own.
**Where it runs:** the recipe's new B-roll switch (a new channel: on; a recipe locked
before this phase keeps what it had: off), between the scene plan and the build.

### Phase 2: Recorded engine

Status: todo

Own implementation, never read or copy third-party editing skills. Input: a camera
file, a screen file, both, or one combined file. Local transcription with word
timestamps, checked against the video. Cut silences, filler words and repeated takes
(keep the last good take). Presets:

- Talking head: my face is the main picture; B-roll from the Phase 1b engine on things
  I name; big words on screen; chapter titles; optional person cut-out so a big word
  can sit behind my head (Apache or MIT licensed segmentation model).
- Screen recording: the screen is the main picture; zoom to clicks and cursor, smooth
  cursor; optional small face bubble from a separate camera file.
- Screen share: camera and screen files; layout switches between full face, split, and
  big screen with a small face, about every 8 seconds, timed to my sentences.
- Profile Silhouette: a side-angle take turned into a dark silhouette with a thin rim
  light on a flat color background that changes at story beats; a front take supplies
  the voice.

No transition sounds. Output goes into the same preview step and publishing tail
(Publishing Card with chapter timestamps from the real final length, Thumbnail Maker,
PDT export).

### Phase 3: Direction, Research and Shot map

Status: todo

**Start screen, three choices with per-channel defaults in the recipe:**

1. Direction: "Script to video" or "Edit a recording" (Recorded engine).
2. Text (Script to video only): empty means I give only a topic or idea. If I paste
   text, I mark it "Finished script, use as is" or "Notes, turn into a script" (typical:
   a cleaned transcript from my phone app). Notes mode keeps my ideas, opinions, stories
   and way of speaking, reorganized into the channel's script structure, and never adds
   claims I did not make unless research is on.
3. Research: on or off. Web research with the configured LLM (free Gemini with Google
   Search grounding where available). Output a research brief: key facts, numbers,
   dates, 3 to 8 sources. With my notes: check my claims, flag errors, add missing
   facts. The brief is shown and editable before the script; one click continues.
   Sources go into the Publishing Card for my own checking only.

**Not in this phase, on purpose:** no audio upload, no inbox folder, no memo-as-narration.

**Week batch** works with every mode (7 pasted notes give 7 scripts).

**Shot map, a new stage after voice:** split sentences into shots, pin every element's
entrance to the exact word where it is spoken (word timestamps), choose graphic or
B-roll per shot, camera move, shot length, transitions, and mark hero moments. My
existing per-sentence HyperFrames catalog block choices stay as overrides; the shot map
fills everything else.

**Hero moments are fully automatic, cheapest first, within the existing budget rules:**
free sources (Public Domain, Pixabay, local 2.5D parallax), then a Kie AI image animated
with local 2.5D parallax, then Kie AI video only if the channel budget allows. Add the
"Kie AI image plus local 2.5D parallax" tier to the B-roll engine.

**Optional manual fallback, off by default:** a "Google Flow" slot. When I switch it on
for a shot, ITV writes a ready Flow prompt with a copy button and the exact clip length;
I drop the mp4 back into that shot. Log it as "Google Flow (Veo), own generation".

**Pipeline order:** Direction, Research (optional), Script, Voice with word timestamps,
Shot map, Preview and approval (shows paid costs), B-roll and assets, Render, Publishing
Card, Thumbnail, PDT export.

### Phase 4: Preset "3D Explainer" (one strange question per video)

Status: todo

Simple 3D scenes rendered with three.js inside the composition: soft-shaded
objects, cutaway views, scale comparisons, bright clean materials, smooth camera
moves.

### Phase 5: Preset "Stick World" (what-if stories)

Status: todo

Light plain background, black stick figures, the hero marked by one
accent-colored item of clothing. Camera nearly still. Characters blink every
3.5 to 4 seconds, feet stay planted when walking. One short sentence per shot,
the narrator talks to "you". Big readable text for key numbers.

### Phase 6: Preset "Archive Collage" (documentary collage explainer)

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

### Phase 7: Preset "Night Case File" (true story documentary)

Status: todo

Dark blue-black scenes, faceless figures glowing in one accent color, rooms and
streets built from simple shapes. Never show weapons, blood or violence: events
are implied by light flashes and sound. Date and place stamps, evidence board
scenes. Scripts are fact-checked and a sources list goes into the Publishing
Card.

### Phase 8: Preset "Soft Clay Chronicle" (warm history documentary)

Status: todo

three.js scenes with a matte, hand-made clay look: rounded faceless figures,
subtle fingerprint texture, warm lamp light, old map table surfaces, a soft glow
on the object the story is about, a small date label in a corner.

## Open decisions for Zoltan (found in Phase 1, nothing changed yet)

The rules above are stricter than what ITV already ships. These were not
touched, because each one changes how every video is made. The channel flow
avoids them where it can; the rest waits for his decision.

| What | Rule it meets | Where it stands |
|---|---|---|
| FFmpeg, the BtbN GPL build (libx264) | no GPL | Shipped next to the app, run as a separate program. Without GPL means another H.264 encoder (OpenH264 or the graphics card), a change to every render. |
| GSAP, its own "no charge" license | MIT, Apache, BSD or OFL only | The engine needs it. docs/gsap-license-question.md has the earlier decision. |
| libvips through sharp (LGPL), inside the engine | MIT, Apache, BSD or OFL only | Comes with HyperFrames, not used by ITV directly. |
| Non-OFL fonts | OFL only | library/fonts.json records no license per font. Not audited yet. Every new preset must list only OFL fonts in its tokens. |
| The registry component `vox-annotate` | never "Vox" or any other brand name in the app | Status "on" in library/catalog.json, so the catalog plan (Advanced) can still pick it and its title shows there. No preset template uses it. |
| Unsplash, HeyGen AI B-roll, ElevenLabs Music | allowed sources, no attribution, music, 0 USD | Still in the Advanced paths. Unsplash's API terms ask for a credit to the photographer, so the new attribution rule rejects it for channel videos. A channel video's build refuses Unsplash; HeyGen clips are logged with model and prompt. Pixabay and Kie AI are allowed now (Phase 1b). |
| Kie AI's terms say nothing about who owns the output | clean licensing | Only the product page says "Fully licensed for business use". See Phase 1b: ask Kie AI in writing before a paid clip goes into a monetized video. |
| Prelinger and other old film can show real people | never a recognizable real person | Filtered by words, and with an AI key the AI looks at the frame. Without a key no old film is used. The Preview tab still asks Zoltan to look at each clip. |
| Gemini thumbnail pictures | 0 USD | Still a choice on the Thumbnail tab, with its price. Channel videos start on the free maker. |

Other findings:

- The Library of Congress puts a Cloudflare bot check in front of its JSON, so
  the app's search gets a 403 and says so. Decide whether to keep it as a source
  (its images often sit on Wikimedia Commons too). Openverse's server gave a 504
  on 2026-11-02 in a browser too: try it again before a preset relies on it.

- The block `rail` in Zoltan's zg-frames library lands its last stop after the
  scene ends in any scene over 4.2 s (`autoRail`: 1.5 x length minus 2.1). The
  preset uses `grid-card-assemble` for steps instead. The canon was not changed.
- The block `highlighter` has a fixed second line ("in front of the slow step")
  that no variable reaches. The preset uses `marker-highlight` instead.
- Preset 1 uses the zg-frames blocks when the channel has the pack, which
  DECISIONS 130 had stopped planning. The Scenes tab's catalog plan is unchanged.

## What later phases reuse

- A preset is one folder: `runner/presets/<id>/preset.json`, checked by
  `checkPreset`. The contract is in `runner/presets/index.mjs`.
- `use` names what draws a template: a bundled component, or `<pack>:<block>`.
  New hand-drawn templates should ship as a block pack (`runner/packs/`), which
  already has variables, roles and a build path. The first style preset (Phase 4) needs to let a preset
  bring its own pack from its folder (today `registerPacks` reads the Identity's).
- `ruleParams` in `runner/gates/scenes/templates.mjs` knows the Motion Frames
  template ids. A new preset adds its own rules there or names rule-fillable ids.
- B-roll for any preset or engine: `planAuto`, `findFree`, `findPixabay`,
  `finishFind`, `approvePaid` in `runner/broll/engine.mjs` need only sentences,
  scene rows and an Identity. A preset that must not have B-roll: the recipe's switch.
- Whisper is not in the app yet. Kokoro gives word times itself and ElevenLabs
  gives them with its audio, so Phase 2 is the first to need a local transcriber.
- Publishing Card sources (Phase 3 and Phase 7): `video-publishing-card/1` takes optional blocks.

## Next step

Phase 2: Recorded engine.
