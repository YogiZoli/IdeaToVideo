# IdeaToVideo (ITV)

A desktop app (Tauri 2, Svelte 5, a Node runner) that takes a YouTube video from an idea or a recording to a
finished MP4 and a Publishing Card, on the user's own computer with the user's own keys. One app, two engines,
channel presets, 0 USD per video at runtime, fully copyright clean. ITV does not depend on Claude at runtime: any AI
key works, the default is the free Gemini model, the render is local (HyperFrames). With no AI at all it still works:
scripts are written by hand, everything else runs on this computer.

**Start every session here:** `STATUS.md` (where we are), then `docs/BUILD_PLAN.md` (the plan and the rules), then
`DECISIONS.md` only for the number you need (it is 200 KB, use Grep). Reliability: `docs/AUDIT_REPORT.md`.

## Folder map

| Path | What it is |
|---|---|
| `app/src/` | The window (Svelte 5, TypeScript). `lib/api.ts` is the only door to the core. `lib/pages.ts` is the top menu and its pages, `lib/tabs.ts` the steps of a video. `lib/ProjectView.svelte` runs a video's stages (`recipeRun`, `recordedRun`, `autopilot`). `lib/channels/ChannelStudio.svelte` is the start screen. `lib/HealthCheck.svelte` is the Health check, with `lib/VideoNeeds.svelte`. `lib/wizard/Demo.svelte` draws the wizards' small moving pictures. |
| `app/src-tauri/src/` | The Rust core: `runner.rs` (whitelist of runner commands, starts Node, Stop, the check-in), `jobs.rs` (queue), `keys.rs` (OS keychain), `log.rs` (local log), `lib.rs` (Tauri commands). |
| `runner/main.mjs` | The Node runner's entry: one command per process, JSON in on stdin, JSON lines out. Every command the UI can call is listed in `runner.rs` too. |
| `runner/presets/<id>/` | A style preset: `preset.json` (tokens, 8 to 15 templates, shot rules), its own `pack/` when it draws its own. Contract in `runner/presets/index.mjs`. |
| `runner/gates/` | The stages: `script`, `voice`, `scenes`, `avatar`, `build`, `review`, `render`. |
| `runner/recorded/` | The Recorded engine: words (Whisper), cuts, plan, cursor, cut-out, compose. |
| `runner/broll/`, `generate/`, `assets/` | B-roll engine, paid generators (Kie AI, HeyGen), free sources, the license ledger (`assets/license.mjs`). |
| `runner/research/`, `shots/`, `channels/` | Research brief, Shot map, recipes and start of a video, week batch. |
| `runner/channelwizard/` | The YouTube Brand Channel Wizard: questions, kit, fields, the Traffic Card (`docs/wizards/brand-channel.md`). |
| `runner/providers/` | Services: `llm.mjs` (the AI chain), `claude.mjs`, `tts/`, `music/`, `avatar/`, `research/`. |
| `runner/net.mjs`, `disk.mjs`, `friendly.mjs`, `errorlog.mjs`, `health.mjs` | The reliability layer. Use them, see the rules below. |
| `library/` | The pinned HyperFrames registry catalog, fonts index. |
| `engine/`, `app/src-tauri/engine/` | The pinned render engine (HyperFrames, GSAP). Fetched, not edited. |
| `scripts/` | Fetchers (`fetch-*.mjs`), `audit/` (reliability tests), `phase2/*-e2e.mjs` (real render tests), `ui-mock/` (the window in a browser), `make-*-blocks.mjs` (preset packs). |
| `docs/` | `BUILD_PLAN.md`, `AUDIT_REPORT.md`, wizards, older plans. |

## The engines and presets

- **Script to video:** `motion-frames` (the default, HyperFrames motion graphics), `explainer-3d`, `stick-world`,
  `archive-collage`, `night-case-file`, `soft-clay`.
- **Edit a recording:** `talking-head`, `screen-recording`, `screen-share`, `profile-silhouette`.

Stages, in order: Direction, Research (optional), Script, Voice with word timestamps, Shot map, Preview and approval
(shows paid costs), B-roll and assets, Render, Publishing Card, PDT export. A channel is an Identity plus one
locked recipe (`<identity>/recipe.json`): engine, preset, voice, avatar, music, length.

On screen a script video has eight tabs: Research, Script, Voice and music, Scenes, Shot map, Avatar, Preview, Your video.
The Thumbnail is not one of them: it is on the Publishing menu, for any video, at any time. The top menu is Home, ONE Video, Identity, Wizards, Playlist,
Publishing, Video Recording Editing, Settings, on one row, and nothing hides behind a switch (DECISIONS 168, 169, 172, 173, 175). Home
starts a video from a script, Video Recording Editing one from a recording. Home's order: Today's video, Latest videos, The recipe, A new video, Week batch. The dropdown before Home only switches the Identity; adding, duplicating, exporting and deleting one are on Identity, Manage Identity (DECISIONS 179). On Playlist the Keyword Research comes first and the Planner reads what it found (`<identity>/keyword-research.json`). Every import and export of the app is listed on Settings, Import & Export (`lib/transferList.ts`): a new import or export gets a row there. On screen the word is Identity, not channel: one Identity has 0 or 1
YouTube channel. The Brand wizard is called Design on screen; the code still says `brand` and `channels`. The first page of Wizards is the YouTube Brand Channel Wizard, which prepares the channel itself: 13 questions, a kit to paste into YouTube, the Evergreen Traffic Card (DECISIONS 174). It is not the Design wizard.

