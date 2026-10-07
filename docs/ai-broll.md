# AI B-roll: egyedi, generált klipek a stock helyett (terv)

Állapot: **megépült (2026-10-06, branch `ai-broll`, DECISIONS 98-99),
helyettesítő generátorral tesztelve.** Valódi HeyGen hívás még nem volt
(nincs API kredit); az első próbaklip (legfeljebb 5 mp) Zoltan kifejezett
jóváhagyásával jön, lásd a STATUS nyitott pontjait. A stock (`docs/stock.md`)
felfüggesztve, csak ez az irány marad.

A 8. pont írja le, ami megépült, és ahol eltér az eredeti tervtől.

Zoltan döntései (2026-10-06): alapból kikapcsolva; bekapcsolva HeyGen Video 1,
a Veo csak második, lehet, hogy kimarad; költségplafon videónként egy
csúszkán, alap 1 USD; az elkészült klipek a Footage alatt külön "AI B-roll"
részben maradnak, újra és újra használhatók.

## 1. Miért

- **Egyedi:** minden klip az adott mondathoz készül, nincs két egyforma videó.
- **Nincs forrásmegjelölés**, és nincs Content ID ütközés: a klip senki
  máshoz nem tartozik.
- **Pontosan azt mutatja, amiről a hang beszél** (a kánon 2. szabálya).

Egy dolgot a YouTube kér: ha egy generált klip valóságosnak látszik (ember,
hely, esemény), a feltöltéskor be kell jelölni az "altered or synthetic
content" kérdést a YouTube Studióban. Az app ezt a Your video tab YouTube
lépésénél egy mondattal jelzi, és a `card.json`-ba is beírja
(`syntheticMedia: true`).

## 2. Melyik generátor

A meglévő elv szerint: a user saját kulcsával, a runner hívja a szolgáltató
API-ját, a kész MP4-et letölti. Nincs szerver, nincs ismétlődő díj, nincs
közvetítő.

| Generátor | Kulcs | Ár másodpercenként (2026-10-06) | Megjegyzés |
|---|---|---|---|
| **HeyGen Video 1** | a meglévő HeyGen kulcs | 0,02 USD (480p), kb. 0,03 USD (768p); októberben fele | olcsó, de a mai árlista szerint legfeljebb 768p (építés előtt ellenőrizendő) |
| **Veo 3.1 Lite** | a meglévő Gemini kulcs (fizetős szint kell, ingyenes keret nincs) | 0,05 USD (720p), 0,08 USD (1080p) | 1080p, jó ár-érték |
| Veo 3.1 Fast | Gemini kulcs | 0,10 (720p), 0,12 (1080p), 0,30 (4K) | jobb minőség |
| Veo 3.1 | Gemini kulcs | 0,40 (720p, 1080p), 0,60 (4K) | prémium, drága |
| Kling, Wan, Seedance | fal.ai kulcs (egy kulcs, sok modell) | kb. 0,07-0,15 USD | később, ha kell |

Mindkét első jelölthöz már van kulcsod, új szolgáltató nem kell.

**Remotion:** nem generátor. Kódból rajzolt videó keretrendszer (React), a
HyperFrames testvére, valós felvételt nem készít. Cégeknek fizetős licenc
kell hozzá, innen jön a "drága" híre. Nálunk a render a HyperFrames (a két
szabály egyike), ezért a Remotion kimarad.

## 3. Mennyibe kerül egy videó

Egy 8 perces videóban a szabály szerint legfeljebb minden harmadik jelenet
kap B-rollt, és csak ott, ahol a narráció valami láthatót mond. Egy klip
5-8 másodperc. Becslés: 10 klip, összesen kb. 60 másodperc.

| Generátor | 60 mp | 120 mp |
|---|---|---|
| HeyGen Video 1 (768p) | kb. 1,8 USD | kb. 3,6 USD |
| Veo 3.1 Lite (1080p) | kb. 4,8 USD | kb. 9,6 USD |
| Veo 3.1 Fast (1080p) | kb. 7,2 USD | kb. 14,4 USD |

