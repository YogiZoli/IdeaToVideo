# Brand varázsló: terv (2. fázis, 14. lépés)

Állapot: **terv, Zoltan jóváhagyására vár** (2026-10-02). Kód csak a
jóváhagyás után.

Alapja: DECISIONS 59 (Blue Professional az alap), 67 (Identity), 68
(szótár), 69 (Brand Identity Card), 24 és 55 (registry, rögzített commit),
`docs/identity.md` 8. pont. Javasolt modell: **Opus 5.5, High**.

## 1. Cél egy mondatban

Identity-nként egyetlen design-forrás, a **Brand Identity Card**: színek,
betűk, formák, logó (világos és sötét), név a képernyőn. A videó ebből
kapja a kinézetét, és később a GHL Custom Value-k, a Lead Magnet app és a
YouTube Brand Channel varázsló is ebből olvas. Mellette ugyanebben a körben
a **szótár** (DECISIONS 68), ami a script szavait tartja kordában.

## 2. Ami ma megvan (2026-10-02)

- `runner/gates/build/assemble.mjs`: `THEME_KEYS` (12 token), két kézzel
  leképezett preset (`BLUE_PROFESSIONAL`, `WARM_PAPER`), `themeCss`,
  `mountTheme`. A build a `look` nevét kapja (`identity.brand.preset`).
- Settings, Identity, "Video look": választó két elemmel. Onboarding Brand
  lépés: ugyanez és logó feltöltés (`brand/logo.png` az Identity mappában).
  **A logót ma semmi nem használja** a videóban.
- A `logo-brand-close` komponensnek nincs kép-változója (csak `wordmark`,
  `tagline`, `url`).
- Betűk: a HyperFrames minden `@font-face` nélküli családot render közben a
  Google Fonts-ról tölt le (a Georgiát EB Garamondra cseréli), a komponensek
  tartaléka `Inter`. Ez hálózati hívás és idegen betű.
- A 13 preset (`skills/hyperframes-creative/frame-presets/`) összesen 20
  betűcsaládot használ, mind Google Fonts és OFL: Inter, Space Grotesk,
  Barlow, Source Serif 4, Bebas Neue, Archivo Black, Newsreader, JetBrains
  Mono, Shrikhand, Instrument Serif, Playfair Display, Bodoni Moda, Fredoka
  One, EB Garamond, Hanken Grotesk, Archivo, Quicksand, Libre Baskerville,
  DM Mono, IBM Plex Mono.

## 3. Fájlok az Identity mappájában

```text
identities/<id>/
  identity.json                 brand.preset marad (régi Identity-k), új: brand.card
  brand/
    brand-identity-card.json    A FORRÁS (séma: brand-identity-card/1)
    FRAME.md                    generált nézet a kártyából, kézzel nem szerkesztendő
    logo-light.png              logó világos háttérre (png, jpg, webp vagy svg)
    logo-dark.png               logó sötét háttérre (opcionális)
    fonts/                      csak a user saját feltöltött betűi (lásd 6.4)
  dictionary.json               a szótár (séma: dictionary/1)
```

- **Egy forrás:** a kártya. A `FRAME.md` minden mentéskor újraíródik belőle
  (a HyperFrames formátumában, hogy ember és HyperFrames eszköz is olvassa),
  fejlécében: "Generated from brand-identity-card.json. Edit in the app."
  **Döntés kell (K1).**
- **Átállás:** ha nincs kártya, az app a `brand.preset`-ből számolja ki
  (ugyanazt kapja a videó, mint ma). A varázsló első mentése írja meg a
  kártyát. A mai `brand/logo.png` átnevezés nélkül `logo-light`-ként
  olvasódik.
- **Export, import, Duplicate, mentés:** a `brand/` és a `dictionary.json`
  mind megy vele. Az Identity zip engedélyezett típusai bővülnek: `.json`
  (már az), `.md`, `.svg`, `.woff2`, `.ttf`, `.otf`.

## 4. A Brand Identity Card sémája (`brand-identity-card/1`)

Szerződés, mint a Video Brief Card: verziózott JSON séma
(`runner/schema/brand-identity-card.schema.json`), minden olvasó validálja.
Csak hex szín és ismert név, semmi CSS kifejezés, hogy más app (GHL, web)
is gond nélkül olvassa.

