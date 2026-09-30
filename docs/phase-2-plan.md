# 2. fázis: terv

Kimenet (PRD 13): **kész videó az appból.** A teljes 5 kapus menet a UI-ban,
Autopilot, presetek, opcionális Brand, Mozgás és CTA varázsló.

Branch: `phase-2` (a mainről, `b7f2289`). A fázis végén egy PR a main felé, utána
Zoltan jóváhagyása. Állapot 2026-09-30: **jóváhagyott terv, D út** (DECISIONS
48-54).

Kilépő feltétel: Zoltan a saját gépén, a telepített appból, egy új témából kész
MP4-et készít (script, hang, jelenet-tábla, kontakt lap, render, felirat),
egyszer kézi kapukkal, egyszer Autopilottal. Az avatar ág egyszer a saját
HeyGen kulcsával, ha a kreditje engedi.

## Eldőlt (Zoltan, 2026-09-30)

1. Egy fázis, egy PR, köztes megállókkal.
2. **D út:** az appnak saját könyvtára és saját pipeline-kódja van. A
   jelenettípusok a HyperFrames nyilvános registryjéből jönnek (Apache-2.0),
   rögzített commitról, SHA256-tal. A kinézet a presetből vagy a Brand
   varázslóból, a mozgás a Mozgás varázslóból. Más forrásból semmi nem kerül be
   (DECISIONS 48, 49).
3. Az app felülete a saját IdeaToVideo arculata (DECISIONS 39, 40). A videók
   alapból egy HyperFrames presetet kapnak, a Brand varázslóval a user sajátját.
4. Három külön, opcionális varázsló az onboarding után: Brand, Mozgás, CTA
   (DECISIONS 50). Az onboarding után az app varázslók nélkül is használható.
5. Zene sorrendje: ElevenLabs Music, HeyGen katalógus, első használatkor
   letöltött CC0 zenék, "Use my own file".
6. Narrátor hang: ElevenLabs (a user kulcsával), ingyenes út a Gemini TTS a user
   Gemini kulcsával.
7. CI: PR-en csak Windows build és unit tesztek. A Mac build és a renderelő e2e
   teszt kézi indítású (`gh workflow run`), Claude indítja a fázis végén.
8. ffmpeg Macen: `eugeneware/ffmpeg-static` rögzített kiadás, SHA256-tal.
9. Mozgás varázsló: a kamera kikapcsolható, a lüktetés 0 is lehet. Bezáruló
   gyűrű és haladásjelző nincs. Helyette fejezetek: YouTube fejezetlista a script
   szakaszaiból és a hang időzítéséből (DECISIONS 52).
10. YouTube végképernyő: alapból 20 mp, a Settingsben 5-20 mp (DECISIONS 53).
11. A kulcsszavas komment-CTA visszajön, alapból 15 kulcsszóval (DECISIONS 51).

## Mérések és találatok menet közben (2026-09-30)

- **Telepítő:** utoljára 99 MB, a render lánc (hyperframes, GSAP) és az ffmpeg
  miatt. A tiszta release build 17 perc: 10 perc fordítás, 7 perc NSIS.
  Az `engine/` 154 MB kicsomagolva. Az új méret a registry-próba után mérendő.
- **Chrome:** a runner a hyperframes gyerekfolyamatainak saját otthont ad az app
  helyi adatmappájában, így a letöltött böngésző (42 mp, 282 MB) és minden
  hyperframes gyorsítótár ott van, nem a user `~/.cache` mappájában. Windows
  ARM-on nincs rögzített shell, ott a Google Chrome a tartalék.
- **Gemini TTS:** `gemini-3.8-flash-tts`, van magyar, 30 kész hang, a tempó
  szövegesen állítható. Szó-időbélyeget nem ad, és a `hyperframes transcribe`
  whisper.cpp-t kér, ami a user gépén nem járható. Megoldás: mondatonként egy
  felolvasás, a mondatok ideje így pontos, a szavak a betűk aránya szerint.
- **`hyperframes tts`** (Kokoro): nincs magyar, Python és 340 MB kellene. Kimarad.
- **GSAP licenc:** ingyenes, kereskedelmi használatra is. Egy kitétel: nem
  használható a Webflow vizuális animációszerkesztőjével versenyző eszközben. A
  4. fázis előtt rákérdezni a GSAP-nál.
- **Presetek:** `heygen-com/hyperframes`,
  `skills/hyperframes-creative/frame-presets/`, 13 darab. Mindegyik egy
  `FRAME.md` (színek, betűk, sarkok), egy `caption-skin.html` és egy
  `frame-showcase.html`. Apache-2.0. Mozgást nem tartalmaznak.
