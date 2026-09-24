# STATUS: Studio (munkanév)

Frissítve: 2026-09-24

End goal: helyben telepíthető asztali app, ami egy YouTube videót végigvisz ötlettől kész MP4-ig, a user saját gépén és kulcsaival, a HyperFrames motorral és Zoltan blokk-könyvtárával.

Hol tartunk: PRD 0.1 és SPEC 0.1 jóváhagyva. **A 0. fázis kész, Zoltan jóváhagyására vár.** A pipeline Node-on fut egy szimulált tiszta gépen: a C2C videó végigment a teljes láncon (mondattábla, build, check, render, avatar), a kimenet a jóváhagyott v4-gyel szemre azonos. A mérések és a találatok: `docs/phase-0.md`. A kilépő teszt: `scripts/phase0/e2e.mjs`. App kód még nincs.

Nyitott PR-ek:
- packaged-video-creator `phase-0-finish`: a teszt, a mérések, a döntések (DECISIONS 17-22).
- brand-frames `node-pipeline-docs`: dokumentáció Node-ra, `package-lock.json`, avatar hang javítás, STATUS. Kánon-változás, Zoltan nézi át.

Zoltan döntésére vár:
1. SPEC 12.3, böngésző: javaslat a pinnelt headless shell letöltve, a rendszer Edge vagy Chrome csak tartalék (a SPEC 8 javaslatának fordítottja, mérés alapján).
2. SPEC 12.4, Node sidecar: javaslat a csomagolt Node és egy lecsupaszított `node_modules` (`onnxruntime-node` nélkül, 153 MB). SEA kizárva.
3. A 39 archetípus az appban a választott HyperFrames preset színeit és betűit kapja Zoltan brandje helyett: jól értem-e.
4. A nyilvános repó csak a telepítőt és a README-t tartalmazza, a forrás privát marad.
5. Az `image-audio-lint` javítása a mountolt jelenetekre (külön brand-frames feladat, `docs/phase-0.md` Találatok 1.).

Következő lépés: Zoltan jóváhagyja a 0. fázist és a fenti javaslatokat, utána 1. fázis: Tauri váz, onboarding, config és kulcstár, LLM integráció. Az 1. fázis elején dől el a UI keretrendszer (SPEC 12.5), az ffmpeg build (docs/phase-0.md), és hogy a brand-frames melyik része kerül az appba (saját brand nélkül).

Forrás: Drive `10_HyperFrames_Shippability_and_Documentation_Review`
https://docs.google.com/document/d/1fOLZnrikPn-A_2tl2XNZPJnsdO9AOd1XpUY2u4VF4_4/edit

Drive tükör: https://docs.google.com/document/d/19PougSc18s97PBKP6mr_CnQUnEulNgkfq1eckCPDqJI/edit
