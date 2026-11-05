# STATUS: IdeaToVideo

Frissítve: 2026-11-05 (menu, Home, recordings, Playlist, Import & Export, DECISIONS 175)

End goal: helyben telepíthető asztali app, ami egy YouTube videót végigvisz ötlettől kész MP4-ig, a user saját gépén és kulcsaival, a HyperFrames motorral és a teljes HyperFrames registry katalógussal (234 komponens, DECISIONS 130).

Fázisok (PRD 13): 0 pipeline Node-ra (**kész**) · 1 Tauri váz, onboarding, config és kulcstár, LLM (**kész, PR #2**) · 2 teljes menet a UI-ban (**kész, 2026-10-06, PR a main felé, merge-ölve**) · 3 pilot (**kész, 2026-10-07, PR #5**) · 4 kiadás (README kész; a többi később).

## Now (2026-11-05, Playlist and Connections after his answer, DECISIONS 176)

- **Playlist:** no numbers, no buttons between its pages. Keyword Research, Playlist Planner, Create Playlist File. The Planner is one section.
- **Connections:** AI Apps, AI Services, Which AI for which job, Remove all keys. The Publishing link is gone.
- **ONE Video stays after Home**, he confirmed it.
- **Recordings (DECISIONS 177):** Talking Head asks only for the camera file. A typed working title stays, the AI only names a video with none.
- **Waits for Zoltan:** how to simplify the Identity dropdown, the Identity menu and Home's Identity section. Claude's plan is in the chat of 2026-11-05, nothing of it is built. The Identity named New Identity holds real settings: his to rename or delete.

## Earlier (2026-11-05, Zoltan's second walk through the app, DECISIONS 175)

**Done in one change. Phase 9, the macOS build, is still next, and it needs a Mac.**

- **Top menu on one row:** Home, ONE Video, Identity, Wizards, Playlist, Publishing, Video Recording Editing (on three short lines), Settings. Measured at 900, 1100, 1181 and 1280 px wide in `scripts/ui-mock`: no overflow. **His call:** his list did not place ONE Video; Claude put it after Home (one line in `pages.ts`).
- **Home:** Today's video, Latest videos, Identity, The recipe, A new video, Week batch. The Channels board is gone. What a video needs moved to Settings, Health check.
- **The recipe:** always open, six tiles with a few plain words each, a primary Change the recipe.
- **"New Identity" twice:** one was a real Identity with that name, `identities/new-identity`. Not deleted, it is his. The button now says Add Identity.
- **Video Recording Editing:** only Your recording, with one small line for the kind of recording, which decides what files it asks for.
- **Playlist:** Keyword Research first, Playlist Planner second. The result stays in `<identity>/keyword-research.json`, and that is how the Planner knows it.
- **Identity, Thumbnail is gone:** the same photos are on Publishing, Thumbnail.
- **Import & Export:** two new lists, everything that can come in and go out (`lib/transferList.ts`).
- Tests: Node 686 of 688 (2 live tests skipped, none red), Rust 50, UI check 0 errors. Screens clicked in `scripts/ui-mock`, no console error: the menu, Home, the recording page and Change the kind, Keyword Research to the Planner with a stand-in vidIQ answer, the Health check, Import & Export. `npm run audit:quick` was not run: this change touches no video stage.
- Local installer built 2026-11-05 16:34 and installed over the old app: `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe` (110 MiB). The installed copy has the new runner code. The app was opened. **No screen was clicked in the installed window** (screen access was declined this session).
- Housekeeping: old build outputs removed, only the newest installer kept, so the next build compiles Rust from scratch (about 15 minutes).
- Merged into `main` from branch `ui-walkthrough-home-menu` and pushed. No PR, no GitHub Actions run.

**Not tried:** a real vidIQ search from the new page, a real AI plan from the kept keywords.

**Open for Zoltan:** whether a real Identity named New Identity should stay. His wish list (blind spots) is answered in the chat of 2026-11-05, nothing of it is built.

**Next:** Zoltan tries the new menu on the installer. Then Phase 9 in a new chat, on a Mac.

## Earlier (2026-11-04, YouTube Brand Channel Wizard, DECISIONS 174)

**The wizard is in the app: Wizards, first page. Phase 9, the macOS build, is still next, and it needs a Mac.**

- **What it does:** the lead magnet's 13 questions, one per screen, for the active Identity. "Write it with AI" on the text answers. Optional vidIQ keywords, asked first. A kit with Copy: name and handle ideas, tagline, channel description, about text, links, banner and logo image prompts, the checklist. Preview and Save: the Identity's fields you tick, and the same Evergreen Traffic Card as the Import, so the Playlist Planner reads it with no change. Download as .md. It never touches YouTube and makes no picture.
- **With no AI** it works by hand and says so in one sentence.
- **Links:** Identity, YouTube Channel & Audience links to it.
- **Your call (DECISIONS 174):** whether the first name idea should be offered as the Identity's name (now: no); whether question 3 should keep the word "course".
- Tests: Node 683 of 685 (2 live tests skipped, none red), 15 new in `runner/channel-wizard.test.mjs`, Rust 50, UI check 0 errors. Screens clicked in `scripts/ui-mock`, no console error: the whole way with an AI stand-in, no AI key (`?noai=1`), the vidIQ search, Stop, Save, coming back to the answers, the link from Identity.

- Local installer built 2026-11-04 22:26 and installed over the old app: `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe` (110 MiB). The installed copy's own node and runner did state, draft, kit, save and download on a throwaway folder with a space and an accent, and the card was read back (`traffic-card-load`, `planner-start`). The app was opened, its silent Health check logged 0 problems. Clicked in the installed window, on the Identity test explainer: Wizards, the wizard opens, the kit screen, one Copy (the clipboard really had the text), Close. Nothing was typed or saved there.
- Housekeeping: old build outputs removed, only the newest installer kept, so the next build compiles Rust from scratch (about 10 to 15 minutes).
- Merged into `main` from branch `channel-wizard` and pushed. No PR, no GitHub Actions run.

**Not tried:** a real AI on the wizard's prompts. Every AI answer so far was a stand-in, so how good the texts are, and whether a real model keeps to the channel's language and invents nothing, nobody has seen. A real vidIQ search from the wizard. A whole run with typed answers and Save in the installed window (that ran in `scripts/ui-mock` and through the installed runner's commands, separately). `npm run audit:quick` was not run: this change touches no video stage.

**Next:** Zoltan runs the wizard once on the installer with his AI key, on a real or test Identity, and reads the texts. Then Phase 9 in a new chat, on a Mac.

## Earlier (2026-11-04, new menu and video steps, DECISIONS 168 to 173)

**Zoltan walked through the app and asked for a new order. Done, in one change. Phase 9, the macOS build, is still next, and it needs a Mac.**

- **Top menu:** Home, Videos, Video Recording Editing, Playlist, Publishing, Wizards, Identity, Settings. The Advanced checkbox is gone, everything is always there.
- **Video Recording Editing:** a video from a recording starts here, with no script steps in sight. Home is only for a video from a script. Zoltan wants two apps in the end; until then it stays one menu (DECISIONS 172, 173).
- **Home:** Today's video on top, then the Identity and A new video. The recipe, the week batch and what a video needs are folded away.
- **Names:** Identity everywhere on screen instead of channel, Design instead of Brand for the look wizard.
- **Research pictures:** each fact has a Picture button: only CC0 and public domain pictures, the rest is refused by the app, so no credit is owed.
- **Unsplash:** kept, but off unless turned on after its warning, older saved profiles too.
- **Write it with AI:** on Channel Profile too: from a few words, the channel's text, ready to paste into YouTube.
- **Playlist:** Playlist Planner (out of Wizards), Keyword Research (was Identity, Resources), Course or Playlist File (out of Import & Export).
- **Publishing:** Thumbnail, for any video at any time, before the video too. PDT Connection, with the Video Publishing Card's Send and Save.
- **A script video's steps, the same for every video:** Research, Script, Voice and music, Scenes, Shot map, Avatar, Preview, Your video. Research never blocks and one click skips it. The vidIQ keyword ideas moved to the Research tab. The Thumbnail tab is gone.
- **Identity:** Audio Voice, AI Avatar, Thumbnail (the profile photos) instead of Voice & Avatar. Footage has sub links.
- **Settings:** Health check first, Legal (was General) last, Account Plan (was Plan). Connections has sub links. Back up now moved to Backup.
- **Import & Export:** one "Your look" row with one Import for both kinds of file, instead of Brand Identity Card and tokens.css. "Extra scene designs" instead of Scene pack. HeyGen import moved to Wizards, CTA.
- **Wizards:** a small moving picture for every choice of Motion and Scenes (`wizard/Demo.svelte`), one picture of what each wizard is about on all four (`wizard/WizardMap.svelte`). They illustrate the idea; the real look is still the Motion wizard's sample video.

- Local installer built 2026-11-04 12:13 and installed over the old app: `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe` (110 MiB). The app was opened, its silent Health check logged 0 problems. No screen was clicked in the installed window.
- Housekeeping: old build outputs removed, only the newest installer kept, so the next build compiles Rust from scratch (about 15 minutes).

**The three CTA clips were not lost:** they belong to the Identity ZG C2C, and the app was on Test Stick man. Files: `C:/Users/gdp/Videos/CTA-segments/`.

**Your call (DECISIONS 171):** the photos are on both Identity, Thumbnail and Publishing, Thumbnail: keep both? The PDT's own "make it" button next to Copy is in the publishing-dreamteam repo, a separate task.
**Not tried yet:** the screens were clicked in `scripts/ui-mock` (no console error), not in the installed window. A real AI, vidIQ or Gemini call from the moved places: none was made, nothing was spent. A real picture search from the Research tab, with the real sources. A Shot map on a real long catalog video (the e2e one is 21 s). An older video opened in the new tabs.

- Tests: Node 668 of 670 (2 live tests skipped, none red), `npm run audit:quick` 823 of 823 in 36 minutes, 0 USD, `scripts/phase2/e2e.mjs` 59/59 with real renders (new: a Shot map on a catalog plan, a thumbnail before the video), channel e2e 56/56, Rust 50, UI check 0 errors. The audit ran before the last two commits (the Edit menu, Home, the names, the Research pictures, the Unsplash switch); Node 668 of 670, the UI check and both e2e runs were repeated after them. One timing test (`stallGuard`, 15 ms sleeps) was red in two busy full runs and green alone: the test's fault, not the code's, its margins are now wide.
- Merged into `main` from branches `ui-menu-reorganize` and `ui-home-and-pictures` and pushed. No PR, no GitHub Actions run (`build.yml` runs only on a PR or by hand).

**Next:** Zoltan tries the new menu on the installer. Then Phase 9 in a new chat, on a Mac.

## Earlier (2026-11-03, reliability audit, DECISIONS 164 to 167)

**The audit is done: `docs/AUDIT_REPORT.md` has what was found, fixed and left open. Phase 9, the macOS build, is still next, and it needs a Mac.**

- **Nothing stops a video for lack of a service any more.** AI text: the configured model, any other saved key, then offline mode, where you write or paste the script and the rest runs on this computer. Paid services that fail or have no budget are skipped, a free one is used, and the Preview tab has a new box "What this video did differently".
- **New: Health check** (Settings, Health check, and silently at startup): keys, models, ffmpeg, engine, fonts, disk, internet. Each OK, or what to fix.
- **Errors:** one plain sentence, with Copy details; everything else in `<app data>/logs/errors.log`.
- **Stop:** every job in the top bar's Jobs list has one. **Freezes:** 23 slow Tauri commands left the window's thread.
- **Decided by Zoltan:** no AI no longer stops Night Case File, the card says `unchecked` instead (DECISIONS 165, which changes 160). **Your call:** the licence table in `docs/BUILD_PLAN.md` still waits for you (GPL FFmpeg, GSAP, libvips); fonts and the brand title are closed there.
- **The hole in offline mode:** a channel not in English has no free voice, so without ElevenLabs it stops at the voice with a sentence.
- Tests: `npm run audit`, new, one command, 0 USD, real network blocked: 916 of 916 checks, 13 real renders, 51 minutes, in folders with spaces and Hungarian accents. Node 661 of 663 (2 live tests skipped, the old red `traffic-card.test.mjs` was the test's own fault and is fixed), Rust 50, UI check 0 errors.
- Merged into `main` from branch `reliability-audit` and pushed. No PR, no GitHub Actions run (`build.yml` runs only on a PR or by hand).
- `CLAUDE.md` is new in the repo root: what ITV is, the folder map, every rule, how to build.
- Local installer built 2026-11-03 19:57 and installed over the old app:
  `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe` (110 MiB). The installed copy's own node, runner and engine, with no key: the Health check, a draft by hand, the free voice standing in for ElevenLabs with its note, a real render (17.6 s of video in 41 s) and the card. The app was opened, its silent Health check logged 0 problems. No screen was clicked in the installed window.
- Housekeeping: old build outputs removed, only the newest installer kept, so the next build compiles Rust from scratch (about 15 minutes).

**Not tried yet:** no real AI, ElevenLabs, HeyGen, Kie AI or Pixabay answered in the audit, only mocks of their failures. The stages ran through the runner's commands in the app's order, not by clicking; the new fallbacks inside `ProjectView.svelte` are type-checked, not clicked. A really full disk. A Mac.

**Next:** Zoltan tries the installer with no key and with a wrong key on one channel (one pasted script, one topic). Then Phase 9 in a new chat, on a Mac.

## Earlier (2026-11-03, Soft Clay Chronicle, DECISIONS 161 to 163)

**Phase 8 of `docs/BUILD_PLAN.md` is done. Phase 9, the macOS build, is next, and it needs a Mac.**

- **Where to find it:** a channel's recipe, Style: Soft Clay Chronicle. Choosing it turns B-roll off, research on and the music warm; all three switches stay.
- **What it makes:** warm history documentaries in matte clay. Rounded faceless figures told apart by what they wear, things with a faint fingerprint texture, one warm lamp over
  a table with a real old map on paper, a soft glow on the thing the story is about. 15 scene templates, 42 things drawn by code, three.js. Nothing is downloaded when a video is
  made and nothing is paid. Its own colors and the OFL fonts Playfair Display and Source Serif 4.
- **The small date label:** the last date the voice has said, in the top left corner. It stands still across cuts. The build fills it, so the AI is never asked and it cannot say a date the voice did not.
- **Your call, Claude chose (DECISIONS 161 and 162):**
  - No percent template, the 15 places went to history's needs (year, journey, map, two people talking, the thing on a cloth). A percentage stands in the words.
  - Research is on by default here, but can be turned off. Unlike Night Case File, this style does not promise a fact-check.
- **The AI only fills templates.** A dead AI still gets a varied plan, though a line cut by rule can read oddly ("Most people in the town never", "a rich king built").
- **Speed:** 62 s of video renders in about 140 s (draft quality), 27 MB.
- **Also fixed, every preset:** a year is no longer read as a plain number ("In 1761" could become a giant 1,761).
- Tests: Node 637 of 640 (the one red is `traffic-card.test.mjs`, red on main before; 2 live tests skipped), UI check 0 errors, new `scripts/phase2/clay-e2e.mjs` 51/51 with the real free voice and
  real renders, 3D Explainer's e2e 21/21 (its shared code changed; its picture looks the same on a contact sheet) and Motion Frames' channel e2e 56/56. Rust not touched, not run again.
- Merged into `main` from branch `preset-soft-clay` and pushed. No PR, no GitHub Actions run (`build.yml` runs only on a PR or by hand).
- Local installer built 2026-11-03 16:46 and installed over the old app:
  `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe` (110 MiB). The installed copy's own node, runner and engine offered the style and rendered a real
  Soft Clay video (41/41 steps, 62 s of video in 136 s). The app was opened. The style list was not clicked in the installed window (screen access was declined this session).
- Samples: `C:/Users/gdp/Videos/IdeaToVideo-mintak/2026-11-03_soft-clay_minden-sablon.mp4` (every template once) and
  `2026-11-03_soft-clay_szabaly-alapjan.mp4` (planned by rule, no AI). Draft quality. The story in them is invented, as a test.
- Housekeeping: old build outputs removed, only the newest installer kept, so the next build compiles Rust from scratch (about 15 minutes).

**Not tried yet:** a real AI on the plan, the brief and the script (rule and a pasted script only), so Google Search grounding has still not run against the real service; Hungarian on
this preset (only finding things and dates is tested); a video over 63 s; nobody has listened to the warm music under this picture.

**Next:** Phase 9 (macOS build) in a new chat, on a Mac with Claude Code, no CI. It cannot be done on this Windows computer. Zoltan's own tries are still open: one piece of history on
Soft Clay Chronicle, one true story on Night Case File, one explainer on Archive Collage, one what-if story on Stick World, one strange question on 3D Explainer, and Phase 3's
(one topic with research, one set of notes, one recording).

## Earlier (2026-11-03, Night Case File, DECISIONS 158 to 160)

**Phase 7 of `docs/BUILD_PLAN.md` is done. Phase 8, Soft Clay Chronicle, is next.**

- **Where to find it:** a channel's recipe, Style: Night Case File. Choosing it turns B-roll off and sets the dark music mood; both switches stay.
- **What it makes:** true story documentaries. Dark blue-black streets and rooms from simple shapes, faceless figures glowing amber, date and
  place stamps, an evidence board with one string, one thing under a lamp, dark maps with pins and routes. 15 scene templates, 22 things
  drawn by code. Nothing is downloaded when a video is made and nothing is paid. Its own colors and the OFL fonts Bebas Neue and IBM Plex Mono.
- **Never a weapon, blood or violence:** a sentence that says such a thing gets windows flashing in the dark and a dull sound made by code, and
  no word of it on screen (English and Hungarian list, `never` in the preset). The script writer is told not to describe it.
- **Your call, Claude chose (DECISIONS 159 and 160):**
  - The voice still says what the script says, and captions, if the channel has them, show those words. A pasted finished script stays as it is.
  - Research is always on for this style and cannot be turned off, so even a finished script needs your AI key on this style.
  - Nobody has listened to the flash's sound yet. It is measurably there (the low band up 4 dB). **Your ear decides the level.**
- **Fact-check:** the brief stops the run as in Phase 3, one click goes on. Sources and flagged claims go into the Publishing Card, never into
  the YouTube text. A video with no sources says `unchecked` on the card.
- **The AI only fills templates.** A dead AI still gets a varied plan, though a line cut by rule can read oddly ("A man walked / side door and went", "At 11:40 / P.M").
- **Speed:** 60 s of video renders in about 130 s (draft quality), 24 MB.
- **Also fixed, every preset:** "At 11:40" no longer makes a giant 11, and a date no longer makes a number. A time on screen keeps its colon.
- Tests: Node 615 of 618 (the one red is `traffic-card.test.mjs`, red on main before; 2 live tests skipped), UI check
  0 errors, new `scripts/phase2/nightfile-e2e.mjs` 65/65 with the real free voice and real renders, Motion Frames' channel e2e 56/56. Rust not touched, not run again.
- Merged into `main` from branch `preset-night-case-file` and pushed. No PR, no GitHub Actions run (`build.yml` runs only
  on a PR or by hand).
- Local installer built 2026-11-03 14:56 and installed over the old app:
  `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe` (110 MiB). The installed copy's own node,
  runner and engine rendered a real Night Case File video (13/13 steps, 23 s of video in 75 s). The app was opened and the style list clicked in the
  installed window: the style, its dark mood and the locked research box show. Cancelled, your recipes were not changed.
- Samples: `C:/Users/gdp/Videos/IdeaToVideo-mintak/2026-11-03_night-case-file_minden-sablon.mp4` (every template once) and
  `2026-11-03_night-case-file_szabaly-alapjan.mp4` (planned by rule, no AI). Draft quality. The story in them is invented, as a test.
- Housekeeping: old build outputs removed, only the newest installer kept, so the next build compiles Rust from scratch
  (about 15 minutes).

**Not tried yet:** a real AI on the plan, the brief and the script (rule, a pasted script and a stand-in brief only), so Google Search grounding
has still not run against the real service; Hungarian on this preset (only the forbidden words are tested); a video over 60 s.

**Next:** in a new chat, Phase 8 (Soft Clay Chronicle). `docs/BUILD_PLAN.md`, "What later phases reuse", says what to start from.
Zoltan's own tries are still open: one true story on Night Case File with research on, one explainer on Archive Collage, one what-if story on
Stick World, one strange question on 3D Explainer, and Phase 3's (one topic with research, one set of notes, one recording).

## Earlier (2026-11-03, Archive Collage, DECISIONS 155 to 157)

**Phase 6 of `docs/BUILD_PLAN.md` is done.**

- **Where to find it:** a channel's recipe, Style: Archive Collage. Choosing it turns B-roll off; the switch stays.
- **What it makes:** documentary collage explainers. Aged paper with a faint map, halftone cutouts with a rough light
  keyline and an offset accent stroke, torn strips of words, giant ticking numbers, underline swipes, a date stamp, map pins
  and route lines on real maps, and a rare frame that floods with the accent. 15 scene templates, 32 things drawn by code.
  Nothing is downloaded when a video is made and nothing is paid. Its own colors and the OFL fonts Archivo Black and Newsreader.
- **Maps:** Natural Earth (public domain) is bundled, 242 countries and 236 cities. Logged in every video's license file,
  never in a YouTube description. A sentence that names a place gets a pin, one that names two gets a route.
- **As the plan asks:** six layers at different depths in real parallax under one slow drift per scene, spring pop-ups with a
  slight overshoot, staggered entrances. The alert comes at most once per 16 scenes, only where the words say crisis or the like.
- **Your call, Claude chose:** the cutouts are drawn by code, not real photos put through dots (DECISIONS 155). The draft
  of 69 s is about 85 MB because of the print grain; say if that is too much.
- **The AI only fills templates and names things.** A dead AI still gets a varied video by rule.
- **Speed:** 69 s of video renders in about 160 to 230 s (draft quality), slower than Stick World.
- Tests: Node 590 of 593 (the one red is `traffic-card.test.mjs`, red on main before; 2 live tests skipped), UI check
  0 errors, new `scripts/phase2/collage-e2e.mjs` 51/51 with the real free voice and real renders, Motion Frames' channel e2e 56/56. Rust not touched, not run again.
- Merged into `main` from branch `preset-archive-collage` and pushed. No PR, no GitHub Actions run (`build.yml` runs only
  on a PR or by hand).
- Local installer built 2026-11-03 13:35 and installed over the old app:
  `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe` (110 MiB). The installed copy's own node,
  runner and engine rendered a real Archive Collage video (42/42 steps, 69 s of video in 150 s). The app was opened. The style
  list was not clicked in the installed window (screen access was declined this session); the installed runner does offer it.
- Samples: `C:/Users/gdp/Videos/IdeaToVideo-mintak/2026-11-03_archive-collage_minden-sablon.mp4` (every template once) and
  `2026-11-03_archive-collage_szabaly-alapjan.mp4` (planned by rule, no AI). Draft quality.
- Housekeeping: old build outputs removed, only the newest installer kept, so the next build compiles Rust from scratch
  (about 20 minutes).

**Not tried yet:** a real AI on the plan and on the script's places and years (rule and a pasted script only); Hungarian on
this preset (only the finding of places is tested); a video over 69 s.

**Next:** in a new chat, Phase 7 (Night Case File). `docs/BUILD_PLAN.md`, "What later phases reuse", says what to start
from. Zoltan's own tries are still open: one explainer on Archive Collage, one what-if story on Stick World, one strange
question on 3D Explainer, and Phase 3's (one topic with research, one set of notes, one recording).

## Earlier (2026-11-03, Stick World, DECISIONS 152 to 154)

**Phase 5 of `docs/BUILD_PLAN.md` is done.**

- **Where to find it:** a channel's recipe, Style: Stick World. Choosing it turns B-roll off; the switch stays.
- **What it makes:** what-if stories told to "you". Black stick figures on a light plain background, you are the one
  with the red scarf. 14 scene templates, 28 things drawn by code: thought cloud, two people talking, you walk to the
  thing, four signs in a row, you and them, A leads to B, a big number with exactly that many people, 100 people with
  the percentage marked. Nothing is downloaded and nothing is paid. Its own colors and the OFL fonts Rubik and Quicksand.
- **As the plan asks:** a blink every 3.5 to 4 seconds on the video's clock, feet that stay planted when walking, a
  camera that moves under 2% per shot. The blink and the feet were tested and also seen in the rendered frames.
- **One limit, your call:** a shot lasts at least 2 seconds, so a sentence under that shares a shot with the next one.
  The script writer is told to write 6 to 12 words, which gave 21 shots for 21 sentences (DECISIONS 153).
- **The AI only fills templates and names things.** A dead AI still gets a varied video by rule.
- **Speed:** 61 s of video renders in about 110 s (draft quality).
- Tests: Node 567 of 570 (the one red is `traffic-card.test.mjs`, red on main before; 2 live tests skipped), UI check
  0 errors, new `scripts/phase2/stickworld-e2e.mjs` 45/45 with the real free voice and real renders, Motion Frames'
  channel e2e 56/56. Rust not touched, not run again.
- Merged into `main` from branch `preset-stick-world` and pushed. No PR, no GitHub Actions run (`build.yml` runs only
  on a PR or by hand).
- Local installer built 2026-11-03 12:22 and installed over the old app:
  `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe` (109 MiB). The installed copy's own node,
  runner and engine rendered a real Stick World video (37/37 steps, 61 s of video in 124 s). The style list was not
  clicked in the installed window (screen access was declined this session); the installed runner does offer it.
- Samples: `C:/Users/gdp/Videos/IdeaToVideo-mintak/2026-11-03_stick-world_minden-sablon.mp4` (every template once) and
  `2026-11-03_stick-world_szabaly-alapjan.mp4` (planned by rule, no AI). Draft quality.
- Housekeeping: old build outputs removed, only the newest installer kept, so the next build compiles Rust from scratch
  (about 20 minutes; this one took about 20).

**Not tried yet:** a real AI on the plan and on the script's short "you" sentences (rule and a pasted script only);
Hungarian on this preset (the fonts have the letters, a rule-made video finds fewer things there); a video over 61 s.

**Next:** in a new chat, Phase 6 (Archive Collage). `docs/BUILD_PLAN.md`, "What later phases reuse", says what to start
from. Zoltan's own tries are still open: one what-if story on Stick World, one strange question on 3D Explainer, and
Phase 3's (one topic with research, one set of notes, one recording).

## Earlier (2026-11-03, 3D Explainer, DECISIONS 148 to 151)

**Phase 4 of `docs/BUILD_PLAN.md` is done.**

- **Where to find it:** a channel's recipe, Style: 3D Explainer. Choosing it turns B-roll off; the switch stays.
- **What it makes:** one strange question per video. 14 scene templates, 38 objects drawn by code: cutaway view,
  scale comparison, tank that fills, stairs, two sides on plinths, A leads to B, and more. One slow camera move per
  scene, plain cuts, its own colors and the OFL fonts Outfit and DM Sans. Nothing is downloaded and nothing is paid.
- **The AI only fills templates and names objects.** A dead AI still gets a varied video: rules pick scale, cutaway,
  versus, cause or question when the sentence really says that. A ratio the voice says is the ratio on screen.
- **Speed:** a 43 s video renders in about 86 s, the same pace as Motion Frames, so 8 minutes is about 16 minutes.
- **Your Motion wizard does not apply to this preset,** because the camera belongs to the scene. Your captions do.
- **three.js 0.180.0 (MIT)** is in the pinned engine, reduced to the one file a build reads.
- Tests: Node 547 of 550 (the one red is `traffic-card.test.mjs`, red on main before; 2 live tests skipped), UI check
  0 errors, new `scripts/phase2/explainer3d-e2e.mjs` 42/42 with the real free voice and real renders, Motion Frames'
  channel e2e 56/56. Rust not touched, not run again.
- Merged into `main` from branch `preset-3d-explainer`. No PR, no GitHub Actions run.
- Local installer built 2026-11-03 01:03 and installed over the old app:
  `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe` (109 MiB). The installed copy's own
  node, runner and engine rendered a real 3D video (43 s of video in 82 s). The style list and the B-roll switch were
  checked in `scripts/ui-mock`, not by clicks in the installed window (screen access was declined this session).
- Samples: `C:/Users/gdp/Videos/IdeaToVideo-mintak/2026-11-03_3d-explainer_minden-sablon.mp4` (every template once) and
  `2026-11-03_3d-explainer_szabaly-alapjan.mp4` (planned by rule, no AI). Draft quality.
- Housekeeping: old build outputs removed, only the newest installer kept, so the next build compiles Rust from scratch.

**Not tried yet:** a real AI on the plan and on the script's strange question (rule and stand-ins only); a video over
a minute; Hungarian on this preset (a rule-made video finds fewer objects there, and shows the neutral one).

**Next:** Zoltan tries one strange question on the installer, on a channel set to 3D Explainer, up to the render. Phase 3's
own try is still open too (one topic with research, one set of notes, one recording). Then Phase 5.

## Earlier (2026-11-02, Direction, Research and Shot map, DECISIONS 142 to 147)

**Phase 3 of `docs/BUILD_PLAN.md` is done.**

- **Start screen:** Script to video or Edit a recording (either one from any channel); a topic, or
  pasted text marked Finished or Notes; research on or off. The recipe holds the defaults.
- **Notes:** your ideas and way of speaking kept, no word target, and any number not in the notes or
  the approved brief goes back to the AI.
- **Research:** Gemini with Google Search. A tab with the brief, editable, with claims flagged; one
  click goes on. Sources go into the Publishing Card only. Another AI cannot search here, and its
  brief says so. A finished script is only checked, never changed.
- **Shot map:** a new stage and tab after the voice, no AI. Each shot starts on the word of its main
  text, a long one is cut at a pause, and the tab shows graphic or B-roll, camera, change, hero. A block
  you chose stays. Limit, also on the tab: a second line inside a block keeps the block's own animation.
- **Hero moments:** automatic. Free sources, then a Kie AI picture (Z-Image, about 0.004 USD, shown as
  0.01) moved in 2.5D here, then Kie AI video, which only ever goes out on a new yes.
- **Google Flow slot:** per shot, off by default: prompt, copy, exact length, mp4 back.
- **Week batch:** every mode. Pasted texts split on `---`, at most 7. With research on, each stops at
  its brief (Claude's decision, can be overruled).
- **Bug fixed from phase 1b:** the B-roll "source" link on the Preview tab could not open most
  addresses. New command `open_source_link` opens only what the video itself recorded.
- **One change from the plan's order:** the free B-roll search stays before the Preview; only money
  waits for the approval. DECISIONS 145 says why.
- Merged into `main` from branch `direction-research-shotmap`. No PR, no GitHub Actions run.
- Tests: Node 524 of 527 (the one red is `traffic-card.test.mjs`, red on main before; 2 live tests
  skipped), Rust 50, UI check 0 errors. `scripts/phase2/channel-e2e.mjs` 56/56 with the real free voice
  and a real render; a shot was seen in the real video to change on its word. Stand-ins only for the AI.
- Local installer built 2026-11-02 23:36 and installed over the old app:
  `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe` (109 MiB). The installed
  copy starts, its runner answers, and the new start screen took real clicks.

**Not tried yet:** a real AI on the brief and on notes, so **Google Search grounding has not run against
the real service**; a real paid picture and its look at 1080p; a real Google Flow clip; dropping an mp4
in the installed app (the button path is tested). Screens seen in `scripts/ui-mock`
(`?research=notes`, `?shots=1`), and in the installed app only as far as noted above.

**Open for Zoltan:** Google's terms on showing Search Suggestions with grounded answers (DECISIONS 143).

**Next:** Zoltan tries one topic with research, one set of notes and one recording. Then Phase 4.

## Housekeeping (2026-11-02, no new features)

- **Space:** 9.26 GB freed on C:, free space from 33.07 GB to 42.33 GB. Removed the Rust build
  output except the installer, `app/build`, `app/.svelte-kit`, the npm cache, render history, preview
  files, temporary test folders and the duplicate Kokoro model.
- **The next build is slower:** Rust compiles from scratch, and npm downloads again.
- **Installer kept:** `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe`.
- **`docs/BUILD_PLAN.md`:** new housekeeping rules, and Phase 9 (macOS build) added.
- **Backup:** every local branch pushed. Every branch's `build.yml` runs only on `pull_request` and
  `workflow_dispatch`, so no Actions run. No PR. Merged into `main` from `housekeeping-build-rules`.
- **Not touched:** `~/.cache/hyperframes` (727 MB) and `~/.cache/huggingface` (141 MB), other tools
  may use them.

## Earlier (2026-11-02, Recorded engine, DECISIONS 138 to 141)

**Phase 2 of `docs/BUILD_PLAN.md` is done.**

- **Where to find it:** a channel's recipe, Engine: Recorded. Four presets: Talking Head,
  Screen Recording, Screen Share, Profile Silhouette. The start screen then asks for the files.
- **The run:** words on this computer (Whisper, downloaded once, 79 MB), checked against the
  recording's sound; silences, filler words and repeated takes cut; chapters and big words by
  the AI or a rule; up to the existing Preview. Render, Publishing Card, Thumbnail and the
  publishing app are unchanged. Chapter times come from the real cut video.
- **The Recording tab:** every cut with a Put back, chapter titles, big words, the check.
- **Person cut-out and silhouette:** MODNet, Apache 2.0, downloaded once, 26 MB. Checked by eye
  in real renders: the word sits behind the head, the figure has its rim light.
- **Smooth cursor, only when safe:** on three of your real recordings the tracker followed enough to
  zoom, but other things moved on those screens, so the filmed cursor stays there. The clean
  test screen gets the smooth drawn one, with a known limit: at one stop of the test clip a sliver of
  the filmed cursor stayed visible (the recipe has a switch). Recordings with no voice stop with a
  sentence that says so.
- Merged into `main` from branch `recorded-engine`. No PR, no GitHub Actions run.
- Tests: Node 486 of 489 (the one red is `traffic-card.test.mjs`, red on main before; 2 live tests
  skipped), Rust green, UI check 0 errors. `scripts/phase2/recorded-e2e.mjs`, all steps with a real
  render: Talking Head 41, with cut-out on a real clip 38, with B-roll 49, Screen Recording 44, on a
  real recording with real speech 38, Screen Share 44, Profile Silhouette 39. Screens seen in
  `scripts/ui-mock` (`?recorded=talking-head`), not in the installed app.
- Local installer built 2026-11-02 20:49 and installed over the old app:
  `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe` (109 MiB). The installed
  copy's runner transcribed a real clip.

**Not tried yet:** a real AI on the plan (the rule only); a recording over a minute; a real
side-angle take with a separate front take (a front-facing clip stood in); Hungarian speech (no
Hungarian recording with sound was at hand).

**Next:** Zoltan tries one real recording on the installer. Then Phase 3.

## Earlier (2026-11-02, merge and new phase order)

- **`broll-engine` is merged into `main`**, which brings Phase 1 (`channel-presets`) too.
  No PR. `engine/node_modules/` and `itv-local-build.log` are ignored by the new root
  `.gitignore`.
- **A push to `main` starts no GitHub Actions:** `.github/workflows/build.yml` runs only on
  `pull_request` and `workflow_dispatch`, and no PR is open. Never open a PR, a PR starts it.
- **`docs/BUILD_PLAN.md` has the new order:** 2 Recorded engine, 3 Direction, Research and
  Shot map, 4 3D Explainer, 5 Stick World, 6 Archive Collage, 7 Night Case File, 8 Soft Clay
  Chronicle. New clean room rules: no source that asks for attribution, nothing about sources
  in the YouTube description, never "Vox" or any other brand name.


## Earlier (2026-11-02, B-roll engine, DECISIONS 137)

**Phase 1b of `docs/BUILD_PLAN.md` is done.**

- **Engine:** `runner/broll/engine.mjs`. For each stretch the cheapest source that
  fits: public domain film (Prelinger, NASA, Wikimedia Commons), a free still moved
  in 2.5D on this computer (`broll/parallax.mjs`, `broll/depth.mjs`, rendered by
  HyperFrames, about 70 s a clip), Pixabay (the existing integration and key), then
  a paid Kie AI clip.
- **Paid clips:** off by default. Per channel in its recipe: a switch, a most per
  video, a most per month. Seedance 1.0 Lite, 0.12 USD a 5 second clip at 720p. The
  Preview tab lists the scenes and the total; nothing is spent until "Approve and
  spend". Kie AI key in the keychain, tested with the free balance call: 80 credits,
  about 0.40 USD.
- **Open for Zoltan:** Kie AI's terms do not say who owns the output; only its product
  page says "Fully licensed for business use" (BUILD_PLAN, phase 1b).
- **A recipe locked before this keeps B-roll off:** turn it on in the channel's recipe.
- **Ledger:** every clip in `assets_license.json` with source or model, license or
  terms, author, prompt, cost, date.
- Branch `broll-engine`, committed, not pushed. Tests and the installer: see DECISIONS 137.

**Not tried yet:** a real paid clip; a real AI on the plan and the frame check (stand-ins
and the rule through a real render only).

**Next:** Zoltan turns B-roll on for one channel and tries one video.

## Earlier (2026-11-02, channels and presets, DECISIONS 132 to 136)

**The plan is `docs/BUILD_PLAN.md`. Every session reads it first and does only
the next "todo" phase. Phase 1 is done, Phase 2 is next.**

- **Home is the channel screen:** pick a channel, its locked recipe, idea or
  script in, video out, stopping at the Preview. Advanced toggle in the top bar:
  the wizards are behind it, nothing was deleted.
- **Preset engine:** `runner/presets/`. Preset 1, Motion Frames: 13 templates,
  the channel's zg-frames blocks first, bundled components second. The LLM only
  fills templates; a dead AI still gives a video.
- **Free voice:** Kokoro on this computer, word times from the model itself.
  An option: Zoltan's channels keep his ElevenLabs clone. Music by code.
- **Asset license module:** `runner/assets/`, `assets_license.json` per video.
- **Week batch:** 7 scripts in one run, queued on the channel screen.
- Branch `channel-presets`, **not committed**. Tests: Node 393 of 396 (the one
  red is `traffic-card.test.mjs`, red on main before; 2 live tests skipped),
  Rust 49, UI check 0 errors, e2e 54/54, channel e2e 29/29 with the real voice
  and render.
- Local installer built 2026-11-02 16:46 and installed over the old app:
  `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe`
  (109 MiB). No public installer, no GitHub Actions.

**Not tried yet:** a real AI on the template planner (stand-in answers and the
rule-based plan through a real render only); the `overlay` avatar against HeyGen
(costs credits); Openverse live (its server gave a 504 that day). The Library
of Congress search is blocked by a Cloudflare bot check; Wikimedia Commons works.

**Next:** Zoltan tries one video on the local installer and decides the open
licence table in `docs/BUILD_PLAN.md`. Then Phase 2, Archive Collage.

## Now (2026-10-29, thumbnails, DECISIONS 131)

- **Tab 7 "Thumbnail"** after Your video: With my face / No face, 3
  variants from the chosen YouTube title, the Brand colours and font, at
  most 4 words, strong contrast, a phone-size preview, free word edits,
  Regenerate one or all, Pick. The price is asked before every paid call.
- **Pictures:** Gemini `gemini-nano-banana-2.1` with the existing Gemini key
  ($0.0336 a picture, about $0.11 for 3), Pro in the picker, free test
  pictures. The app sets the words itself (HyperFrames snapshot), never the
  AI.
- **Profile photos** once per Identity (up to 3): Identity, Voice & Avatar,
  or right on the Thumbnail tab. In the Identity export like the logo.
- **Card:** optional `thumbnail` block (base64 JPEG under 1 MB), still
  `video-publishing-card/1`; Send to Publishing carries it. PDT side: its
  own chat, started 2026-10-29 from the prompt.
- Merged into main (PR #20, `25a50de`). Local installer built 2026-10-29
  15:13: `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe`.
  No public installer, no GitHub Actions.
- Tests: Node 341 of 344 (the one red is `traffic-card.test.mjs`, red on
  main before; 2 live tests skipped), e2e 54/54 (10 new thumbnail steps
  with the real engine), Rust 49, UI check 0 errors.

**Next:** Zoltan tries one video with real pictures (about $0.11, his Gemini
key needs billing on), with and without the face, on the local installer.

## Now (2026-10-28, full scene catalog, DECISIONS 130)

- **All 234 registry components** are bundled at the pinned commit, with the
  same lock and a new licence check. DECISIONS 56 is closed: "all 234".
- **Catalog** `library/catalog.json`: what each component shows, when it
  fits, role, needs, strong and weak points, an example, status. Written from
  the component files and from test renders of two topics in two looks.
  **25 on, 209 off** (72 paste-in recipes, 48 fail the check in their
  finished state, 1 lint, 19 empty or identical pictures, 69 own fixed
  content, placeholders or own colours). Never deleted, the reason is in the
  catalog. Re-test: `scripts/catalog/test-components.mjs`, then
  `build-catalog.mjs` (docs/scene-catalog.md).
- **Planning in two steps:** the whole catalog gives 3 to 5 candidates per
  scene, then the candidates' full code gives one pick with a reason. No
  component twice in a row, a use limit per video, the channel's last
  videos ranked lower (`<identity>/scene-history.json`).
- **Picture check** after the build (Preview tab, Autopilot asks): the AI
  judges two frames of every scene and swaps the ones that do not fit or do
  not read well, then those are checked again.
- **Price first:** planning, a swap, a change and the picture check show
  their price before they run.
- **Brand:** block packs (the ZG archetypes) are no longer planned; old
  tables build in the Identity's Brand. The pack files are untouched.
- **Build gate:** every scene is judged once it has landed.
- Tests: Node 329 of 332 (the one red is `traffic-card.test.mjs`, red on
  main before; 2 live tests skipped), e2e 44/44, Rust 48, UI check 0 errors.

## Now (2026-10-27, check report, DECISIONS 129)

- **"hyperframes check gave no readable report"** fixed: the engine's
  output was cut into lines piece by piece, so a long check report could
  break in two. Not a version problem: the app keeps its pinned engine
  0.8.181; the "update available" note in the report is only a notice.
- Tests: Node 322 of 323 (the one red is `traffic-card.test.mjs`, red on
  main before this change too). A real check on the 2026-10-26 video with
  the installed engine: 0 errors.
- Installer built locally on branch `fix-check-report` (2026-10-27 17:44):
  `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe`.
  Not pushed, no PR yet. Next: install it over the old app and run a video
  through the check again.

## Now (2026-10-23, playlist bridge lines, DECISIONS 128)

- **Script gate:** a lesson of a course or playlist gets "watch the previous
  one first" after the hook (from lesson 2) and "next, watch ..." (or "start
  from lesson 1" on the last) at the end. Made from the current order when
  the script is written, at most 12 seconds each, the comment calls as the
  video has them.
- Tests: Node 318 green, e2e 44/44.

## Now (2026-10-23, many channels, DECISIONS 127)

- **Home, Channels board:** one row per Identity and playlist: done "X of
  N", next video and its step, Sent to Publishing, Uploaded. Open goes to
  that Identity and that video's step.
- **Uploaded tick** (Your video tab and the board): the YouTube link and
  the date; then the 3 comment keywords and "Open vidrev.app". Upload stays
  manual.
- **Wizards, Playlist Planner:** Traffic Card or typed answers, vidIQ
  research, AI plan (8 to 16 videos, why), editable table, AI outline, then
  "Create N videos" through the course import. Each paid step asks first.
- **Identity, YouTube Channel & Audience:** "Import card (.md)" keeps the
  Evergreen Traffic Card and fills name, audience, topic and promise,
  language.
- **Import labels:** "Course or playlist".
- Tests: Node 313 green, Rust 48, e2e 44/44, UI check 0 errors. Not
  committed yet, no installer built.

**Next:** Zoltan tries the planner with a real Traffic Card and his vidIQ
key (real credits and AI tokens), then one video through to Uploaded.
Backlog: vidrev "Tell vidrev" through `/api/v1/cards/{id}/published`.

## Most (2026-10-20, HyperFrames 0.8.181)

- **Motor:** `hyperframes` és `@hyperframes/shader-transitions` 0.8.181,
  `gsap` 3.15.0, új engine lockfile (DECISIONS 126).
- **Render:** mindig a letöltött chrome-headless-shell; ha nincs meg, a
  render előtt letöltődik ("Downloading the render browser"). Rendszer
  Chrome tartalék renderre nincs. A render rövid ideiglenes mappába ír
  (`<tmp>/itv-r`), így hosszú útvonalon sincs ENAMETOOLONG.
- Tesztek helyben: Node 299 zöld, e2e 44/44 hosszú útvonalon is, UI check
  0 hiba. Telepítő nem készült, a branch nincs pusholva.

## Most (2026-10-20, tech stack átnézés)

- **HeyGen v3** (határidő 2026-10-31): minden hívás már v3, a doksival újra
  összevetve, kódcsere nem kellett (DECISIONS 116, 125).
- **ElevenLabs**: `eleven_v4`, `/v2/voices`, nincs kivezetett modell. A Music
  még `music_v1`; a `music_v2_5` fülpróbára vár.
- **Függőségek**: app patch/minor frissítés és `cargo update`; svelte-check 0
  hiba, Rust 48, Node 293 zöld.
- **Backlog:** SvelteKit 3 / TypeScript 7 később (a HyperFrames 0.8.181
  kész, DECISIONS 126).

## Most (2026-10-16, CTA teljes szöveg)

- **CTA wizard** (DECISIONS 124): a "What they get" mező 600 karakter, 4
  soros; a kulcsszót tartalmazó teljes hívást a HeyGen klip szóról szóra
  mondja, az előnézet is így mutatja. Branch `status-installer`, commitok
  `196e1e9` és `ddaa76d`.
- **Telepítő** helyben épült:
  `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe`.
  GitHub Actions nem futott.
- **Backlog:** "Generate now" gomb a CTA kártyán (egy klip azonnal, egyesével).

**Következő:** Zoltan a három CTA klipet egyenként legyártja (GUIDE, COURSE,
TRIGGER), és megnézi, hogy API-ról vízjel nélkül jön-e.
## Most (2026-10-11, Course import)

- **Course import** (121, branch `course-import`, PR a main felé): a
  Minicourse oldal "Course Content Structure" fájlja (vagy a kimásolt
  szövege) leckénként egy előkészített ONE Video lesz. Settings, Import &
  Export: fájl és beillesztés, előnézet, "Create N videos". Kitöltve: cím,
  kulcsszó, hook, script seed (teach, do, review a percekkel), zárómondat,
  YouTube cím és leírás, a kurzus és a playlist adatai.
- **Videos, "Course" szűrő:** a leckék playlist-sorrendben az állapotukkal,
  a playlist link, "Export Course Content Structure". Újraimport: csak a
  kézzel át nem írt értékek frissülnek, duplikátum nincs.
- **Video tab:** "Playlist: position N of M" a linkkel. Feltöltés nincs, az
  kézi marad a YouTube Studio-ban, sorrendben.
- **Video Publishing Card: opcionális `series` blokk** (122), a séma marad
  `video-publishing-card/1`. A PDT ezt a leírást másolja.
- Az import semmit nem indít el (nincs AI, HeyGen, render). Telepítő nem
  készült.
- **Backup** (123): a kurzus-csoport (`_courses`) és videónként a
  `seed.json`, `course-import.json`, `packaging.json` a mentésben van, és
  visszatöltéskor visszajön. A `packaging.json` eddig hiányzott minden
  videó mentéséből, ez is javítva.
- **Telepítő** (Windows, build `e047179`, a PR #16 és #17 merge után):
  `C:/Users/gdp/ITV-sandbox/share/IdeaToVideo_0.1.0_e047179_x64-setup.exe`
  (106 MB). Benne van minden a mainről; csak a `ci-test-order` branch
  nincs (CI beállítás, szándékosan a 4. fázis végére vár).
- Tesztek: Node 293 zöld (2 éles kihagyva), Rust 48, e2e 44/44, UI check 0
  hiba; a felület a `scripts/ui-mock`-kal megnézve (`?course=1`).

**Következő:** Zoltan kézi próbája egy valódi kurzusfájllal (az `e047179`
telepítővel); a PDT oldalon a `series` blokk olvasása. A korábbi pontok
állnak: a HeyGen éles próba, amikor van keret.

## Most (2026-10-08 este)

- **Videónként négy választás a hívásokra** (120): feltöltött klip, HeyGen új,
  HeyGen korábbi, avatar nélkül; nincs alapértelmezett, a HeyGen soha nem
  automatikus. Szürke opció mellett link a pótláshoz.
- **Javítva a naplóból:** a Script tab packaging (cím, összefoglaló, tagek)
  és a tokens.css import a telepített appban (a mag engedélylistája), teszttel.
- Telepítők (Windows és Mac): a merge után, a G:/My Drive/IdeaToVideo-pilot/ alá.

## Most (2026-10-08, UI egyszerűsítés)

- **Új felső menü** (119): Home, Videos, Wizards, Identity, Settings. Home:
  "Ready to make videos?" lista és a legutóbbi videók. Settings,
  Connections: minden kulcs egy oldalon, Identityként felülírható.
  Settings, Import & Export: minden import és export egy oldalon. Wizards,
  CTA: a házi hármas nagyban, klipforrással ("Generate with HeyGen" új
  móddal). Videó tabok: egy fő gomb, a többi Advanced alatt; a kész videó
  fő gombja "Send to Publishing".
- Funkció nem veszett el, csak máshova került; a régi helyeken link.
- Tesztek: Node 279 zöld, Rust 48, e2e 39/39, UI check 0 hiba. Telepítő
  nem készült (Zoltan).
- QUICKSTART frissítve az új helyekkel (`G:/My Drive/IdeaToVideo-QUICKSTART-Zoltan.md`).

**Következő:** Zoltan kézi próbája az új menüvel (a következő telepítővel);
a HeyGen éles próba, amikor van keret ("Generate with HeyGen" CTA klippel együtt).

## Most (2026-10-08)

- **Mac v1** (118): aláíratlan .dmg Apple Silicon gépre, a CI-ban
  indítási próbával; az arm64 ffmpeg új forrása (a régiből szűrők
  hiányoztak). Leírások: `docs/pilot/install-guide-mac.md`,
  `docs/pilot/send-logs.md`; a Windows leírás az új részekkel frissítve.
  A telepítők (build `da2d41a`, PR #12): `IdeaToVideo_0.1.0_da2d41a_aarch64.dmg`
  és `IdeaToVideo_0.1.0_da2d41a_x64-setup.exe` a `G:/My Drive/IdeaToVideo-pilot/`
  mappában, a Windows-os a `C:/Users/gdp/ITV-sandbox/share/`-ben is. Következő
  lépés: a Mac-es barátok próbája, a naplóik alapján javítás.

- **HeyGen v3** (116): minden HeyGen hívás már v3 volt; teszt rögzíti, hogy
  nincs v1 vagy v2 hívás. Határidő 2026-10-31 rendben.
- **Unsplash** (117): kép-forrás a Pixabay mellett, saját Access Key,
  Demo módban látható. Megjelölés az appban, download tracking, licenc-rekord.
- Tesztek: Node 277 zöld (2 éles kihagyva kulcs nélkül), Rust 48, e2e 39/39.

- Unsplash éles keresés Zoltan kulcsával: zöld (5/5). PR #10 merge-ölve.

**Zoltan döntései (2026-10-08):**
- **Unsplash Production kérelem: nem lesz soha.** Az Unsplash Demo módban
  marad (50 kérés óránként), és ez így végleges.
- **HeyGen éles próba:** elfogyott a HeyGen keret, 1-2 hét múlva jön
  (`runner/heygen-v3.test.mjs`, HEYGEN_API_KEY-jel). A határidő 2026-10-31.
- **Mac build:** másik, külön chatben készül, nem itt.

**Következő:** a HeyGen éles próba, amikor van keret; a Mac build a külön
chatben; utána CI és egy közös telepítő.

## Most (2026-10-07, este)

**Publikálási csomag kész** (Zoltan döntései 2026-10-07, DECISIONS 112-115;
PR #6, #7, #8, mind merge-ölve):
- **15 kulcsszó szó szerint a vidrevből**, kulcsszavanként legfeljebb egy
  szegmens; Settings, Identity, CTA: 3 sor x 5 kártya, Add/Replace, Delete
  (112).
- **Csomagolás a Script tabon** (86 frissítve, 113): cím-ötletek,
  összefoglaló, tagek a scripttel; a választott cím a script címe; a user
  választása megmarad újraírásnál. A Video tab ebből és a pontos adatokból
  rakja össze a YouTube szövegeket, másolás gombbal.
- **Video Publishing Card** (114): `<video>.card.json`, séma
  `video-publishing-card/1`, `cardId` projektenként, `packaging` mező.
- **Send to Publishing** (115): Settings, Publishing (cím, token a
  kulcstárban), POST `/api/v1/cards`, mock szerver
  (`scripts/publishing-mock.mjs`).
- Tesztek: 272 Node, 48 Rust, e2e 39/39 (az e2e jelenettáblája javítva).
- **Telepítő nem készült** (Zoltan, 2026-10-07): a Mac build és a CI után,
  egyben.

**Következő:** Zoltan kézi próbája a mock szerverrel; a PDT végpontja
ugyanerre a szerződésre; utána Mac build, CI, egy közös telepítő.

## Most (2026-10-06, este)

**AI B-roll: megépült, Zoltan jóváhagyására vár** (branch `ai-broll`, PR a
main felé, DECISIONS 98-99, `docs/ai-broll.md` 8). HeyGen Video 1 a meglévő
HeyGen kulccsal; Settings, Identity, Footage: kapcsoló (alapból ki),
generátor, minőség (480p, 768p alap, 1080p = HeyGen 2k, háromszoros ár),
plafon csúszkán (1-10 USD, alap 1), és külön "AI B-roll library". Scenes
tab: "Make B-roll clips" (AI terv, átírható képleírás, pipa, ár, plafon,
egyenleg, Make, Make again, Remove). Próba mód a telepítőben ("Test clips
(free, placeholder)"), így a teljes menet kredit nélkül kipróbálható.
Valódi HeyGen hívás nem volt. Tesztek: 231 Node, 47 Rust, e2e 39/39 (a próba
móddal a renderig).

**Nyitott pontok:**
1. **Az első valódi HeyGen Video 1 próbaklip** (legfeljebb 5 mp, 768p, kb.
   0,15 USD, októberben fele): amikor lesz API kredit (1-2 hét), és csak
   Zoltan kifejezett jóváhagyásával. Ellenőrizni: a rendelés és a letöltés
   él, a 768p minősége 1080p-s videóban, a valódi ár a számlán (a becslés
   rendes árral számol), a gyártási idő (a haladásjelző becslése: kb. 45 mp
   klipenként, tipp), és hogy a HeyGen 402-es "api credits" hibája emberi
   mondattal jön-e.
2. A `ci-test-order` branch (cd9a3e9, a CI runner tesztjei a könyvtár
   letöltése után) **a 4. fázis végén kerül PR-be**, mert Actions percet
   fogyaszt.
3. **Avatar, külön chatben** (Zoltan, 2026-10-06, DECISIONS 100):
   motorválasztás a Settings, Identity, Voice and avatar oldalon (Avatar
   III, IV, V, az `engine` mező; **alap: Avatar III**, a legolcsóbb; csak a
   look által támogatott motorok, becslés motoronként; ma az app nem küld
   motort, így a HeyGen alapja, az Avatar IV fut). És "Import from HeyGen"
   a CTA-szegmensekhez (`GET /v3/videos`, ingyenes; ki kell próbálni,
   hogy a webes felületen készült videók is benne vannak-e). Addig a
   GUIDE, COURSE, TRIGGER szegmenst Zoltan a webes HeyGenből tölti le, és
   feltöltésként adja hozzá (ingyen). Kérdés a próbán: ad-e az Avatar III
   átlátszó hátterű (WebM) klipet.

## 3. fázis, branch `phase-3` (frissítve 2026-10-07)

**Itt kezdd:** `docs/hatralevo.md` (a sorrend és mi kész), utána
`docs/video-quality-plan.md` (a videóminőség terve), a DECISIONS 101-109.
PR #5, merge-ölve a mainbe (2026-10-07).

**Zoltan sorrendje (DECISIONS 103):** (1) élénkebb alap, (2) ikonok, (3)
kimondott szó és feliratok, (4) a 39 archetípus csomagként, (5) Scenes
varázsló, (6) kép és videó források, utána telepítési leírás, új telepítő,
Zoltan próbája Windows Sandboxban; csak ezután README, `release.yml`, updater.
Zoltan kérése: kérdés nélkül haladni a javaslatok szerint.

**Kész ebben a fázisban:**
- avatar motorválasztás (alap Avatar III), Import from HeyGen, szegmens szöveg
  1500 karakter (101); sampler a 11 presettel, olvashatóság, betűköz,
  THIRD-PARTY-NOTICES (102);
- élénkebb alap: folyamatos kamera, új kép 3-5 mp-enként (103); tempó
  választható, Pixabay kulcs (104; a Coverr kivéve, 108);
- ikonok: Lucide, Tabler, Iconoir a rajzos jelenetben (105);
- 15 felirat-stílus és a kimondott szó kiemelése (106);
- blokk-csomagok (`.itvpack`), Import, Export a Settings, Identity, Scenes
  oldalon; a 39 archetípus márkanyom nélkül és eredetiben (107);
- Open Sans; Zoltan ZG/C2C márkája importálható Identity-fájlban:
  `C:/Users/gdp/ITV-packs/ZG-C2C.identity.zip` (109, `C:/Users/gdp/ITV-packs/README.md`).

**Kész a Scenes varázsló** (DECISIONS 110) **és a Pixabay keresés** (111: a
Scenes tabon, fotó lassú ráközelítéssel). Kész az egyoldalas angol telepítési leírás (`docs/pilot/install-guide.md`) és az új
telepítő (`C:/Users/gdp/ITV-sandbox/share/IdeaToVideo_0.1.0_981636b_x64-setup.exe`, 106 MB).
**A 3. fázis lezárva (2026-10-07):** PR a mainre, Zoltan jóváhagyásával merge; a
README is kész. A Sandbox-próba elhagyva, a telepítőt Zoltan próbálja, a hibákat megírja.
**Következő:** Zoltan próbája; a későbbi, ingyenes teendők (updater, `release.yml`,
`ci-test-order`, a GSAP licenc-kérdés eladás előtt) a `docs/hatralevo.md`-ben.

**Tesztek:** 266 Node, 47 Rust, UI check 0 hiba. Telepítő: `IdeaToVideo_0.1.0_981636b_x64-setup.exe`.
Mintavideók: `C:/Users/gdp/Videos/IdeaToVideo-mintak/`.

Régebbi sorrend: utána a 3. fázis (pilot).

## Előtte (2026-10-06)

**A 2. fázis lezárva** (DECISIONS 97). Előtte Zoltan c105d15-ös próbájának
hibái javítva (DECISIONS 96, `feedback/2026-10-06/NOTES.md`): a check a
kamera nélküli lapon fut (a Preview build hatszor elbukott a 9. jeleneten,
pedig a render jó volt); **Eleven v4 az alap**, a v2 nem kap nyelvkódot; a
Preview build nem állítja vissza a jóváhagyott avatart (a kapuk sorrendje a
tabok szerint); a "Get a key" linkek nyílnak; az elfogyott Claude kredit
emberi mondattal. Tesztek: 218 Node, 47 Rust, e2e 33/33. SPEC és PRD menet-
leírása a kódhoz igazítva.

**Következő volt: AI B-roll** (kész, lásd fent). Előtte érdemes egy új telepítővel (a lezárás commitjával)
egy magyar ONE Videót renderig vinni. A Drive tükör a 3. és 4. fázis után
frissül. A Mac build a 3. és 4. fázis után (DECISIONS 95).

## Hol tartunk

**Az 1. fázis kész**, a kimenete megvan: telepíthető app, ami scriptet ír. Zoltan a
saját gépén telepítette, végigment az onboardingon a saját Gemini kulcsával, és
írt és jóváhagyott egy scriptet (2026-09-30).

- `runner/`: Node sidecar, 38 teszt (`npm test`), új: `suggest-channel`.
- `app/src-tauri/`: Rust mag (config, OS kulcstár, sidecar, CSP, átköltöztetés a
  Studio névről), 15 teszt (`cargo test`).
- `app/src/`: Svelte 5 UI, onboarding 12 lépés, Settings, Projects, 1. kapu,
  `ITV-...` hibakódok. Kinézet: design-system "Shine" tokenek build közben.
- `scripts/fetch-sidecars.mjs`: Node 24.16.0, rögzített SHA256.
- CI: `.github/workflows/build.yml`, Windows + macOS, csak PR-re és kézzel.
- Mérések: `docs/ffmpeg.md` (döntés: DECISIONS 43), vidIQ (DECISIONS 42).
- Telepítő: `IdeaToVideo_0.1.0_x64-setup.exe` (25 MB, aláíratlan).

A kézi tesztben talált hibák mind javítva: runner útvonal (`\\?\`), modellnév,
Settings megnyitás, üres kulcsteszt, eltűnő hibaüzenet.

## Következő lépés

**2. fázis, branch `phase-2`.** Terv: `docs/phase-2-plan.md`, a Mozgás varázsló
specifikációja: `docs/motion-wizard.md`. A fázis közben irányt váltott: **D út**
(DECISIONS 48-54): az app saját könyvtárat kap a HyperFrames registry
komponenseiből, és saját pipeline-kódot.

Kész (2026-09-30):
- Névigazítás; CI PR-en csak Windows, a macOS kézi (Claude indítja).
- `engine/`: saját render lánc (hyperframes 0.8.22, gsap 3.14.2, lockfile),
  `scripts/fetch-engine.mjs` (154 MB).
- `library/components.json` + `scripts/fetch-library.mjs`: registry komponensek
  (titlecard-lockup, per-word-rise, kinetic-type-swap, count-up, chart-story,
  grid-card-assemble, vox-annotate, cta-close), rögzített commit, SHA256 lock,
  helyi GSAP. Témaváltozóik: `--bg`, `--fg`, `--brand`, `--accent`,
  `--accent-2`, `--font-display`.
- ffmpeg sidecar (Windows BtbN 8.1.2, macOS ffmpeg-static 6.1.1) képesség-
  ellenőrzéssel.
- Chrome az app helyi adatmappájába (`runner/tools.mjs`), "Download now" sáv.
- Hang kapu: ElevenLabs és Gemini TTS (mondatonkénti időzítés), hangminták,
  saját zenefájl, ElevenLabs Music, keverés -14 LUFS-re, UI lejátszókkal.
- Saját mondattábla (`runner/timing/sentences.mjs`).
- lint + check és render runner parancs.
- Telepítő utoljára 100 MB (2026-09-30, a 2. kapuval).

- **Registry-próba kész** (2026-09-30): `runner/gates/build/assemble.mjs` a
  jelenet-táblából és a `sentences.json`-ból megírja a `build/`-et, jelenetenként
  a saját hosszára illesztett komponens-másolattal. `scripts/phase2/pilot.mjs`:
  15 jelenet, 50 mp, két téma, lint + check 0 hiba, render 112 mp (kb. 2,2 perc
  gépidő videópercenként). Találatok: a HyperFrames minden változót CSS-változóként
  is kiír (az `accent` ezért nem mehet be változóként, a téma `--itv-*` néven
  él); a komponensek további téma-tokeneket olvasnak (`muted`, `surface`,
  `border`, `radius`, három betű).
- **Könyvtár: 15 komponens** (DECISIONS 55), mondat-szerepek szerint.
- Telepítő a 2. kapuval: Zoltan telepítette, a hang és a zene rendben (2026-09-30).
- Tesztek: 103 Node, 17 Rust, zöld.

- **3. kapu kész** (2026-09-30): `runner/gates/scenes/`, az AI a 15 komponensből
  tervez szerepek szerint (`roles.mjs`), ellenőrzés, egy javító hívás, csere
  ugyanabban a szerepben, Custom szöveg, hiányzó szerepek naplója. Határok:
  DECISIONS 57. UI: `SceneGate.svelte`. Valódi LLM-mel Zoltan próbálja ki.
- **4. kapu kész** (2026-09-30): `runner/gates/review/`, build + lint + check +
  kontakt lap (jelenetenként egy kocka a vége előtt), jóváhagyás, utána render
  az appból (minőség, haladás, lejátszó, "Show in folder"). UI: `ReviewGate.svelte`.
  E2E a runner parancsokkal: build 27 mp, render 110 mp egy 50 mp-es videóra.

- **13. és 17. kész** (2026-09-30, a 20:17-es telepítőben még nincs benne):
  render után `.srt` felirat és YouTube fejezetlista a videó mellé
  (`runner/gates/render/export.mjs`, "Copy chapters"); "Finish on Autopilot"
  gomb, ami a hátralévő kapukat Recommended módban végigviszi a renderig. A
  Custom szerkesztés (script, jelenet-tábla) mostantól nullázza a későbbi kapukat
  (SPEC 6).

- **Az első teljes videó az appból** (Zoltan, 2026-09-30): a visszajelzés és
  állapota: `feedback/2026-09-30/NOTES.md`. Javítva: üres jelenetvégek,
  keskeny betűk, vox-annotate ki (14 komponens), 0,6 mp szünet, -14 LUFS
  (DECISIONS 58).
- Varázslók indító leírásai: `docs/wizards/` (brand, motion, cta).

- **Kész még (2026-09-30), a feedback nyomán is:** haladásjelző és ébren
  tartás; a 4. kapu magyarázata és állóképei; videó-kinézet a brand presetből
  (Blue Professional, Warm paper, DECISIONS 59); zene: ElevenLabs Music, saját
  fájl, kulcs nélkül nincs (DECISIONS 60, 62); 5. kapu: HeyGen avatar a saját
  narrációval (DECISIONS 61, 63); vidIQ kulcsszó-ötletek (DECISIONS 64);
  ElevenLabs saját hangok (v2); feliratok és fejezetek; Autopilot; e2e teszt
  (`npm run e2e`, 11/11). Tesztek: 103 Node, 17 Rust.

- **Kész még (2026-10-01), a 3. feedback kör után:** Settings összeomlás
  javítva (bindable fallback); projekt útvonal rögzítve a nézetben; avatar
  előnézetek párhuzamosan, százalékkal; új hangnál a régi jelenet-tábla
  törlődik, jóváhagyás csak illő táblára; Gemini 503-nál a másik Gemini
  modell; avatar elhelyezés: kivágott (HeyGen WebM, átlátszó háttér), kör,
  kártya, teljes kép; négy sarok, három méret; alap a Settingsben, videónként
  az 5. kapuban, átváltás költség nélkül (DECISIONS 65); telepítő ikon.
  Tesztek: 106 Node, 17 Rust, e2e 11/11. Utolsó telepítő: commit 862344b.
- **UI próbakörnyezet:** `scripts/ui-mock/` (a leírás a `prepare.mjs` fejében):
  az app felülete sima böngészőben, ál-Tauri maggal, ami minden hívást naplóz.
  Így került elő a Settings összeomlás. UI hibánál ezzel kezdd.

- **Hibátlanítás, 1. kör (2026-10-01, commit 833dbeb):** Settings hat
  aloldalra bontva, aloldalanként a beállító varázsló újrafuttatható;
  haladásjelző: nem áll meg 95%-on, óra, részlépés szavakban, mi fogy és mi
  nem, ne altasd el a gépet; app bezárásakor megszakadt lépés "failed" lesz.
  Állapot: `feedback/2026-10-01/NOTES.md`. Tesztek: 111 Node, 17 Rust, e2e 11/11.

- **Identity kész (2026-10-01)**, terv: `docs/identity.md`, DECISIONS 67.
  Két szint: App (`config.json` schema 2) és Identity
  (`identities/<id>/identity.json`); ONE Videos az Identity mappájában;
  kulcs-öröklés (App kulcs, az Identity saját kulcsa felülírja); választó a
  felső sávban (New, Duplicate, Import, Identity settings); Settings két
  csoportban; Duplicate a saját kulcsokkal (jelölő); Delete (a videók
  maradnak); **Identity export és import** zipben, kulcs nélkül (a mintázó
  üzlet, DECISIONS 71); Solo és Agency egy helyen (`edition.rs`, ma Agency);
  Jobs jelző, render-sor (1), egy kulcson egy munka; átállás a mai
  beállításból: "My Identity". Tesztek: 116 Node, 34 Rust, e2e 13/13; UI
  próba a `scripts/ui-mock`-ban (`?fresh=1`, `?tier=solo`, `?one=1`).

- **Mentés (Backup) és Napló kész (2026-10-01)**, terv: `docs/backup.md`,
  DECISIONS 66. Mentés: Settings, App, Backup (mappa, felhő-mappa
  javaslat, szint 1-4 méretbecsléssel, automatikus mentés jóváhagyás és
  render után, "Back up now"); ONE Videónként saját szint és állapot;
  "Restore from backup" a listában; első indításkor "Restore from a backup"
  (App beállítás és minden Identity, kulcs nélkül). Fájlnevek Zoltan
  szabálya szerint. Napló: `AppData/Local/app.ideatovideo.desktop/logs/*.jsonl`,
  minden kattintás, nézet, választás, hívás, runner lépés (újrapróbálás,
  modellváltás), hiba; kulcs és tartalom nélkül; soha nem törlődik magától.
  Összefoglaló: `node scripts/log-summary.mjs`. Javítva még: a jelenet-tábla
  sikertelen újratervezése után a korábbi, illő tábla jóváhagyható; "ONE
  Video" mindig egyes számban. Tesztek: 124 Node, 39 Rust, e2e 16/16.

- **Brand varázsló és szótár kész (2026-10-02)**, leírás: `docs/wizards/brand.md`,
  DECISIONS 72. Brand Identity Card Identity-nként (`brand/brand-identity-card.json`,
  generált `FRAME.md`); varázsló 7 képernyővel (Settings, Identity, Brand):
  galéria (11 HyperFrames preset és a Warm paper), logó világos és sötét
  (videóba nem kerül), színek olvashatóság-ellenőrzéssel és Fix gombbal,
  betűk, formák, név a képernyőn, valódi előnézet (mintavideó, 8-15 mp).
  18 helyi OFL betű (1,7 MB), mind a 10 tartalomnyelv betűivel; a render
  nem tölt le betűt (mérve). Szótár: Settings, Identity, Dictionary; a
  script prompt kapja, a gépi ellenőrzés az 1. és 3. kapuban jelez.
  Gemini 429-nél egyszer a másik Gemini modell. Közös varázsló-keret a
  Mozgás és a CTA varázslónak. Javítva még: a sikertelen jelenet-csere a
  videó `log.txt`-jébe is bekerül. Tesztek: 142 Node, 40 Rust, e2e 20/20.
- **Brand varázsló, második kör (2026-10-02)**, DECISIONS 73: Warm paper
  törölve; a galéria 163 kinézet (11 HyperFrames preset és mind a 152
  open-design stílus, "<márka> style" névvel, jogtisztán: csak tények,
  márkabetű helyett szabad betű); 35 helyi betű (2,8 MB); "Import
  tokens.css"; Export és Import Brand Identity Card. Zoltan előző próbája
  (a 6df985d telepítővel): a napló 0 hiba. Tesztek: 144 Node, 43 Rust, e2e
  21/21.
- **Mozgás varázsló kész (2026-10-04)**, DECISIONS 74, specifikáció:
  `docs/motion-wizard.md` 3. változat, megvalósítás: `docs/wizards/motion.md`.
  Identity-nként `motion.json`, minden ONE Video örökli. Minden a
  HyperFrames-é: 9 hangulat és 3 energia a transition overview-ból, 5 CSS
  átmenet a saját jegyzékéből, 14 shader a `@hyperframes/shader-transitions`
  csomagból (0.8.22), háttér-komponensek (Dot field, Aurora csak sötétben,
  átlátszó jelenet-talajjal), kamera a doktrína szerint (Off, Subtle
  jitter, Push in). Komponensek szerepenként, stílusukkal. Valódi előnézet
  (18 mp-es videó). Settings, Identity, Motion. Profil nélkül a build bájtra
  a régi. Zoltan próbája ezzel a telepítővel még nincs (a 2026-10-02-i második
  körös Brand telepítőt sem telepítette: a napló utolsó indítása az első
  körösé, 0 hiba).

## Sorrend innen (Zoltan, 2026-10-01): külön chatek

1. **Hibátlanítás: kész** (2026-10-01).
2. **Identity: kész** (2026-10-01). Zoltan kipróbálta: átnevezés, Export,
   Import, Duplicate, Delete rendben. A saját kulcs és a futó render melletti
   váltás próbája egy barátnál.
2b. **Mentés és Napló: kész** (2026-10-01, Zoltan döntése szerint a
   varázslók előtt). Utolsó telepítő: commit d2a83b1 (2026-10-01 23:29),
   benne a jelenet-tábla javítása (egy korábbi sikertelen csere vagy
   tervezés nem blokkolja a jóváhagyást). Zoltan próbája ezzel: mentés a
   `G:/My Drive`-ba, napló, és a "Zoltan Gero" Identity első videója.
   **Következő: 3. pont, Brand varázsló, új chatben** (a prompt a 2026-10-02-i
   chat végén; a munka első lépése a Zoltan próbájának napló-összefoglalója).
3. **Brand varázsló: kész** (2026-10-02), a szótárral és a helyi betűkkel
   (DECISIONS 72). Zoltan próbája az új telepítővel: Settings, Brand, Open
   Brand wizard végig, mentés, egy ONE Video újra a 4. kapuig; Settings,
   Dictionary; és a 2b-ből elmaradt mentés a `G:/My Drive`-ba (a naplóban
   nem volt nyoma, a config.json-ban nincs mentési mappa).
   A Brand körből nyitott kérdés nem maradt (DECISIONS 73).
4. **Mozgás varázsló: kész** (2026-10-04, DECISIONS 74). Zoltan próbája az
   új telepítővel: Settings, Identity, Motion, Open Motion wizard végig,
   Render preview, Save; egy ONE Video újra a 4. kapuig és renderig; és a
   Brand második köre (163 kinézet, Import tokens.css, kártya export és
   import). **Következő: 5. pont, CTA varázsló, új chatben** (a prompt a
   2026-10-04-i chat végén; Zoltan ott adja a pontos leírást).
5. **CTA varázsló: kész, első kör** (2026-10-05, DECISIONS 75, leírás és
   Zoltan K1-K14 válaszai: `docs/wizards/cta.md`). Comment Routing: a vidrev
   15 kulcsszava, alap GUIDE, COURSE, TRIGGER, 0-3 hely (eleje az ígéret
   után, közepe a legértékesebb szakasz után, vége a végképernyő előtt),
   bármelyik kulcsszó bárhol, saját "mit kap" szöveg, Identity-szintű
   `cta.json`, videónként az 1. kapuban. A CTA mondata saját `cta-close`
   jelenet, a gomb a hőmérséklet színében. A landing link csak a leírásba
   (K10). logo-brand-close kivezetve. Javítva még: a videó fő színe mindig
   olvasható (DECISIONS 76, Zoltan halvány rózsaszín jelenete). Tesztek: 171
   Node, e2e (a CTA-jelenettel).
   Ugyanebben a chatben még (2026-10-05): **publikálási adatok** a videó
   mellett (`publish.json`, séma `itv-publish/1`, és `comments.txt`, Export
   gomb, DECISIONS 77), **újrahasznosítható CTA-szegmensek** (feltöltés vagy
   HeyGen, kulcsszóhoz kötve, legfeljebb 30 mp, helyenként Narrator vagy My
   segment, "previously selected") és a **végképernyő farok** (alap 20 mp,
   DECISIONS 53 megvalósítva), DECISIONS 78; **"previously used" hang és
   avatar** Identity-nként (DECISIONS 79); Zoltan próbája után javítva
   (DECISIONS 80, `feedback/2026-10-05/NOTES.md`): üres állóképek, kilógó
   CTA-sor, script hossza, szegmens "auto", elemek a kimondáskor; második
   kör (DECISIONS 81). **Saját felvétel-könyvtár (B-roll)** Identity-nként,
   AI-leírással, vágásponttól induló, váltakozó darabokkal (DECISIONS 82);
   **Eleven v4** választható (83). Tesztek: 188 Node, e2e 31/31.
   Jelenet-tábla a 8 perces teszt után (DECISIONS 84). Tesztek: 188 Node,
   43 Rust, e2e 31/31. Utolsó telepítő: commit 5984811 (2026-10-05 18:06).
   **A UI kör kész, Zoltan próbájára vár** (2026-10-05, DECISIONS 85-90).
   - A ONE Video hat tabon (Script, Voice and music, Scenes, Avatar,
     Preview, Your video); központi munkalista, nincs dupla indítás;
     pontosabb haladásjelző; kártyás hang- és kétlépcsős avatar-választó;
     jelenet-javítás a Preview-ban; AI nélküli kiutak (saját script, Simple
     plan); Your video tab (Download, felhő-mappa, YouTube Studio a
     szövegekkel). DECISIONS 85-86.
   - Az app a tálcán él, az X nem lép ki (87).
   - Natural voice (humanizer) Off, Light, Strong, "Your own angle" (88).
   - AI-modell és effort lépésenként (Script, Scenes, Small texts), Change a
     tabokon; natív Claude csatlakozó az Anthropic SDK-val (89).
   - Stock kereső: terv kész, a pilot után (90).
   Tesztek: 204 Node, 43 Rust, e2e 33/33. Telepítő: commit 8ddcdd9
   (2026-10-05 23:46, 99 MB). Képek: `feedback/2026-10-05/ui-tabs/`.
   UI próba: `scripts/ui-mock` (`?stage=0..6`, `?slow=`, `?aifail=1`).
   **Hibátlanítás: kész** (2026-10-06, DECISIONS 91), a cél a megbízható
   futás és az átláthatóság. Stop gomb minden haladásjelzőn; folyamatfa
   (Windows Job Object), így a Stop, az őrkutya és a kilépés a Chrome-ot és
   az ffmpeg-et is leállítja; checkin 15 mp-enként (working, waiting,
   seems stuck), automatikus leállítás nélkül (DECISIONS 92);
   türelmes újrapróbálás (AI kb. 3 perc körökben, a sáv kiírja; hang és
   HeyGen hívásonként); nincs dupla fizetés (megőrzött hangblokkok, HeyGen
   megrendelések átvétele); két javító kör a scriptnél és a jelenet-táblánál,
   az ízlésbeli eltérés csak figyelmeztetés; lépésenként kiírva, lecsukhatod-e
   a gépet; alvás és csend jelzése; beragadt "Running" a mag tudása alapján;
   Autopilot folytatás megszakadás után; render állapot a projektben;
   felületi hibahatár; "Export diagnostics" zip. Tesztek: 210 Node, 47 Rust, e2e 33/33.
   Telepítő: commit c105d15 (2026-10-06, a checkinnel, 99 MB), Zoltan próbájára vár.
   **A 2. fázis lezárása: kész** (2026-10-06, DECISIONS 96-97): Zoltan
   próbájának hibái javítva, PR a main felé, merge. Utána az AI B-roll.
   **Stock kereső: felfüggesztve** (DECISIONS 93, 95, `docs/stock.md`).
   **AI B-roll (generált klipek): megépült** (2026-10-06, DECISIONS 94, 95,
   98, 99, `docs/ai-broll.md` 8): alapból kikapcsolva, HeyGen Video 1,
   480p, 768p, 1080p, plafon csúszkán alap 1 USD, az elkészült klipek a
   Footage alatt újrahasznosíthatóan, próba mód. Az első valódi klip a
   HeyGen kredit után, Zoltan jóváhagyásával.
   Később: az OpenArt kimarad;
   élő előnézet renderelés nélkül (K9 b, Zoltan még nem döntött);
   lokalizáció és fordítás (DECISIONS 86). A PDT import és a Translation
   Pack külön chatben a PDT repóban.
6. ~~Mentés (Backup)~~: kész, lásd 2b.

A **fázis vége megvolt** (2026-10-06): STATUS, DECISIONS, SPEC frissítve, PR
`phase-2` a main felé, merge (Zoltan előzetes engedélyével). A Drive tükör a
3. és 4. fázis után. A Mac build
(`gh workflow run build -f platforms=both`) a 3. és 4. fázis után, a kiadás
előtt (DECISIONS 95).

**Megoldva (2026-10-02, DECISIONS 72), a 14. lépéshez: betűk.** A HyperFrames minden `@font-face` nélküli
betűcsaládot a Google Fonts-ról tölt le (a Georgiát is EB Garamondra cseréli),
és a komponensek tartalékként `Inter`-t írnak. Megoldás: helyi OFL betűfájlok
`@font-face`-szel a buildben, így nincs hálózati hívás és idegen betű.

## Zoltan döntésére vár

Stratégia (nem az IdeaToVideo kódja, de a suite iránya): a Drive
`21_Strategy_Update_2026-10-02 (READ FIRST)` doksi, DECISIONS 71.

0. A mintázó üzlet: megerősítve (2026-10-02, DECISIONS 71 és a Drive 21-es
   doksi). Nyitva csak: az affiliate létra (97 vagy 297 USD-s GHL szint),
   "amelyik előbb jön".

1. ~~A kulcsszavas komment-CTA~~: kész (DECISIONS 75).
2. ~~A `docs/motion-wizard.md`~~: jóváhagyva és kész (DECISIONS 74).
3. A v1 videótípusa: explainer? Zoltan még nem döntött, a DECISIONS-be még nem
   kerül.
4. A teljes registry (234 komponens): érvek a DECISIONS 56-ban, Zoltan később
   átnézi. Javaslat a katalógus csoportjai szerint: DECISIONS 74 utolsó pont.
5. ~~A logo-brand-close~~: kivezetve (DECISIONS 75). Nyitott: a Brand
   varázsló "név a képernyőn" lépése eddig ezt mutatta a videó végén; most
   a név a videóban nem jelenik meg. Kell-e helyette valami?
6. ~~A publikálási adatok átadása~~: kész az IdeaToVideo oldalon (DECISIONS
   77); a PDT import, a Translation Pack és később az API a PDT repóban.

## Hogyan indul egy új session

A `docs/SESSION-PROMPT.md` promptja, a táblázat szerinti modellel és effort-tal.

Forrás: Drive `10_HyperFrames_Shippability_and_Documentation_Review`
https://docs.google.com/document/d/1fOLZnrikPn-A_2tl2XNZPJnsdO9AOd1XpUY2u4VF4_4/edit

Drive tükör: https://docs.google.com/document/d/19PougSc18s97PBKP6mr_CnQUnEulNgkfq1eckCPDqJI/edit
