# 2. fázis: terv

Kimenet (PRD 13): **kész videó az appból.** A teljes 5 kapus menet a UI-ban,
Autopilot, presetek, opcionális Brand varázsló.

Branch: `phase-2` (a mainről, `b7f2289`). A fázis végén egy PR a main felé, utána
Zoltan jóváhagyása. Állapot 2026-09-30: **terv, részben jóváhagyva** (lásd
"Eldőlt" és "Zoltan döntésére vár").

Kilépő feltétel: Zoltan a saját gépén, a telepített appból, egy új témából kész
MP4-et készít (script, hang, jelenet-tábla, kontakt lap, render, felirat),
egyszer kézi kapukkal, egyszer Autopilottal. Az avatar ág egyszer a saját
HeyGen kulcsával, ha a kreditje engedi.

## Eldőlt (Zoltan, 2026-09-30)

1. Egy fázis, egy PR, köztes megállókkal.
2. A brand-frames PR (projekt-mappa, téma-réteg, semleges alapértékek, helyi
   GSAP) előre jóváhagyva. Merge a regress teszt után, utána jelzés Zoltannak.
3. A `quote` és az `overlay-lower-third` alapértéke semleges lesz.
4. Az app felülete marad Zoltan IdeaToVideo brandjében (Shine, DECISIONS 39). A
   videók alapból a HyperFrames presetjeit kapják. Új: **opcionális Brand
   varázsló**, amivel a user a saját színeit, betűit és assetjeit adja meg.
5. Zene sorrendje: ElevenLabs Music, HeyGen katalógus, első használatkor
   letöltött CC0 zenék, "Use my own file". Keverés az AUDIO.md szerint.
6. Narrátor hang: ElevenLabs (a user kulcsával, a user fizeti), ingyenes út a
   Gemini TTS a user Gemini kulcsával. A Microsoft online hangok csak akkor
   kerülnek be, ha a Gemini TTS a mérésen elbukik (magyar minőség, keret,
   időzítés).
7. CI: a Mac build ideiglenesen nem fut PR-en, csak kézi indításra, amit Claude
   indít (`gh workflow run`), a fázis végén a jóváhagyott változatra. PR-en csak
   Windows build és unit tesztek. A renderelő e2e teszt szintén Claude indítja,
   a fázis végén.
8. ffmpeg Macen (Claude döntése, Zoltan kérésére): `eugeneware/ffmpeg-static`
   rögzített GitHub kiadás, SHA256-tal. A CI Mac futása ellenőrzi a szükséges
   kódolókat és szűrőket.
