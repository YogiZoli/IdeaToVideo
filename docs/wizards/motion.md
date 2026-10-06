# Mozgás varázsló: megvalósítás (2. fázis, STATUS "Sorrend innen" 4. pont)

Állapot: kész (2026-10-04), DECISIONS 74. A specifikáció (mit és miért):
`docs/motion-wizard.md` 3. változat. Ez a fájl a megvalósítás: fájlok,
séma, registry-elemek, előnézet, mérés, tesztek.

## 1. Cél

Identity-nként egy Mozgás profil (`identities/<id>/motion.json`), amit minden
ONE Video örököl. Ugyanaz a mindset, mint a Brandnél: a HyperFrames saját,
tesztelt, karbantartott elemeiből dolgozunk, rögzített verzióval, SHA256-tal.
Saját mozgást nem írunk.

## 2. Fájlok

| Hol | Mi |
|---|---|
| `runner/motion/transitions.mjs` | hangulatok és energiák (overview.md), átmenet-terv a narratív pozíciók szerint, a registry receptjeinek kitöltése (a HyperFrames injektor módszere), shader-config |
| `runner/motion/stage.mjs` | háttér-darabok (5-15 mp), háttér-választás (aurora csak sötét), kamera (push, jitter) |
| `runner/motion/profile.mjs` | séma-ellenőrzés, mentés és betöltés, ajánlás a Brandből (open-design tokenek), a varázsló választásai |
| `runner/motion/preview.mjs` | a valódi előnézet: 6 jelenet, 18 mp, draft render |
| `runner/schema/motion-profile.schema.json` | `motion-profile/1` |
| `runner/gates/build/assemble.mjs` | `motionPlan`, `sectionStartsOf`, `transparentGround`; profil nélkül a régi kimenet bájtra |
| `runner/gates/build/index.mjs` | lint, és mozgásos buildnél `check --json` az átmenet-ablakok kezelésével |
| `runner/gates/scenes/index.mjs` | a kikapcsolt komponensek kimaradnak (AI, ellenőrzés, cserelista) |
| `runner/main.mjs` | `motion-state`, `motion-check`, `motion-save`, `motion-preview`; a `look.motion` a buildhez és a 3. kapuhoz |
| `app/src-tauri/src/runner.rs`, `jobs.rs`, `lib.rs` | a négy parancs; az előnézet nehéz munka (egy render egyszerre); a lejátszó látja a `motion-preview` mappát |
| `app/src/lib/motion/MotionWizard.svelte`, `MotionPage.svelte` | a varázsló és a Settings, Identity, Motion oldal |
| `scripts/phase2/motion-measure.mjs` | a mérés (8. pont) |
| `scripts/ui-mock/` | a négy parancs ál-válasza |

Az Identity export, import és Duplicate a teljes mappát viszi, így a
`motion.json` is utazik (Rust teszt).

## 3. Registry-elemek (rögzített commit, SHA256)

Forrás: `github.com/heygen-com/hyperframes`, commit
`9a27b9f9349b43b9fd194a95ace830d7cbe38b42` (ugyanaz, mint a 14 komponensé),
Apache-2.0. A `scripts/fetch-library.mjs` tölti le build közben
(`library/components.json` "motion"), a `library/library.lock.json`
ellenőrzi. A repóba semmi nem másolódik.

| Elem | Útvonal a registryben | Mire |
|---|---|---|
| transitions.json | `skills/faceless-explainer/scripts/lib/transitions.json` | 5 CSS átmenet GSAP receptje, a maximum hossz |
| overview.md | `skills/hyperframes-animation/transitions/overview.md` | hangulat- és energia-tábla, narratív pozíciók (a tesztek minden nevet ellenőriznek benne) |
| aurora-drift | `registry/components/aurora-drift/` | háttér, csak sötét kinézet |
| grain-field | `registry/components/grain-field/` | háttér, pontmező |

Shader-átmenetek: `@hyperframes/shader-transitions` 0.8.22 (MIT), az
`engine/package.json`-ban a motor mellett, ugyanazzal a verzióval; a build
a `dist/index.global.js`-t másolja a videó mellé. A teszt ellenőrzi, hogy
a 14 név a csomagé.

## 4. motion.json