A Veo csak a sikeres klipért számol. A hangot (narráció és zene) mi adjuk,
a generált klip saját hangja néma marad a keverésben.

## 4. Menet a felhasználónak (nagyon egyszerű)

1. A Scenes tabon egy gomb: **"Make B-roll clips"**.
2. Az AI kiválasztja a jeleneteket (a szabály szerint), és mindegyikhez ír
   egy rövid képleírást a mondatból. A user látja a listát: jelenet, a
   mondat, a képleírás (átírható), egy pipa.
3. Fölötte egy sor: generátor (HeyGen Video 1 vagy Veo 3.1 Lite), minőség,
   **becsült ár**, és a fiók egyenlege, ahol lekérdezhető. Egy
   "Make N clips (about X USD)" gomb, mint az avatarnál.
4. A klipek a háttérben készülnek, a haladásjelzővel (Stop, checkin, a
   lecsukás szabálya: a szolgáltató dolgozik, le lehet csukni, az app
   ébredéskor átveszi). A már megrendelt klipet soha nem rendeli újra
   (mint a HeyGen avatarnál, `pending.json`).
5. A kész klip jelenetenként előnézettel; egyenként "Make again" (új ár)
   vagy "Remove".
6. A klipek a ONE Video mappájába és az Identity felvétel-könyvtárába
   kerülnek ("generated" forrással), így egy későbbi videó is
   felhasználhatja őket ingyen.

Autopilot: egy kapcsoló, alapból kikapcsolva (pénzbe kerül).

**Settings, Identity, Footage** (DECISIONS 95):
- "AI B-roll" kapcsoló, alapból **kikapcsolva**; kikapcsolva a Scenes tabon
  a gomb sem látszik.
- Generátor: **HeyGen Video 1** (alap); a Veo 3.1 Lite csak akkor jelenik meg,
  ha Zoltan később benne hagyja.
- **Költségplafon videónként: csúszka, 1 és 10 USD között, 0,50-es
  lépésekkel, alap 1 USD.** A becslés mindig mutatja, mennyi fér még bele; a
  plafon fölött az app kérdez, magától soha nem lépi túl.
- **"AI B-roll" könyvtár**, külön rész a saját felvételek mellett: minden
  elkészült klip előnézettel, a képleírásával, a generátorral, a dátummal és
  a videókkal, amikben szerepelt; törölhető. Egy újabb videónál a tervező
  előbb ezek közül választ (ingyen), és csak a hiányzót rendeli meg; a
  becslés ezt külön mutatja ("3 from your library, 4 new, about 0.60 USD").

## 5. Technikai felépítés

- `runner/generate/`: közös réteg és szolgáltatónként egy illesztő:
  `heygen-video.mjs` (a meglévő `providers/avatar/heygen.mjs` hívásaira
  építve), `veo.mjs` (Gemini API, hosszú futású művelet: indítás,
  lekérdezés, letöltés).
- Runner parancsok: `broll-plan` (AI: jelenetek és képleírások, a Scenes
  modelljével), `broll-estimate`, `broll-make` (kulcsos munka a Jobs
  sorban), `broll-remove`.
- A képleírás szabályai: a mondatból, a márka színeivel és hangulatával
  (Brand Identity Card), szöveg és logó nélkül, valódi ember arca csak ha a
  user kéri; 16:9 vagy 9:16 a videó formája szerint.
- A klip a jelenet-tábla `footage` mezőjén keresztül kerül a buildbe, mint
  a saját felvétel (DECISIONS 82); a HyperFrames rendereli, saját
  videómotor nincs.
- Türelmes újrapróbálás, pending megrendelések, checkin: DECISIONS 91-92.
- Kulcs: a meglévő `heygen` és `gemini`; új kulcsnév nem kell.
- Tesztek: illesztők álszolgáltatóval (mint a HeyGen avatar tesztjei), a
  becslés, a dupla megrendelés tiltása, a plafon.

## 6. Eldőlt (Zoltan, 2026-10-06, DECISIONS 95)

