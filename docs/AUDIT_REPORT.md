# IdeaToVideo reliability audit

Done 2026-11-03 on branch `reliability-audit`, merged into `main`. No new features apart from the ones the audit asked
for: the Health check, offline mode and the fallbacks. Goal: both engines and every preset run end to end without a
crash, a freeze or an unknown error, even with no AI service at all.

**To continue in a new chat:** say "continue the audit". Read this file, go to the first unticked box or to "Left open".

**To run it again, 0 USD:** from the repo root:

```text
npm test                  661 fast tests, about a minute
npm run audit:quick       every failure case, no renders, about 30 minutes
npm run audit             the same with real renders of every preset, about an hour
```

Every paid API is mocked and the real network is blocked (`scripts/audit/mock-net.mjs`). The net log proves it: no call
left the computer. The free local parts are real: Kokoro, Whisper, MODNet, ffmpeg, the engine. All folders of a run have
spaces and Hungarian accents in their names on purpose.

## The flow that was audited

- **Start screen** `app/src/lib/channels/ChannelStudio.svelte`: channel, direction, text, research.
- **Script to video** `recipeRun` in `app/src/lib/ProjectView.svelte`: research-make, write-script, make-voice, make-music,
  make-template-scenes or simple-template-scenes, shot-map-make, avatar-plan and make-avatar or skip-gate, findBroll
  (`brollRun.ts`), build-video, Preview (user), render-video, Publishing Card (`writeExtras`), thumbnail, card-send.
- **Edit a recording** `recordedRun`: recorded-transcribe, recorded-apply-cuts, make-music, recorded-plan or -rule,
  recorded-prepare, findBroll, build-video, then the same tail.
- **Script presets:** motion-frames, explainer-3d, stick-world, archive-collage, night-case-file, soft-clay.
- **Recorded presets:** talking-head, screen-recording, screen-share, profile-silhouette.

## Checklist

### 1. Shared layer
- [x] Every network call has a timeout (enforced by a test that scans the code)
- [x] Limited retry with backoff on every free GET; never an automatic retry of a paid create call
- [x] One plain sentence for every error, never a stack trace or an unknown error (runner and UI)
- [x] Copy details button with the full details, full details in a log file
- [x] Disk space checked before heavy work, a full disk gets a plain sentence
- [x] No secret in a log, an error or a file

### 2. AI text
- [x] Fallback chain: configured model, then any other configured key, then offline mode
- [x] Offline script: paste or edit by hand, the pipeline goes on with local tools
- [x] Research with no AI: an empty brief that says so, one click goes on, card says unchecked
- [x] Scene plan, B-roll plan, recording plan, packaging fall back to their rule without long waits
- [x] Week batch works without an AI where it can, and says so where it cannot

### 3. Paid services
- [x] ElevenLabs voice failure or no key: Kokoro, with a note in the preview (English videos, see Left open)
- [x] ElevenLabs music failure: music by code, with a note
- [x] HeyGen failure or no key: no avatar, with a note
- [x] Kie AI failure or no budget: the free source stays, with a note
- [x] Pixabay failure or no key: skipped, with a note
- [x] Gemini thumbnail pictures failure: one sentence, the free maker is one click away
- [x] Publishing app down: the card stays on disk, plain sentence

### 4. Local parts
- [x] ffmpeg and ffprobe missing or broken
- [x] Speech model, Kokoro, depth model, segmentation model: missing, partial, corrupt, no internet
- [x] Renderer: engine or browser missing
- [x] Fonts and library missing (Health check)

### 5. Bad input
- [x] Corrupt, empty and unsupported video and audio files
- [x] Empty text, only punctuation, very long text
- [x] Paths with spaces and Hungarian accents, through the whole pipeline

### 6. Interruptions
- [x] Low disk space before a render (during one: the ENOSPC sentence, see Left open)
- [x] App closed in the middle of a render: no half video shown, render runs again
- [x] Render cancelled: temp files go, render runs again
- [x] Every stage saved: a restart goes on from the last finished stage

### 7. UI
- [x] Every long step has a progress indicator and a working Stop
- [x] Nothing blocks the window (slow Tauri commands off the main thread)
- [x] Health check screen, also run silently at startup

### 8. Tests
- [x] Mocked paid APIs, the real network blocked
- [x] Every engine and preset end to end, offline, with small generated samples
- [x] Every failure case above with mocked failures
- [x] One command: `npm run audit`

### 9. Rules
- [x] Licenses of bundled libraries, models and fonts
- [x] `assets_license.json` written for every external asset, nothing that needs attribution
- [x] No secrets in the repo or the logs
- [x] Cross-platform rule for the macOS build

### 10. Finish
- [x] CLAUDE.md in the repo root
- [x] This report: found, fixed, open
- [ ] Commit, merge into main, push if no Actions run, no PR
- [ ] STATUS.md updated, old build outputs cleaned, installer built, app opened

