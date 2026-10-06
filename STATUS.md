# STATUS: IdeaToVideo

Frissítve: 2026-10-06 (hibátlanítás: megbízható futás, DECISIONS 91)

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

- **Brand varázsló és szótár kész (2026-10-02)**, leírás: `docs/wizards/brand.md`,
  DECISIONS 72. Brand Identity Card Identity-nként (`brand/brand-identity-card.json`,
  generált `FRAME.md`); varázsló 7 képernyővel (Settings, Identity, Brand):
  galéria (11 HyperFrames preset és a Warm paper), logó világos és sötét
  (videóba nem kerül), színek olvashatóság-ellenőrzéssel és Fix gombbal,
  betűk, formák, név a képernyőn, valódi előnézet (mintavideó, 8-15 mp).
  18 helyi OFL betű (1,7 MB), mind a 10 tartalomnyelv betűivel; a render
  nem tölt le betűt (mérve). Szótár: Settings, Identity, Dictionary; a
  script prompt kapja, a gépi ellenőrzés az 1. és 3. kapuban jelez.
  Gemini 429-nél egyszer a másik Gemini modell. Közös varázsló-keret a
  Mozgás és a CTA varázslónak. Javítva még: a sikertelen jelenet-csere a
  videó `log.txt`-jébe is bekerül. Tesztek: 142 Node, 40 Rust, e2e 20/20.
- **Brand varázsló, második kör (2026-10-02)**, DECISIONS 73: Warm paper
  törölve; a galéria 163 kinézet (11 HyperFrames preset és mind a 152
  open-design stílus, "<márka> style" névvel, jogtisztán: csak tények,
  márkabetű helyett szabad betű); 35 helyi betű (2,8 MB); "Import
  tokens.css"; Export és Import Brand Identity Card. Zoltan előző próbája
  (a 6df985d telepítővel): a napló 0 hiba. Tesztek: 144 Node, 43 Rust, e2e
  21/21.
- **Mozgás varázsló kész (2026-10-04)**, DECISIONS 74, specifikáció:
  `docs/motion-wizard.md` 3. változat, megvalósítás: `docs/wizards/motion.md`.
  Identity-nként `motion.json`, minden ONE Video örökli. Minden a
  HyperFrames-é: 9 hangulat és 3 energia a transition overview-ból, 5 CSS
  átmenet a saját jegyzékéből, 14 shader a `@hyperframes/shader-transitions`
  csomagból (0.8.22), háttér-komponensek (Dot field, Aurora csak sötétben,
  átlátszó jelenet-talajjal), kamera a doktrína szerint (Off, Subtle
  jitter, Push in). Komponensek szerepenként, stílusukkal. Valódi előnézet
  (18 mp-es videó). Settings, Identity, Motion. Profil nélkül a build bájtra
  a régi. Zoltan próbája ezzel a telepítővel még nincs (a 2026-10-02-i második
  körös Brand telepítőt sem telepítette: a napló utolsó indítása az első
  körösé, 0 hiba).

## Sorrend innen (Zoltan, 2026-10-01): külön chatek

1. **Hibátlanítás: kész** (2026-10-01).
2. **Identity: kész** (2026-10-01). Zoltan kipróbálta: átnevezés, Export,
   Import, Duplicate, Delete rendben. A saját kulcs és a futó render melletti
   váltás próbája egy barátnál.
2b. **Mentés és Napló: kész** (2026-10-01, Zoltan döntése szerint a
   varázslók előtt). Utolsó telepítő: commit d2a83b1 (2026-10-01 23:29),
   benne a jelenet-tábla javítása (egy korábbi sikertelen csere vagy
   tervezés nem blokkolja a jóváhagyást). Zoltan próbája ezzel: mentés a
   `G:/My Drive`-ba, napló, és a "Zoltan Gero" Identity első videója.
   **Következő: 3. pont, Brand varázsló, új chatben** (a prompt a 2026-10-02-i
   chat végén; a munka első lépése a Zoltan próbájának napló-összefoglalója).
3. **Brand varázsló: kész** (2026-10-02), a szótárral és a helyi betűkkel
   (DECISIONS 72). Zoltan próbája az új telepítővel: Settings, Brand, Open
   Brand wizard végig, mentés, egy ONE Video újra a 4. kapuig; Settings,
   Dictionary; és a 2b-ből elmaradt mentés a `G:/My Drive`-ba (a naplóban
   nem volt nyoma, a config.json-ban nincs mentési mappa).
   A Brand körből nyitott kérdés nem maradt (DECISIONS 73).
