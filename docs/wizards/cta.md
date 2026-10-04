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
