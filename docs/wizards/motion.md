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

## Zoltantól kell

- A 3. specifikáció jóváhagyása a fenti keretben.
- Mely átmenetek és háttér-mozgások tetszenek (egy rövid próbavideó alapján).
