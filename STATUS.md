# STATUS: IdeaToVideo

Frissítve: 2026-09-30

End goal: helyben telepíthető asztali app, ami egy YouTube videót végigvisz ötlettől kész MP4-ig, a user saját gépén és kulcsaival, a HyperFrames motorral és Zoltan blokk-könyvtárával.

Fázisok (PRD 13): 0 pipeline Node-ra (**kész**) · 1 Tauri váz, onboarding, config és kulcstár, LLM (**kész, PR #2**) · 2 teljes 5 kapus menet a UI-ban · 3 pilot · 4 kiadás.

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

**2. fázis, branch `phase-2`.** Terv: `docs/phase-2-plan.md` (részben jóváhagyva,
2026-09-30). A PR #2 merge-ölve (main `b7f2289`).

Kész a 2. fázisból (2026-09-30):
- 1. lépés: névigazítás; CI PR-en csak Windows, a macOS build kézi (Claude indítja).
- 2. lépés: `vendor/brand-frames` submodule (`3efb25f`), `scripts/fetch-canon.mjs`
  (188 MB, 39 blokk, hyperframes 0.8.22, onnxruntime nélkül, Zoltan brand-mappái
  nélkül). CI: a kánon a `BRAND_FRAMES_TOKEN` vagy a design-system token
  kiterjesztésével érhető el.
- 4. lépés: ffmpeg sidecar, képesség-ellenőrzéssel.
- 5. lépés: Chrome az app helyi adatmappájába (`runner/tools.mjs`), sáv a
  Projects oldalon ("Download now").
- 6. lépés (részben): hang kapu ElevenLabs-szel és Gemini TTS-sel, hangminták,
  "Use my own file" zene, keverés az AUDIO.md szerint (-14 LUFS), UI lejátszókkal.
- 7. lépés: mondattábla a hang után automatikusan.
- 9. lépés runner oldala (`runner/gates/build`), a brand-frames PR után köthető be.
- Telepítő: 99 MB. Tesztek: 68 Node, 17 Rust, zöld.
- brand-frames `app-integration` branch (worktree `C:/Users/gdp/HyperFrames/_frames-wt-app`):
  `--outdir`, `--gsap` (npm `gsap` 3.14.2), semleges alapértékek. Alapból bájtra
  azonos kimenet. Regress teszt fut.

Következik: brand-frames PR merge és submodule léptetés, 3. kapu (jelenet-tábla),
4. kapu, render, zene szolgáltatók, a Gemini TTS mérése Zoltan kulcsával.

## Zoltan döntésére vár

1. A videó kinézete: A, B vagy C (`docs/phase-2-plan.md`, "Zoltan döntésére
   vár"). A 3. és a 14. lépés ettől függ.
2. `BRAND_FRAMES_TOKEN` létrehozása a CI-hoz (a 2. lépésnél kérem, lépésenként).

## Hogyan indul egy új session

A `docs/SESSION-PROMPT.md` promptja, a táblázat szerinti modellel és effort-tal.

Forrás: Drive `10_HyperFrames_Shippability_and_Documentation_Review`
https://docs.google.com/document/d/1fOLZnrikPn-A_2tl2XNZPJnsdO9AOd1XpUY2u4VF4_4/edit

Drive tükör: https://docs.google.com/document/d/19PougSc18s97PBKP6mr_CnQUnEulNgkfq1eckCPDqJI/edit