10. A videó kinézete: **C** (Zoltan, 2026-09-30). A 39 archetípus marad, a preset
    minden atomját viseli (színek, betűk, sarkok, kártya, árnyék, keret, címke,
    kiemelő vonal, haladásjelző, háttér). A mozgás a kánon MOTION szabályai
    szerint. Javaslat alatt: opcionális Mozgás varázsló (lásd "Zoltan döntésére
    vár").
11. Zoltan, 2026-09-30, a Mozgás varázslóról: a kamera kikapcsolható, a
    lüktetés 0 is lehet; a bezáruló gyűrű semmilyen formában nem kerül az appba
    (választhatóként sem); haladásjelző nincs; helyette fejezetek (a script
    szakaszaiból YouTube fejezetlista, időbélyeggel); a YouTube végképernyő
    helye választható hosszú (5-20 mp); a visszatérő szegmensek a user saját
    feltöltött videói is lehetnek, hosszkorlát nélkül; a kulcsszavas komment-CTA
    visszajön (a DECISIONS 35-öt módosítja), alapból a vidrev.app 15
    kulcsszavával, a márkanév említése nélkül. A részleteket Zoltan később adja.
12. NYITOTT (Zoltan, 2026-09-30): az app könyvtára egyáltalán ne őrizzen semmit
    a C2C előzményből és Zoltan rendszeréből (39 archetípus, MOTION.md), hanem
    most épüljön újra a HyperFrames nyilvános anyagából és a varázslókból. Ez a
    PRD 1, 11 és a DECISIONS 23 módosítása, megerősítésre vár (chat, 2026-09-30).
9. A Brand varázsló külön az onboardingtól: az onboarding után az app
   használható, a varázsló opcionális ("Set your own design"). Kevés, összevont
   képernyő, mindegyiken kiírva, hogy Skip vagy Default is jó, és később
   bármikor módosítható (lásd 14. lépés).

## Kiinduló tények (a repóból és a kánonból, 2026-09-30)

1. **A kánon nincs az appban.** A SPEC 3 `vendor/brand-frames` submodule-t ír,
   ilyen még nincs. A runner ma csak scriptet ír.
2. **A blokkok Zoltan brandjével vannak sütve.** A `zg-frames/blocks/build.mjs` a
   `zg.css` tokenjeit (azúr, navy, Open Sans) minden blokkba beleégeti. A
   DECISIONS 23 szerint a videó a user brandjét vagy egy HyperFrames presetet
   kapja. Ehhez a kánonban kell egy téma-réteg.
3. **Két blokk alapértéke "Zoltan Gero"** (`quote` author, `overlay-lower-third`
   name).
4. **A `build-video.mjs` a könyvtár mappájába ír** (0. fázis, 5. találat). Két
   projekt felülírná egymást.
5. **A GSAP CDN-ről jön** (0. fázis, 6. találat): render közben internet kell.
6. **A presetek helye:** `heygen-com/hyperframes`,
   `skills/hyperframes-creative/frame-presets/`, 13 darab (biennale-yellow,
   blockframe, blue-professional, bold-poster, broadside, capsule, cartesian,
   cobalt-grid, code-editorial, coral, creative-mode, daisy-days,
   editorial-forest). Mindegyik egy `FRAME.md` (YAML tokenek: színek, betűk,
   sarkok, komponens-szabályok, plusz leírás), egy `caption-skin.html` és egy
   `frame-showcase.html`. Apache-2.0. Az npm csomagban nincsenek benne.
7. **A `hyperframes tts` Kokoro-82M modellt futtat Pythonnal** (`kokoro-onnx`,
   311 MB modell és 27 MB hangadat első használatkor). Nyelvei: angol, spanyol,
   francia, hindi, olasz, portugál, japán, kínai. **Magyar és német nincs.**
8. **A BtbN nem ad macOS buildet** (a legfrissebb kiadásban csak Windows és
   Linux). Kész, GitHubon kiadott macOS build: `eugeneware/ffmpeg-static`
   (`ffmpeg` és `ffprobe`, darwin x64 és arm64, rögzített kiadás).
9. **A HyperFrames saját zene-útja:** HeyGen kulccsal a HeyGen zenekatalógusából
   keres (`GET /audio/sounds?type=music`), kulcs nélkül Pythonos helyi
   generálás (Lyria, MusicGen). A Pythonos ág nálunk nem járható.
10. Doksi eltérések a kóddal: a SPEC még `studio.<provider>` kulcsnevet és
    "Studio" nevet ír (a kód `ideatovideo.`, DECISIONS 38), a gyökér
    `package.json` neve `packaged-video-creator`. A STATUS "Következő lépés 1."
    (PR #2 merge) már megtörtént.

## Mérések és találatok menet közben (2026-09-30)

- **Telepítő:** 99 MB (az 1. fázisban 25 MB), benne az ffmpeg (Windows, 170 MB
  kicsomagolva) és a kánon a hyperframes lánccal (188 MB, 5736 fájl). A tiszta
  release build 17 perc: 10 perc fordítás, 7 perc NSIS tömörítés.
- **Chrome:** a runner a hyperframes gyerekfolyamatainak saját otthont ad az app
  helyi adatmappájában, így a letöltött böngésző (42 mp, 282 MB) és minden
  hyperframes gyorsítótár ott van, nem a user `~/.cache` mappájában. Windows
  ARM-on nincs rögzített shell, ott a Google Chrome a tartalék.
- **Gemini TTS:** `gemini-3.8-flash-tts`, van magyar, 30 kész hang, a tempó
  szövegesen állítható. Szó-időbélyeget nem ad, és a `hyperframes transcribe`
  whisper.cpp-t kér (Homebrew vagy git+cmake fordítás), ami a user gépén nem
  járható. Megoldás: mondatonként egy felolvasás, a mondatok ideje így pontos,
  a szavak a betűk aránya szerint (mint a kánon `sentences.mjs`-e SRT-nél).
  Mérendő Zoltan kulcsával az appban: magyar minőség, ingyenes keret, sebesség.
- **GSAP licenc:** ingyenes, kereskedelmi használatra is. Egy kitétel: nem
  használható a Webflow vizuális animációszerkesztőjével versenyző eszközben. A
  4. fázis (nyilvános kiadás) előtt rákérdezni a GSAP-nál. A HyperFrames maga is
  GSAP-ra épül, tehát ez helyi fájllal és CDN-ről ugyanaz.
- **Téma-leltár** (a `zg.css` tokenjei, amiket a blokkok használnak): kiemelő
  (`--blue` család), pozitív és CTA (`--green`), szöveg (`--navy`), halvány
  szövegek (`--muted`, `--sub`, `--label`), kártya és háttér (`--card`, `--bg`,
  `--line`), negatív (`--red`), figyelmeztető (`--amber`), árnyékok (`--e-1..3`,
  `--sh-*`), sarkok (`--r-chip`, `--r-btn`, `--r-card`, `--r-panel`), egyetlen
  betű (Open Sans). Ez egy az egyben ráhúzható egy `FRAME.md` színeire (primary,
  text, text-muted, bg, card-bg, border, positive, negative), a skálák (50-900)
  a fő színből számolva.

- **Archetípusok, amik még nem általánosak** (2026-09-30, a `.src.html` fájlokból):
  beégetett, képernyőn látható szöveg van a `quote` (az idézet), `grid` (25
  nyelvkód), `panel-list` (a sorok), `before-after`, `end-card` ("See you
  there"), `keyword-pill`, `highlighter`, `command`, `form` és `contact-record`
  blokkban. Az `overlay-*` és a `device-footage` felvételhez való (talking_head,
  screenrecording), explainerbe nem. A `library-card` a könyvtárat mutatja be.
  Teljesen változós, azonnal használható: arrow, branch, countup-bars, cycle,
  display-word, funnel, gauge, hero, lead-card, lens, line-chart, progress-ring,
  proportion-bars, pulse-ring, question, rail, short-scene, signature-move,
  skitch-markers, split, state-flip, statement, step-card, tiles. A 3. kapu v1
  ezekből választ; a többit egy második brand-frames PR teszi változóssá
  (regress teszttel), Zoltan jóváhagyásával.
- **brand-frames PR #6** (`--outdir`, `--gsap`, semleges alapértékek): regress
  2 változott (csak a név), 37 változatlan, alap újra elfogadva. A merge-et a
  Claude Code biztonsági szűrője nem engedte, Zoltan merge-öli. Addig a
  submodule a PR commitján (`acfb046`).
- **Build és check az appból** (C2C bemenetekkel, a runnerből, a projekt saját
  mappájában, helyi GSAP-pal): build, időzítés, csúszás-szűrő, lint, check 78 mp
  alatt átment.

## Lépések, ebben a sorrendben

Minden lépés a `phase-2` branchen, külön committal. A brand-frames változásai a
brand-frames repóban, külön branchen és PR-ben, git worktree-ben.

### 1. Házimunka

- SPEC és gyökér `package.json` igazítása a DECISIONS 38-hoz, STATUS frissítése.
- SPEC 3 frissítése a 2. lépés döntésével.
- `build.yml`: PR-en csak Windows, a macOS job csak `workflow_dispatch`-re.

### 2. A kánon bekötése az appba

- `vendor/brand-frames` git submodule, pinnelt commit (SPEC 3). A build lépés
  (`scripts/fetch-canon.mjs`): `npm ci` a submodule-ban, az `onnxruntime-node`
  kivéve (DECISIONS 26), a futáshoz kellő részek a Tauri `resources` alá: a
  `pipeline/`, a `zg-frames/blocks` kész `.html` fájljai, `CATALOG.md`, fontok,
  `hyperframes.json`, és a lecsupaszított `node_modules`.
- Mérem: telepítő méret (ma 25 MB), első indítás, és hogy a telepített appból a
  runner eléri-e a `hyperframes` CLI-t.
- CI: a meglévő `build.yml` marad. A privát brand-frames eléréséhez egy második,
  csak olvasható token kell (`BRAND_FRAMES_TOKEN`), mint a `DESIGN_SYSTEM_TOKEN`.

### 3. brand-frames PR (előre jóváhagyva)

Egy PR a kánonban, négy kis változás, mind visszafelé kompatibilis (Zoltan saját
menete ugyanúgy fut, a regress teszt változatlan képet ad):

- `build-video.mjs --outdir <dir>`: az `index.html` és a `compositions/` a
  projekt `build/` mappájába kerül, nem a könyvtárba.
- `--theme <tokens.css>`: a kompozíciókba a `zg.css` tokenjei után egy felülíró
  `:root` blokk kerül. A blokkok forrása nem változik. Előtte leltár arról,
  melyik tokent használják a blokkok, és egy kis szemantikus készlet (háttér,
  szöveg, halvány szöveg, kiemelő, CTA, pozitív, negatív, sarok, betűk), amire
  egy `FRAME.md` leképezhető.
- A `quote` és `overlay-lower-third` alapértéke semleges szöveg.
- A GSAP a könyvtárból, helyi fájlként.

### 4. Sidecarok: ffmpeg

- `fetch-sidecars.mjs` bővítése, minden forrás rögzített kiadással és SHA256-tal:
  - Windows x64 és arm64: BtbN GPL shared (DECISIONS 43).
  - macOS x64 és arm64: `eugeneware/ffmpeg-static` GitHub kiadás. Saját build nincs.
- A meglévő CI macOS futtatója ellenőrzi, hogy a Mac build tudja, ami kell
  (libx264, aac, libvpx-vp9 dekódoló, overlay, psnr, loudnorm, ebur128). Ha nem
  tudja, szólok, mielőtt bármi mást választanék.
- `licenses/ffmpeg/`, About sor.
- A runner minden hyperframes hívásnál: `HYPERFRAMES_FFMPEG_PATH`,
  `HYPERFRAMES_FFPROBE_PATH`, `HYPERFRAMES_NO_TELEMETRY=1`,
  `HYPERFRAMES_NO_UPDATE_CHECK=1` (DECISIONS 21).

### 5. Chrome első indításkor

- `hyperframes browser ensure` az app adatmappájába (282 MB, kb. 30 mp), haladás
  kijelzéssel. Tartalék a gépen lévő Google Chrome, Edge nem (DECISIONS 25).

### 6. 2. kapu: hang és zene

Narrátor hang (TTS), ebben a sorrendben:

1. **ElevenLabs** a user kulcsával: hanglista a fiókjából, meghallgatással,
   időbélyeges TTS. A user fizeti. Az ElevenLabs ingyenes csomagja nem ad
   kereskedelmi jogot, ezt a UI kiírja.
2. **Gemini TTS** a user Gemini kulcsával (hivatalos Google API), az ingyenes út.
   Először mérem: ingyenes keret, magyar minőség, és az időzítés. A Gemini TTS
   nem ad szó-időbélyeget, ezért a szavak idejét a HyperFrames saját
   `hyperframes transcribe` parancsa méri (whisper.cpp), ha a csomagolt appban
   Python nélkül fut.
3. **Microsoft online hangok** ("Edge TTS", böngésző nem kell hozzá) csak akkor,
   ha a 2. pont mérése elbukik.

Kokoro (`hyperframes tts`) kimarad: nincs magyar, Python és 340 MB kellene hozzá.

Háttérzene, ebben a sorrendben ajánlva:

1. **ElevenLabs Music** a user kulcsával: a videó hosszára generálva. Fizetős
   csomagon kereskedelmi használatra is engedélyezett, kb. 0,15 USD percenként.
2. **HeyGen zenekatalógus** a user HeyGen kulcsával, ugyanazzal a hívással, amit
   a HyperFrames maga is használ. Mérendő: a HeyGen feltételei engedik-e a
   HeyGenen kívüli videóban.
3. **Pár licenctiszta (CC0) zeneszám**, rögzített forrásból első használatkor
   letöltve, kulcs nélkül is.
4. **Use my own file.**

Keverés mindig az AUDIO.md szerint: mérés `ebur128`-cal, a zene 24 LU-val a
narráció alatt, gyengéd ducking, a keverék -14 LUFS. Két fájl: `vo_bgm.mp3`
(jóváhagyásra) és `vo.mp3`. Mindkét TTS út `audio/stt.json`-t ad a
`sentences.mjs` formájában. UI: lejátszó, hossz, LUFS, Approve, Regenerate,
hang csere. A hang- és zenemintákat a runner tölti le, a UI nem hív külső címet.

### 7. 3. lépés: mondattábla (automatikus)

- `sentences.mjs` a submodule-ból, `sentences.json`, `words.json`.

### 8. 3. kapu: jelenet-tábla

- `runner/gates/scenes/`: prompt a `CATALOG.md`-ből és a MOTION szabályokból
  levezetve, mondatonként archetípus, max 6 szó a képernyőn, `data-sent` horgony.
  JSON válasz séma szerint, a blokk-változók a blokkok meta fejlécéből
  ellenőrizve, egy javító hívás, utána hiba (SPEC 5).
- UI: a PIPELINE.md szöveges táblája, soronként szerkeszthető (Custom), Approve.

### 9. Build, lint, check (automatikus)

- `build-video.mjs --outdir --theme`, `stamp-timing.mjs`, `image-audio-lint.mjs`
  (jelzés, nem kapu), `hyperframes lint`, `hyperframes check`. 0 hiba a
  feltétel, különben a hiba a UI-ban `ITV-...` kóddal.

### 10. 4. kapu: kontakt lap

- `hyperframes snapshot`, `review/contact.png`, a Tauri asset protokollal
  mutatva, csak a Projects mappára szűkítve. A képernyő kiírja: a kontakt lap
  nem mutat mozgást.

### 11. Render

- `hyperframes render`, időbélyeges fájlnév az `out/` alatt, haladás, Cancel.
  Előre kiírt becslés: kb. 3 perc gépidő videópercenként.

### 12. 5. kapu: avatar

- HeyGen avatar lista a user fiókjából, előnézettel (DECISIONS 47).
- Segments mód az alap (nyitás és záró CTA), a klipek a narrációból, előtte
  kredit becslés. Alfa önellenőrzés, `avatar-composite.mjs`, `out/final.mp4`.
- Mérendő: a nyilvános HeyGen API ad-e átlátszó webm-et (a kánon az MCP-vel
  készítette), és a 402-es (üres API pénztárca) hiba érthetően jelenjen meg.

### 13. Feliratok, export

- `out/video.srt` a `words.json`-ból. "Open folder" gomb.

### 14. Presetek és Brand varázsló

A videó témája mindig egy `FRAME.md`, ugyanabban a formában, mint a HyperFrames
presetjei. Két forrása van: egy preset, vagy a Brand varázsló kimenete. A lánc
ettől egységes: a `FRAME.md` tokenjei a 3. lépés `--theme` rétegére képeződnek le.

- **Presetek:** a 13 `FRAME.md` rögzített commitról, SHA256-tal, első használatkor
  letöltve (DECISIONS 24). Hogy a presetből mennyit használunk, az a "Zoltan
  döntésére vár" 1. pontján múlik (A, B vagy C). A presetek maguk nem
  tartalmaznak mozgást: mind a 13 `FRAME.md` kimondja, "Motion out of scope".
- **Betűk:** a presetek Google Fonts betűket neveznek meg. A kánon szerint a
  kompozícióban nincs Google Fonts link, ezért a betűfájlok (OFL) helyben
  kerülnek a projektbe. A galéria jelzi, ha egy betűből hiányzik a tartalom
  nyelvének ékezete (ő, ű), és azt a presetet arra a nyelvre nem ajánlja.
- **Galéria** az onboarding Brand lépésében és a Settingsben. Az előnézet abból
  készül, amit a user ténylegesen kapni fog.
- **Brand varázsló** ("Set your own design"), az onboardingtól külön, az app
  főképernyőjéről és a Settingsből. Kimenete a user saját `FRAME.md`-je és a
  feltöltött assetek a config mappában. Képernyők:
  1. Kiindulás és logó: "From my logo", "From a preset", "From scratch", logó
     feltöltés (opcionális, világos és sötét változat).
  2. Színek egy képernyőn: fő szín, háttér, második szín, kész kombinációkkal
     (a 13 preset palettája, a HyperFrames 9 hangulat-palettája, és a logóból
     kinyert javaslatok).
  3. Betűk egy képernyőn: címbetű és szövegbetű, kész párokkal a presetekből,
     ékezetes mintaszöveggel, a hiányos betűk kiszűrve.
  4. Formák: sarkok, kártya árnyékkal vagy kerettel.
  5. Név a képernyőn: név és titulus a névsávhoz és az idézetekhez.
  6. Előnézet és mentés: 4-6 archetípus állóképe, kontrasztellenőrzés,
     javítási javaslat.
  Minden képernyőn: "Not sure? Skip or use the default. You can change this any
  time in Settings."

### 15. Autopilot

- Ugyanaz a menet `recommended` módban, `pending` nélkül. Hibánál megáll, és a
  hibás kapunál nyílik meg (SPEC 6).

### 16. vidIQ (opcionális)

- Az 1. kapuban kulcsszó adat a vidIQ MCP szerveréből a user kulcsával, ha van
  (DECISIONS 42).

### 17. Tesztek

- runner unit tesztek minden új kapura (mock szolgáltatókkal), Rust tesztek az új
  parancsokra (fehérlista, kulcsnév, útvonal a Projects alatt).
- `scripts/phase2/e2e.mjs`: rögzített rövid script, ingyenes TTS, mock LLM a
  jelenet-táblára, végig a renderig, gyors módban.
- A tiltott-nevek teszt kiterjesztése az új promptokra.

### 18. Kézi elfogadás Zoltannal, fázis vége

- Telepítő build, Zoltan végigmegy (kilépő feltétel fent).
- STATUS, DECISIONS, SPEC frissítve, Drive tükör, PR a main felé, megállás.

## Köztes megállók (nem merge, csak megnézed)

1. A 6. lépés után: a hang és a zene a UI-ban, meghallgatod.
2. A 11. lépés után: az első render az appból, presettel.
3. A 14. lépés után: a Brand varázsló, végigkattintod.

## Zoltan döntésére vár

1. **A videó kinézete (a fázis legnagyobb döntése).** Három út, a chatben
   kifejtve (2026-09-30):
   - A: a mi 39 archetípusunk, a preset színeivel, betűivel és sarkaival.
   - B: HyperFrames natív: az AI minden videónál minden jelenetet szabadon ír meg
     a `FRAME.md` és a HyperFrames mozgás-szabályai (49 szabály, 23 minta)
     alapján. A 39 archetípus és a MOTION szabályok nem kellenek hozzá.
   - C (javaslat): A, plusz a preset összes "atomja" (kártya, árnyék, keret,
     címke, kiemelő vonal, haladásjelző, háttér-hangulat). Ez a HyperFrames
     saját elve: "atoms are sacred, composition is free".
   A 3. és 14. lépés ettől függ.

## Javaslat: Mozgás varázsló (2026-09-30, Zoltan döntésére vár)

Userenként rögzített Mozgás profil, amit minden videó örököl. A kánon
`motion.js` gombjait állítja (easingek, időtartam és távolság szorzó, túllövés,
stagger, lüktetés), plusz egy válogatott HyperFrames komponens-készlet
(jelenetváltás, háttér-hangulat, logó-animáció). Alapból bájtra azonos a mai
kimenettel. Csak a MOTION szabályokon belül (blur nincs, sebesség-plafon
marad). 23 kérdés, ebből 16 igen-nem, a lista a chatben (2026-09-30).
brand-frames PR-t igényel (`motion.js` profil-olvasás, `build-video --motion`).

## Nem ebben a fázisban

Pilot barátokkal (3. fázis). Aláírás, updater, nyilvános telepítő repó (4.
fázis). `talking_head` és `screenrecording` videótípus: a v1 csak `explainer`
(avatarral vagy anélkül). Beégetett felirat a preset `caption-skin`-jével (a v1
SRT fájlt ad). A HyperFrames registry blokkjai és példa-sablonjai (`hyperframes
add`, `init --example`). Thumbnail generálás. Import a Tervező appból.
