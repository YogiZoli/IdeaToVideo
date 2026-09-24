# STATUS: Studio (munkanév)

Frissítve: 2026-09-24

End goal: helyben telepíthető asztali app, ami egy YouTube videót végigvisz ötlettől kész MP4-ig, a user saját gépén és kulcsaival, a HyperFrames motorral és Zoltan blokk-könyvtárával.

Hol tartunk: PRD 0.1 és SPEC 0.1 jóváhagyva. **A 0. fázis kész, Zoltan jóváhagyására vár.** A pipeline Node-on fut egy szimulált tiszta gépen: a C2C videó végigment a teljes láncon (mondattábla, build, check, render, avatar), a kimenet a jóváhagyott C2C-vel szemre azonos. A kilépő teszt (`scripts/phase0/e2e.mjs`) alapból a videó első 18 mp-ét rendereli, egy tiszta futás kb. 4 perc. Mérések és találatok: `docs/phase-0.md`. A SPEC 12.3 (Chrome, Edge nem) és 12.4 (csomagolt Node, onnxruntime nélkül) eldőlt, lásd DECISIONS 23-28. App kód még nincs.

Nyitott PR-ek:
- packaged-video-creator #1 `phase-0-finish`: a teszt, a mérések, a döntések.
- brand-frames #1 `node-pipeline-docs`: dokumentáció Node-ra, `package-lock.json`, avatar hang javítás, STATUS. Kánon-változás, Zoltan nézi át.
- Párhuzamosan, külön sessionben: brand-frames `lint-mounted-slots` (az `image-audio-lint` javítása a mountolt jelenetekre). Ugyanabban a helyi mappában fut. Mielőtt mindkét brand-frames PR a mainre kerül, meg kell nézni a `pipeline/TIMING.md` ütközést.

Zoltan döntésére vár:
1. A nyilvános repó csak a telepítőt és a README-t tartalmazza, a forrás privát marad (javaslat).
2. ffmpeg (javaslat): ugyanúgy, mint a Node. Az app hozza magával, rögzített verzióban, a user semmit nem telepít. A kérdés csak a build: egy kisebb, ami csak azt tudja, ami kell (x264, aac, vp9 dekódolás, psnr szűrő). A méretet és a licencet (GPL) az 1. fázisban mérem és ellenőrzöm.

Következő lépés: Zoltan jóváhagyja a 0. fázist, és a brand-frames PR #1 merge után az `e2e.mjs` alapértelmezett `--ref`-je a merge commitra lép. Utána 1. fázis: Tauri váz, onboarding, config és kulcstár, LLM integráció. Az 1. fázis elején dől el a UI keretrendszer (SPEC 12.5), az ffmpeg build (`docs/phase-0.md`), és hogy a brand-frames melyik része kerül az appba (saját brand nélkül). Ugyanott tervezendő a projektenkénti munkapéldány, mert a `build-video.mjs` ma a könyvtár mappájába ír (SPEC 4.3 mást mond).

Forrás: Drive `10_HyperFrames_Shippability_and_Documentation_Review`
https://docs.google.com/document/d/1fOLZnrikPn-A_2tl2XNZPJnsdO9AOd1XpUY2u4VF4_4/edit

Drive tükör: https://docs.google.com/document/d/19PougSc18s97PBKP6mr_CnQUnEulNgkfq1eckCPDqJI/edit