- **Registry komponensek** (15 a könyvtárban, DECISIONS 55; a registryben 234,
  DECISIONS 56): minden
  komponens egy `<template>`-es sub-kompozíció, `data-composition-variables`
  deklarációval, és a `registry-item.json` leírja a változókat (típus, szerep,
  alapérték, opciók) és a szinkronpontokat. Témaváltozóik: `--bg`, `--fg`,
  `--brand`, `--accent`, `--accent-2`, `--font-display`. Két kockázat, a próba
  méri: a timeline kulcsa rögzített (`window.__timelines["count-up"]`), ezért
  ugyanaz a komponens kétszer ütközhet; és a belső gyökér `data-duration="3"`,
  a hosszabb jelenetnél tartania kell a helyét.

## Lépések, ebben a sorrendben

Minden lépés a `phase-2` branchen, külön committal.

### 1. Házimunka (kész)

- Névigazítás, SPEC és `package.json`, CI PR-en csak Windows.

### 2. Render lánc és könyvtár (kész)

- `engine/`: hyperframes 0.8.22 és gsap 3.14.2, lockfile,
  `scripts/fetch-engine.mjs`, `onnxruntime-node` nélkül (DECISIONS 26).
- `library/`: `components.json` (rögzített commit), `library.lock.json`
  (SHA256), `scripts/fetch-library.mjs`, a GSAP helyi fájlként.

### 3. Sidecarok: ffmpeg (kész)

- Windows x64 és arm64: BtbN GPL shared (DECISIONS 43). macOS:
  `eugeneware/ffmpeg-static`. Képesség-ellenőrzés, licenc, About sor.
- A runner minden hyperframes hívásnál: `HYPERFRAMES_FFMPEG_PATH`,
  `HYPERFRAMES_FFPROBE_PATH`, `HYPERFRAMES_NO_TELEMETRY=1`,
  `HYPERFRAMES_NO_UPDATE_CHECK=1` (DECISIONS 21).

### 4. Chrome első indításkor (kész)

- `hyperframes browser ensure` az app adatmappájába, "Download now" sáv.
  Tartalék a gépen lévő Google Chrome, Edge nem (DECISIONS 25).

### 5. 2. kapu: hang és zene (kész)

- ElevenLabs és Gemini TTS, hangminták, saját zenefájl, ElevenLabs Music.
- Keverés: mérés `ebur128`-cal, a zene a narráció alatt, gyengéd ducking, a
  keverék -14 LUFS. Két fájl: `vo_bgm.mp3` (jóváhagyásra) és `vo.mp3`.
- A HeyGen katalógus és a CC0 zenék: a 14. lépéssel együtt.

### 6. Mondattábla (kész)

- `runner/timing/sentences.mjs`: `sentences.json`, `words.json`.

### 7. Registry-próba (kész, 2026-09-30)

1. `runner/assemble.mjs`: a jelenet-táblából (komponens, változók,
   mondat-horgony) és a `sentences.json`-ból megírja a `build/index.html`-t:
   gyökér kompozíció, `class="clip"` mountok `data-composition-src`-vel és
   `data-variable-values`-szal, időzítés a mondatokból, hang, helyi GSAP,
   témaváltozók a `:root`-on. A változókat a `registry-item.json` alapján
   ellenőrzi.
2. Próba-videó: 8 jelenet (mindegyik komponens egyszer, a `per-word-rise`
   kétszer), kb. 30 mp, két témával. lint, check, render, idő és hiba mérése,
   kontakt lap ffmpeg-gel.
3. Az eredmény alapján: a könyvtár bővítése (kb. 20-25 komponens), és ha a
   próba ütközést vagy időzítési hibát talál, a javítás módja (például a
   komponens másolatának átnevezése a build közben).

### 8. 3. kapu: jelenet-tábla (MOST)

- `runner/gates/scenes/`: a prompt a komponensek `registry-item.json`-jából
  (leírás, `jobs`, változók, szinkronpontok) épül. Mondatonként egy jelenet
  komponenssel és változókkal, max 6 szó a képernyőn. JSON válasz séma szerint,
  a változók a `registry-item.json` alapján ellenőrizve, egy javító hívás,
  utána hiba (SPEC 5).
- UI: a jelenet-tábla soronként szerkeszthető (Custom), Approve.

### 9. Build, lint, check (automatikus)

- `assemble.mjs`, utána `hyperframes lint` és `hyperframes check`. 0 hiba a
  feltétel, különben a hiba a UI-ban `ITV-...` kóddal.