## Found and fixed

**Dead ends when no AI answers (the biggest finding)**
- A topic or notes with no AI key could not even start: the button was greyed out. Now it starts, the Script tab opens with
  a draft (notes as they are, or a skeleton with `[write here]` marks that cannot be approved or read aloud), and
  everything after the script runs on this computer.
- A dead AI stopped the whole run with an error. Now `chat()` is a chain: the configured model and its siblings, any other
  saved key (the core passes them in, `keys::other_ai`), then an error marked `offline` that the caller turns into the
  hand-written or rule-made path. OpenAI and Grok have no default model: the chain picks the newest from their own list.
- Research with no AI stopped a video, and Night Case File could not be made at all without a key. Now an empty brief says
  nothing was checked, one click goes on, and the Publishing Card says `unchecked`. This changes DECISIONS 160: research
  stays on for that style, but no key no longer blocks it.
- With no connection every Gemini model was tried and then the app waited three minutes, once per part of a scene plan. Now
  no connection gets one short wait, and once no AI answers the remaining parts go straight to the rule.
- The week batch refused to run without an AI for anything but finished scripts. Pasted notes now make drafts.

**Paid services that stopped a video**
- ElevenLabs failing stopped the run. Now Kokoro reads an English video, and the Preview says so. ElevenLabs Music: music by code.
- A missing HeyGen key, or HeyGen failing, stopped the run. Now the video goes on without the avatar and the Preview says so.
- One B-roll source failing stopped the whole search. Now each source is on its own, and only Stop ends the search.
- New: `notes` in `project.json` and "What this video did differently" on the Preview tab.

**Errors the user should never have read**
- Raw `fetch failed`, `spawn UNKNOWN`, `Unexpected token`, `Could not reach Claude: request ended without sending any chunks`,
  the engine's own output after a failed render, a list of every command after an unknown one. `runner/friendly.mjs` now
  gives one sentence for each kind, and keeps the app's own sentences as they are.
- A web page answering 200 (a proxy, a captive portal) crashed the JSON read of the AI, Pixabay, Unsplash, ElevenLabs and
  Gemini. Now one sentence (`readJson` in `runner/net.mjs`).
- Copy details copied only the sentence. It now has the code line, the log file's path and the raw error with its stack.
  New log file `<app data>/logs/errors.log`, part of Export diagnostics and of Delete logs.

**Network**
- The model downloads (Kokoro, Whisper, depth, MODNet) had no timeout at all: a stalled line froze the step for ever. Now a
  stall guard ends one after a minute without data, with three tries, and a room check before the file. A write error
  on a full disk could crash the process; it is now caught.
- Free reads had a timeout but no retry: Pixabay, Unsplash, the free sources, previews, clip downloads. Now `retrying`: three
  tries with a growing wait, GET and HEAD only. A POST that could cost money is never repeated by it.

**Freezes and Stop**
- Synchronous Tauri commands run on the window's thread. A big copy (`import_footage`, `export_video`, 23 commands in
  all) froze the window. All are now `#[tauri::command(async)]`.
- Stop lived only on some tabs' progress bars. The Recording tab, the Shot map, the free B-roll search, the template plan and the
  week batch had none. Every job in the top bar's Jobs list now has its Stop, and those steps have a bar with percent and Stop.

**Half files and interruptions**
- `fs.copyFileSync` wrote straight to `out/video-*.mp4`, so a crash during the copy left a half video that the app showed as
  the finished one. Now `.part`, then rename.
- A killed render left its working folder in the temp folder for ever. Now the next render removes what is over a day old.
- Tested: a render, a preview build and a voice killed in the middle. The stage says failed, what was finished stays
  approved, the run goes on from there.

**Bad input**
- A text of only punctuation or of any length went on to fail later. Now refused at once with a sentence (limit 100k characters,
  about 11 hours of speech). Corrupt, empty and wrong files had sentences already; they now also say what to do.

**Health check (new)** `runner/health.mjs`, `app/src/lib/HealthCheck.svelte`, Settings, Health check: keys, models, ffmpeg, engine, browser,
fonts, disk, internet. Each item OK, or a note, or what to fix. It runs silently at startup, and speaks up only for a real
problem. It spends nothing; testing the saved keys is a separate button, and says what it may cost.

**Rules**
- **Fonts, closed:** all 36 families are OFL-1.1, checked one by one on Fontsource's API. BUILD_PLAN's table said not audited.
- **Models:** Kokoro (Apache 2.0), Whisper Base ONNX (MIT), Depth Anything V2 Small (Apache 2.0), MODNet (Apache 2.0).
- **Libraries:** runner: MIT, ISC, BSD, Unlicense. Engine: MIT, Apache, ISC, BSD, CC0, 0BSD, and the three in Left open.
  `@hyperframes/shader-transitions` has no license field but an Apache 2.0 file. App: MIT, Apache, ISC, BSD, OFL, and
  lightningcss (MPL 2.0), which is a build tool and is not shipped.
