# IdeaToVideo

From idea to video, on your own machine. A desktop app (Windows, macOS later)
that turns a topic into a finished explainer video: script, narration, music,
scenes, optional avatar, render. No server, no account, no subscription: it
runs locally and uses the user's own API keys, stored only in the OS keychain.

Status: private pilot. See `STATUS.md` for where the work stands and
`DECISIONS.md` for why things are the way they are.

## How it works

Every video goes through gates the user can approve or change:
Script, Voice and music, Scenes, Avatar, Preview, Your video.
"Finish on Autopilot" runs all of them with the recommended settings.

- **Rendering** is done by the HyperFrames engine (pinned in `engine/`).
  The app writes compositions; it never renders frames itself.
- **Look and motion** come from the Identity: Brand, Motion, Scenes and CTA
  wizards, block packs (`.itvpack`), icons (Lucide, Tabler, Iconoir),
  15 caption styles, Pixabay photos and videos, the user's own footage.
- **Keys:** Gemini (free tier is enough to start), optional ElevenLabs,
  HeyGen, vidIQ, Pixabay. Paid calls are never made without a visible price.

## Layout

| Folder | What |
|---|---|
| `app/` | Tauri app: Rust core (`src-tauri/`), Svelte 5 UI (`src/`) |
| `runner/` | Node sidecar: the pipeline (gates, providers, build, render) |
| `engine/` | Pinned HyperFrames render chain |
| `library/` | Pinned registry components, captions, fonts, icons (SHA256 lock) |
| `scripts/` | Fetch, build helpers, pack maker, UI mock, notices |
| `docs/` | Specs and plans; `docs/pilot/install-guide.md` for testers |

## Develop (Windows)

```powershell
npm ci --prefix runner
npm ci --prefix app
node scripts/fetch-engine.mjs
node scripts/fetch-library.mjs
node scripts/fetch-ffmpeg.mjs
node scripts/fetch-sidecars.mjs
npm test
cd app
npm run tauri dev
```

Release build (about 17 minutes): `npm run tauri build` in `app/`; the
installer lands in `app/src-tauri/target/release/bundle/nsis/`.

Checks before a commit: `npm test` (Node), `cargo test` in `app/src-tauri`,
`npm run check` in `app/`.

## Licences

Third-party components and their licences: `THIRD-PARTY-NOTICES.md`
(also shown on the app's About page).