```json
{
  "schema": "brand-identity-card/1",
  "name": "Zoltan Gero",
  "updatedAt": "2026-10-02T10:00:00Z",
  "source": { "kind": "preset", "preset": "blue-professional" },
  "appearance": "light",
  "colors": {
    "background": "#fdfae7",
    "text": "#111111",
    "muted": "#6b6b6b",
    "surface": "#f4f2e8",
    "border": "#d0d1eb",
    "primary": "#1e2bfa",
    "secondary": "#1e2bfa",
    "tertiary": "#1e2bfa"
  },
  "fonts": {
    "display": { "family": "Space Grotesk", "weight": 600, "source": "bundled" },
    "body": { "family": "Inter", "weight": 400, "source": "bundled" },
    "mono": { "family": "JetBrains Mono", "weight": 400, "source": "bundled" }
  },
  "shape": { "corners": "medium", "radiusPx": 14, "cards": "flat" },
  "logo": { "light": "logo-light.png", "dark": null },
  "nameplate": { "name": "Zoltan Gero", "title": "", "url": "vidrev.app" }
}
```

- `source.kind`: `preset`, `logo`, `scratch` vagy `import`. Csak tájékoztat.
- `appearance`: `light` vagy `dark`, a háttér fényességéből számolva.
- `fonts.*.source`: `bundled` (az app betűi közül) vagy `custom` (ekkor
  `file`: a `brand/fonts/` alatti fájlnév).
- `shape.corners`: `none`, `small`, `medium`, `large` (0, 6, 14, 24 px);
  `shape.cards`: `flat`, `border`, `shadow`.
- `logo.*`: fájlnév a `brand/` mappán belül vagy `null`. URL soha (nincs
  szerverünk; a GHL-be a logót később a user tölti fel, lásd lent).

**Leképezés a videóra** (egy helyen, `runner/brand/card.mjs`):

| kártya | `THEME_KEYS` |
|---|---|
| background, text, muted, surface, border | bg, fg, muted, surface, border |
| primary, secondary, tertiary | brand, accent, accent-2 |
| shape.radiusPx | radius |
| fonts.display, body, mono | font-display, font-body, font-mono (családnév, utána a tartalék) |

**Leképezés a GHL Custom Value-kra** (csak a terv rögzíti, **ebben a körben
nem épül**): `brand_color_primary`, `brand_color_secondary`,
`brand_color_background`, `brand_color_text`, `brand_font_heading`,
`brand_font_body`, `brand_radius`, `brand_name`, `brand_title`,
`brand_url`, `brand_logo_url` (ez utóbbit a GHL média feltöltése után a
GHL oldali eszköz tölti ki). Az app egy "Export Brand Identity Card" gombot
kap (a kártya és a logók zipben), az import pedig "Import Brand Identity
Card"; mindkettő Identity-szintű.

## 5. A képernyők

A varázsló a Settings Identity részéből ("Brand", a mai "Video look"
helyén) és az Identity menüből indul ("Set your own design"). Minden
képernyő alján: "Not sure? Skip or use the default. You can change this
any time in Settings." Felül egy élő mini-előnézet (lásd 7.), ami minden
kattintásra azonnal frissül. A varázsló bármelyik lépésnél menthető.

1. **Start.** Három kártya: "From a preset" (galéria, a 13 preset kis
   képével), "From my logo" (logó feltöltés, utána színjavaslat a logóból),
   "From scratch" (a jelenlegi kártyából indul). Plusz "Import a Brand
   Identity Card".
2. **Logo.** Világos és sötét változat, mindkettő opcionális. Ha csak egy
   van, az app mindkét háttéren azt használja, és jelzi, ha a sötét
   háttéren rosszul látszik (a logó átlagos fényessége a háttérhez mérve).
   Formátum: png, jpg, webp, svg (az svg csak `<img>`-ben jelenik meg,
   így szkript nem fut belőle), méretkorlát 5 MB.
3. **Colors.** Három fő mező: háttér, fő szín, második szín; a többit
   (szöveg, halvány szöveg, kártya, keret, harmadik szín) az app számolja
   ki, "Advanced" alatt kézzel is állítható. Kész kombinációk: a 13 preset
   palettája és a logóból kinyert 3-5 szín (a webview-ban, canvas-szal,
   hálózat nélkül). **Kontraszt-ellenőrzés** élőben: szöveg a háttéren és a
   kártyán legalább 4,5:1, a fő szín a háttéren legalább 3:1 (WCAG). Ha nem
   teljesül: piros jelzés és egy "Fix" gomb, ami a legközelebbi megfelelő
   árnyalatra tolja a színt.