### 10. 4. kapu: kontakt lap

- `hyperframes snapshot` a jelenetek közepén, `review/contact.png` ffmpeg-gel, a
  Tauri asset protokollal mutatva, csak a Projects mappára szűkítve. A képernyő
  kiírja: a kontakt lap nem mutat mozgást.

### 11. Render

- `hyperframes render`, időbélyeges fájlnév az `out/` alatt, haladás, Cancel.
  Előre kiírt becslés a próba mérése alapján.

### 12. 5. kapu: avatar

- HeyGen avatar lista a user fiókjából, előnézettel (DECISIONS 47).
- Nyitás és záró CTA avatarral, előtte kredit becslés. Az avatar klip a
  kompozícióba kerül, `out/final.mp4`.
- Mérendő: a nyilvános HeyGen API ad-e átlátszó webm-et, és a 402-es (üres API
  pénztárca) hiba érthetően jelenjen meg.

### 13. Feliratok, fejezetek, export

- `out/video.srt` a `words.json`-ból. YouTube fejezetlista a script
  szakaszaiból. "Open folder" gomb.

### 14. Presetek és Brand varázsló

A videó témája mindig egy `FRAME.md`, ugyanabban a formában, mint a HyperFrames
presetjei. Két forrása van: egy preset, vagy a Brand varázsló kimenete. A
`FRAME.md` tokenjei a komponensek témaváltozóira (`--bg`, `--fg`, `--brand`,
`--accent`, `--accent-2`, `--font-display`) képeződnek le.

- **Presetek:** a 13 `FRAME.md` rögzített commitról, SHA256-tal, első
  használatkor letöltve (DECISIONS 24).
- **Betűk:** a betűfájlok (OFL) helyben kerülnek a projektbe, Google Fonts link
  nincs. A galéria jelzi, ha egy betűből hiányzik a tartalom nyelvének ékezete
  (ő, ű), és azt a presetet arra a nyelvre nem ajánlja.
- **Galéria** az onboarding után és a Settingsben. Az előnézet abból készül,
  amit a user ténylegesen kapni fog.
- **Brand varázsló** ("Set your own design"): kiindulás és logó, színek, betűk,
  formák, előnézet és mentés (kontrasztellenőrzéssel). Kimenete a user saját
  `FRAME.md`-je és a feltöltött assetek a config mappában. Minden képernyőn:
  "Not sure? Skip or use the default. You can change this any time in
  Settings."

### 15. Mozgás varázsló

- Specifikáció: `docs/motion-wizard.md` (2. változat, a D út szerint
  átírandó, jóváhagyásra).

### 16. CTA varázsló

- Visszatérő szegmensek (generált, feltöltött saját videó vagy AI avatar,
  hosszkorlát nélkül), kulcsszó-készlet, végképernyő (DECISIONS 50, 51, 53).
  A részleteket Zoltan adja.

### 17. Autopilot

- Ugyanaz a menet `recommended` módban, `pending` nélkül. Hibánál megáll, és a
  hibás kapunál nyílik meg (SPEC 6).

### 18. vidIQ (opcionális)

- Az 1. kapuban kulcsszó adat a vidIQ MCP szerveréből a user kulcsával, ha van
  (DECISIONS 42).

### 19. Tesztek

- runner unit tesztek minden új kapura (mock szolgáltatókkal), Rust tesztek az
  új parancsokra (fehérlista, kulcsnév, útvonal a Projects alatt).
- `scripts/phase2/e2e.mjs`: rögzített rövid script, ingyenes TTS, mock LLM a
  jelenet-táblára, végig a renderig, gyors módban.
- A tiltott-nevek teszt kiterjesztése az új promptokra.

### 20. Kézi elfogadás Zoltannal, fázis vége

- Telepítő build, Zoltan végigmegy (kilépő feltétel fent).
- STATUS, DECISIONS, SPEC frissítve, Drive tükör, PR a main felé, megállás.

## Köztes megállók (nem merge, csak megnézed)

1. A 7. lépés után: a próba-videó két témával.
2. A 11. lépés után: az első render az appból, presettel.
3. A 14. lépés után: a Brand varázsló, végigkattintod.

## Nyitott

1. A CTA varázsló részletei (16. lépés): Zoltan később adja.

## Nem ebben a fázisban

Pilot barátokkal (3. fázis). Aláírás, updater, nyilvános telepítő repó (4.
fázis). `talking_head` és `screenrecording` videótípus: a v1 csak `explainer`
(avatarral vagy anélkül). Beégetett felirat a preset `caption-skin`-jével (a v1
SRT fájlt ad). Thumbnail generálás.
