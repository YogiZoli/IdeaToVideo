# Mozgás varázsló: specifikáció (3. változat, D út)

Állapot: javaslat, Zoltan jóváhagyására vár. 2026-10-04.
Előzmény: a 2. változat (2026-09-30) a kánon `motion.js` gombjaira épült. A D út
(DECISIONS 48) óta az app nem használja a kánont, ezért az a változat elavult;
a git történetben megvan. A megvalósítás terve: `docs/wizards/motion.md`.

## Mit csinál

A user egyszer végigmegy rajta, a kimenet az Identity **Mozgás profilja**
(`identities/<id>/motion.json`). Minden ONE Video ezt örökli, így a playlist
egy kaptafára mozog, a tartalom videónként más. Profil nélkül a kimenet
pontosan a mai: éles vágás, sima háttér, nincs kamera, mind a 14 komponens.

## A keret: mi állítható a D úton

A jelenetek a HyperFrames registry komponensei, mindegyik a saját, beégetett
mozgásával. Közös tempó-, távolság- vagy rugózás-gombjuk nincs, és nem írjuk át
őket. Ami állítható, az mind a HyperFrames-ből jön, kész és karbantartott
formában:

1. **Jelenetváltás.** A HyperFrames saját, gépi átmenet-jegyzéke
   (`skills/faceless-explainer/scripts/lib/transitions.json`, ugyanaz a
   rögzített commit, mint a komponenseké). Öt átmenet: crossfade,
   blur-crossfade, push-slide (négy irány), squeeze, zoom-through. Mindegyik
   kész GSAP recept a két jelenet keretére; a HyperFrames a saját
   explainer- és termékvideó-menetében ugyanígy illeszti be (a kimenő jelenet
   kitart, a bejövő a mondatánál kezd, így a hang szinkronja nem mozdul).
2. **Háttér-mozgás.** A registry háttér-komponensei egy alsó sávon a teljes
   videó alatt: grain-field (pontmező), aurora-drift (fényfátyol, csak sötét
   kinézethez), és felül egy filmszemcse (grain-overlay).
3. **Kamera.** A HyperFrames kamera-szabálya (`multi-phase-camera`,
   `viewport-change`): jelenetenként egy lassú ráközelítés a jelenet keretén,
   vagy csak egy alig látható lebegés. Kikapcsolható (DECISIONS 52).
4. **Komponensek szerepenként.** Melyik komponens jöhet szóba a 3. kapuban
   (szerepenként legalább egy marad), és a komponensek saját,
   a kinézetet és a mozgást érintő változói: a kiemelés módja (filc, kör, aláhúzás,
   firka), a rajzoló toll látszik-e, a szám kap-e fényt, a cím kap-e vonalat.

Ami nem állítható: globális tempó, távolság, rugózás, a komponensek belső
időzítése. Ezt a varázsló nem is ígéri.

## Eldőlt, és így marad (DECISIONS 52)

- A kamera kikapcsolható.
- Lüktetés: a D úton nincs külön, közös lüktetés (a komponensek saját
  kitartása marad). A "0 is lehet" ezzel teljesül; a helyén a kamera
  "lebegés" fokozata áll, ami szintén kikapcsolható. Lásd a kérdéseket.
- Bezáruló gyűrű és haladásjelző nincs.
- Fejezetek igen (kész, a render mellé kerül a fejezetlista).

## Menet (a Brand varázsló keretében, WizardShell)

1. **Start: kiinduló stílus.** Négy kártya, mindegyik kitölti az összes
   választ: Calm (ajánlott), Clean, Lively, Still. Mellette "Import from the
   current profile", ha már van mentett profil.
2. **Scene changes.** Átmenet típusa (Cut és az öt), hossza (Short, Normal,
   Slow), iránya (csak push-slide), és hol: minden jelenetváltásnál, vagy csak
   a script új szakaszainál (a szakaszon belül éles vágás).
3. **Background.** Plain (a kinézet háttérszíne), Dot field, Aurora (csak
   sötét kinézetnél választható, világosnál szürke, magyarázattal), és külön
   kapcsoló: Film grain.
4. **Camera.** Off, Drift (alig látható lebegés), Slow push-in (Subtle vagy
   Medium).
5. **Scenes.** Szerepenként a komponensek pipával (legalább egy marad), a
   leírásukkal és egy állóképpel; alattuk a stílus-változók (kiemelés módja,
   toll, fény, vonal), mindegyiknél "Let the AI choose" is.
6. **Preview.** Valódi mintavideó lejátszóval: a Brand előnézet öt jelenete
   és egy hatodik (kiemelés), a user kinézetével és a választott mozgással,
   helyben renderelve. Gomb: "Render preview" (kb. 1 perc, a gép dolgozik).
7. **Save.** Mentés az Identity mappájába. Az Identity export, import és
   Duplicate viszi.

Minden képernyőn ott a "Not sure? Keep the recommended" sor és a "Later you can
change this in Settings" mondat. Csak egy választás képernyőnként, csúszka nincs.

## Mit nem csinál

- Nem ír saját átmenetet, hátteret vagy kamerát: csak a HyperFrames kész
  receptjeit és komponenseit illeszti, rögzített commitról, SHA256-tal.
- Shader-átmenet (WebGL blokkok: light-leak, whip-pan, sdf-iris) nincs: ezek a
  registryben bemutató blokkok saját tartalommal és Google-betűvel, nem a két
  jelenet közé illeszthető receptek.
- A "slot" átmenet-komponensek (whip-pan-cut, iris-reveal, morph-swap) sincsenek
  az első körben: a két jelenetet a saját belsejükbe kérik, és ezt a beágyazott
  komponensekkel még nem mértük. Ha később kell, külön próba.
- Visszatérő szegmensek, végképernyő, komment-CTA: a CTA varázslóé
  (DECISIONS 50, 53).

## Mérni kell, mielőtt bekerül (a kód első lépése)

Egy elem csak akkor kerül a varázslóba, ha a mintavideón, világos és sötét
kinézettel is: lint és check 0 hiba, a render ideje legfeljebb 20%-kal nő, és a
kontakt lapon a jelenet olvasható. A blur-crossfade és a zoom-through elmosást
használ (0,4-0,6 mp-ig, jelenetváltásonként); ha ez a 20%-ot átlépi, kiesik vagy
csak "Slow" hosszal marad.