4. **Fonts.** Címbetű és szövegbetű, kész párokkal a presetekből (például
   Space Grotesk és Inter). Minden betű a saját mintaszövegével jelenik meg,
   a tartalom nyelvének ékezeteivel (magyarnál: "Árvíztűrő tükörfúrógép
   ŐŰ"). **Ha egy betűből hiányzik egy ékezet** (ő, ű, vagy románnál ș ț,
   lengyelnél ł ą), a kártyáján "Missing: ő ű" áll, és alapból ki van
   szűrve ("Show all fonts" kapcsoló). Saját betű feltöltése: lásd 6.4,
   **döntés kell (K3)**.
5. **Shapes.** Sarkok (négy lépés) és kártya (lapos, kerettel, árnyékkal),
   képpel.
6. **Name on screen.** Név, titulus, rövid URL. Ezek a záró jelenet
   (`logo-brand-close`: wordmark, tagline, url) alapértékei, és a CTA
   varázsló is ezt olvassa.
7. **Preview and save.** **Valódi előnézet**: 5 komponens állóképe a user
   kártyájával (titlecard, per-word-rise, count-up, grid-card-assemble,
   logo-brand-close), ugyanazzal a lánccal, mint a 4. kapu kontakt lapja
   (build, check, kocka a jelenet vége előtt). Egy beépített mintavideóból
   készül, kulcs és LLM nélkül, kb. 20-40 mp (Chrome kell; ha nincs, a
   "Download now" sáv). Utána "Save". Mentéskor megíródik a kártya, a
   `FRAME.md`, és a felület kiírja, mely ONE Videókat érinti (a még nem
   renderelteket; a kész MP4 nem változik).

Az **onboarding** Brand lépése a galéria kis változatát kapja (preset és
logó), a teljes varázsló utána opcionális. A mai "Video look" választó
megszűnik, a helyén a kártya kis képe és "Open Brand wizard".

## 6. Betűk

### 6.1 Forrás és csomagolás

- `library/fonts.json`: a családok listája (a 20 preset család; bővítés
  egy sor). Forrás: a fontsource npm csomagjai (OFL betűk WOFF2-ben,
  nyelvi részhalmazonként), **rögzített verzióval**, SHA256 lockkal
  (`library/fonts.lock.json`), mint a komponensek és a Node.
- `scripts/fetch-fonts.mjs` **build közben** tölti le a `latin` és
  `latin-ext` részhalmazt (a tartalom 10 nyelvéhez ennyi kell), a használt
  vastagságokat (változó betűnél egy fájl), és a licencfájlt
  családonként. **Futás közben semmi nem megy a hálózatra.**
- Becsült méret: 3-6 MB a telepítőben (mérendő, a STATUS-ba kerül).
- A licencek az About oldalon egy sorban, a fájlok a csomagban.

### 6.2 A buildben

- Az assembler a kártya betűit (és mindig az `Inter`-t, mert a komponensek
  ezt írják tartaléknak) bemásolja a `build/fonts/` alá, és az
  `index.html`-be `@font-face` szabályokat ír relatív úttal.
- A családnév pontosan az marad, amit a komponensek és a preset kérnek, így
  a HyperFrames nem tölt le semmit.
- **Mérés a kód elején** (DECISIONS-be kerül): a `@font-face` a gyökér
  dokumentumban eléri-e a beillesztett komponenseket, és a render tényleg
  nem hív-e hálózatot (render a hálózat nélkül, a HyperFrames naplója és a
  kész kép összevetése). Ha a komponensekhez külön kell, az assembler a
  komponens-másolatokba is beírja.
- Teszt: a kész `build/` egyetlen fájlja sem tartalmaz `http`
  betű-hivatkozást (`fonts.googleapis`, `fonts.gstatic`).

### 6.3 Ékezet-ellenőrzés

- A `fetch-fonts.mjs` minden fájl `cmap` táblájából kiszámolja, mely
  karakterek vannak benne, és nyelvenként (a tartalom 10 nyelve, egy
  karakterlistával nyelvenként) a `fonts.json` mellé írja: teljes vagy
  hiányzó karakterek. A galéria ezt olvassa, futás közben nem kell
  betűfájlt elemezni.
