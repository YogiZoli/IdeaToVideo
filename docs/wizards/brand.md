# Brand varázsló (2. fázis, 14. lépés)

Állapot: **kész** (2026-10-02). A terv jóváhagyva; Zoltan döntései a 14.
pontban és a DECISIONS 72-ben. Ez a fájl a megépült állapotot írja le.

Alapja: DECISIONS 59 (Blue Professional az alap), 67 (Identity), 68
(szótár), 69 (Brand Identity Card), 24 és 55 (registry, rögzített commit),
`docs/identity.md` 8. pont.

## 1. Cél egy mondatban

Identity-nként egyetlen design-forrás, a **Brand Identity Card**: színek,
betűk, formák, logó (világos és sötét), név a képernyőn. A videó ebből
kapja a kinézetét, és később a GHL Custom Value-k, a Lead Magnet app és a
YouTube Brand Channel varázsló is ebből olvas. Mellette a **szótár**
(DECISIONS 68), ami a script szavait tartja kordában.

## 2. Kiindulás (2026-10-02 reggel)

- A build a `look` nevét kapta (`identity.brand.preset`), két kézzel
  leképezett kinézettel (Blue Professional, Warm paper).
- A logót semmi nem használta a videóban.
- Betűk: a HyperFrames minden `@font-face` nélküli családot render közben a
  Google Fonts-ról töltött le (mérve: a gyorsítótárban Inter, EB Garamond,
  JetBrains Mono, Roboto).
- A 13 preset összesen 20 betűcsaládot használ, mind Google Fonts és OFL.
  Kettőből hiányoznak a tartalom nyelveinek betűi (Fredoka One: ő ű,
  lengyel, román; Shrikhand: román ț). Ezek és a presetjeik (Daisy Days,
  Bold Poster) **kimaradtak** (Zoltan). Marad **18 betű és 11 preset**,
  plusz a Warm paper.

## 3. Fájlok az Identity mappájában

```text
identities/<id>/
  identity.json                 brand.preset és brand.logo marad (a setup írja)
  brand/
    brand-identity-card.json    A FORRÁS (séma: brand-identity-card/1)
    FRAME.md                    generált nézet a kártyából, kézzel nem szerkesztendő
    logo.<ext>                  logó világos háttérre (png, jpg, webp vagy svg)
    logo-dark.<ext>             logó sötét háttérre (opcionális)
  dictionary.json               a szótár (séma: dictionary/1)
```

- **Egy forrás:** a kártya. A `FRAME.md` minden mentéskor újraíródik belőle
  (a HyperFrames preset formátumában, hogy ember és HyperFrames eszköz is
  olvassa). Kézzel átírva sem hat semmire (K1).
- **Átállás:** ha nincs kártya, az app a `brand.preset`-ből számolja ki,
  így a régi Identity-k videói ugyanúgy néznek ki. A varázsló első mentése
  írja meg a kártyát.
- **Export, import, Duplicate, mentés:** a `brand/` és a `dictionary.json`
  megy vele (Rust teszt).
- A runner az Identity mappáját (`identityDir`) mindig a Rust magtól kapja,
  a ONE Video saját Identity-jéből; a felület nem adhatja meg.

## 4. A Brand Identity Card sémája (`brand-identity-card/1`)

Szerződés, mint a Video Brief Card: verziózott JSON séma
(`runner/schema/brand-identity-card.schema.json`). Csak hex szín, ismert
név és fájlnév, semmi CSS kifejezés, hogy más app is gond nélkül olvassa.

```json
{
  "schema": "brand-identity-card/1",
  "name": "Kovács Ödön",
  "updatedAt": "2026-10-02T10:00:00.000Z",
  "source": { "kind": "preset", "preset": "coral" },
  "appearance": "light",
  "colors": {
    "background": "#f5f0e8", "text": "#1a1a1a", "muted": "#6b6b6b",
    "surface": "#ffffff", "border": "#e8e0d4",
    "primary": "#e85d5d", "secondary": "#d44a4a", "tertiary": "#1a1a1a"
  },
  "fonts": {
    "display": { "family": "Bebas Neue", "source": "bundled" },
    "body": { "family": "Inter", "source": "bundled" },
    "mono": { "family": "JetBrains Mono", "source": "bundled" }
  },
  "shape": { "corners": "small", "radiusPx": 6, "cards": "flat" },
  "logo": { "light": "logo.png", "dark": null },
  "nameplate": { "name": "Kovács Ödön", "title": "Üzletépítő coach", "url": "odon.example" }
}
```

