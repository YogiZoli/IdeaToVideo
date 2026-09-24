# 0. fázis: a pipeline tiszta gépen

Dátum: 2026-09-24. Gép: Windows 11, Intel i5-8350U (8 szál), 21 GB RAM, Intel UHD
620. Node 24.16.0. brand-frames `61b4143` (hyperframes 0.8.22).

## Eredmény

**A PRD 13. pontjában vállalt kimenet teljesült: a pipeline fut egy tiszta gépen.**

A C2C videó ("One Idea In A Published Video Out", 16 jelenet, 72 mp) végigment a
Node láncon egy szimulált tiszta gépen, a `scripts/phase0/e2e.mjs` szerint:

- friss `git clone` a brand-frames repóból, pinnelt commitra
- üres felhasználói profil: nincs böngésző-cache, nincs npm-cache
- a PATH-ban csak a Node és az operációs rendszer (nincs ffmpeg, nincs git)
- ffmpeg és ffprobe csak környezeti változón át, ahogy az app adja majd a sidecart
- hyperframes telemetria és frissítés-ellenőrzés kikapcsolva

| Lépés | Idő | Eredmény |
|---|---|---|
| clone | 56 mp | rendben |
| npm install (üres cache) | 43 mp | 186 csomag, 365 MB |
| Chrome letöltés (`hyperframes browser ensure`) | 31 mp | chrome-headless-shell 152.0.7977.30, 282 MB |
| 3. mondattábla (`sentences.mjs`) | 0,1 mp | 23 mondat, **bájtra egyezik a jóváhagyott C2C táblával** |
| 5. build-video, stamp-timing | 0,5 mp | rendben |
| 6. image-audio-lint | 0,1 mp | **nem ellenőrzött semmit**, lásd Találatok 1. |
| 6. hyperframes lint | 22 mp | 0 hiba |
| 6. hyperframes check | 51 mp | PASSED, 0 hiba, 15/15 WCAG AA |
| 8. render | 218 mp | 72,27 mp, 1080p30, -14,4 LUFS |
| 9. avatar composite (segments) | 43 mp | 72,27 mp, a jóváhagyott v4-hez mérve 43,8 dB PSNR |

A render ezen a gépen **kb. 3 perc videópercenként** (a RUNNING-COMMANDS.md 3,5-öt
mond, a 9 perces videón mérve).

### Gyors mód: a teszt alapja (DECISIONS 28)

A teszt alapból csak a videó első kb. 18 mp-ét rendereli: egész jelenetek, a hang
a vágásnál lekeverve, az avatarból a belelógó szakasz. Minden lépést ugyanúgy
végigpróbál. Második tiszta futás, ezúttal a brand-frames PR-ágáról
(`2dac5d1`, commitolt `package-lock.json`, tehát `npm ci`):

| Lépés | Idő | Eredmény |
|---|---|---|
| clone, `npm ci`, Chrome letöltés | 58 + 26 + 30 mp | a lockfile a baseline gép verzióit hozta (`@puppeteer/browsers` 3.2.1), a lock nélküli telepítéshez képest 14 alcsomag eltér |
| mondattábla | 0,1 mp | bájtra egyezik a jóváhagyottal |
| gyors vágás | 0,4 mp | 4 jelenet, 17,88 mp |
| lint, check | 5 + 24 mp | PASSED |
| render | **58 mp** (a teljes 218 helyett) | 17,9 mp |
| avatar composite | 9 mp | 17,9 mp |
| összevetés a jóváhagyott C2C v2 renderrel | 1 mp | 44,9 dB átlag, 40,2 dB minimum: szemre azonos |

A teljes tiszta futás így kb. 4 perc, ebből a render 1 perc.

## Mérés: melyik böngésző renderel (SPEC 12.3)

Ugyanaz a C2C render négyféleképpen. A PSNR az első renderhez mérve: minél
nagyobb, annál közelebb van, 40 dB felett szemmel nem látszik különbség.

| Böngésző | Render | PSNR átlag / min |
|---|---|---|
| letöltött chrome-headless-shell 152 (alap) | 218 mp | viszonyítási alap |
| ugyanaz, még egyszer (`onnxruntime` nélkül) | 196 mp | 58,1 / 51,5 dB |
| rendszer Edge 153 (`HYPERFRAMES_BROWSER_PATH`) | 224 mp | 58,1 / 51,5 dB |
| rendszer Chrome 154 (`HYPERFRAMES_BROWSER_PATH`) | 220 mp | 58,5 / 52,5 dB |

Mind a négy ugyanabban a rögzítési módban (`beginframe`) futott. A rendszer
böngészők **pontosan annyira térnek el, amennyire két futás ugyanazzal a
böngészővel**, a sebesség is a mérési szórásban van. Windowson tehát az Edge
teljes értékű.

Két tény a hyperframes forrásából:

- Windowson a hyperframes magától **nem találja meg** a rendszer Chrome-ot vagy
  Edge-et (a keresési listája csak Linux utakat tartalmaz). Az appnak kell
  átadnia a `HYPERFRAMES_BROWSER_PATH` változóban.
- A hyperframes a saját, pinnelt Chrome verzióját tölti le (152.0.7977.30). A
  rendszer böngésző magától frissül, így egy későbbi Edge vagy Chrome frissítés
  elvileg eltörheti a rendert, a pinnelt verzió nem.

