# 2. fázis: terv

Kimenet (PRD 13): **kész videó az appból.** A teljes 5 kapus menet a UI-ban,
Autopilot, presetek.

Branch: `phase-2` (a mainről, `b7f2289`). A fázis végén PR a main felé, utána
Zoltan jóváhagyása. Állapot 2026-09-30: **terv, jóváhagyásra vár.**

Kilépő feltétel: Zoltan a saját gépén, a telepített appból, egy új témából kész
MP4-et készít (script, hang, jelenet-tábla, kontakt lap, render, felirat),
egyszer kézi kapukkal, egyszer Autopilottal. Az avatar ág egyszer a saját
HeyGen kulcsával, ha a kreditje engedi.

## Kiinduló tények (a repóból és a kánonból, 2026-09-30)

1. **A kánon nincs az appban.** A SPEC 3 `vendor/brand-frames` submodule-t ír,
   ilyen még nincs. A runner ma csak scriptet ír.
2. **A blokkok Zoltan brandjével vannak sütve.** A `zg-frames/blocks/build.mjs` a
   `zg.css` tokenjeit (azúr, navy, Open Sans) minden blokkba beleégeti. A
   DECISIONS 23 szerint a videó a user brandjét vagy egy HyperFrames presetet
   kapja. Ehhez a kánonban kell egy téma-réteg. Ez a fázis legnagyobb kérdése.
3. **Két blokk alapértéke "Zoltan Gero"** (`quote` author, `overlay-lower-third`
   name). A DECISIONS 18 szerint ez nem kerülhet a user videójába.
4. **A `build-video.mjs` a könyvtár mappájába ír** (0. fázis, 5. találat). Két
   projekt felülírná egymást.
5. **A GSAP CDN-ről jön** (0. fázis, 6. találat): render közben internet kell.
6. **A HyperFrames presetek nincsenek az npm csomagban** (`hyperframes@0.8.22`
   `dist/` alatt nincs `blue-professional`). A forrásuk a HeyGen nyilvános repója,
   a pontos útvonalat meg kell keresni.
7. **A `hyperframes tts` Kokoro-t használ Pythonnal** (`kokoro_onnx`). A user
   gépén nincs Python, és az `onnxruntime-node` a sidecarból ki van véve
   (DECISIONS 26). Ingyenes TTS tartaléknak (SPEC 12.2) így nem jó.
8. **A BtbN nem ad macOS buildet** (csak Windows és Linux). A DECISIONS 43 a
   BtbN shared buildet választotta, Macre külön forrás kell.