- `source.kind`: `preset`, `logo`, `scratch` vagy `import`; csak tájékoztat.
- `name`: mindig az Identity neve; hogy melyik presetből indult, a `source`
  mondja.
- `fonts.*.source`: mindig `bundled`: csak az app 18 betűje választható (K3).
- `shape.corners`: `none`, `small`, `medium`, `large` (0, 6, 14, 24 px).

**Leképezés a videóra** (`runner/brand/card.mjs`, `cardTheme`):

| kártya | téma (`THEME_KEYS`) |
|---|---|
| background, text, muted, surface, border | bg, fg, muted, surface, border |
| primary, secondary, tertiary | brand, accent, accent-2 |
| shape.radiusPx | radius |
| fonts.display, body, mono | font-display, font-body, font-mono |

**Leképezés a GHL Custom Value-kra** (rögzítve, **nem épült**):
`brand_color_primary`, `brand_color_secondary`, `brand_color_background`,
`brand_color_text`, `brand_font_heading`, `brand_font_body`,
`brand_radius`, `brand_name`, `brand_title`, `brand_url`, `brand_logo_url`
(ezt a GHL média feltöltése után a GHL oldali eszköz tölti ki).

## 5. A képernyők

Indítás: Settings, az Identity része, **Brand** oldal (a régi "Look"
helyén): a mostani kinézet képe, és "Open Brand wizard". A közös
varázsló-keret (`app/src/lib/wizard/WizardShell.svelte`): lépések felül,
Back és Next, Save minden képernyőn, alul: "Not sure? Skip or use the
default. You can change this any time in Settings." Jobb oldalon az élő
mini-kép és az olvashatóság.

1. **Start.** "From my logo", "From scratch", alatta a galéria: 11 preset
   és a Warm paper, mindegyik a saját élő képével.
2. **Logo.** Világos és sötét változat, mindkettő opcionális. **A logó nem
   kerül a videóba** (K2): a kártyán van a többi eszköznek, és a Colors
   képernyő színt javasol belőle (a webview-ban, hálózat nélkül).
3. **Colors.** Három fő mező (háttér, fő szín, második szín), a többit az
   app számolja; "Advanced" alatt mind a nyolc. Kész kombinációk a
   presetekből, javaslatok a logóból. Olvashatóság élőben (WCAG: szöveg
   4,5:1, halvány szöveg és fő szín 3:1), "Fix" gomb a legközelebbi
   megfelelő árnyalatra.
4. **Fonts.** Párok a presetekből, vagy cím- és szövegbetű külön; minden
   betű a tartalom nyelvének ékezetes mintamondatával. Figyelmeztetés nem
   kell: minden betű tudja mind a 10 nyelv betűit (6.3).
5. **Shapes.** Sarkok (négy fok) és kártya (lapos, kerettel, árnyékkal).
6. **Name on screen.** Név, titulus, rövid webcím: a záró jelenet
   (`logo-brand-close`) és a 3. kapu ebből tölti a nevet; a CTA varázsló is
   ezt olvassa.
7. **Preview and save.** **Valódi előnézet**: 5 komponens állóképe
   (titlecard-lockup, per-word-rise, count-up, grid-card-assemble,
   logo-brand-close) egy beépített mintavideóból, kulcs és LLM nélkül, a
   4. kapu láncával (build, kocka a jelenet vége előtt; lint és check
   nélkül, a minta fix). Mérve 8-15 mp.

Az **onboarding** Brand lépése a 12 kinézet közül választ és logót kér; a
varázsló utána, a Settingsben.

## 6. Betűk

### 6.1 Forrás és csomagolás

- `library/fonts.json`: a 18 család. Forrás: fontsource (OFL, WOFF2,
  nyelvi részhalmazonként), **rögzített verzió** (5.3.0), SHA256 lock
  (`library/fonts.lock.json`).
- `scripts/fetch-library.mjs` **build közben** tölti le a `latin` és
  `latin-ext` részhalmazt (változó betűnél egy fájl, különben a használt
  vastagságok) és családonként a licencet. **Futás közben semmi nem megy a
  hálózatra.** Mért méret: 1,7 MB.

### 6.2 A buildben

- Az assembler a kártya betűit (és mindig az Inter-t, a komponensek
  tartalékát) a `build/fonts/` alá másolja, és `@font-face` szabályokat ír
  az `index.html`-be.
