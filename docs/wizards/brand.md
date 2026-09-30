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
  `DEFAULT_THEME` (sötét, a próbához választva), `themeCss` (`--itv-*` a
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

## Képernyők (a terv szerint)

1. Kiindulás és logó: "From my logo", "From a preset", "From scratch".
2. Színek: fő szín, háttér, második szín, kész kombinációkkal.
3. Betűk: cím és szöveg, kész párok, ékezetes minta.
4. Formák: sarkok, kártya árnyékkal vagy kerettel.
5. Előnézet és mentés: 4-6 komponens állóképe, kontrasztellenőrzés.

## Zoltantól kell

- Az alap téma a Brand varázsló előtt: sötét maradjon vagy világos legyen
  (a kérdés nyitva, 2026-09-30).
- A képernyők sorrendjének és szövegeinek jóváhagyása az első változat után.