1. Alapból kikapcsolva; bekapcsolva HeyGen Video 1; a Veo csak második, és
   lehet, hogy kimarad. Építéskor a Veo illesztő elhagyható.
2. Plafon videónként csúszkán, alap 1 USD.
3. A stock felfüggesztve; csak az AI B-roll marad.
4. Az elkészült klipek a userénél maradnak, a Footage alatt külön "AI
   B-roll" részben, újrahasznosíthatóan.

A 3. pont becslése 1 USD-s plafonnal: HeyGen Video 1 768p-n kb. 30-60 mp
B-roll fér bele egy videóba (0,02-0,03 USD/mp), a könyvtárból vett klip
ingyen van.

## 7. Prompt egy új chathez (a 2. fázis lezárása után)

```text
Olvasd el és kövesd szó szerint a C:/Users/gdp/projects/IdeaToVideo/docs/SESSION-PROMPT.md
fájlban lévő session promptot (a text blokk), az a KEZDÉS és a SZABÁLYOK.

A helyzet: a 2. fázis lezárva és merge-ölve a mainre. Ebben a chatben: az AI
B-roll megépítése a docs/ai-broll.md terv szerint, Zoltan döntéseivel
(DECISIONS 94 és 95): alapból kikapcsolva, HeyGen Video 1 a generátor, a Veo
csak ha külön kérem; költségplafon videónként csúszkán, alap 1 USD; az
elkészült klipek a Settings, Identity, Footage alatt külön "AI B-roll"
részben, újrahasznosíthatóan. A stock felfüggesztve, ne építsd.

Menet: új feature branch a mainről. Előbb mondd vissza a tervet röviden, és
ellenőrizd a HeyGen Video 1 mai API leírását (developers.heygen.com):
végpont, felbontás, hossz, ár, kereskedelmi felhasználás. Ha valami eltér a
tervtől, szólj és kérdezz, mielőtt kódolsz. Utána: illesztő és runner
parancsok tesztekkel, a könyvtár, a Scenes tab "Make B-roll clips" lépése, a
Settings csúszka, ui-mock próba, e2e, telepítő. A végén STATUS, DECISIONS,
Drive tükör, commit, push, PR a main felé, és állj meg a jóváhagyásomig.
Fizetős hívást csak az én kifejezett jóváhagyásommal indíts (egy próbaklip,
legfeljebb 5 mp).
```

## 8. Ami megépült (2026-10-06, DECISIONS 98-99)

### A HeyGen Video 1 a hivatalos leírás szerint (developers.heygen.com, 2026-10-06)

| Pont | Leírás |
|---|---|
| Rendelés | `POST /v3/models/videos`, `model: "heygen-video-1"`, `mode: "text_to_video"`, `prompt`, `duration` 5-15 mp (egész), `resolution` `480p`, `768p` vagy `2k`, `aspect_ratio` (16:9, 9:16 és mások) |
| Lekérdezés | `GET /v3/models/videos/{id}`: `pending`, `processing`, `completed`, `failed`, `cancelled`; kész állapotban `video_url` (aláírt link) |
| Kimenet | MP4, H.264, 24 fps, generált hanggal (AAC); a 768p 16:9-ben 1344x768 |
| Dupla rendelés | `Idempotency-Key` fejléc: ugyanaz a kulcs 24 órán belül ugyanazt a rendelést adja vissza |
| Kulcs | csak fizetős API kulccsal (`x-api-key`), a meglévő `heygen` kulcs |
| Ár | a hivatalos leírásban nincs másodpercenkénti ár, csak hogy a 2k a 768p háromszorosa; az indulási árak: 480p 0,02, 768p kb. 0,03 USD/mp, októberben fele |
| Kereskedelmi felhasználás | fizetős csomagnál a kimenet a useré, kereskedelmi célra is; a HeyGen licencet kap a tartalomra (a szolgáltatás javítására, modell-tanításra is) |

### Eltérések a tervtől (Zoltan döntései, 2026-10-06, DECISIONS 98)

