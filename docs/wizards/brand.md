# Brand varázsló: indító leírás (2. fázis, 14. lépés)

Egy külön munkamenethez. Olvasd el előtte: `STATUS.md`, `DECISIONS.md` (39, 48-58),
`docs/phase-2-plan.md` 14. lépés. Javasolt modell: **Opus 5.5, High**.

## Cél

A videó kinézete a useré legyen: színek, betűk, formák, logó. Két forrás, egy
kimenet: egy HyperFrames preset, vagy a varázsló eredménye. Mindkettő egy
`FRAME.md` (ugyanaz a forma, mint a presetek), amit az assembler a komponensek
téma-változóira képez le. Az onboarding után opcionális ("Set your own design"),
minden képernyőn: "Not sure? Skip or use the default. You can change this any
time in Settings."

## Ami már megvan (2026-09-30)

- `runner/gates/build/assemble.mjs`: `THEME_KEYS` (bg, fg, muted, surface,
  border, brand, accent, accent-2, radius, font-display, font-body, font-mono),
  `BLUE_PROFESSIONAL` (az alap, DECISIONS 59), `WARM_PAPER`, `LOOKS`,
  `DEFAULT_THEME` (sötét, csak a próbákhoz), `themeCss` (`--itv-*` a
  `:root`-on), `mountTheme` (jelenetenként rögzíti a tokeneket, mert a runtime
  a változókat CSS-változóként is kiírja, lásd DECISIONS 58 és a kódkomment).
- A projekt `scenes.json`-jában a `theme` mező már most is felülírja az alapot.
- 14 komponens a könyvtárban, mindegyik csak ezekből a tokenekből színez.

## Ismert akadály: betűk

A HyperFrames minden `@font-face` nélküli betűcsaládot a Google Fonts-ról tölt
le render közben, a rendszerbetűket is (a Georgiát EB Garamondra cseréli), és a
komponensek tartalékként `Inter`-t írnak. Kell: helyi OFL betűfájlok a buildben
`@font-face`-szel, a preset betűi és az `Inter` is, így nincs hálózati hívás. A
galéria jelezze, ha egy betűből hiányzik a tartalom nyelvének ékezete (ő, ű).

## Presetek

`heygen-com/hyperframes`, `skills/hyperframes-creative/frame-presets/`, 13 darab,
Apache-2.0, rögzített commitról, SHA256-tal, első használatkor letöltve
(DECISIONS 24). Mozgást nem tartalmaznak.

## Képernyők (az eredeti terv, 2026-09-30, a 2. fázis tervének korábbi 14. lépéséből)

A varázsló az onboardingtól külön, az app főképernyőjéről és a Settingsből
indul ("Set your own design"). Kimenete a user saját `FRAME.md`-je és a
feltöltött assetek a config mappában. A galéria az onboarding Brand lépésében és
a Settingsben is megjelenik, az előnézet abból készül, amit a user ténylegesen
kapni fog.

1. **Kiindulás és logó:** "From my logo", "From a preset", "From scratch",
   logó feltöltés (opcionális, világos és sötét változat). A logó ma is
   feltölthető az onboardingban (`config.brand.logo`), de még semmi nem
   használja.
2. **Színek egy képernyőn:** fő szín, háttér, második szín, kész kombinációkkal
   (a 13 preset palettája, a HyperFrames 9 hangulat-palettája, és a logóból
   kinyert javaslatok).
3. **Betűk egy képernyőn:** címbetű és szövegbetű, kész párokkal a
   presetekből, ékezetes mintaszöveggel, a hiányos betűk kiszűrve.
4. **Formák:** sarkok, kártya árnyékkal vagy kerettel.
5. **Név a képernyőn:** név és titulus a névsávhoz és az idézetekhez. Ma nincs
   ilyen komponens a könyvtárban (14 komponens, DECISIONS 58): vagy kimarad,
   vagy a `logo-brand-close` nevét tölti ki.
6. **Előnézet és mentés:** 4-6 komponens állóképe, kontrasztellenőrzés,
   javítási javaslat.

Minden képernyőn: "Not sure? Skip or use the default. You can change this any
time in Settings."

A mai választó (Settings, "Video look": Blue Professional vagy Warm paper,
DECISIONS 59) a galéria helyén áll, a varázsló ezt váltja le.

## Zoltantól kell

- (Eldőlt, DECISIONS 59: az alap a Blue Professional, ez marad az irány.)
- A képernyők sorrendjének és szövegeinek jóváhagyása az első változat után.