A preset is three things: a style sheet (JSON tokens, a PNG rendered by code), scene templates, shot rules. At runtime
the LLM only outputs scene JSON that fills the templates; it is checked, repaired once, and otherwise filled by a rule.

## The rules (from `docs/BUILD_PLAN.md`, valid for every change)

**Clean room**
- Build only from the specs and your own knowledge. Never open, read or copy any third-party skill, code, prompt, style
  sheet or image, including the editor and faceless skills in Zoltan's `.claude\skills` folder and any "Vox" files in Downloads.
- Own preset names and palettes. No brand names, channel names or trademarks in the app or the output. Never "Vox" or
  any other brand name in the app, titles or descriptions.
- Fonts: OFL only, bundled. Bundled models and libraries: MIT, Apache 2.0, BSD or OFL only. No GPL, no non-commercial.
- External images and video: CC0 or Public Domain only, from Openverse (cc0, pdm), Wikimedia Commons (PD, CC0), Library
  of Congress ("no known restrictions"), Prelinger on the Internet Archive (only an item that says PD or CC0), NASA or
  other US federal works. Maps: Natural Earth, bundled.
- Two named exceptions: Pixabay (logged "free license, not CC0") and Kie AI outputs (logged with model and prompt). No Pexels.
- Zoltan's change (2026-11-05, DECISIONS 179): a future documentary style for recordings may use real material found online, not only CC0 and public domain. Nothing of it is built, and how wide this goes is his to say.
- Never a source that asks for attribution or a credit line. Nothing about sources in the YouTube description.
- Every external asset goes into the project's `assets_license.json`: source URL or model, license or terms, author,
  prompt (AI), cost, date. Anything without a clear license is rejected.
- AI prompts never name a real person, brand, logo, character or artist. Never show a recognizable real person. People
  and characters are drawn by code.
- Music and sound effects: synthesized by code, or Zoltan's own files. Never download music.
- Voice: Zoltan's ElevenLabs clone, or local Kokoro as the free default. Word timestamps from a local speech model.
- Avatar: HeyGen, engine `avatar_iii` only, transparent output composited 1:1 with no mask, resize or reposition.
- 16:9 only. No shorts. Never publish automatically.
- Build the Windows installer locally. **Never trigger GitHub Actions (billing), never open a PR:** `build.yml` runs on
  `pull_request` and by hand only, so a push to `main` starts nothing, a PR would.

**Housekeeping**
- After every phase: delete old build outputs, keep only the newest installer.
- Models download once into one shared models folder, never per project.
- Everything stays cross-platform for the macOS build (Phase 9): no Windows-only paths or commands, path joins, anything
  platform-specific behind a small adapter.

**Reliability (`docs/AUDIT_REPORT.md`)**
- Every network call has a timeout (`signal`, or `timeout:` through `retrying` in `runner/net.mjs`; a big download uses
  `stallGuard`). A test scans for this. A free GET goes through `retrying`; a paid POST is never repeated automatically.
- AI text always goes through `chat()`: the configured model, any other saved key, then an error marked `offline`, which
  the caller turns into the hand-written or the rule-made path.
- A paid service that fails or has no budget is skipped, a free one is used, and `addNote` puts a line on the Preview tab.
- A user never reads a stack trace or an unknown error: one plain sentence (`runner/friendly.mjs`, `plainMessage` in the
  UI, `ErrorBox` with Copy details). Full details: `<app data>/logs/errors.log` (`errorlog.mjs`). No key in any of them.
- Ask for room before heavy work (`ensureRoom`). Each stage is saved in `project.json`; never leave a half file under a
  name that looks finished (write `.part`, then rename).
- Every long step shows progress and has Stop (`Progress.svelte`). A Tauri command that touches disk is `#[tauri::command(async)]`.
- A new runner command goes in `COMMANDS` in `runner.rs` too.

**How sessions work here**
- Do only the next phase with status "todo" in `docs/BUILD_PLAN.md`, mark it done, and write "Next step" at its bottom.
- Reuse what exists. Log a choice in `DECISIONS.md`, and update `STATUS.md` at the end of a session.
- Writing rule for everything: no emoji, no dash between words used as punctuation (see the user's `~/CLAUDE.md`).
- Give Zoltan full absolute paths with forward slashes, and commands that run in PowerShell 5.1 (no `&&`).

## Commands

Tests, one at a time from the repo root:

```text
npm test                    all Node tests, about a minute
npm run audit:quick         every engine and preset and failure case, no renders, about 30 minutes, 0 USD
npm run audit               the same with real renders, about an hour, 0 USD
node scripts/phase2/channel-e2e.mjs --work <dir>     one real run of a channel video
```

From `app/`:

```text
npm run check               the UI's type check
npm run tauri -- dev        the app in development
```

From `app/src-tauri/`: `cargo test`.

## Building the installer

Locally only, from `app/`, about 15 minutes when Rust compiles from scratch:

```text
npm ci
npm run tauri -- build --bundles nsis
```

`beforeBuildCommand` in `tauri.conf.json` fetches the pinned sidecars, the runner's dependencies, the engine and the
library. The result: `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe`. Afterwards delete old
build outputs and keep only that file (`docs/BUILD_PLAN.md`, housekeeping). The macOS build is Phase 9: on a Mac, with
Claude Code, no CI.