- **Mérve** (2026-10-02): a HyperFrames a komponenseket egy dokumentumba
  fűzi, így a gyökér `@font-face` eléri őket; csak azt a családot tölti
  le, amelyhez nincs `@font-face`. Ezért a tartalék is csak általános név
  (`serif`, `sans-serif`, `monospace`): egy megnevezett tartalékot
  (Georgia, Consolas) letöltene, holott a képen sosem jelenne meg.
  Bizonyíték: üres betű-gyorsítótárral futtatva a gyorsítótár mappája létre
  sem jött, és a kép a választott betűvel készült. Az e2e minden futáskor
  ellenőrzi.
- Egyvastagságú betű (Bebas Neue, Archivo Black, Instrument Serif) minden
  vastagságra érvényesnek van jelölve, így a böngésző nem vastagítja
  mesterségesen.

### 6.3 Ékezet-ellenőrzés: a buildben, nem a felületen

`scripts/fetch-library.mjs` minden fájl `cmap` táblájából kiolvassa, mely
betűk vannak benne (`runner/brand/cmap.mjs`, saját kis olvasó, függőség
nélkül, WOFF2, TTF, OTF). **Ha egy családból bármelyik nyelv bármelyik
betűje hiányzik, a build elbukik.** Az ilyen betű kimarad, a usernek nem
kell vele foglalkoznia (Zoltan). Teszt is ellenőrzi a kész fájlokon.

### 6.4 Saját betű (K3): nincs

Nem kell, amíg erre nem jön kérés, és utána sem biztos.

## 7. Előnézet

- **Élő mini-kép** (`brand/BrandMini.svelte`): a kártya tokenjeiből, a
  csomagolt betűkkel (Tauri asset protokoll; a CSP `font-src` ennyivel
  bővült). Logó nincs rajta, mert a videóban sincs.
- **Valódi előnézet** (`runner/brand/preview.mjs`, `brand-preview`): a
  mintavideó a Mozgás varázsló előnézetének is az alapja.

## 8. A presetek

- A presetek `FRAME.md`-je a library rögzített commitjáról, build közben,
  SHA256-tal (`scripts/fetch-library.mjs`). Ez a DECISIONS 24-et pontosítja:
  nem első használatkor, hanem a csomagban.
- A színnevek presetenként mások (paper, ink, sun...), ezért a repóban
  **szerepkiosztás** él (`library/presets.map.json`: melyik nevű szín a
  háttér, a szöveg, a fő szín; csak nevek, érték nem). A hiányzó szerepeket
  a Blue Professional módján számolja (kártya 4%, keret 20% a fő színből a
  háttéren); a Blue Professional így pontosan a korábbi kézi értékeit adja.
- A presetek a szerzőik szerint maradnak; a Colors képernyő mutatja az
  olvashatóságot (például a Blockframe rózsaszín fő színe 2:1), a "Fix"
  egy kattintással javít.

## 9. A logó a videóban (K2): nincs

Semmilyen logó és vízjel nem kerül a videóba. A záró jelenet a névsávból
kapja a nevet, a titulust és a webcímet, szövegként.

## 10. Szótár (DECISIONS 68)

### 10.1 Fájl: `dictionary.json` (`dictionary/1`)

```json
{
  "schema": "dictionary/1",
  "preferred": [{ "term": "Owner", "note": "always with capital O" }],
  "banned": [{ "term": "blasting email", "instead": "sending to your list" }],
  "distinct": [{ "a": "YouTube Subscriber", "b": "Email Subscriber" }],
  "positions": [{ "against": "hustle culture", "kind": "phenomenon", "stance": "Calm, planned growth beats grinding." }]
}
```

Listánként legfeljebb 100 elem, elemenként 200 karakter; mentéskor az app
levágja a szóközöket, kidobja az üres és ismétlődő sorokat.

### 10.2 Felület (K4)

Settings, az Identity része, **Dictionary** oldal, négy szekció:
"Preferred spellings", "Banned words", "Never mix up", "What you stand
against", példákkal. A találatok az 1. kapuban a script alatt, a 3.
kapuban a jelenet-tábla alatt jelennek meg, sárga keretben, "You decide".

### 10.3 Hogyan működik

1. **Írás előtt:** a script kapu a DATA blokkba teszi a négy listát, a
   prompt "Dictionary" része mondja meg, mit kezdjen velük: kedvelt szó
   pontosan így; tiltott szó soha, helyette a megadott; a pár két tagját
   nem keveri; az álláspontot felveheti, valódi személyről csak
   véleményként beszél. A lista adat, nem utasítás (SPEC 9).
2. **Írás után:** gépi ellenőrzés (`runner/gates/script/dictionary.mjs`) a
   script minden kimondott szövegén és a jelenet-tábla minden szövegén.
   Szóhatárral ("hustle" nem találja a "hustlers"-t), kis- és nagybetűtől
   és ékezettől függetlenül ("Blasting Émail" találat). Kedvelt szónál a
   más írásmód találat ("owner" a "Owner" helyett), a mondat eleji
   nagybetű nem.
