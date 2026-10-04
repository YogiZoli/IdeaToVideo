# Mozgás varázsló: terv (2. fázis, STATUS "Sorrend innen" 4. pont)

Állapot: terv, Zoltan jóváhagyására vár (2026-10-04). A specifikáció (mit és
miért): `docs/motion-wizard.md` 3. változat. Ez a fájl a megvalósítás: fájlok,
séma, registry-elemek, előnézet, tesztek. Javasolt modell: **Opus 5.5, High**.

Előtte olvasd: `STATUS.md`, `DECISIONS.md` 48, 52, 55, 57, 72, 73.

## 1. Cél

Identity-nként egy Mozgás profil (`identities/<id>/motion.json`), amit minden
ONE Video örököl. Ugyanaz a mindset, mint a Brandnél: meglévő, tesztelt, mások
által karbantartott elemekből dolgozunk (HyperFrames registry, rögzített
commit, SHA256), nem írunk sajátot.

## 2. A Brand körből újrahasznosítva

- `app/src/lib/wizard/WizardShell.svelte`: lépések, Back, Next, Save, "Not
  sure?" sor, naplózott lépésváltás. Minta: `app/src/lib/brand/BrandWizard.svelte`.
- `runner/brand/preview.mjs`: a mintavideó jelenetei (`sampleScenes`,
  `sampleSentences`) és a csendes hang; a Mozgás előnézet ezekre épül.
- Az `identityDir` a Rust magtól jön (`app/src-tauri/src/lib.rs` run_runner),
  a runner ide ír. Az Identity export a teljes mappát viszi
  (`identity.rs` export, walk), a Duplicate is (`copy_tree`), így a
  `motion.json` külön kód nélkül utazik; a meglévő Rust teszt kap egy sort.
- open-design `tokens.css` mozgás-értékei: megnézve, lásd 11. pont.

## 3. Registry-elemek (rögzített commit, SHA256)

Forrás: `github.com/heygen-com/hyperframes`, commit
`9a27b9f9349b43b9fd194a95ace830d7cbe38b42` (ugyanaz, mint a 14 komponensé),
Apache-2.0. A `scripts/fetch-library.mjs` tölti le build közben, a
`library/library.lock.json` ellenőrzi. A repóba semmi nem másolódik.

| Elem | Útvonal a registryben | SHA256 (letöltve, 2026-10-04) | Mire |
|---|---|---|---|
| transitions.json | `skills/faceless-explainer/scripts/lib/transitions.json` | `e471afb6...a29a103` | 5 átmenet GSAP receptje, alap- és maximum hossz |
| aurora-drift | `registry/components/aurora-drift/` (html + item) | html `bf700650...e34c23`, item `822b07de...a767` | háttér, csak sötét kinézet (az alapja mindig sötét, `#050711`) |
| grain-field | `registry/components/grain-field/` | html `2e2e06e1...e451f`, item `2d269f69...b86e51b` | háttér, pontmező, a `--bg` színére |
| grain-overlay | `registry/components/grain-overlay/` | html `97a0da8f...e80d`, item `bd0c8976...bca0e897` | filmszemcse felül (CSS keyframes, beágyazott SVG zaj, nincs hálózat) |

A teljes hash a lockba kerül. A `transitions.json` ugyanaz a fájl, amit a
HyperFrames saját faceless-explainer menete használ; a receptek forrása a
`skills/hyperframes-animation/transitions/css-*.md` katalógus.

Megnézve és kihagyva (indoklás a specifikációban): a shader-blokkok
(light-leak, whip-pan, sdf-iris, cross-warp-morph stb., saját tartalom és
Google-betű), a slot-átmenetek (whip-pan-cut, iris-reveal, morph-swap,
cut-the-curve: a két jelenetet belül kérik), a recept nélkül nem mozgó
snippetek (dynamic-grid, mesh-gradient-bg: utóbbi valójában bemutató kártya),
a ritmusra épülő beat-pulse-background, a statikus vignette.

## 4. motion.json

```json
{
  "schema": "motion-profile/1",
  "preset": "calm",
  "transition": { "type": "crossfade", "length": "normal", "direction": "LEFT", "where": "every" },
  "background": { "type": "plain", "grain": false },
  "camera": { "move": "push-in", "amount": "subtle" },
  "scenes": {
    "off": ["headline-slam"],
    "style": {
      "marker-highlight": { "style": "underline" },
      "whiteboard-ink": { "pen": "hide" },
      "count-up": { "glow": true },
      "titlecard-lockup": { "rule": "hide" },
      "headline-slam": { "shadow": false }
    }
  }
}
```