**Döntés (Zoltan, DECISIONS 25):** a render Chrome. Alapból a pinnelt headless
shell, első indításkor letöltve (31 mp, 282 MB). Ha a letöltés nem sikerül
(nincs net, tűzfal), a gépen lévő Google Chrome a tartalék, ezt az app kapcsolja
be a `HYPERFRAMES_BROWSER_PATH` változóval. Edge nem. Ez **megfordítja a SPEC 8. pontjának
javaslatát** (ott a rendszer böngésző volt az első). Az ok: a mérés szerint a
kettő egyformán jó, a döntő a stabilitás, és a pinnelt verzió nem változik
alattunk. Macen ez nincs mérve, ott nincs mindig Chrome (a Safari nem jó), tehát
Macen a letöltés mindenképp kell.

## Mérés: a Node sidecar formája (SPEC 12.4)

**Az egyfájlos Node bináris (SEA) nem járható.** A hyperframes futás közben a
saját mappájából tölt be fájlokat (parancsmodulok, böngészőoldali szkriptek,
runtime), natív `.node` modult használ (sharp) és Worker szálat indít. Ezek
lemezen kell legyenek, tehát a `node_modules` a SEA mellé is kellene.

**Döntés (Zoltan, DECISIONS 26):** csomagolt Node bináris (89 MB) és mellé egy
lecsupaszított `node_modules`.

- A `node_modules` 365 MB, ebből **208 MB az `onnxruntime-node`**, mind a hat
  platform bináris változatával. A hyperframes csak dinamikusan tölti be
  (háttéreltávolításhoz, átíráshoz), a renderhez nem kell. Kivéve: 153 MB, a
  render, a check és az avatar composite ugyanúgy lefutott (lásd a táblát fent).
- A `sharp` natív modulja platformonként más, ezért a sidecart platformonként kell
  építeni (Windows és Mac külön). Ez a CI-ban amúgy is így van (SPEC 10).

**ffmpeg (az 1. fázis kérdése):** a gépen lévő teljes build 242 MB darabja, az
ffmpeg és az ffprobe együtt majdnem 500 MB. Ez a telepítőbe túl nagy, kisebb
statikus build kell. Kötelezően tudnia kell: `psnr` szűrő (a hyperframes gyors
rögzítésének önellenőrzése), `libvpx-vp9` dekóder (avatar alfa), `libx264`, `aac`.

## Találatok

1. **Az `image-audio-lint` az éles láncon nem ellenőriz semmit.** Csak a régi
   `<section class="clip">` jeleneteket ismeri, a 08-31 óta használt mountolt
   blokkokat (`data-composition-src`) nem. A PowerShell eredetiből öröklődött,
   a port hűen átvette. Nem kapu, ezért eddig nem tűnt fel. Javítás: külön
   feladat a brand-frames repóban (a szkriptnek a `compositions/` fájlokból kell
   kiolvasnia a jelenetek szövegét).
2. **A brand-frames nem commitolta a `package-lock.json`-t.** Egy friss telepítés
   más alcsomag-verziókat hozott, mint a baseline-t renderelő gép
   (`@puppeteer/browsers` 3.2.3 a 3.2.1 helyett, `devtools-protocol`, `hono`,
   `adm-zip` és társai). A brand-frames PR-ben commitolva.
3. **Avatar composite hang.** A kánon szerint az éles láncban külön `--audio`
   kell. A mostani lánc a hangot már a renderbe teszi, és a külön hangsáv a
   `-shortest` miatt levágja a végkártya kitartását (71,29 mp a 72,27 helyett).
   Hangsáv nélkül a hossz pontos. A kánon a brand-frames PR-ben javítva.
4. **A hyperframes alapból anonim telemetriát küld.** Az app mindig
   `HYPERFRAMES_NO_TELEMETRY=1` és `HYPERFRAMES_NO_UPDATE_CHECK=1` mellett hívja.
5. **A `build-video.mjs` a könyvtár mappájába ír.** A `zg-frames/index.html`-t és a
   `zg-frames/compositions/` fájlokat írja felül, és a hangfájlnak is a
   `zg-frames/` mellett kell lennie. Az appban minden projekt a könyvtár saját
   munkapéldányán fog futni, különben két projekt felülírja egymást. Ez az 1-2.
   fázis tervezési kérdése, nem hiba.
6. **A GSAP CDN-ről töltődik** (`cdn.jsdelivr.net`) a check és a render alatt, tehát
   rendereléshez internet kell. Offline működéshez a GSAP-ot helyben kell adni.
7. **Nincs portolva:** a TTS szkriptek (`HyperFrames/pipeline/tts*.ps1`) a kánon
   repón kívül élnek. Az appban ezek a `runner/providers` részei lesznek (SPEC 7).
8. **Mac nincs mérve,** mert nincs Mac. Az 1. fázisban a CI macOS futtatója futtatja
   ugyanezt a tesztet, a kézi próba a pilot (3. fázis).

## Újrafuttatás

```powershell
cd C:/Users/gdp/projects/packaged-video-creator
npm test
node scripts/phase0/e2e.mjs --project C:/Users/gdp/HyperFrames/ai-video-workflow/c2c --work C:/Users/gdp/pvc-e2e-quick --reference C:/Users/gdp/HyperFrames/ai-video-workflow/c2c/sentences.json --segments "avatar_open.webm=0:6,avatar_close.webm=62.8:71.3"
```

A második parancs kb. 4 perc (gyors mód). A teljes videó: `--full` (kb. 8 perc).
A brand-frames PR #1 merge-e előtt a lockfile-os változathoz: `--ref 2dac5d16fb7c94fe3a867afd9cb9f1c4038cdfd1`.
A gépen lévő Chrome-mal egy meglévő telepítésen:
`--reuse --tag chrome --browser "C:/Program Files/Google/Chrome/Application/chrome.exe"`.
