# Mozgás varázsló: indító leírás (2. fázis, 15. lépés)

Egy külön munkamenethez. Olvasd el előtte: `STATUS.md`, `DECISIONS.md` (48-58,
különösen 52), `docs/motion-wizard.md`. Javasolt modell: **Opus 5.5, High**.
A Brand varázsló után érdemes, mert az előnézet a user témájával készül.

## Cél

Userenként egy Mozgás profil, amit minden videója örököl: a playlist egy
kaptafára megy, a tartalom videónként más.

## Fontos: a meglévő specifikáció elavult

A `docs/motion-wizard.md` 2. változata a régi szabályrendszerre épül (egy közös
`motion.js` gombjai: easing, idő- és távolságszorzó, túllövés, stagger). A D út
óta (DECISIONS 48) a jelenetek a HyperFrames registry komponensei, mindegyik a
saját, beégetett mozgásával. Közös mozgás-gombjaik nincsenek. Ami ma
ténylegesen állítható:

- melyik komponensek jöhetnek szóba (szerepenként, `runner/gates/scenes/roles.mjs`);
- a komponensek saját változói, ahol mozgást érintenek (pl. `exit`, `split`,
  `style`, `draw_at`);
- jelenetváltás: a registry átmenet-komponensei (pl. cut-the-curve, whip-pan-cut,
  iris-reveal), a két jelenet közé illesztve;
- háttér-mozgás: a registry háttér-komponensei (pl. aurora-drift,
  mesh-gradient-bg, grain-overlay) egy alsó sávon a teljes videó alatt.

Ami nem állítható a komponensek átírása nélkül: globális tempó, távolság,
rugózás. Az első feladat ezért a specifikáció átírása erre a keretre, és
Zoltan jóváhagyása, a kód csak utána.

## Eldőlt (DECISIONS 52)

A kamera kikapcsolható, a lüktetés 0 is lehet. Bezáruló gyűrű és haladásjelző
nincs. Fejezetek igen (kész: a render mellé kerül a fejezetlista).

## A Brand varázslóból kész (2026-10-02, DECISIONS 72, 73)

- Közös varázsló-keret: `app/src/lib/wizard/WizardShell.svelte` (lépések,
  Back, Next, Save, a "Not sure?" sor, naplózott lépésváltás). A Brand
  varázsló (`app/src/lib/brand/BrandWizard.svelte`) a minta.
- Valódi előnézet: `runner/brand/preview.mjs` (mintavideó, 5 jelenet, a 4.
  kapu láncával, 8-15 mp), runner parancs `brand-preview`. A Mozgás
  varázsló ugyanezt futtatja átmenetekkel és háttér-mozgással.
- Mentés az Identity mappájába: a runner az `identityDir`-t a Rust magtól
  kapja (`app/src-tauri/src/lib.rs` run_runner); a `motion.json` ide megy,
  az Identity export és a Duplicate viszi.
- Ötlet a tervhez: az open-design `tokens.css` fájljaiban mozgás-értékek is
  vannak (`--motion-fast`, `--motion-base`, `--ease-standard`), a galéria
  stílusainak saját tempója. A csomagban megvannak
  (`app/src-tauri/library/opendesign/<id>/tokens.css`).

## Zoltantól kell

- A 3. specifikáció jóváhagyása a fenti keretben.
- Mely átmenetek és háttér-mozgások tetszenek (egy rövid próbavideó alapján).