3. **Nem blokkol:** a jóváhagyás mindig megy. A naplóba csak a találatok
   száma kerül, a szavak nem.
4. A "Never mix up" és a "What you stand against" csak a promptban él:
   gépi szabály ezeket nem tudja megbízhatóan ellenőrizni.

## 11. Mit kap ebből a Mozgás és a CTA varázsló

Igen, minden varázsló ugyanarra a sablonra épül:

- **Közös keret** (`WizardShell.svelte`): lépések, Back, Next, Save,
  ugyanaz a megnyugtató sor, naplózott lépésváltás.
- **Előnézet-lánc**: a mintavideó és a `brand-preview` parancs; a Mozgás
  varázsló átmenetekkel és háttér-mozgással futtatja.
- **A kártya**: színek a háttér- és átmenet-komponenseknek; a CTA
  varázslónak a név, titulus, webcím, a színek és a betűk (logó csak a
  kártyán, videóba nem).
- **A szótár**: a CTA szövegére és a komment-kulcsszavakra ugyanaz a gépi
  ellenőrzés.
- **Mentés az Identity mappájába**, ugyanígy: a runner az `identityDir`-t a
  Rust magtól kapja; az export és a Duplicate viszi.

## 12. Ami ebben a körben nem épült

GHL Custom Value írás; a Brand Identity Card külön exportja és importja
(ma az Identity zip viszi); webes olvasók; saját betű; logó a videóban.

## 12b. Külső design-források (Zoltan kérdése, 2026-10-02)

- **open-design** (`github.com/nexu-io/open-design`, Apache-2.0, kb. 99
  ezer csillag, napi commitok): 154 design rendszer, mindegyikben
  `tokens.css`, szinte a mi neveinkkel (`--bg`, `--fg`, `--surface`,
  `--muted`, `--border`, `--accent`, `--font-display`, `--font-body`,
  `--font-mono`). Kb. a fele valódi márka utánzata (Stripe, Nike,
  Ferrari, Canva), ezeket nem vennénk át; a semlegesek (default, minimal,
  editorial, paper és társaik) a galéria második forrásai lehetnek,
  rögzített commitról, SHA256-tal. A betűiket a mi 18 betűnkre kell
  képezni (sok rendszerbetűt vagy nem szabad betűt nevez).
  **Javaslat, Zoltan döntésére vár:** a következő körben.
- **Canva:** nincs nyilvános paletta API. A Brand Kit színei csak a Canván
  belül futó appoknak érhetők el, egy asztali appnak nem.
- **Claude Design:** zárt termék, nincs letölthető katalógusa. Híd lehet
  egy "Import tokens.css" gomb: a Claude Design és az open-design kinézete
  is kártyává alakítható. Javaslat a következő körre.

## 13. Tesztek

- **Node**: `runner/brand.test.mjs` (kártya, presetek, kontraszt és Fix,
  mentés és átállás, betű-lefedettség a fájlokból, cmap olvasó, `@font-face`,
  "nincs webes betű" a buildben, szótár, protokoll), `scripts/app/brand.test.mjs`
  (a felület és a runner színszámítása azonos), `pages.test.mjs` (a setup
  presetlistája egyezik a csomagolttal), 429 modellváltás.
- **Rust**: az export, import és Duplicate viszi a kártyát, a `FRAME.md`-t,
  a sötét logót és a szótárt; a `brand-preview` a helyi nehéz munkák sorába
  kerül.
- **E2E**: kártya mentése, valódi előnézet, build a kártyával (Bebas Neue,
  helyi fájl), render, és a betű-gyorsítótár nem nő.
- **UI próba** a `scripts/ui-mock`-ban: Brand oldal, mind a 7 képernyő,
  Fix, mentés, Dictionary oldal, találat az 1. kapuban.

## 14. Zoltan döntései (2026-10-02)

| | kérdés | döntés |
|---|---|---|
| K1 | `FRAME.md` | igen, a kártyából generálva; a kártya az egyetlen forrás |
| K2 | Logó a videóban | nem, semmilyen logó és vízjel |
| K3 | Saját betű | nem, amíg nincs rá kérés; a meglévőkből dolgozunk |
| K4 | A szótár helye | Settings, Identity, "Dictionary", négy szekció |
| K5 | Gemini 429 | igen, egyszer a másik Gemini modell, ugyanazzal a kulccsal |
| | Hiányos ékezetű betűk | kimaradnak, a presetjeikkel együtt |