4. **Mozgás varázsló: kész** (2026-10-04, DECISIONS 74). Zoltan próbája az
   új telepítővel: Settings, Identity, Motion, Open Motion wizard végig,
   Render preview, Save; egy ONE Video újra a 4. kapuig és renderig; és a
   Brand második köre (163 kinézet, Import tokens.css, kártya export és
   import). **Következő: 5. pont, CTA varázsló, új chatben** (a prompt a
   2026-10-04-i chat végén; Zoltan ott adja a pontos leírást).
5. **CTA varázsló: kész, első kör** (2026-10-05, DECISIONS 75, leírás és
   Zoltan K1-K14 válaszai: `docs/wizards/cta.md`). Comment Routing: a vidrev
   15 kulcsszava, alap GUIDE, COURSE, TRIGGER, 0-3 hely (eleje az ígéret
   után, közepe a legértékesebb szakasz után, vége a végképernyő előtt),
   bármelyik kulcsszó bárhol, saját "mit kap" szöveg, Identity-szintű
   `cta.json`, videónként az 1. kapuban. A CTA mondata saját `cta-close`
   jelenet, a gomb a hőmérséklet színében. A landing link csak a leírásba
   (K10). logo-brand-close kivezetve. Javítva még: a videó fő színe mindig
   olvasható (DECISIONS 76, Zoltan halvány rózsaszín jelenete). Tesztek: 171
   Node, e2e (a CTA-jelenettel).
   Ugyanebben a chatben még (2026-10-05): **publikálási adatok** a videó
   mellett (`publish.json`, séma `itv-publish/1`, és `comments.txt`, Export
   gomb, DECISIONS 77), **újrahasznosítható CTA-szegmensek** (feltöltés vagy
   HeyGen, kulcsszóhoz kötve, legfeljebb 30 mp, helyenként Narrator vagy My
   segment, "previously selected") és a **végképernyő farok** (alap 20 mp,
   DECISIONS 53 megvalósítva), DECISIONS 78; **"previously used" hang és
   avatar** Identity-nként (DECISIONS 79); Zoltan próbája után javítva
   (DECISIONS 80, `feedback/2026-10-05/NOTES.md`): üres állóképek, kilógó
   CTA-sor, script hossza, szegmens "auto", elemek a kimondáskor; második
   kör (DECISIONS 81). **Saját felvétel-könyvtár (B-roll)** Identity-nként,
   AI-leírással, vágásponttól induló, váltakozó darabokkal (DECISIONS 82);
   **Eleven v4** választható (83). Tesztek: 188 Node, e2e 31/31.
   Jelenet-tábla a 8 perces teszt után (DECISIONS 84). Tesztek: 188 Node,
   43 Rust, e2e 31/31. Utolsó telepítő: commit 5984811 (2026-10-05 18:06).
   **A UI kör kész, Zoltan próbájára vár** (2026-10-05, DECISIONS 85-90).
   - A ONE Video hat tabon (Script, Voice and music, Scenes, Avatar,
     Preview, Your video); központi munkalista, nincs dupla indítás;
     pontosabb haladásjelző; kártyás hang- és kétlépcsős avatar-választó;
     jelenet-javítás a Preview-ban; AI nélküli kiutak (saját script, Simple
     plan); Your video tab (Download, felhő-mappa, YouTube Studio a
     szövegekkel). DECISIONS 85-86.
   - Az app a tálcán él, az X nem lép ki (87).
   - Natural voice (humanizer) Off, Light, Strong, "Your own angle" (88).
   - AI-modell és effort lépésenként (Script, Scenes, Small texts), Change a
     tabokon; natív Claude csatlakozó az Anthropic SDK-val (89).
   - Stock kereső: terv kész, a pilot után (90).
   Tesztek: 204 Node, 43 Rust, e2e 33/33. Telepítő: commit 8ddcdd9
   (2026-10-05 23:46, 99 MB). Képek: `feedback/2026-10-05/ui-tabs/`.
   UI próba: `scripts/ui-mock` (`?stage=0..6`, `?slow=`, `?aifail=1`).
   **Hibátlanítás: kész** (2026-10-06, DECISIONS 91), a cél a megbízható
   futás és az átláthatóság. Stop gomb minden haladásjelzőn; folyamatfa
   (Windows Job Object), így a Stop, az őrkutya és a kilépés a Chrome-ot és
   az ffmpeg-et is leállítja; checkin 15 mp-enként (working, waiting,
   seems stuck), automatikus leállítás nélkül (DECISIONS 92);
   türelmes újrapróbálás (AI kb. 3 perc körökben, a sáv kiírja; hang és
   HeyGen hívásonként); nincs dupla fizetés (megőrzött hangblokkok, HeyGen
   megrendelések átvétele); két javító kör a scriptnél és a jelenet-táblánál,
   az ízlésbeli eltérés csak figyelmeztetés; lépésenként kiírva, lecsukhatod-e
   a gépet; alvás és csend jelzése; beragadt "Running" a mag tudása alapján;
   Autopilot folytatás megszakadás után; render állapot a projektben;
   felületi hibahatár; "Export diagnostics" zip. Tesztek: 210 Node, 47 Rust, e2e 33/33.
   Telepítő: commit afc0118 (2026-10-06 00:45, 99 MB), Zoltan próbájára vár.
   **Következő: Zoltan próbája** (a napló: `node scripts/log-summary.mjs`),
   utána a fázis lezárása (Mac build, STATUS, DECISIONS, SPEC, Drive tükör,
   PR a main felé).
   **Stock kereső: új terv, Zoltan döntésére vár** (DECISIONS 93,
   `docs/stock.md`): Pixabay és Coverr az első kör, az Unsplash és a Pexels
   kulcsra vár.
   **AI B-roll (generált klipek): terv, Zoltan döntésére vár** (DECISIONS 94,
   `docs/ai-broll.md`, benne a prompt egy új chathez).
   Később: az OpenArt kimarad;
   élő előnézet renderelés nélkül (K9 b, Zoltan még nem döntött);
   lokalizáció és fordítás (DECISIONS 86). A PDT import és a Translation
   Pack külön chatben a PDT repóban.
