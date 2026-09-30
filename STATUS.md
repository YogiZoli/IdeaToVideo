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
- 1. lépés: SPEC, PRD, `package.json` névigazítás; a CI PR-en csak Windowst
  épít, a macOS build kézi (`gh workflow run build -f platforms=both`).
- 4. lépés: ffmpeg sidecar (`scripts/fetch-ffmpeg.mjs`): Windows BtbN
  n8.1.2 GPL shared, macOS ffmpeg-static 6.1.1, SHA256-tal; `check-ffmpeg.mjs`
  ellenőrzi a képességeket (Windowson mind megvan), a CI is futtatja; a runner
  a csomagolt ffmpeg-et kapja (`HYPERFRAMES_FFMPEG_PATH`). 43 Node és 16 Rust
  teszt zöld.

Következik: 5. lépés (Chrome első indításkor), 2. lépés (a kánon bekötése),
3. lépés (brand-frames PR), 6. lépés (hang).

## Zoltan döntésére vár

1. A videó kinézete: A, B vagy C (`docs/phase-2-plan.md`, "Zoltan döntésére
   vár"). A 3. és a 14. lépés ettől függ.
2. `BRAND_FRAMES_TOKEN` létrehozása a CI-hoz (a 2. lépésnél kérem, lépésenként).

## Hogyan indul egy új session

A `docs/SESSION-PROMPT.md` promptja, a táblázat szerinti modellel és effort-tal.

Forrás: Drive `10_HyperFrames_Shippability_and_Documentation_Review`
https://docs.google.com/document/d/1fOLZnrikPn-A_2tl2XNZPJnsdO9AOd1XpUY2u4VF4_4/edit

Drive tükör: https://docs.google.com/document/d/19PougSc18s97PBKP6mr_CnQUnEulNgkfq1eckCPDqJI/edit
