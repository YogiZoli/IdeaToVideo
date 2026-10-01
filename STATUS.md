# STATUS: IdeaToVideo

Frissítve: 2026-10-01 (Identity, Mentés és Napló kész)

End goal: helyben telepíthető asztali app, ami egy YouTube videót végigvisz ötlettől kész MP4-ig, a user saját gépén és kulcsaival, a HyperFrames motorral és Zoltan blokk-könyvtárával.

Fázisok (PRD 13): 0 pipeline Node-ra (**kész**) · 1 Tauri váz, onboarding, config és kulcstár, LLM (**kész, PR #2**) · 2 teljes 5 kapus menet a UI-ban · 3 pilot · 4 kiadás.

## Hol tartunk

**Az 1. fázis kész**, a kimenete megvan: telepíthető app, ami scriptet ír. Zoltan a
saját gépén telepítette, végigment az onboardingon a saját Gemini kulcsával, és
írt és jóváhagyott egy scriptet (2026-09-30).

- `runner/`: Node sidecar, 38 teszt (`npm test`), új: `suggest-channel`.
- `app/src-tauri/`: Rust mag (config, OS kulcstár, sidecar, CSP, átköltöztetés a
  Studio névről), 15 teszt (`cargo test`).
- `app/src/`: Svelte 5 UI, onboarding 12 lépés, Settings, Projects, 1. kapu,
  `ITV-...` hibakódok. Kinézet: design-system "Shine" tokenek build közben.
- `scripts/fetch-sidecars.mjs`: Node 24.16.0, rögzített SHA256.
- CI: `.github/workflows/build.yml`, Windows + macOS, csak PR-re és kézzel.
- Mérések: `docs/ffmpeg.md` (döntés: DECISIONS 43), vidIQ (DECISIONS 42).
- Telepítő: `IdeaToVideo_0.1.0_x64-setup.exe` (25 MB, aláíratlan).

A kézi tesztben talált hibák mind javítva: runner útvonal (`\\?\`), modellnév,
Settings megnyitás, üres kulcsteszt, eltűnő hibaüzenet.

## Következő lépés

**2. fázis, branch `phase-2`.** Terv: `docs/phase-2-plan.md`, a Mozgás varázsló
specifikációja: `docs/motion-wizard.md`. A fázis közben irányt váltott: **D út**
(DECISIONS 48-54): az app saját könyvtárat kap a HyperFrames registry
komponenseiből, és saját pipeline-kódot.

Kész (2026-09-30):
- Névigazítás; CI PR-en csak Windows, a macOS kézi (Claude indítja).
- `engine/`: saját render lánc (hyperframes 0.8.22, gsap 3.14.2, lockfile),
  `scripts/fetch-engine.mjs` (154 MB).
- `library/components.json` + `scripts/fetch-library.mjs`: registry komponensek
  (titlecard-lockup, per-word-rise, kinetic-type-swap, count-up, chart-story,
  grid-card-assemble, vox-annotate, cta-close), rögzített commit, SHA256 lock,
  helyi GSAP. Témaváltozóik: `--bg`, `--fg`, `--brand`, `--accent`,
  `--accent-2`, `--font-display`.
- ffmpeg sidecar (Windows BtbN 8.1.2, macOS ffmpeg-static 6.1.1) képesség-
  ellenőrzéssel.
- Chrome az app helyi adatmappájába (`runner/tools.mjs`), "Download now" sáv.
- Hang kapu: ElevenLabs és Gemini TTS (mondatonkénti időzítés), hangminták,
  saját zenefájl, ElevenLabs Music, keverés -14 LUFS-re, UI lejátszókkal.
- Saját mondattábla (`runner/timing/sentences.mjs`).
- lint + check és render runner parancs.
- Telepítő utoljára 100 MB (2026-09-30, a 2. kapuval).

- **Registry-próba kész** (2026-09-30): `runner/gates/build/assemble.mjs` a
  jelenet-táblából és a `sentences.json`-ból megírja a `build/`-et, jelenetenként
  a saját hosszára illesztett komponens-másolattal. `scripts/phase2/pilot.mjs`:
  15 jelenet, 50 mp, két téma, lint + check 0 hiba, render 112 mp (kb. 2,2 perc
  gépidő videópercenként). Találatok: a HyperFrames minden változót CSS-változóként
  is kiír (az `accent` ezért nem mehet be változóként, a téma `--itv-*` néven
  él); a komponensek további téma-tokeneket olvasnak (`muted`, `surface`,
  `border`, `radius`, három betű).
- **Könyvtár: 15 komponens** (DECISIONS 55), mondat-szerepek szerint.
- Telepítő a 2. kapuval: Zoltan telepítette, a hang és a zene rendben (2026-09-30).
- Tesztek: 103 Node, 17 Rust, zöld.

- **3. kapu kész** (2026-09-30): `runner/gates/scenes/`, az AI a 15 komponensből
  tervez szerepek szerint (`roles.mjs`), ellenőrzés, egy javító hívás, csere
  ugyanabban a szerepben, Custom szöveg, hiányzó szerepek naplója. Határok:
  DECISIONS 57. UI: `SceneGate.svelte`. Valódi LLM-mel Zoltan próbálja ki.
- **4. kapu kész** (2026-09-30): `runner/gates/review/`, build + lint + check +
  kontakt lap (jelenetenként egy kocka a vége előtt), jóváhagyás, utána render
  az appból (minőség, haladás, lejátszó, "Show in folder"). UI: `ReviewGate.svelte`.
  E2E a runner parancsokkal: build 27 mp, render 110 mp egy 50 mp-es videóra.

- **13. és 17. kész** (2026-09-30, a 20:17-es telepítőben még nincs benne):
  render után `.srt` felirat és YouTube fejezetlista a videó mellé
  (`runner/gates/render/export.mjs`, "Copy chapters"); "Finish on Autopilot"
  gomb, ami a hátralévő kapukat Recommended módban végigviszi a renderig. A
  Custom szerkesztés (script, jelenet-tábla) mostantól nullázza a későbbi kapukat
  (SPEC 6).

- **Az első teljes videó az appból** (Zoltan, 2026-09-30): a visszajelzés és
  állapota: `feedback/2026-09-30/NOTES.md`. Javítva: üres jelenetvégek,
  keskeny betűk, vox-annotate ki (14 komponens), 0,6 mp szünet, -14 LUFS
  (DECISIONS 58).
- Varázslók indító leírásai: `docs/wizards/` (brand, motion, cta).

- **Kész még (2026-09-30), a feedback nyomán is:** haladásjelző és ébren
  tartás; a 4. kapu magyarázata és állóképei; videó-kinézet a brand presetből
  (Blue Professional, Warm paper, DECISIONS 59); zene: ElevenLabs Music, saját
  fájl, kulcs nélkül nincs (DECISIONS 60, 62); 5. kapu: HeyGen avatar a saját
  narrációval (DECISIONS 61, 63); vidIQ kulcsszó-ötletek (DECISIONS 64);
  ElevenLabs saját hangok (v2); feliratok és fejezetek; Autopilot; e2e teszt
  (`npm run e2e`, 11/11). Tesztek: 103 Node, 17 Rust.

- **Kész még (2026-10-01), a 3. feedback kör után:** Settings összeomlás
  javítva (bindable fallback); projekt útvonal rögzítve a nézetben; avatar
  előnézetek párhuzamosan, százalékkal; új hangnál a régi jelenet-tábla
  törlődik, jóváhagyás csak illő táblára; Gemini 503-nál a másik Gemini
  modell; avatar elhelyezés: kivágott (HeyGen WebM, átlátszó háttér), kör,
  kártya, teljes kép; négy sarok, három méret; alap a Settingsben, videónként
  az 5. kapuban, átváltás költség nélkül (DECISIONS 65); telepítő ikon.
  Tesztek: 106 Node, 17 Rust, e2e 11/11. Utolsó telepítő: commit 862344b.
- **UI próbakörnyezet:** `scripts/ui-mock/` (a leírás a `prepare.mjs` fejében):
  az app felülete sima böngészőben, ál-Tauri maggal, ami minden hívást naplóz.
  Így került elő a Settings összeomlás. UI hibánál ezzel kezdd.

- **Hibátlanítás, 1. kör (2026-10-01, commit 833dbeb):** Settings hat
  aloldalra bontva, aloldalanként a beállító varázsló újrafuttatható;
  haladásjelző: nem áll meg 95%-on, óra, részlépés szavakban, mi fogy és mi
  nem, ne altasd el a gépet; app bezárásakor megszakadt lépés "failed" lesz.
  Állapot: `feedback/2026-10-01/NOTES.md`. Tesztek: 111 Node, 17 Rust, e2e 11/11.

- **Identity kész (2026-10-01)**, terv: `docs/identity.md`, DECISIONS 67.
  Két szint: App (`config.json` schema 2) és Identity
  (`identities/<id>/identity.json`); ONE Videos az Identity mappájában;
  kulcs-öröklés (App kulcs, az Identity saját kulcsa felülírja); választó a
  felső sávban (New, Duplicate, Import, Identity settings); Settings két
  csoportban; Duplicate a saját kulcsokkal (jelölő); Delete (a videók
  maradnak); **Identity export és import** zipben, kulcs nélkül (a mintázó
  üzlet, DECISIONS 71); Solo és Agency egy helyen (`edition.rs`, ma Agency);
  Jobs jelző, render-sor (1), egy kulcson egy munka; átállás a mai
  beállításból: "My Identity". Tesztek: 116 Node, 34 Rust, e2e 13/13; UI
  próba a `scripts/ui-mock`-ban (`?fresh=1`, `?tier=solo`, `?one=1`).

- **Mentés (Backup) és Napló kész (2026-10-01)**, terv: `docs/backup.md`,
  DECISIONS 66. Mentés: Settings, App, Backup (mappa, felhő-mappa
  javaslat, szint 1-4 méretbecsléssel, automatikus mentés jóváhagyás és
  render után, "Back up now"); ONE Videónként saját szint és állapot;
  "Restore from backup" a listában; első indításkor "Restore from a backup"
  (App beállítás és minden Identity, kulcs nélkül). Fájlnevek Zoltan
  szabálya szerint. Napló: `AppData/Local/app.ideatovideo.desktop/logs/*.jsonl`,
  minden kattintás, nézet, választás, hívás, runner lépés (újrapróbálás,
  modellváltás), hiba; kulcs és tartalom nélkül; soha nem törlődik magától.
  Összefoglaló: `node scripts/log-summary.mjs`. Javítva még: a jelenet-tábla
  sikertelen újratervezése után a korábbi, illő tábla jóváhagyható; "ONE
  Video" mindig egyes számban. Tesztek: 124 Node, 39 Rust, e2e 16/16.

## Sorrend innen (Zoltan, 2026-10-01): külön chatek

1. **Hibátlanítás: kész** (2026-10-01).
2. **Identity: kész** (2026-10-01). Zoltan kipróbálta: átnevezés, Export,
   Import, Duplicate, Delete rendben. A saját kulcs és a futó render melletti
   váltás próbája egy barátnál.
2b. **Mentés és Napló: kész** (2026-10-01, Zoltan döntése szerint a
   varázslók előtt). Zoltan próbája az új telepítővel következik.
3. **Brand varázsló** (Opus 5.5, High): `docs/wizards/brand.md`, benne a helyi
   betűk és a szótár (DECISIONS 68).
4. **Mozgás varázsló** (Opus 5.5, High): `docs/wizards/motion.md`. Első
   feladat a `docs/motion-wizard.md` átírása a D útra, Zoltan jóváhagyása,
   csak utána kód.
5. **CTA varázsló** (Opus 5.5, High): `docs/wizards/cta.md`. Zoltantól kell a
   15 alap kulcsszó és a komment-CTA működése.
6. ~~Mentés (Backup)~~: kész, lásd 2b.

Utána a **fázis vége**: Mac build (`gh workflow run build -f platforms=both`, a
jóváhagyott változaton), STATUS, DECISIONS, SPEC frissítve, Drive tükör, PR
`phase-2` a main felé, Zoltan jóváhagyása, merge.

**Nyitott, a 14. lépéshez: betűk.** A HyperFrames minden `@font-face` nélküli
betűcsaládot a Google Fonts-ról tölt le (a Georgiát is EB Garamondra cseréli),
és a komponensek tartalékként `Inter`-t írnak. Megoldás: helyi OFL betűfájlok
`@font-face`-szel a buildben, így nincs hálózati hívás és idegen betű.

## Zoltan döntésére vár

0. A mintázó üzlet: a válaszok a DECISIONS 71-ben (2026-10-01). Zoltan
   megerősítésére vár: a minta-típusok sorrendje (előbb módszer-, utána
   niche-minta) és az átmeneti ügynökségi szakasz keretei (3 hónap, 3-5
   ügyfél, ugyanaz a minta, záró dátum).

1. A kulcsszavas komment-CTA és a CTA varázsló részletei: Zoltan később adja.
2. A `docs/motion-wizard.md` 2. változata (a D út szerint átírandó,
   jóváhagyásra).
3. A v1 videótípusa: explainer? Zoltan még nem döntött, a DECISIONS-be még nem
   kerül.
4. A teljes registry (234 komponens): érvek a DECISIONS 56-ban, Zoltan később
   átnézi.

## Hogyan indul egy új session

A `docs/SESSION-PROMPT.md` promptja, a táblázat szerinti modellel és effort-tal.

Forrás: Drive `10_HyperFrames_Shippability_and_Documentation_Review`
https://docs.google.com/document/d/1fOLZnrikPn-A_2tl2XNZPJnsdO9AOd1XpUY2u4VF4_4/edit

Drive tükör: https://docs.google.com/document/d/19PougSc18s97PBKP6mr_CnQUnEulNgkfq1eckCPDqJI/edit