- `transition.type`: `cut` vagy a `transitions.json` egyik neve. `length`:
  `short`, `normal`, `slow` = a recept alaphosszának 0,75, 1 és 1,4-szerese,
  legfeljebb a jegyzék `max_duration_s` értéke (2 mp), és legfeljebb a
  bejövő jelenet harmada. `direction` csak a push-slide-nál. `where`:
  `every` (minden jelenetváltás) vagy `sections` (csak ahol a script új
  szakasza kezdődik; a szakaszokat a 3. kapu már ismeri,
  `sentenceSections`).
- `background.type`: `plain`, `grain-field`, `aurora-drift`. Az aurora
  világos kinézetnél nem választható; ha a kinézet később világosra vált, a
  build `plain`-t használ és a videó `log.txt`-jébe ír egy sort.
- `camera.move`: `off`, `drift`, `push-in`; `amount`: `subtle` (1,00 -> 1,03
  jelenetenként) vagy `medium` (1,00 -> 1,06). A `drift` a
  `multi-phase-camera` szabály lebegése (kis szinuszos eltolás, a két tengely
  1,3-as frekvencia-aránnyal).
- `scenes.off`: kikapcsolt komponensek. Tiltó lista, nem engedélyező: egy
  később hozzáadott komponens alapból bent van. Szerepenként legalább egy
  marad, különben a mentés hibát ad.
- `scenes.style`: csak `role: "style"` változók, a `registry-item.json`
  szerint ellenőrizve (`checkVars`). Ami nincs benne, azt az AI választja
  (ma: az alapérték).
- Hiányzó vagy üres fájl: a mai kimenet bájtra azonosan. Ez teszt.

Előre kitöltött stílusok (Start képernyő):

| Stílus | Átmenet | Háttér | Kamera |
|---|---|---|---|
| Calm (ajánlott) | crossfade, slow, every | plain | push-in, subtle |
| Clean | crossfade, normal, sections | plain | drift |
| Lively | push-slide LEFT, short, every | grain-field | push-in, medium |
| Still | cut | plain | off (= a mai kimenet) |

## 5. Hol hat (runner)

- `runner/motion/profile.mjs`: séma, normalizálás, stílusok, ellenőrzés;
  `motion-state` és `motion-save` runner parancs (mint a `brand-state`,
  `brand-save`), az `identityDir`-be ír.
- **3. kapu** (`runner/gates/scenes/index.mjs`): a `libraryCatalog` a
  `scenes.off` nélkül kapja a listát; a cserelista is. A `checkScenes` a
  kikapcsolt komponenst elutasítja.
- **Build** (`runner/gates/build/assemble.mjs`), a profil a `lookOf`
  mintájára az `identityDir`-ből:
  - stílus-változók a jelenet `vars`-ába (a user választása felülírja az
    AI-ét);
  - átmenet: a HyperFrames injektor módszere (a kimenő jelenet kerete a
    hosszával kitart, a bejövő a mondatánál kezd, a két szomszéd keret külön
    sávon, a recept a fő idővonalra, `__OLD__`, `__NEW__`, `__T__`, `__DUR__`,
    `__DX__` helyettesítve). A jelenetek kezdete nem mozdul, így a hang, a
    felirat és a fejezetlista változatlan;
  - háttér: a 0. sávon a `#main-bg` helyett a komponens, jelenetenként egy
    darabban (a háttér-komponensek hurok-pontosak: eleje és vége ugyanaz a
    kocka, így a darabok varrat nélkül illeszkednek; egy hosszú darab egy
    10 perces videón szinte állna, mert egy ciklust nyújt a teljes hosszra);
  - filmszemcse: a `grain-overlay` a jelenetek fölött, az avatar alatt;
  - kamera: a jelenet keretén egy tween, a `multi-phase-camera` receptje
    szerint egy írója van a transzformnak.
- A Brandhez hasonlóan a profil a buildkor számít: egy régi videó
  újraépítése a mai profillal megy.

## 6. Képernyők (UI)

