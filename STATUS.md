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

1. A PR #2 merge-e zöld CI után (Zoltan jóváhagyta).
2. 2. fázis terve (`docs/phase-2-plan.md`): hang (edge TTS, ElevenLabs hanglista
   meghallgatással), jelenet-tábla, build, kontakt lap, render (ffmpeg és a
   hyperframes bekötése), HeyGen avatar lista, presetek, Autopilot.

## Zoltan döntésére vár

Semmi.

## Hogyan indul egy új session

A `docs/SESSION-PROMPT.md` promptja, a táblázat szerinti modellel és effort-tal.

Forrás: Drive `10_HyperFrames_Shippability_and_Documentation_Review`
https://docs.google.com/document/d/1fOLZnrikPn-A_2tl2XNZPJnsdO9AOd1XpUY2u4VF4_4/edit

Drive tükör: https://docs.google.com/document/d/19PougSc18s97PBKP6mr_CnQUnEulNgkfq1eckCPDqJI/edit
