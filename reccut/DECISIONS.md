# RecCut: decisions

Why RecCut is the way it is. One entry per decision, newest at the bottom. The full log of
the whole repo is `DECISIONS.md` at the root; the numbers here are the same numbers.

1. **A separate product (root DECISIONS 184, Zoltan, 2026-11-09).** Editing a recording is 100% separate from making a video from a script. RecCut is its own Tauri app with its own window, menu and installer, built from the same repo: one Svelte source, one Rust crate, one runner. `VITE_ITV_APP=editor` and `app/src-tauri/tauri.editor.conf.json` make RecCut; without them the build is IdeaToVideo. Nothing is forked: ErrorBox, Progress, plainMessage, the Health check, Thumbnail, PDT and the whole runner are the same files.
2. **Shared data (184).** RecCut reads IdeaToVideo's settings and Identities folder (`app.ideatovideo.desktop`) and its data folder (models, render browser, previews), so nothing is set up or downloaded twice. Keys are the same OS keychain entries. Only `editor.json` and RecCut's own log are in `app.reccut.desktop`.
3. **The menu (184).** Home (Today's recording, Latest videos, A new recording), Identity (the switch, Footage, Thumbnail photos), Publishing (Thumbnail, PDT Connection), Settings (Connections, Health check, Backup, Import & Export, Legal). Nothing else.
4. **What did you record? (184).** Six kinds in Zoltan's order; each is one Recorded preset plus a `bubble` (`runner/recorded/bubble.mjs`). The bubble in one file is marked once on the first frame and pinned outside the zoom; skipped means no zoom and a sentence why. The AI avatar bubble is off by default, `avatar_iii` only, its price on the button, nothing spent before the press, any failure gives Screen only with a note; or a clip already made in HeyGen; or a lip sync clip from any outside tool made from the exported cut voice ("Own generation, outside tool" in `assets_license.json`). B-roll from own Footage: per video, off by default.
5. **Old recordings open (184).** `recorded/input.json` schema 1 is read as schema 2 (`migratedFrom`); the file on disk is not rewritten.
6. **Name and icon (185, Zoltan, 2026-11-10).** RecCut, identifier `app.reccut.desktop`, binary `reccut`. White scissors cutting a film strip on coral, drawn by `scripts/make-reccut-icon.py`, so it never looks like IdeaToVideo in the taskbar.
7. **Reliability (186, Zoltan, 2026-11-10: "the most important is that it runs reliably").**
   - The top bar always says whether anything runs and whether the lid may close (`lidState`). A video between two steps counts as running.
   - A sleep is noticed (a gap in the clock), logged as `computer_slept`, and said: the work goes on, or open the video and press Go on from where it stopped. Every finished step is kept, so Go on never repeats a paid step.
   - Every heavy step asks for disk room first (the cut, the prepared pictures, a bubble clip).
   - A damaged or unfinished recording gets one plain sentence, never ffmpeg's words.
   - The first frame for marking falls back to frame 0 for a very short file; only the newest 10 stills are kept; the stills folder is allowed for the window, which it was not before (the frame never showed).
   - Marking the bubble again sends an approved preview back to be built.
   - The diagnostics zip holds RecCut's log and the shared runner log with `errors.log`, so one zip shows both sides of a run. Bubble actions and stopped runs are logged.
