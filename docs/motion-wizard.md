# Mozgás varázsló: specifikáció (3. változat, D út)

Állapot: Zoltan jóváhagyta (2026-10-04, "mind az ajánlott"), megvalósítva
(DECISIONS 74). Előzmény: a 2. változat (2026-09-30) a kánon `motion.js`
gombjaira épült; a D út (DECISIONS 48) óta elavult, a git történetben megvan.
A megvalósítás részletei: `docs/wizards/motion.md`.

## Mit csinál

A user egyszer végigmegy rajta, a kimenet az Identity **Mozgás profilja**
(`identities/<id>/motion.json`). Minden ONE Video ezt örökli a következő
buildjétől, így a playlist egy kaptafára mozog, a tartalom videónként más.
Profil nélkül a kimenet bájtra a régi: éles vágás, sima háttér, nincs kamera,
mind a 14 komponens (mérve: a build `index.html`-je azonos).

## A keret: minden a HyperFrames-ből jön

A jelenetek a HyperFrames registry komponensei, mindegyik a saját, beégetett
mozgásával. Közös tempó-, távolság- vagy rugózás-gombjuk nincs, és nem írjuk
át őket. Ami állítható, az mind a HyperFrames saját, karbantartott része,
rögzített verzióval:

1. **Hangulat és energia: a HyperFrames "mozgás design systemje".** A saját
   átmenet-áttekintője (`skills/hyperframes-animation/transitions/overview.md`)
   9 hangulatot (Warm, Premium, Editorial, Cold, Tech, Tense, Playful,
   Dramatic, Retro) és 3 energiát (Calm, Medium, High) ad, mindegyikhez
   átmeneteket, hosszt és görbét. Mellette két egyszerű választás: Simple
   (crossfade) és No transitions (vágás). Ez az open-design párja a
   mozgásra.
2. **Jelenetváltás.** Két forrásból, mindkettő a HyperFrames-é:
   - a CSS átmenet-jegyzéke (`skills/faceless-explainer/scripts/lib/
     transitions.json`): crossfade, blur-crossfade, push-slide, zoom-through,
     squeeze; a saját injektorának módszerével beillesztve (a kimenő jelenet
     kitart, a bejövő a mondatánál kezd, így a hang, a felirat és a
     fejezetlista nem mozdul);
   - a `@hyperframes/shader-transitions` csomag 14 shader-átmenete (light
     leak, whip pan, iris, morph, glitch...), ugyanazzal a verzióval, mint a
     motor (0.8.22). Ha egy profil shadert használ, a csomag kezel minden
     váltást; ahol nincs shader, ott áttűnés, és a CSS recept többi része
     (elmosás, nagyítás, eltolás) megmarad.
   - Hol melyik: a HyperFrames "Narrative Position" szabálya. Fő átmenet a
     szakaszon belül, kiegészítő az első váltásnál és új szakasznál, a
     végén lassú crossfade. Választható: csak új szakasznál legyen átmenet,
     a szakaszon belül vágás.
3. **Háttér-mozgás.** A registry háttér-komponensei egy alsó sávon: Dot field
   (grain-field, a háttérszínre épül) és Aurora (aurora-drift, mindig sötét
   alapú, ezért csak sötét kinézetnél választható). 5-15 mp-es darabokban,
   mert egy komponens egy mozgás-kört tesz meg a teljes hosszán, és a darabok
   eleje és vége ugyanaz a kocka (varrat nincs). A jelenet-komponensek a saját
   talajukat festik (a HyperFrames elve: minden jelenet viszi a talaját); ha
   a user hátteret választ, a build a jelenet-másolatokban csak ezt a talajt
   teszi átlátszóvá (Zoltan döntése, 2026-10-04), minden más változatlan.
4. **Kamera.** A HyperFrames explainer-doktrínája szerint
   (`skills/faceless-explainer/references/motion-language.md`: "inkább
   semmi mozgás, mint rossz mozgás"): Off (ajánlott), Subtle jitter (az
   egyetlen megengedett "élet" egy kitartott képen), Push in (lassú
   ráközelítés a jelenet első felében, utána tart). Lebegő, úszó kamera
   nincs, mert a doktrína tiltja.
5. **Komponensek szerepenként.** Melyik jöhet szóba a 3. kapuban
   (szerepenként legalább egy marad), és a stílus-változóik (a kiemelés
   módja, a toll, a fény, a vonal, az árnyék), mindegyiknél "Let the AI
   choose". A zárás szerep a CTA varázslóé.

Ami nem állítható: globális tempó, távolság, rugózás, a komponensek belső
időzítése, a kilépő animáció (`exit`: a jelenetváltásé).

## Eldőlt (DECISIONS 52 és 74)

- A kamera kikapcsolható; alapból ki.
- Közös lüktetés a D úton nincs; a helyén a kamera "Subtle jitter" fokozata.
- Bezáruló gyűrű és haladásjelző nincs. Fejezetek igen (kész).
- Filmszemcse (grain-overlay) nincs: CSS `@keyframes`-szel mozog, amit a
  HyperFrames doktrínája a render órájától független futás miatt tilt.
- Slot-átmenetek (whip-pan-cut, iris-reveal) nincsenek: ugyanezek a hatások
  shaderként jönnek, a jelenetek átrendezése nélkül.
- A shader-blokkok (registry/blocks) bemutató kompozíciók saját tartalommal,
  nem illeszthetők be; helyettük a shader-csomag.
- Render-költség: nem dobunk ki semmit a lassúság miatt, a mért adat a
  varázslóban az opció mellett áll.

## Menet (WizardShell, hat képernyő)

1. **Start:** a 11 hangulat galériája, mellette az energia. Ajánlott
   hangulat a Brandből: egy open-design stílus mozgás-tokenjei
   (`--motion-base`, `--ease-standard`) ott, ahol eltérnek az átlagtól
   (lassú, gyors, lépcsős, rugós vagy mozdulatlan); különben Premium.
2. **Scene changes:** fő átmenet, kiegészítő, irány (push-nál), hol.
3. **Background:** Plain (ajánlott), Dot field, Aurora.
4. **Camera:** Off (ajánlott), Subtle jitter, Push in.
5. **Scenes:** szerepenként a komponensek és a stílusuk.
6. **Preview and save:** valódi, 18 mp-es mintavideó a user kinézetével és
   a még nem mentett profillal, helyben renderelve, lejátszóval; Save.

## Ellenőrzés

A lint és a check minden mozgásos buildnél fut. Egy jelenetváltás alatt két
jelenet szándékosan együtt látszik (shadernél teljes fedéssel, mert a motor
keveri őket), ezért a check JSON-jából a csak az átmenet-ablakon belül látott
szöveg-átfedés nem hiba; minden más igen. A jeleneteket a check a
"megérkezett" pillanatukban is nézi.