```json
{
  "schema": "motion-profile/1",
  "transition": { "mood": "premium", "primary": "blur-crossfade", "accent": "cross-warp-morph", "energy": "calm", "where": "every" },
  "background": { "type": "plain", "vars": {} },
  "camera": { "move": "off" },
  "scenes": { "off": ["headline-slam"], "style": { "marker-highlight": { "style": "underline" } } }
}
```

- `transition.primary`, `accent`: `cut`, a registry öt neve vagy a 14
  shader. `energy`: a hossz (Calm 0,65 mp, Medium 0,4, High 0,25, az
  overview.md tartományainak közepe), legfeljebb 2 mp és a bejövő jelenet
  harmada. `where`: `every` vagy `sections`. `direction`: push-slide-nál.
- `background.type`: `plain`, `grain-field`, `aurora-drift`.
- `camera.move`: `off`, `jitter`, `push`.
- `scenes.off`: tiltó lista (egy később hozzáadott komponens alapból bent
  van), szerepenként legalább egy marad, a zárás szerep nem szerepelhet.
  `scenes.style`: csak `role: "style"` változók, `accent` és `exit` nélkül.

## 5. Előnézet

`motion-preview`: a Brand mintavideó öt jelenete és egy kiemelés (6 x 3 mp),
új szakasz a 4. jelenettől (hogy a kiemelt átmenet is látsszon), a user
kártyájával és a nem mentett profillal, draft minőségben renderelve a
`dataDir/motion-preview/` mappába, lejátszó a varázslóban. Kulcs nem kell.

## 6. Mérés (M1-M3, 2026-10-04)

`scripts/phase2/motion-measure.mjs`: a mintavideó (6 x 4 mp, 24 mp) minden
változattal, világos (blue-professional) és sötét kinézettel. A
render-idők ugyanazon a gépen, de mellette más munka is futott, ezért
nagyságrendet mutatnak, nem pontos százalékot.

Mind a 14 változat, világos és sötét kinézettel: lint és check 0 hiba.
Render-idő (24 mp-es videó, mp):

| Változat | Világos | Sötét |
|---|---|---|
| vágás (alap) | 44-46 | 44-49 |
| crossfade | 46 | 61 |
| soft blur (blur-crossfade) | 49 | 58 |
| push (push-slide) | 51 | 57 |
| zoom through | 47 | 51 |
| squeeze | 44 | 45 |
| shader: light leak | 70 | 72 |
| Premium (soft blur + morph shader) | 68 | 66 |
| Editorial (push + whip pan shader) | 67 | 63 |
| Dot field háttér | 91 | 84 |
| Aurora háttér | (világosnál sima) | 78 |
| kamera: push in | 52 | 45 |
| kamera: subtle jitter | 53 | 47 |
| minden együtt (Premium, Dot field, push in) | 84 | 84 |

A háttér-sorok az átlátszó talajjal mért második futásból valók, egyedül a
gépen. Az első futásban a háttér nem látszott (a jelenetek saját talaja
eltakarta), ebből jött a döntés (DECISIONS 74).

Összegezve, a varázslóban így áll: a CSS átmenetek és a kamera kb. ugyanannyi
(0-15%), a shader kb. másfélszeres, a háttér kb. kétszeres render-idő.
Világos kinézeten a sötétre épülő Aurora helyett sima háttér kerül a
videóba, a videó naplójába egy sorral.

## 7. Mit kap ebből a CTA varázsló

- A WizardShell-t és ugyanezt a mintát: Identity-szintű JSON, `*-state` és
  `*-save` runner parancs, export és Duplicate külön kód nélkül.
- A mintavideó renderelőjét (`runner/motion/preview.mjs`): a visszatérő
  szegmensek és a végképernyő előnézete ugyanígy készül.
- Az átmenet-beillesztést (`motionPlan`): a visszatérő szegmensek a profil
  átmenetével kapcsolódnak, nem saját váltással.
- A háttér-darabolást: a végképernyő (DECISIONS 53, 5-20 mp) alatt a háttér
  folytatódik.
- A zárás szerep (cta-close, logo-brand-close) a CTA varázslóé. Zoltan
  szerint a logo-brand-close szinte biztosan nem kell (2026-10-04); a CTA
  chat dönti el.

## 8. Tesztek

`runner/motion.test.mjs` (19), a Rust export-teszt bővítve, az e2e öt új
lépéssel (profil, előnézet, build a profillal, render, cserelista).
