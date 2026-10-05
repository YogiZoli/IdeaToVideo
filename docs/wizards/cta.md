# CTA varázsló: indító leírás (2. fázis, 16. lépés)

Egy külön munkamenethez. Olvasd el előtte: `STATUS.md`, `DECISIONS.md` (35, 47,
50, 51, 53). Javasolt modell: **Opus 5.5, High** (ha Zoltan részletes leírást
ad, Sonnet 5 High is elég).

## Cél

A videó eleje és vége, ami minden videóban visszatér, és a nézőt a következő
lépésre viszi. Az onboarding után opcionális varázsló.

## Eldőlt

- Visszatérő szegmensek: generált, a user saját feltöltött videója, vagy AI
  avatar, hosszkorlát nélkül (DECISIONS 50).
- Kulcsszavas komment-CTA, alapból 15 kulcsszóval, márkanév említése nélkül
  (DECISIONS 51). A részleteket Zoltan adja.
- YouTube végképernyő: alapból 20 mp, a Settingsben 5-20 mp (DECISIONS 53).
- Avatar: HeyGen, a user kulcsával, listából választva, előnézettel (DECISIONS 47).

## Ami már megvan (2026-09-30)

- Zárás szerep a könyvtárban: `cta-close` (felhívás és gomb), `logo-brand-close`
  (név a végén), `runner/gates/scenes/roles.mjs`.
- A script írásakor a CTA szövege és linkje a Settingsből vagy a Brief Cardból
  jön (`runner/gates/script/`).

## Zoltantól kell (még nincs meg)

- A 15 alap kulcsszó és a komment-CTA pontos működése.
- A visszatérő szegmensek: hol legyenek (eleje, vége, közbe), és a feltöltött
  saját videó hogyan illeszkedjen (vágás, hang).
- A végképernyő tartalma a 20 mp alatt.

## A Brand és a Mozgás körből kész (2026-10-04, DECISIONS 72-74)

- Közös keret: `app/src/lib/wizard/WizardShell.svelte`; minta a
  `app/src/lib/motion/MotionWizard.svelte` és a `brand/BrandWizard.svelte`.
- Identity-szintű JSON az Identity mappájában (mint a `motion.json`), runner
  parancsok `*-state` és `*-save` mintára (`runner/main.mjs`), a Rust magban
  a parancs-lista (`app/src-tauri/src/runner.rs`); az Identity export,
  import és Duplicate a teljes mappát viszi.
- Valódi mintavideó-előnézet: `runner/motion/preview.mjs` (draft render,
  lejátszó a varázslóban), nehéz munkaként a Jobs sorban (`jobs.rs`).
- Az átmenet-beillesztés és a háttér-darabolás: `runner/gates/build/
  assemble.mjs` `motionPlan`; a visszatérő szegmensek a profil átmenetével
  kapcsolódhatnak, a végképernyő alatt a háttér folytatódhat.
- A zárás szerep (cta-close, logo-brand-close) ide tartozik; a Mozgás
  varázsló nem mutatja. Zoltan: a logo-brand-close szinte biztosan nem kell.
- A HyperFrames katalógusban (hyperframes.heygen.com/catalog) CTA-hoz illő
  elemek is vannak (például "Logo Outro", social follow kártyák a blocks
  között); ugyanaz a registry, rögzített commitról.

## Megbeszélés, 1. kör (2026-10-05): Comment Routing

Zoltan leírása ebben a chatben: a CTA varázsló alapelve a **Comment Routing**
(komment = lead hőmérséklet). A néző egy kulcsszót kommentel, és a kulcsszó
hőmérsékletének megfelelő landinget kapja. Az app **nem** köt CRM-et, nem figyel
YouTube URL-t, nem ad linket: ez a vidrev.app dolga. Az app csak a kulcsszó-logikát
állítja be ugyanúgy, mint a vidrev, hogy egységes legyen a rendszer. Kód még nincs,
előbb Zoltan válaszai a lenti kérdésekre.

### Tények (ellenőrizve 2026-10-05)