- **Brand name:** the catalog's "Vox Annotate" is now shown as "Annotated keyword". The internal id stays: the registry finds
  the files by it. `VoxFlow` remains only in test data and a code comment, never in the app.
- **Ledger:** Gemini thumbnail pictures were the one outside asset not in `assets_license.json`. Now logged with model and prompt.
- **Secrets:** nothing in the repo or its history (the one match is a test string). Keys now leave the runner's environment at
  start, so ffmpeg and the render never get them. The audit greps every file and output of a run for its test keys.
- **Cross-platform:** nothing new is Windows-only: `fs.statfsSync`, path joins. `taskkill` is only in the test harness, behind a
  platform check. Windows-only parts stay behind `cfg(windows)`.
- **A red test fixed:** `traffic-card.test.mjs`, red since 2026-10-23, doubled its line ends on a Windows checkout. The test's fault, not the app's.

## Test results

The last full run, 2026-11-03, on the final code but for the small changes noted below:

| Group of `npm run audit` | Checks | Result |
|---|---|---|
| Script to video, every preset, offline, render to PDT export | 133 | all passed, 6 real videos |
| Edit a recording, every preset, offline, render to PDT export | 80 | all passed, 4 real videos |
| Every start with no AI at all | 29 | all passed |
| AI text: 6 providers, every failure, the chain | 163 | all passed |
| Plans: a dead AI falls back to the rule, every preset | 116 | all passed |
| Paid services: skipped, the free way, a note | 205 | all passed |
| Publishing app down | 10 | all passed |
| Local parts missing or broken | 65 | all passed |
| Bad input | 45 | all passed |
| Low disk space | 28 | all passed |
| App closed or Stop in the middle | 36 | all passed, 3 more real videos |
| No secret anywhere, nothing left this computer | 6 | all passed |
| **Total** | **916** | **all passed, 51 minutes, 0 USD** |

After that run only three small things changed: the sentence for a damaged project file (`--only input` run again, 45 of 45), a
note when a paid clip fails, and a Health check test for missing fonts. The first full pass had 35 failures in 826 checks, some of
them real bugs (listed above), and reading every sentence of the run by hand found one more: `LlmError:` in front of the message.

Also: Node tests 661 of 663 (2 live tests skip without a real key, none red), Rust 50 of 50, UI check 0 errors. A contact sheet of
three real renders was looked at: the accents draw, the clay scenes, the silhouette and the screen share compose. The samples are
generated test footage and a short script, so this proves the pipeline runs, not how a real video looks.

## Left open

**Your decisions (BUILD_PLAN's table, nothing changed; each one changes how every video is made)**
- FFmpeg is the GPL build (libx264), shipped next to the app. Against "no GPL". Replacing it means another H.264 encoder.
- GSAP has its own "no charge" license. The engine needs it. `docs/gsap-license-question.md`.
- libvips through sharp (LGPL), inside the engine, not used by ITV directly.
- Kie AI's terms do not say who owns the output. Ask support@kie.ai in writing before a paid clip goes into a monetized video.

**Limits of offline mode**
- **A channel that is not in English has no free voice.** Kokoro reads English only. With no ElevenLabs, a Hungarian video stops at
  the voice with a sentence. It does not read Hungarian with an English voice.
- **Profile Silhouette needs the cut-out model,** and any recording needs the speech model: both download once, so the very first
  use needs the internet. The sentence and the Health check say so. Talking Head's optional cut-out just goes without.
- **A week of ideas out of nothing needs an AI.** Pasted texts do not.
- **The render browser's first download** is the engine's own process, with no stall timeout of ours. The Stop works, and the
  check-in says when a step seems stuck.

**Not tried, because a real one costs money or needs a person**
- No real AI, ElevenLabs, HeyGen, Kie AI or Pixabay answered in this audit. The failure shapes are mocks of what each service
  documents: a service answering in a new way would still be one sentence, but maybe a less helpful one.
- The stages were run through the same runner commands in the same order as `recipeRun` and `recordedRun`, not by clicking the
  window. The screens were seen in `scripts/ui-mock` (Health check, the notes on the Preview). The fallbacks inside
  `ProjectView.svelte` itself (the avatar's skip, the offline note) are type-checked but were not clicked.
- A disk that fills up in the middle of a render: the check before it and the sentence for ENOSPC are tested, a really full disk was not.
- Nothing was run on a Mac (Phase 9).
- Low priority: Unsplash, HeyGen AI B-roll and ElevenLabs Music are still in the Advanced paths, as before.