6. ~~Mentés (Backup)~~: kész, lásd 2b.

Utána a **fázis vége**: Mac build (`gh workflow run build -f platforms=both`, a
jóváhagyott változaton), STATUS, DECISIONS, SPEC frissítve, Drive tükör, PR
`phase-2` a main felé, Zoltan jóváhagyása, merge.

**Megoldva (2026-10-02, DECISIONS 72), a 14. lépéshez: betűk.** A HyperFrames minden `@font-face` nélküli
betűcsaládot a Google Fonts-ról tölt le (a Georgiát is EB Garamondra cseréli),
és a komponensek tartalékként `Inter`-t írnak. Megoldás: helyi OFL betűfájlok
`@font-face`-szel a buildben, így nincs hálózati hívás és idegen betű.

## Zoltan döntésére vár

Stratégia (nem az IdeaToVideo kódja, de a suite iránya): a Drive
`21_Strategy_Update_2026-10-02 (READ FIRST)` doksi, DECISIONS 71.

0. A mintázó üzlet: megerősítve (2026-10-02, DECISIONS 71 és a Drive 21-es
   doksi). Nyitva csak: az affiliate létra (97 vagy 297 USD-s GHL szint),
   "amelyik előbb jön".

1. ~~A kulcsszavas komment-CTA~~: kész (DECISIONS 75).
2. ~~A `docs/motion-wizard.md`~~: jóváhagyva és kész (DECISIONS 74).
3. A v1 videótípusa: explainer? Zoltan még nem döntött, a DECISIONS-be még nem
   kerül.
4. A teljes registry (234 komponens): érvek a DECISIONS 56-ban, Zoltan később
   átnézi. Javaslat a katalógus csoportjai szerint: DECISIONS 74 utolsó pont.
5. ~~A logo-brand-close~~: kivezetve (DECISIONS 75). Nyitott: a Brand
   varázsló "név a képernyőn" lépése eddig ezt mutatta a videó végén; most
   a név a videóban nem jelenik meg. Kell-e helyette valami?
6. ~~A publikálási adatok átadása~~: kész az IdeaToVideo oldalon (DECISIONS
   77); a PDT import, a Translation Pack és később az API a PDT repóban.

## Hogyan indul egy új session

A `docs/SESSION-PROMPT.md` promptja, a táblázat szerinti modellel és effort-tal.

Forrás: Drive `10_HyperFrames_Shippability_and_Documentation_Review`
https://docs.google.com/document/d/1fOLZnrikPn-A_2tl2XNZPJnsdO9AOd1XpUY2u4VF4_4/edit

Drive tükör: https://docs.google.com/document/d/19PougSc18s97PBKP6mr_CnQUnEulNgkfq1eckCPDqJI/edit