- A vidrev repó: `github.com/YogiZoli/c2c-saas` (élő: vidrev.app). A katalógus:
  `src/lib/keyword-catalog.ts`, kulcsszó, hőmérséklet és "gets" (mit kap a néző):
  - Cold (wants a free resource): GUIDE (a free guide), CHECKLIST (a checklist),
    TEMPLATE (a template), PDF (a free PDF), START (where to start)
  - Warm (wants to learn more): TRAINING (a free training), WORKSHOP (a workshop
    seat), WEBINAR (a webinar seat), COURSE (course details), SURVEY (a short survey)
  - Hot (ready to buy): TRIGGER (a link to buy now), CALL (a call with you), BUY
    (a link to buy), APPLY (an application), ACTION (the next step)
  - Alap: GUIDE. A DOWNLOAD már nincs benne (a régi commentclient #96 vezette ki).
- A vidrev UI (`src/app/app/campaigns/KeywordPicker.tsx`): soronként egy
  hőmérséklet, a sor halványan színezett (surface 40%), a kártya erősebben (70%),
  a kiválasztott kártya "lélegzik" a hőmérséklet színében. Színek
  (`src/app/globals.css`): Cold #2E6FE0 / felület #E7EFFC / szöveg #1D4F9C;
  Warm #E5A400 / #FBF2DD / #6B4E00; Hot #D92D20 / #FDECEA / #A5161B.
  Saját kulcsszó: "coming soon" az Advanced alatt. Elírásokat (GUDIE) a vidrev
  magától kezel.
- A vidrevben a kampány lehet csatorna-szintű vagy egy videóra szóló; több
  kulcsszó egy kommentben: a magasabb hőmérséklet nyer (Q-10b). Statikus link
  kampányonként és videónként a leíráshoz és a kitűzött kommenthez (P5-01).
- Az app scriptje ma két CTA-helyet ismer: `ownershipCta` (a legértékesebb
  szakasz után, kb. a közepén) és `own.cta` (a végén), mindkettő "link a
  leírásban" jellegű (`runner/gates/script/prompt.md`).
- DECISIONS 35 azért vette ki a komment-CTA-t, mert a user oldalán nincs mögötte
  automatizmus. DECISIONS 51 visszahozta, márkanév említése nélkül.
- A tiltott-nevek teszt a "hot" szót önmagában nem tiltja, csak egy harmadik fél
  módszer-nevét, amiben szerepel. A Cold, Warm, Hot címkék rendben vannak.

### Kérdések Zoltanhoz, Claude javaslatával

K1. A 15 kulcsszó a vidrev fenti listája, angolul, nagybetűvel, a "gets"
    szövegekkel együtt? Javaslat: igen, egy teszt rögzíti.
K2. Nem angol videóban is angol marad a kulcsszó (például magyar videóban
    "írd be kommentben, hogy GUIDE")? Javaslat: igen, mert a vidrev ezt keresi; a
    kiejtést a Szótár kezeli.
K3. Három mód: **Routing** (alap: Cold, Warm, Hot), **Egy kulcsszó**, **Nincs
    komment-CTA**. Az "egy, kettő vagy három" az egy-hőmérsékletes videóban a
    helyek számát jelenti, vagy különböző kulcsszavakat is (például GUIDE és
    CHECKLIST egy videóban)? Javaslat: egy kulcsszó, 1-3 helyen.
K4. Hely a script szerkezetéhez kötve, százalék nélkül: **Eleje** = az OPEN
    ígérete után (kb. 20-60. mp, nem 0:00), **Közepe** = a legértékesebb szakasz
    után (ahol ma az `ownershipCta` van), **Vége** = az OWN-ban, a végképernyő
    előtt. A CTA-k száma a bekapcsolt helyek száma (0-3), a "hány CTA" kérdés így
    elmarad. Az időbélyeget az app pontosan tudja (mondat-időzítés).
K5. Routingnál a hely és a hőmérséklet kötött (Eleje Cold, Közepe Warm, Vége
    Hot), egy helyet ki lehet kapcsolni, de felcserélni nem? Javaslat: kötött.
K6. Mit kap a néző: a mondat a "gets" szövegből épül ("comment GUIDE and I'll
    send you the free guide"). Kulcsszavanként egy opcionális saját sor a
    konkrét ajánlathoz ("a 7 lépéses YouTube ellenőrzőlista"), üresen a vidrev
    "gets" szövege. Javaslat: igen.
K7. Szint: Identity-szintű alap a varázslóban (`cta.json`, mint a `motion.json`),
    videónként felülírható az 1. kapuban (a felülírás nullázza a későbbi
    kapukat). Javaslat: igen.
K8. A képernyőn (2. szabály): amikor elhangzik, a kulcsszó látszik. Eleje és
    közepe: rövid sáv a futó jelenet alján, vagy külön rövid jelenet? Vége: a
    `cta-close` mutatja. Szín a videóban: a user brand színe, nem a hőmérsékleté
    (a néző nem lát "cold" feliratot). Javaslat: sáv és brand szín; a sávot a
    HyperFrames registryből kell választani, ezt Claude megnézi.
K9. Ki válaszol a kommentekre? A varázsló egy mondattal jelezze, hogy a
    kulcsszavas kommentekre valakinek válaszolnia kell (kézzel vagy egy
    eszközzel). Említheti az app a vidrevet (DECISIONS 51 szerint nem)?
K10. A mai "link a leírásban" CTA (Settings CTA szöveg és landing URL) marad
    negyedik módként, vagy megszűnik? Javaslat: marad, mert ehhez nem kell
    válaszoló eszköz.
K11. Hatókör: a fenti "Zoltantól kell" visszatérő szegmensek (intro, outro,
    saját videó, avatar) ebben a körben? Javaslat: nem, a v1 csak Comment Routing;
    a végképernyő marad (20 mp, DECISIONS 53), a Hot CTA közvetlenül előtte.
K12. `logo-brand-close` kikerül a könyvtárból? Javaslat: igen.
K13. Előválasztás vagy lüktetés: Zoltan kérése, hogy amíg nincs választás, a
    kulcsszavak lüktessenek. A vidrevben a GUIDE eleve ki van választva, és a
    kiválasztott lélegzik. Javaslat: a varázslóban első nyitáskor nincs
    előválasztás, a sorok lüktetnek (±2%, MOTION.md); ha a varázsló soha nem fut,
    az app alapja GUIDE, WEBINAR, CALL (ezt Zoltan erősítse meg vagy cserélje).
K14. Saját kulcsszó: Claude véleménye: a v1-ben nem. A vidrev is "coming soon"-nal
    jelzi, a 15 elem átlátható, mérhető, a hőmérséklet csak ezekhez ismert.

### Claude javaslata: hozzáadás és elvétel

Hozzáadás:
- Render után "Copy pinned comment" és egy leírás-sor a kulcsszóval (a fejezetek
  mellett). A vidrev statikus linkje ide illik, az app csak a szöveget adja.
- A videó mellé `comment-keywords.txt`: kulcsszó, hőmérséklet, időbélyeg, mit
  kap. Ebből állítja be a user a válaszoló eszközt.
- Gépi ellenőrzés a scriptben: a kulcsszó szó szerint, nagybetűvel elhangzik a
  saját helyén, máshol nem.
- Előnézet: a három CTA-mondat szövegként, és állókép a kulcsszó-sávról (nem
  teljes mintavideó).

Elvétel:
- Százalékos hely, "hány CTA" külön kérdés, saját kulcsszó, hőmérséklet-szín a
  videóban, `logo-brand-close`, minden CRM és GoHighLevel kötés, landing URL a
  komment-módban.

### Zoltan válaszai (2026-10-05, ugyanebben a chatben)

- K1: igen, a teszt rögzíti a 15 kulcsszót a "mit kap" szövegekkel.
- K2: igen, angol marad; fordítás csak akkor, ha a vidrevben is lesz.
- K3: félreértettem. Az alap: 1 videó = 3 különböző kulcsszó, GUIDE eleje
  (cold), COURSE közepe (warm), TRIGGER vége (hot). Kevesebb is lehet (0, 1,
  2), a szám 0-3. Kevesebbnél előbb a közepe esik ki; egynél a user választ.
- K4: igen, az ígéret után.
- K5: nincs megkötés: bármelyik helyen bármelyik kulcsszó, ugyanaz többször.
- K6: igen, saját "mit kap" szöveg kulcsszavanként.
- K7: igen.
- K8: saját jelenet (B), a sáv nem kell. A gomb színe a hőmérsékleté.
- K9: a vidrev neve nem kerül az appba (független brand).
- K10: a link csak a leírásba; a narráció nem mondja ki, a képen sincs.
- K11: a visszatérő szegmensek külön prompttal jönnek (Zoltan).
- K12: igen, a logo-brand-close kikerül.
- K13: nincs előválasztás az első nyitáskor, a kulcsszavak lüktetnek; az
  alap GUIDE, COURSE, TRIGGER (Zoltan megerősítette).
- K14: nincs saját kulcsszó.
- A pinned comment és a `comment-keywords.txt`: Zoltan külön promptot ad.

## Megvalósítás (2026-10-05, DECISIONS 75)

Runner:
- `runner/cta/catalog.mjs`: a 15 kulcsszó, a három hőmérséklet színekkel,
  a helyek, az alap (GUIDE, COURSE, TRIGGER), helyek a szám szerint.
- `runner/cta/profile.mjs` és `runner/schema/cta-profile.schema.json`:
  `<identity>/cta.json` (`slots`, `offers`), `ctaPlan`, `videoPlan`.
- `runner/main.mjs`: `cta-state` (a profil, az alap, a lehetőségek és a
  look a still előnézethez), `cta-check`, `cta-save`; a `write-script`
  `input.cta`-ban kapja a videó saját választását; a `load-project`
  visszaadja a script `commentCalls`-ját.
- Script kapu: `buildData` `commentCalls`, a landing CTA mindig null;
  `open.cta` új mező; `commentCallIssues` ellenőrzés; a `script.json`
  `commentCalls` mezőt kap.
- Hang kapu: `speakable` (a kulcsszó sima szóként a hangnak).
- Jelenet kapu: `callSentences` (a CTA-mondat a felvett szövegben),
  `checkScenes` saját `cta-close` jelenetet kér, a gomb a kulcsszó; a
  jelenet `call` mezőt kap.
- Build: `callColor` (a hőmérséklet színe 4,5:1-re igazítva), a jelenet
  `--brand`-je.
- Tesztek: `runner/cta.test.mjs` (7), az e2e-ben egy CTA-jelenet buildje.

App:
- `app/src/lib/cta/`: `KeywordPicker` (3 színes sor, lüktetés,
  lélegzés), `CallsEditor` (szám 0-3, helyek, választó), `CallsPreview`
  (idővonal, mondatok, still), `CtaWizard` (3 lépés), `CtaPage`
  (Settings, Identity, CTA), `VideoCalls` (1. kapu, "Change for this
  video").
- `SceneGate`: a CTA-jelenet jelölése, csere nélkül.
- UI próba: `scripts/ui-mock` (`cta-state.json`).

## Újrahasznosítható szegmensek: megbeszélés (2026-10-05)

Zoltan kérése: egyszer felvett, legfeljebb 30 mp-es klipek (például teljes
képernyős avatar: "Comment GUIDE below"), kulcsszóhoz kötve, eleje, közepe
vagy vége helyre, duplikáció nélkül, a per-videó avatarral nem ütközve,
"previously selected" emlékezéssel, Identity-nként (csatorna, avatar).

Claude javaslata:
- Egy helyet vagy a narrátor tölt ki (CTA-mondat és `cta-close` jelenet),
  vagy a saját szegmens, soha nem mindkettő. Helyenként: Off, Narrator, My
  segment. Ha szegmens van ott, a script arra a helyre nem ír CTA-mondatot.
- A szegmens a kulcsszaván keresztül választható: a helyre választott
  kulcsszóhoz tartozó szegmensek jelennek meg, így a klipben elhangzó és a
  hely kulcsszava nem térhet el.
- Szegmens-könyvtár Identity-nként: fájl (MP4), kulcsszó (kötelező), név,
  legfeljebb 30 mp. Kulcsszavanként legfeljebb 3, a több közül alapból a
  legrégebben használt (váltakozás).
- Beszúrás szakaszhatáron: eleje = az OPEN után, közepe = a legértékesebb
  szakasz után, vége = az OWN után. A narráció ott szünetel, a klip a saját
  hangjával szól, a zene halkabban megy tovább. A per-videó avatar csak a
  narráció alatt látszik, a szegmens alatt nem, így nem ütköznek.
- Forrás: feltöltött MP4, vagy az appban HeyGennel készítve (a user
  kulcsával, kreditbe kerül).
- Hiány a régi döntéshez képest: a YouTube végképernyő (DECISIONS 53, alap
  20 mp) nincs megvalósítva, a videó az utolsó mondattal véget ér. Javaslat:
  a végére 20 mp-es farok (az utolsó jelenet vagy a vége-szegmens tart, a
  zene lecseng).

Zoltan válaszai (2026-10-05): S1 igen (szakaszhatár), S2 igen (legfeljebb 3,
váltakozva), S3 igen ("previously selected"), S4 mindkettő (feltöltés, hogy a
HeyGen kredit elfogyása se állítson meg semmit, és HeyGen az appban), S5
igen, a legegyszerűbb megvalósítás, S6 nincs külön javasolt hely, a feltöltött
és a generált szegmens ugyanúgy kezelt, S7 igen (a farok más, mint a
vége-CTA), S8 előbb a szegmens, utána a farok. DECISIONS 78.

Megvalósítás:
- `runner/cta/segments.mjs` (könyvtár, legfeljebb 30 mp és 3 kulcsszavanként,
  váltakozás), `runner/cta/make.mjs` (HeyGen: `segment-voice`, majd
  `segment-make`), `runner/cta/profile.mjs` (`modes`, `segmentIds`,
  `endScreen`, `cta-last.json`), Rust `import_segment`.
- Script kapu: a szegmenses helyre nincs CTA-mondat; `script.json`
  `segmentCalls` (a klip a projekt `segments/` mappájába másolva) és
  `endScreen`.
- Hang kapu: `insertAfter`, a szegmens hangja és a farok csendje a blokkok
  közé; `voice.json` `inserts` és `endScreen`.
- Jelenet kapu: `gapsOf`, a hosszellenőrzés nem számolja őket.
- Build: `segmentClips`, néma teljes képes videó a 5. sávon; `covered.json`.
- App: `SegmentsManager` (Settings, Identity, CTA), végképernyő-választó,
  `CallsEditor` Narrator vagy My segment, az 1. kapuban a szegmens kiválasztása.
- Tesztek: `runner/segments.test.mjs` (5), az e2e-ben egy szegmens a buildben
  és a renderben.