9. Doksi eltérések a kóddal: a SPEC még `studio.<provider>` kulcsnevet és
   "Studio" nevet ír (a kód `ideatovideo.`, DECISIONS 38), a gyökér
   `package.json` neve `packaged-video-creator`. A STATUS "Következő lépés 1."
   (PR #2 merge) már megtörtént. Ezeket az 1. lépésben javítom.

## Lépések, ebben a sorrendben

Minden lépés a `phase-2` branchen, külön committal. A brand-frames változásai a
brand-frames repóban, külön branchen és PR-ben, git worktree-ben, és mindegyikről
szólok, mielőtt merge-re kérem.

### 1. Házimunka (fél óra)

- SPEC és gyökér `package.json` igazítása a DECISIONS 38-hoz, STATUS frissítése.
- SPEC 3 frissítése a 2. lépés döntésével.

### 2. A kánon bekötése az appba

- `vendor/brand-frames` git submodule, pinnelt commit (SPEC 3). A build lépés
  (`scripts/fetch-canon.mjs`): `npm ci` a submodule-ban, az `onnxruntime-node`
  kivéve (DECISIONS 26), a futáshoz kellő részek a Tauri `resources` alá: a
  `pipeline/`, a `zg-frames/blocks` kész `.html` fájljai, `CATALOG.md`, fontok,
  `hyperframes.json`, és a lecsupaszított `node_modules`.
- Mérem: telepítő méret (ma 25 MB), első indítás, és hogy a telepített appból a
  runner eléri-e a `hyperframes` CLI-t.
- **CI:** a privát brand-frames eléréséhez egy második, csak olvasható, csak arra
  a repóra szóló token kell (`BRAND_FRAMES_TOKEN`), mint a `DESIGN_SYSTEM_TOKEN`.
  Ezt Zoltannak kell létrehoznia (lépései a chatben jönnek, amikor ide érünk).

### 3. brand-frames PR: projekt-mappa, téma, semleges alapértékek, helyi GSAP

Egy PR a kánonban, négy kis változás, mind visszafelé kompatibilis (Zoltan
saját menete ugyanúgy fut, a regress teszt változatlan képet ad):

- `build-video.mjs --outdir <dir>`: az `index.html` és a `compositions/` a
  projekt `build/` mappájába kerül, nem a könyvtárba (4. tény).
- `--theme <tokens.css>`: a kompozíciókba a `zg.css` tokenjei után egy felülíró
  `:root` blokk kerül. A blokkok forrása nem változik. Ehhez leltár kell arról,
  melyik tokent használják a blokkok, és javaslat egy kis szemantikus készletre
  (háttér, szöveg, kiemelő, CTA, figyelmeztető, betű), amire egy preset leképezhető.
- A `quote` és `overlay-lower-third` alapértéke semleges szöveg (3. tény).
- A GSAP a könyvtárból, helyi fájlként (5. tény), hogy a render netkapcsolat
  nélkül is menjen. A letöltött Chrome-hoz az első indításkor úgyis kell net.

Ez a pont a kánon kódját érinti, ezért a PR-t külön megmutatom, és csak a te
jóváhagyásod után merge-ölöm.

### 4. Sidecarok: ffmpeg

- `fetch-sidecars.mjs` bővítése: BtbN GPL shared, dátumozott kiadás, SHA256,
  Windows x64 és arm64. `licenses/ffmpeg/`, About sor (DECISIONS 43).
- Macre javaslatot hozok forrással, mérettel és licenccel (8. tény), döntés
  nélkül.
- A runner minden hyperframes hívásnál: `HYPERFRAMES_FFMPEG_PATH`,
  `HYPERFRAMES_FFPROBE_PATH`, `HYPERFRAMES_NO_TELEMETRY=1`,
  `HYPERFRAMES_NO_UPDATE_CHECK=1` (DECISIONS 21).

### 5. Chrome első indításkor

- `hyperframes browser ensure` az app adatmappájába (282 MB, kb. 30 mp), haladás
  kijelzéssel. Tartalék a gépen lévő Google Chrome `HYPERFRAMES_BROWSER_PATH`-szal,
  Edge nem (DECISIONS 25).

### 6. 2. kapu: hang és zene

- **Edge TTS** Node könyvtárral a sidecarban (Python nélkül), szó-határ
  eseményekkel. Hanglista a tartalom nyelvére szűrve, meghallgatással.
- **ElevenLabs**: hanglista a user fiókjából, meghallgatással (a minta a runneren
  át töltődik le, a UI nem hív külső címet), TTS időbélyegekkel.
- Mindkettő `audio/stt.json`-t ad a `sentences.mjs` formájában
  (`{ words:[{text,start,end,type}] }`).
- **Keverés az AUDIO.md szerint:** mindkét forrás mérése `ebur128`-cal, a zene
  24 LU-val a narráció alatt, gyengéd ducking, a keverék -14 LUFS-re. Két fájl:
  `vo_bgm.mp3` (jóváhagyásra) és `vo.mp3` (csak narráció).
- UI: lejátszó a keverékre és a narrációra, hossz, LUFS, Approve / Regenerate /
  hang csere.
- **SPEC 12.2 (ingyenes TTS tartalék)** és **12.6 (zene)**: mérek, javaslatot
  hozok (lásd lent, "Zoltan döntésére vár").

### 7. 3. lépés: mondattábla (automatikus)

- `sentences.mjs` a submodule-ból, `sentences.json`, `words.json`.

### 8. 3. kapu: jelenet-tábla

- `runner/gates/scenes/`: prompt a `CATALOG.md`-ből és a MOTION szabályokból
  levezetve, mondatonként archetípus, max 6 szó a képernyőn, `data-sent` horgony.
  A válasz JSON, séma szerint validálva, a blokk-változók a blokkok meta
  fejlécéből ellenőrizve, egy javító hívás, utána hiba (SPEC 5).
- UI: a PIPELINE.md szöveges táblája (idő, hossz, archetípus, képernyő-szöveg),
  soronként szerkeszthető (Custom), Approve.

### 9. Build, lint, check (automatikus)

- `build-video.mjs --outdir --theme`, `stamp-timing.mjs`, `image-audio-lint.mjs`
  (jelzés, nem kapu), `hyperframes lint`, `hyperframes check`. 0 hiba a
  feltétel, különben a hiba a UI-ban `ITV-...` kóddal.

### 10. 4. kapu: kontakt lap

- `hyperframes snapshot`, `review/contact.png`. A UI a képet a Tauri asset
  protokollal mutatja, csak a Projects mappára szűkítve. A képernyő kiírja: a
  kontakt lap nem mutat mozgást (PIPELINE.md).

### 11. Render

- `hyperframes render`, időbélyeges fájlnév az `out/` alatt, haladás, Cancel.
  Előre kiírt becslés: kb. 3 perc gépidő videópercenként (0. fázis mérése).

### 12. 5. kapu: avatar

- HeyGen avatar lista a user fiókjából, előnézettel (DECISIONS 47).
- Segments mód az alap (nyitás és záró CTA), a klipek a narrációból. Előtte kiírt
  kredit becslés. Alfa önellenőrzés, `avatar-composite.mjs`, `out/final.mp4`.
- Mérendő kockázat: a kánon a HeyGen MCP-vel készítette az átlátszó webm-et.
  Meg kell nézni, hogy a nyilvános HeyGen API ugyanezt adja-e, és a 402-es
  (üres API pénztárca) hibát érthetően kell mutatni.

### 13. Feliratok, export

- `out/video.srt` a `words.json`-ból. "Open folder" gomb.

### 14. Presetek és brand

- A HyperFrames presetek forrásának megkeresése a HeyGen nyilvános repójában,
  pinnelt commit, SHA256, első használatkor letöltve (DECISIONS 24).
- Galéria az onboarding Brand lépésében és a Settingsben, előnézettel.
- Logóból színkinyerés (PRD 7) a sidecarban lévő `sharp`-pal, a preset színei a
  logó színeire cserélve, a betű a presetből.
- A preset a 3. lépés `--theme` tokenjeire képeződik le.

### 15. Autopilot

- Ugyanaz a menet `recommended` módban, `pending` nélkül. Hibánál megáll, és a
  hibás kapunál nyílik meg (SPEC 6). A kapu újrafuttatása érvényteleníti a
  későbbieket (ez a runnerben már megvan).

### 16. vidIQ (opcionális)

- Az 1. kapuban kulcsszó adat a vidIQ MCP szerveréből a user kulcsával, ha van
  (DECISIONS 42). Ha nincs, a kulcsszó kézzel vagy a Brief Cardból jön.

### 17. Tesztek

- runner unit tesztek minden új kapura (mock szolgáltatókkal), Rust tesztek az új
  parancsokra (fehérlista, kulcsnév, útvonal a Projects alatt).
- `scripts/phase2/e2e.mjs`: egy rögzített rövid script, edge TTS, mock LLM a
  jelenet-táblára, végig a renderig, gyors módban, helyben.
- A tiltott-nevek teszt kiterjesztése az új promptokra.

### 18. Kézi elfogadás Zoltannal, fázis vége

- Telepítő build, Zoltan végigmegy (kilépő feltétel fent).
- STATUS, DECISIONS, SPEC frissítve, Drive tükör, PR a main felé, megállás.

## Köztes megállók (nem merge, csak megnézed)

1. A 3. lépés brand-frames PR-je (a kánon kódja).
2. A 6. lépés után: a hang a UI-ban, meghallgatod.
3. A 11. lépés után: az első render az appból, presettel.

## Zoltan döntésére vár (a terv jóváhagyásával együtt)

1. **Egy fázis vagy kettő?** Javaslat: marad egy fázis, egy PR, a fenti köztes
   megállókkal. A másik lehetőség 2A (1-11. lépés, avatar és presetgaléria
   nélkül) és 2B külön PR-ben: kisebb PR-ek, de két kézi elfogadás.
2. **CI a 2. fázisban.** A `BRAND_FRAMES_TOKEN` (ingyenes). Az e2e teszt a CI-ban
   render miatt futásonként kb. 10 perc Windowson és a macOS 10-es szorzóval kb.
   100 perc a keretből. Javaslat: az e2e csak kézi indításra fut a CI-ban, a
   PR-en csak a build és a unit tesztek.
3. **Zene (SPEC 12.6).** Javaslat: pár licenctiszta (CC0) háttérzene, pinnelt
   forrásból első használatkor letöltve, mint a presetek, plusz "Use my own
   file". A konkrét forrást a 6. lépésben mérve hozom.
4. **Ingyenes TTS tartalék (SPEC 12.2).** A `hyperframes tts` kiesett (7. tény).
   Javaslat: a 6. lépésben két jelöltet mérek (méret, minőség, Python nélkül
   fut-e), és hozom a javaslatot. A v1 addig csak Edge TTS és ElevenLabs.

## Nem ebben a fázisban

Pilot barátokkal (3. fázis). Aláírás, updater, nyilvános telepítő repó (4.
fázis). `talking_head` és `screenrecording` videótípus: a v1 csak `explainer`
(avatarral vagy anélkül). Thumbnail generálás (PRD 4). Import a Tervező appból.
