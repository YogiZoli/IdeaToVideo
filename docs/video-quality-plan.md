# Videóminőség: terv (2026-10-06)

Zoltan esti videója (`feedback/2026-10-06/NOTES.md`, "What is a motion
graphics video?") élettelen lett: ugyanaz a rajz, üres kép, szoros betű,
4-11 mp-ig álló képek, csak szöveg. Zoltan döntése: **előbb a videó
minősége**, utána a README, a `release.yml` és az updater. Állapot: **terv,
Zoltan döntéseire vár** (a 8. pont).

## 1. Mi mit csinál ma (a félreértés oka)

| Varázsló vagy kapu | Mit dönt el | Példa a videóból |
|---|---|---|
| Brand | hogyan néz ki: színek, betűk, formák | krém háttér, Archivo Black |
| Motion | **hogyan mozog**: átmenet a jelenetek között, háttér, kamera, a jelenettípusok stílus-kapcsolói | dramatic, zoom-through, Push in |
| CTA | a komment-felhívás helyei, kulcsszavai, szegmensei | GUIDE, COURSE, TRIGGER |
| 3. kapu (Scenes tab) | **mi van a képen**: mondatonként egy jelenettípus a könyvtárból | marker-highlight, whiteboard-ink |

A "mi van a képen" kérdésnek ma **nincs Identity-szintű beállítása**: a
könyvtár fix 13 elem (DECISIONS 55), mind szöveg-alapú, és a tervező AI
ebből választ. Ez a hiányzó láncszem. A Motion varázsló nem választ
jelenettípust, csak azt mondja meg, hogyan mozogjanak.

## 2. Mi a 39 archetípus

A brand-frames repó `_frames/blocks/` mappája: 39 blokk (arrow, before-after,
branch, command, contact-record, countup-bars, cycle, device-footage,
display-word, end-card, form, funnel, gauge, grid, hero, highlighter,
keyword-pill, lead-card, lens, library-card, line-chart, overlay-callout,
overlay-lower-third, overlay-quote, panel-list, progress-ring,
proportion-bars, pulse-ring, question, quote, rail, short-scene,
signature-move, skitch-markers, split, state-flip, statement, step-card,
tiles). 2026-08-30-án a zg-frames samplerből kinyerve, a C2C Blue tokenekkel,
Open Sans betűvel, saját mozgáskönyvtárral (`zg-frames/motion.js`, a
`MOTION.md` szabályai: lüktetés, drift, kamera) és 37 saját ikonnal
(`zg-frames/icons.js`). Zoltan jóváhagyta: "eddigi legjobb" (2026-08-31).

**Állapot:** 36 blokknak **nincs változója**, csak a sampler szövegét tudja
(a `STATUS.md` szerint: "a többi 36 egyelőre változó nélkül"). Ezért ma egy
videóba nem tehetők a videó saját szövegével. A `BLOCKS.md` ezen felül egy
nagyobb, a registryből átvett készletet is leír (Tier A-E, kb. 60 elem,
például `drift-hold`: "ambient idle so nothing freezes"), amiből az appban 13
van.

**Hogyan lesz csak Zoltané:** az app nem szállítja (DECISIONS 18 és 48
marad), hanem egy **saját blokk-csomagot** olvas a gépről, Identity-nként
bekapcsolva (Settings, Identity, Scenes: "Add a block pack", a mappa:
`C:/Users/gdp/HyperFrames/_frames/blocks`). Bárki betehet saját csomagot; a
telepítőben nincs benne semmi Zoltané.

Ehhez kell:
1. **brand-frames (külön branch és PR, a kánon szabálya szerint):** mind a
   39 blokknak változó-felület (szövegek, számok, ikon), és egy
   `pack.json` a tervezőnek: blokkonként szerep, mire jó, hány szó fér bele,
   meddig tart. Átnézés és javítás, amit fontosnak látok (Zoltan kérése):
   olvashatóság, a jelenet hosszához illesztés, seek-stabilitás, a
   változók határai.
2. **app:** csomag-betöltő, ellenőrzés (lint, check), a tervező a csomag
   szerepeit is ismeri, a Scenes tab cserelistája is mutatja.

## 3. Miért csak szöveg

Döntések sorozata, nem beállítási hiba: a könyvtár csak a registry (D út,
DECISIONS 48), abból 13 elem, a próbán a témát biztosan követő, szöveg-alapúak
(55); a stock felfüggesztve a szerzői jog miatt (93, 95); az AI B-roll alapból
ki, és pénzbe kerül (98); kép és videó ma csak saját felvételből jön (82).

**Cél: mindig vegyesen szöveg, ikon vagy rajz, kép, videó.** Források:

| Fajta | Forrás | Költség |
|---|---|---|
| Ikon, rajz | ikonkészletek a telepítőben (4. pont) | ingyen, mindig |
| Kép | (a) AI kép a user Gemini kulcsával, lassú zoommal mozgatva; (b) ingyenes stock (Pexels: kereskedelmi célra ingyenes) | (a) pénzbe kerül, az árat a döntés előtt ellenőrzöm; (b) ingyen |
| Videó | saját felvétel (megvan); AI B-roll (megvan, alap ki); stock videó (Pexels) | saját: ingyen; AI: fizetős; stock: ingyen |

## 4. Ikonok: több család

A HyperFrames registryben **nincs ikonkészlet** (ellenőrizve a rögzített
commiton: csak az `icon-swap` és az `icon-morph-beat` mozgás-elem). Javaslat,
mind vonalas (a rajzos jelenet vonalról vonalra kirajzolja), mind szabad
licenc:

| Család | Darab | Licenc |
|---|---|---|
| Lucide | kb. 1600 | ISC |
| Tabler Icons (outline) | kb. 5000 | MIT |
| Iconoir | kb. 1600 | MIT |

A tervező mondatonként a tartalomhoz illőt választja, videón belül nem
ismétel, és az Identity megjegyzi a legutóbbiakat (videóról videóra is
váltakozik). Identity-nként választható család és kedvencek. A rács-kártyák
ikonjai is innen.

## 5. A kimondott szó kiemelése (Motion varázsló)

A registryben 17 felirat-stílus van, ezek a tipikus "transcription" formák:
`caption-pill-karaoke` (pirula a kimondott szó mögött), `caption-highlight`,
`caption-weight-shift` (a kimondott szó vastagabb), `caption-editorial-emphasis`,
`caption-kinetic-slam`, `caption-clip-wipe`, `caption-camera-follow`, és a
kánon Tier A eleme, az `mk-callout-highlight` (szóról szóra kiemelés a
hanghoz). Ami bekerül:

1. **A képernyőn lévő szövegben a kimondott szó kiemelve** (szín vagy
   pirula), a rázás helyett; a headline-slam rázása kikapcsolható.
2. **Beégetett felirat alul**, választható stílusban (karaoke pirula,
   kiemelés, vastagodó szó, szerkesztői), ki is kapcsolható (a `.srt` marad).
3. A kulcsszavak kiemelése a mondatban (a tervező jelöli).

A szóidőzítés már megvan (`words.json`).

## 6. Élénkebb jelenetek

1. **Semmi nem áll meg:** minden jelenet alatt lassú, folyamatos mozgás a
   belépő után is (a registry `drift-hold` elve, a kánon szabálya).
2. **Rövidebb jelenetek:** legfeljebb kb. 5 mp; a hosszú mondat 2-3 képre
   bomlik (most átlag 9,5 mp volt).
3. **Több jelenettípus a registryből:** a `BLOCKS.md` Tier A és B listájából
   a témát követők (`stagger-cascade`, `number-wheel`, `flowchart`,
   `before-after-wipe`, `mk-line-graph`, `hw-*` kézírásos elemek...), a
   DECISIONS 56 "köztes útja" szerint: a próbán átment készletből választ az AI.

## 7. A negyedik varázsló: "Scenes"

Javaslat: **külön, rövid varázsló** (4 képernyő), mert más kérdés, mint a
Motion (mit mutat, nem hogyan mozog), és a Motion már 7 képernyős.

1. **Keverék:** szöveg, ikon vagy rajz, kép, videó aránya (csúszkák, alap
   például 40, 30, 20, 10).
2. **Tempó:** jelenet-hossz (3-6 mp).
3. **Csomagok:** HyperFrames könyvtár, és ha betöltötted, a saját blokk-
   csomagod (Zoltannak a 39 archetípus).
4. **Ikonok és képek:** ikoncsalád, kedvencek; képforrás (AI kép, stock,
   csak saját).

Példa, egy mondat a videóból: "Motion graphics is graphic design that moves."

- **Ma:** egy jelenet, 4 mp, `marker-highlight`: a mondat szövege, a "moves"
  aláhúzva, utána áll. A Motion varázsló ehhez zoom átmenetet és lassú
  kamerát ad, de a kép tartalma ugyanaz marad.
- **A Scenes varázslóval** (keverék 40-30-20-10, tempó 4 mp, ikon: Tabler,
  kép: AI): két jelenet. (1) Egy toll-ikon kirajzolódik, alatta "Graphic
  design", a kimondott szó kiemelve. (2) Egy AI kép (tervező a monitor
  előtt) lassú zoommal, rajta "that moves", a "moves" kimondáskor
  kiemelve. Zoltannál a (2) helyén a saját `split` archetípusa is jöhet.

## 8. Zoltan döntésére vár

1. Negyedik varázsló ("Scenes"), vagy a Motion varázsló új része?
2. Képforrás: AI kép a Gemini kulccsal (fizetős), és/vagy a stock
   visszakapcsolása Pexelsszel (ingyen, a felfüggesztés feloldása)?
3. Ikoncsaládok: Lucide, Tabler, Iconoir mind a három?
4. A 39 archetípus: mehet a brand-frames PR (változók, `pack.json`,
   javítások) és az app csomag-betöltője?

Sorrend javaslat: (a) élénkebb alap, kimondott szó, ikonok a rajzhoz;
(b) Scenes varázsló; (c) kép és videó források; (d) a 39 archetípus
csomagként; utána a README, `release.yml`, updater.