- A script kapu nem cserél betűt magától: ha a tartalom nyelve megváltozik,
  és a kártya betűje hiányos, a Settings és a 4. kapu figyelmeztet
  ("Your display font has no ő ű; the video would show a fallback font").

### 6.4 Saját betű (K3)

Javaslat: igen, már v1-ben. TTF, OTF vagy WOFF2, legfeljebb 5 MB, egy pipa:
"I have the right to use this font in my videos." Az app egy kis saját
`cmap` olvasóval (függőség nélkül, Node, `zlib` brotli a WOFF2-höz)
feltöltéskor ellenőrzi az ékezeteket, és a `brand/fonts/` alá másolja. Ha
Zoltan szerint ez ráér, a v1 csak a beépített betűkkel megy.

## 7. Előnézet

- **Élő mini-előnézet** (minden képernyőn, azonnal): egy Svelte kép a
  kártya tokenjeiből: háttér, cím a címbetűvel, szövegsor, kártya,
  kiemelő gomb, logó. A betűk a csomagolt fájlokból `@font-face`-szel a
  webview-ban (Tauri asset protokoll, a CSP `font-src` ennyivel bővül).
- **Valódi előnézet** (az utolsó képernyőn): lásd 5/7. A beépített
  mintavideó (`library/brand-preview/`: sentences és jelenet-tábla, hang
  nélkül) egyben a Mozgás varázsló előnézetének alapja is.

## 8. A presetek

- A 13 preset `FRAME.md`-je a library rögzített commitjáról, build közben,
  SHA256-tal (`scripts/fetch-library.mjs` bővül). Ez a DECISIONS 24-et
  pontosítja: nem első használatkor, hanem a csomagban, mert a futás
  hálózat nélküli.
- A presetek színnevei eltérnek (paper, ink, sun...), ezért a repóban egy
  **szerepkiosztás** él presetenként (`library/presets.map.json`: melyik
  nevű szín a háttér, a szöveg, a fő szín...; csak nevek, érték nem), a
  hex értékek a letöltött fájlból jönnek. Így a repóban nincs másolat
  (DECISIONS 19).
- Minden preset végigmegy a próbán (build, check, kontakt lap, két nyelv),
  ahogy a komponensek. Ami nem megy át a kontraszt-ellenőrzésen (például
  a halvány daisy-days), az a galériában jelzéssel szerepel, nem tűnik el.
- A `WARM_PAPER` (saját kinézet, nem preset) a galériában "Warm paper"
  néven marad, mert Zoltan szerette.

## 9. A logó a videóban (K2)

Javaslat: a **záró jelenetben** (`logo-brand-close`): az assembler a
komponens-másolatban a wordmark fölé teszi a logót (a háttérhez illő
változatot), ugyanúgy, mint a DECISIONS 58-as időtartam-javításnál. Plusz
egy opció, alapból kikapcsolva: kis logó a sarokban az egész videó alatt
("Logo in the corner", az avatar sarkával nem ütközve). **Döntés kell.**

## 10. Szótár (DECISIONS 68)

### 10.1 Fájl: `dictionary.json` (`dictionary/1`)

```json
{
  "schema": "dictionary/1",
  "preferred": [{ "term": "Owner", "note": "always with capital O" }],
  "banned": [{ "term": "blasting email", "instead": "sending to your list" }],
  "distinct": [{ "a": "YouTube Subscriber", "b": "Email Subscriber", "note": "never mix them" }],
  "positions": [{ "against": "hustle culture", "kind": "phenomenon", "stance": "Calm, planned growth beats grinding." }]
}
```

`kind`: `phenomenon`, `type` vagy `person`. Korlátok: listánként legfeljebb
100 elem, elemenként 200 karakter.

### 10.2 Hol használja az app

- **Script kapu (1.):** a prompt egy "Dictionary" részt kap a négy listából.
  Személy (`person`) esetén a prompt szabálya: véleményként fogalmaz, nem
  állít tényt a személyről.
- **Gépi ellenőrzés** (`runner/gates/script/dictionary.mjs`, nem az AI
  ítéli meg): a kész scriptben és a jelenet-tábla szövegeiben megkeresi a
  tiltott szavakat (szóhatárral, kis- és nagybetűtől és ékezettől
  függetlenül), és a kedvelt szavak eltérő írásmódját ("owner" a "Owner"
  helyett). Az 1. és a 3. kapuban sárga jelzés a sor mellett, a
  szóval és a javasolt helyettesítővel. Nem blokkol (a felhasználó dönt).
