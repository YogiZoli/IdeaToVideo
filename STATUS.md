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

**2. fázis, branch `phase-2`.** Terv: `docs/phase-2-plan.md`, a Mozgás varázsló
specifikációja: `docs/motion-wizard.md`. A fázis közben irányt váltott: **D út**
(DECISIONS 48-54): az app nem használja Zoltan brand-frames kánonját, saját
könyvtárat kap a HyperFrames registry komponenseiből, és saját pipeline-kódot.

Kész (2026-09-30):
- Névigazítás; CI PR-en csak Windows, a macOS kézi (Claude indítja).
- `engine/`: saját render lánc (hyperframes 0.8.22, gsap 3.14.2, lockfile),
  `scripts/fetch-engine.mjs` (154 MB). A kánon submodule törölve.
- `library/components.json` + `scripts/fetch-library.mjs`: 8 registry komponens
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
- lint + check és render runner parancs (a C2C-n kipróbálva a régi úton).
- Tesztek: 68 Node, 17 Rust, zöld. Telepítő utoljára 99 MB (még a kánonnal).

**A következő konkrét lépés: a registry-próba befejezése.**
1. `runner/assemble.mjs`: a jelenet-táblából (komponens + változók + mondat-
   horgony) és a `sentences.json`-ból megírja a `build/index.html`-t: gyökér
   kompozíció, `class="clip"` mountok `data-composition-src`-vel és
   `data-variable-values`-szal, időzítés a mondatokból, hang, helyi GSAP,
   témaváltozók a `:root`-on.
2. Próba-videó: 8 jelenet (mindegyik komponens egyszer, a per-word-rise
   kétszer, mert a timeline-kulcsuk rögzített, ütközhet), kb. 30 mp, kétféle
   témával. lint, check, render, idő és hiba mérése, kontakt lap ffmpeg-gel.
3. Ennek alapján: a könyvtár bővítése (kb. 20-25 komponens), utána a
   3. kapu (jelenet-tábla) promptja a komponensek `registry-item.json`-jából.

## Zoltan döntésére vár

1. A kulcsszavas komment-CTA részletei (a vidrev.app 15 kulcsszava, márkanév
   nélkül): Zoltan később adja.
2. A `docs/motion-wizard.md` 2. változata (a D út miatt a MOTION-korlátok nélkül,
   a "Visszatérő elemek" a CTA varázslóba kerül): átírandó, jóváhagyásra.

## Hogyan indul egy új session

A `docs/SESSION-PROMPT.md` promptja, a táblázat szerinti modellel és effort-tal.

Forrás: Drive `10_HyperFrames_Shippability_and_Documentation_Review`
https://docs.google.com/document/d/1fOLZnrikPn-A_2tl2XNZPJnsdO9AOd1XpUY2u4VF4_4/edit

Drive tükör: https://docs.google.com/document/d/19PougSc18s97PBKP6mr_CnQUnEulNgkfq1eckCPDqJI/edit