Settings, Identity, **Motion** aloldal (a Brand mellett), rajta: a profil
összefoglalója és "Open Motion wizard". A varázsló hét képernyője a
specifikáció "Menet" pontja szerint: Start, Scene changes, Background, Camera,
Scenes, Preview, Save. Fájlok: `app/src/lib/motion/MotionWizard.svelte` és
`MotionPage.svelte`; a próbakörnyezet (`scripts/ui-mock`) kap ál-választ a két
új parancsra és az előnézetre.

## 7. Előnézet

`runner/motion/preview.mjs`, runner parancs `motion-preview`: a Brand
mintavideó öt jelenete és egy hatodik (marker-highlight), jelenetenként 3 mp,
18 mp összesen, csendes hanggal, a user kártyájával és a nem mentett
profillal. Build, utána render a 4. kapu lánca szerint, kisebb minőségben, a
`dataDir/motion-preview/preview.mp4`-be, lejátszó a varázslóban. Becslés: a
mért 2,2 perc gépidő videópercenként alapján kb. 40 mp render, plusz build,
összesen kb. 1 perc; haladásjelző és Cancel, mint a 4. kapuban. Kulcs nem
kell, AI nem fut.

## 8. Mérés a kód előtt (M1-M3)

- **M1:** az öt átmenet a mintavideón, világos (blue-professional) és sötét
  kinézettel: lint és check 0 hiba, render-idő a "cut"-hoz képest, kontakt
  lap. A blur-crossfade és a zoom-through elmosást használ: ha a render
  több mint 20%-kal lassabb, kiesik.
- **M2:** a három háttér-elem ugyanígy, plusz a varrat ellenőrzése két
  háttér-darab határán.
- **M3:** a kamera és az átmenet ugyanazon a kereten: ha a kettő
  ütközik (mindkettő a `scale`-t írja), a kamera egy külső keretre kerül;
  ha a futtató ezt nem engedi, a kamera a bejövő átmenet vége után indul.

Az eredmény a DECISIONS 74-be kerül, és ami elbukik, nem kerül a varázslóba.

## 9. Mit kap ebből a CTA varázsló

- A WizardShell-t (már megvan) és ugyanezt a mintát: Identity-szintű JSON,
  `*-state` és `*-save` runner parancs, export és Duplicate külön kód nélkül.
- A mintavideó renderelőjét (`motion-preview` általánosítva): a visszatérő
  szegmensek és a végképernyő előnézete ugyanígy készül.
- Az átmenet-beillesztést: a visszatérő szegmensek a profil átmenetével
  kapcsolódnak a videóhoz, nem saját váltással.
- A háttér-darabolást: a végképernyő (DECISIONS 53, 5-20 mp) alatt a háttér
  folytatódik.
- A zárás szerep (cta-close, logo-brand-close) a CTA varázslóé: a Mozgás
  varázsló Scenes képernyője ezt a szerepet nem mutatja (lásd kérdések).

## 10. Tesztek és kör vége

- Node: séma és stílusok, `off` szerepenként legalább egy, stílus-változók
  ellenőrzése, recept-helyettesítés, sávok, hosszak (a harmad-szabály és a
  2 mp), `sections` mód, háttér-darabok, profil nélkül bájtra azonos
  `index.html`, 3. kapu szűrése.
- Rust: az export és a Duplicate viszi a `motion.json`-t.
- e2e: build, lint, check, render egy profillal (crossfade, grain-field,
  push-in), és az előnézet.
- UI próba a `scripts/ui-mock`-ban, utána commit és push a `phase-2`-re, új
  telepítő.

## 11. open-design mozgás-értékek (megnézve, 2026-10-04)

A 152 stílus `tokens.css`-ében mind megvan a `--motion-fast`, `--motion-base`
és `--ease-standard`, de felület-mikromozgásra valók (80-330 ms, gomb és
menü), nem videóra: 120 stílusnak ugyanaz a görbéje (`cubic-bezier(0.2, 0, 0,
1)`), 101-nek ugyanaz a `--motion-fast` (150 ms). Javaslat: nem használjuk, a
kiinduló stílust a user választja.

## 12. Zoltantól kell

A döntések listája a chatben (2026-10-04), a válaszok után ide és a
DECISIONS 74-be kerülnek. Utána a kód, az M1-M3 méréssel kezdve.