- A naplóba csak a találatok száma kerül, a szavak nem (tartalom).

### 10.3 Felület

Javaslat: a Settings Identity részében külön oldal, "Dictionary", négy
egyszerű listával és rövid magyarázó példákkal (köztük: "An opponent can
be a phenomenon or a type, not a person: hustle culture, the hustle
bro."). A Brand varázsló utolsó képernyője linkel rá. **Döntés kell (K4).**

## 11. Mit kap ebből a Mozgás és a CTA varázsló

- **Közös varázsló-keret** (`app/src/lib/wizard/`): lépések, "Skip",
  "Not sure?" lábléc, mentés az Identity mappájába biztonságos úton
  (`identityDir`, a Rust csak az Identity-k mappáján belül ír), naplózás.
- **Előnézet-lánc**: a mintavideó és a valódi előnézet parancsa
  (`brand-preview`), amit a Mozgás varázsló átmenetekkel és háttér-
  mozgással futtat.
- **A kártya**: a Mozgás varázsló háttér- és átmenet-komponensei a kártya
  színeit kapják; a CTA varázsló a végképernyőhöz és a visszatérő
  szegmensekhez a logót (világos, sötét), a `nameplate` mezőket (név,
  titulus, URL), a színeket és a betűket.
- **A szótár**: a CTA szövegére és a komment-kulcsszavakra ugyanaz a gépi
  ellenőrzés fut.
- **Export**: a Mozgás (`motion.json`) és a CTA (`cta/`) eredménye ugyanúgy
  az Identity zipbe megy, a minta-üzlet (DECISIONS 71) így egyben adható.

## 12. Ami ebben a körben nem épül

GHL Custom Value írás (csak a leképezés rögzítve); a Brand Identity Card
webes olvasói (Lead Magnet app, YouTube Brand Channel varázsló); logóból
generált logó vagy ikon; animált logó; sötét és világos téma egyszerre egy
videóban.

## 13. Tesztek és a kör vége

- **Node** (`npm test`): kártya-séma (jó és rossz példák), kártya a
  témára, preset-szerepkiosztás mind a 13-ra, átállás `brand.preset`-ből,
  kontraszt-függvény és a "Fix" javaslat, betű-lefedettség (ő, ű megvan,
  illetve hiányzik egy ismert hiányos betűnél), `@font-face` generálás és
  "nincs hálózati betű" a `build/`-ben, szótár-ellenőrző (szóhatár,
  ékezet, kis-nagybetű, a "person" szabály a promptban), `FRAME.md`
  generálás.
- **Rust** (`cargo test`): írás a `brand/` alá csak az Identity mappáján
  belül, az új fájltípusok az export és import zipben, a Duplicate viszi a
  `brand/`-et és a szótárt.
- **E2E** (`npm run e2e`): build és render egy kártyával és nem preset
  betűvel, hálózat nélkül; a valódi előnézet parancsa.
- **UI próba** a `scripts/ui-mock`-ban: mind a 7 képernyő, ékezet-jelzés
  magyar és angol tartalomnyelvvel, kontraszt "Fix", szótár oldal.
- A kör végén: STATUS, DECISIONS (a mérések és a K1-K5 döntések), commit és
  push a `phase-2`-re, új telepítő. Becsült munka: egy hosszú munkamenet;
  a tesztek kb. 5 perc, a telepítő buildje kb. 10-15 perc.

## 14. Zoltan döntései (K1-K5)

| | kérdés | javaslat |
|---|---|---|
| K1 | `FRAME.md`: generált nézet a kártyából, vagy ne legyen? | generált nézet, a kártya az egyetlen forrás |
| K2 | Logó a videóban | a záró jelenetben; sarok-logó opció, alapból ki |
| K3 | Saját betű feltöltése v1-ben | igen, licenc-pipával és ékezet-ellenőrzéssel |
| K4 | A szótár helye | külön "Dictionary" oldal a Settings Identity részében, a varázsló linkel rá |
| K5 | Gemini kvóta-hiba (429): próbálja a másik Gemini modellt is? | igen, egyszer (az ingyenes kvóta modellenként külön számol); ma szándékosan nem teszi |