- **Minőség: 480p, 768p (alap), 1080p.** A HeyGen Video 1-nek nincs 1080p-je:
  a "1080p" a 2k klipet rendeli (háromszoros ár, csak 16:9 és 9:16), és a
  render 1920x1080-ra kicsinyíti. A becslés: 480p 0,02, 768p 0,03, 1080p
  0,09 USD/mp (rendes ár, októberben a valódi fele ennyi).
- **Próba mód** a telepítőben: Settings, Identity, Footage, AI B-roll,
  generátor "Test clips (free, placeholder)". Az ffmpeg teszt-mintáját
  gyártja a HeyGen méretében, ingyen; a klip "test" jelölést kap, és a
  jelenet-tervező magától soha nem teszi videóba.
- A Veo illesztő nem épült (Zoltan: csak ha külön kéri).

### Claude döntései építés közben (DECISIONS 99, felülbírálhatók)

- **Hova kerülhet klip:** a jelenet-tábla jelenetei közül nem az első és nem
  az utolsó (cím és zárás, ott szokott az avatar beszélni), nem kommentkérő
  jelenet, nem olyan, ahol már saját felvétel van. Legfeljebb a jelenetek
  harmada (lefelé kerekítve), két szomszédos jelenet soha.
- **Mondatokhoz kötve:** egy klip egy jeleneten belül 1-3 mondat alá kerül
  (2-15 mp narráció), a `scenes.json` `footage` listájában, ugyanúgy, mint a
  saját felvétel. A rendelt hossz egész másodperc, legalább 5.
- **Tiltott a képleírásban:** szöveg, logó, márkanév, felismerhető valódi
  ember, kamerába beszélő ember.
- **A tervező előbb a könyvtárból választ** (ingyen); a könyvtár klipje
  a leírásával (a képleírás, amiből készült) szerepel.
- **Nincs dupla fizetés:** a leadott rendelés a `broll/pending.json`-ban és a
  HeyGen `Idempotency-Key` fejlécével; egy korábbi tervhez leadott rendelés
  sem vész el, a következő Make a könyvtárba menti.
- **Remove:** a klip kikerül a videóból, a könyvtárban marad. **Make
  again:** új rendelés, új áron, a régi klip a könyvtárban marad.
- Új jelenet-terv után a már elkészült klipek visszakerülnek a mondataik
  alá (ki vannak fizetve). Új hang után a B-roll terv elavul (a klipek a
  könyvtárban maradnak, az új terv ingyen használhatja őket).
- A klip a jelenet-tábla változása: a Preview újra kell, a jelenetek és az
  avatar jóváhagyása marad (az időzítés ugyanaz).
- A `card.json` `syntheticMedia: true`, ha a videóban generált klip van;
  a Your video tab a YouTube lépésnél egy mondattal szól.

### Fájlok

- `runner/generate/index.mjs` (generátorok, árak, minőségek),
  `heygen-video.mjs` (HeyGen Video 1), `standin.mjs` (próba mód).
- `runner/broll/settings.mjs` (Identity: `broll.json`), `broll/index.mjs`
  (terv, becslés, rendelés, a jelenet-táblába illesztés), `broll/prompt.md`.
- ONE Video: `broll/broll.json` (terv, állapot, elköltött összeg),
  `broll/pending.json` (leadott, még le nem töltött rendelések),
  `broll/clips/` (a klipek saját példánya).
- Runner parancsok: `broll-settings`, `broll-settings-save`, `broll-state`,
  `broll-plan`, `broll-estimate`, `broll-balance`, `broll-make`,
  `broll-update`, `broll-again`, `broll-remove`.
- UI: `app/src/lib/BrollPanel.svelte` (Scenes tab),
  `app/src/lib/footage/BrollSettings.svelte` és a Footage oldal "AI B-roll
  library" része.
- Tesztek: `runner/broll.test.mjs` (álszolgáltatóval), e2e (próba móddal
  végig a renderig). UI próba: `scripts/ui-mock` `?broll=1` vagy `?broll=test`.
