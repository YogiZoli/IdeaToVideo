# IdeaToVideo reliability audit

Started 2026-11-03 on branch `reliability-audit`. No new features. Goal: both engines and every preset run end to
end without a crash, a freeze or an unknown error, even with no AI service at all.

**To continue in a new chat:** say "continue the audit". Read this file, go to the first unticked box, and read
`docs/BUILD_PLAN.md` and the top of `STATUS.md` only if a box needs them. Commit after every ticked area.

Test command when it exists: `npm run audit` (everything, no money, no real paid call).

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
- [ ] Every network call has a timeout (enforced by a test that scans the code)
- [ ] Limited retry with backoff on every free GET; never an automatic retry of a paid create call
- [ ] One plain sentence for every error, never a stack trace or an unknown error (runner and UI)
- [ ] Copy details button with the full details, full details in a log file
- [ ] Disk space checked before heavy work, a full disk gets a plain sentence
- [ ] No secret in a log, an error or a file

### 2. AI text
- [ ] Fallback chain: configured model, then any other configured key, then offline mode
- [ ] Offline script: paste or edit by hand, the pipeline goes on with local tools
- [ ] Research with no AI: an empty brief that says so, one click goes on, card says unchecked
- [ ] Scene plan, B-roll plan, recording plan, packaging fall back to their rule without long waits
- [ ] Week batch works without an AI where it can, and says so where it cannot

### 3. Paid services
- [ ] ElevenLabs voice failure or no key: Kokoro, with a note in the preview
- [ ] ElevenLabs music failure: music by code, with a note
- [ ] HeyGen failure or no key: no avatar, with a note
- [ ] Kie AI failure or no budget: the free source stays, with a note
- [ ] Pixabay failure or no key: skipped, with a note
- [ ] Gemini thumbnail pictures failure: the free maker
- [ ] Publishing app down: the card stays on disk, plain sentence

### 4. Local parts
- [ ] ffmpeg and ffprobe missing or broken
- [ ] Speech model, Kokoro, depth model, segmentation model: missing, partial, corrupt, no internet
- [ ] Renderer: engine or browser missing
- [ ] Fonts and library missing

### 5. Bad input
- [ ] Corrupt, empty and unsupported video and audio files
- [ ] Empty text, only punctuation, very long text
- [ ] Paths with spaces and Hungarian accents, through the whole pipeline

### 6. Interruptions
- [ ] Low disk space before and during a render
- [ ] App closed in the middle of a render: no half video shown, render runs again
- [ ] Render cancelled: temp files go, render runs again
- [ ] Every stage saved: a restart goes on from the last finished stage

### 7. UI
- [ ] Every long step has a progress indicator and a working Stop
- [ ] Nothing blocks the window (slow Tauri commands off the main thread)
- [ ] Health check screen, also run silently at startup

### 8. Tests
- [ ] Mocked paid APIs, the real network blocked
- [ ] Every engine and preset end to end, offline, with small generated samples
- [ ] Every failure case above with mocked failures
- [ ] One command: `npm run audit`

### 9. Rules
- [ ] Licenses of bundled libraries, models and fonts
- [ ] `assets_license.json` written for every external asset, nothing that needs attribution
- [ ] No secrets in the repo or the logs
- [ ] Cross-platform rule for the macOS build

### 10. Finish
- [ ] CLAUDE.md in the repo root
- [ ] This report: found, fixed, open
- [ ] Commit, merge into main, push if no Actions run, no PR
- [ ] STATUS.md updated, old build outputs cleaned, installer built, app opened

## Found and fixed

(filled in area by area)

## Left open

(filled in at the end)
