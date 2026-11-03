# DECISIONS: Studio (munkanév)

## 2026-09-24

1. Helyi asztali app (Tauri), BYOK, nem SaaS. Ok: a render a user gépén fut, Zoltannak 0 szerverköltség.
2. Két külön app: Tervező (A réteg, a módszer része) és Megvalósító (ez, B réteg). Nincs közös adatbázis, átjárás importtal.
3. A két app közti szerződés a Video Brief Card.
4. PDT és a lead magnet appok külön termékek. A Studio és a lead magnet között csak a Landing URL a kapocs.
5. Windows és Mac az első verziótól.
6. A teljes 5 kapus menet a cél, minden kapu átugorható (Recommended, Default, Custom), plusz Autopilot.
7. UI angol, a tartalom nyelve projektenként választható.
8. LLM sorrend: Gemini (default, ingyenes), OpenRouter, Claude, ChatGPT, DeepSeek, Grok. Kihagyva: Perplexity, Mistral, Ollama. Egyetlen OpenAI-kompatibilis integráció.
9. Kulcsok az OS kulcstárában, nem a config fájlban.
10. Remotion kihagyva (licenc, dupla blokk-könyvtár). Ha valaha visszajön, a Remotionból HyperFrames felé irány.
11. Minden HyperFrames nyilvános preset bekerül. Zoltan Gero és VoxFlow brand nem.
12. UI-ban külön szó: Brand Voice és Narrator Voice.
13. Audience és Brand Voice már v1-ben.
14. Ingyenes usernek nincs support, ez nyilvánosan kiírva. Free = nyilvános GitHub repó.
15. Licenc: HyperFrames Apache-2.0 hivatkozással, Zoltan rétege zárt, a user brandje és videói a useréi.
16. Pilotban aláíratlan telepítő, 0 fix költség.
17. PRD 0.1 és SPEC 0.1 jóváhagyva (Zoltan).
18. Saját brand (Zoltan Gero, VoxFlow) semmilyen formában nem kerül az appba, a
    brand-réteg csak HyperFrames nyilvános preset. A HyperFrames marad az egyetlen
    motor és framework, saját motor vagy saját framework nincs (Zoltan).
19. A HyperFrames presetek lehetőleg nem másolatként kerülnek a repóba, hanem
    hivatkozásként vagy első használatkor letöltve. A pontos mód a 2. fázisban dől
    el, a presetek bekötésekor (Zoltan iránya).
20. A 0. fázis kilépő tesztje a `scripts/phase0/e2e.mjs`: egy éles videó (C2C) a
    Node láncon, friss brand-frames klónból, üres profillal, csak Node-dal a
    PATH-ban. A C2C azért, mert minden bemenete megvan (hang, jelenet-tábla, avatar
    klipek), új kreditet nem fogyaszt, és van jóváhagyott kimenete az összevetéshez.
21. Az app a hyperframes CLI-t mindig `HYPERFRAMES_NO_TELEMETRY=1` és
    `HYPERFRAMES_NO_UPDATE_CHECK=1` mellett hívja: a CLI alapból anonim render
    telemetriát küld, a SPEC 9 szerint pedig nincs telemetria.
22. Az avatar composite az éles láncban külön `--audio` nélkül fut, a render saját
    hangjával. Külön hangsávval a `-shortest` levágja a végkártya kitartását (C2C:
    71,29 mp a 72,27 helyett). A kánonban is javítva (brand-frames).
23. Brand: a videó a user saját brandjének színeit és assetjeit kapja (logó és
    társai). Ha a usernek nincs brandje, a HyperFrames presetek vannak felajánlva
    alapértelmezésként. A 39 archetípus ezekből veszi a színt és a betűt, nem
    Zoltan brandjéből (Zoltan). A 18. pontot pontosítja.
24. A HyperFrames presetek: az app első használatkor tölti le őket a HeyGen nyilvános
    repójából, rögzített verzióban, a user gépére. A mi repónkba nem kerül másolat
    (Zoltan). A 19. pontot pontosítja.
25. Render böngésző (SPEC 12.3): Chrome. Alapból a hyperframes által letöltött,
    rögzített verziójú chrome-headless-shell (a Google Chrome render változata).
    Tartalék csak a gépen lévő Google Chrome. Edge nem (Zoltan). Mérés:
    `docs/phase-0.md`.
26. Node sidecar (SPEC 12.4): csomagolt Node bináris és mellé egy lecsupaszított
    `node_modules`, az `onnxruntime-node` nélkül (153 MB a 365 helyett). Az egyfájlos
    SEA nem járható (Zoltan: a javaslat szerint). A user nem telepít Node-ot: az
    app a saját, rögzített verziójú Node-ját hozza magával, és mindig azt használja,
    akkor is, ha a gépen van másik Node.
27. A brand-frames `package-lock.json` commitolva, hogy két gépen ugyanazok az
    alcsomagok fussanak (Zoltan). A brand-frames PR #1-ben.
28. A 0. fázis tesztje alapból rövid: a videó első kb. 18 mp-e (a teljes negyede),
    egész jelenetekkel, vágott hanggal. A teljes videó a `--full` kapcsolóval megy
    (Zoltan: rövidebb render).
29. Terjesztés: a nyilvános GitHub repóban csak a telepítő (Releases) és a README
    van, a forráskód privát repóban marad (Zoltan). A 14. pontot pontosítja.
30. ffmpeg: ugyanúgy, mint a Node. Az app hozza magával, rögzített verzióban, a user
    semmit nem telepít. Kisebb build kell, ami csak a szükségeset tudja (x264, aac,
    vp9 dekódolás, psnr szűrő). A pontos build, a méret és a GPL licenc az 1.
    fázisban dől el, mérés alapján (Zoltan).
31. A brand-frames PR #1 (Node dokumentáció, package-lock, avatar hang) és PR #2
    (image-audio-lint a mountolt jelenetekre, a .ps1 párja törölve) a mainen
    (`db476c7`). A teszt alapverziója ez.
32. A pipeline csak Node, PowerShell tartalék nincs (Zoltan, a brand-frames
    lint session-ben). A maradék portolt `.ps1` fájlok törlése külön brand-frames
    feladat. Az app és a 0. fázis tesztje eddig is csak a `.mjs` szkripteket
    használta, így ez nem érinti.

## 2026-09-25

33. UI keretrendszer (SPEC 12.5): Svelte (SvelteKit SPA módban, Tauri alatt), Svelte 5
    (Zoltan).
34. Fejlesztői eszközök Zoltan gépén: Rust (rustup, stable MSVC) és Visual Studio
    Build Tools 2026 a C++ munkacsomaggal, winget-tel (Zoltan jóváhagyta). A user
    gépére ezek nem kellenek, csak a fordításhoz.
35. A script-kapu promptja a yt-flywheel-team script-író skilljéből van levezetve
    (OPEN, TEACH, OWN, stílusszabályok, egy Ownership CTA). A kulcsszavas komment-CTA
    réteg a v1-ből kimarad, mert a user oldalán nincs mögötte automatizmus.
    Harmadik fél módszer-nevei sehol nem szerepelhetnek, ezt teszt kényszeríti ki
    (Zoltan).
36. A brand-frames maradék portolt `.ps1` fájljai törölve (PR #4), az
    `image-audio-lint` kötőjeles szavakat bont és a `.subcap`-ot nem ellenőrzi
    (PR #3, Zoltan). Main: `3efb25f`.
37. Új sessionök a `docs/SESSION-PROMPT.md` állandó promptjával indulnak; a fázisonkénti
    modell és effort ugyanott.

## 2026-09-30

38. A termék neve **IdeaToVideo** (a "Studio" munkanév helyett). Azonosító
    `app.ideatovideo.desktop`, kulcstár `ideatovideo.<szolgáltató>`, projektmappa
    `IdeaToVideo Projects`. Elnevezésben nincs magyar szó és ékezet. A régi
    Studio tesztadatokat (kulcsok, beállítások, logó, projektek) az app első
    indításkor átköltözteti (Zoltan).
39. Az app felülete a design-system kánon ("Shine", a vidrev.app nyelve) szerint
    néz ki. A `tokens.css` build közben kerül a csomagba, a kész app a repótól
    független. Zoltan neve és logója nem kerül bele, az appnak saját neve és
    logója van. A 18. pontot pontosítja: a videók brandje továbbra is a useré
    vagy HyperFrames preset (Zoltan).
40. Az ikon Zoltan saját IdeaToVideo logója, Shine színekkel. Forrás:
    `app/src-tauri/icons/source/`, a méreteket a `tauri icon` gyártja.
41. A Gemini alapmodell `gemini-3.5-flash`. A `gemini-2.5-flash` új Google
    projektnek már nem érhető el (404), a `gemini-3.8-flash` ingyenes kerete a
    kézi teszt alatt túlterhelt volt (503). A kulcsteszt nem korlátozza a válasz
    hosszát, mert a gondolkodó modellek ilyenkor üres választ adnak.
42. vidIQ (SPEC 12.1): nincs REST API, de van MCP szerver
    (`https://mcp.vidiq.com/mcp`) user által generált Bearer kulccsal.
    Hivatalosan Max csomag, a bevezető időszakban minden csomagban megy. A v1-ben
    opcionális, a runner a 2. fázisban hívja. Ha nincs hozzáférés, a kulcsszó
    kézzel vagy a Brief Cardból jön (Zoltan: Pro csomag, Max nem kell).
43. ffmpeg (a 30. pontot pontosítja): a kész BtbN GPL "shared" build, rögzített
    kiadással és SHA256-tal, mint a Node. Saját minimális build nem lesz. Plusz
    kb. 58 MB a telepítőben. A csomagban licencfájl, az About oldalon egy sor.
    A user semmit nem telepít, az app mindig a sajátját használja. Mérés:
    `docs/ffmpeg.md` (Zoltan).
44. A Remotion továbbra is kimarad (a 10. pont megerősítve, Zoltan).
45. CI (`.github/workflows/build.yml`): Windows és macOS, csak PR-re és kézi
    indításra, a csak dokumentációt érintő változásokra nem fut. A privát
    design-system repót egy csak olvasható, csak arra a repóra szóló token éri
    el (`DESIGN_SYSTEM_TOKEN`, lejár 2027-09-01). Pénzbe nem kerül, az ingyenes
    perckeretből fogy (Zoltan).
46. Eltávolítás: a "Delete the application data" pipával a kulcsok is törlődnek
    a kulcstárból, a Dokumentumokban lévő projektek szándékosan maradnak.
    Settingsben "Remove all keys". Minden hiba mellett `ITV-...` kód és
    "Copy details", hogy egy tesztelő képernyőképéből látszódjon az ok.
47. ElevenLabs hang és HeyGen avatar választás listából, meghallgatással és
    előnézettel: 2. fázis (Zoltan: nem kell előrehozni).

## 2026-09-30 (2. fázis, menet közben)

48. **Az app saját könyvtárat kap (D út), a Zoltan-kánon nélkül.** A jelenettípusok
    a HyperFrames nyilvános registryjéből jönnek (Apache-2.0), a kinézet a
    presetből vagy a Brand varázslóból, a mozgás a Mozgás varázslóból. Semmi C2C
    előzmény, semmi Zoltan rendszeréből (39 archetípus, MOTION.md, BLOCKS.md). A
    brand-frames kánon Zoltan saját videóié marad, érintetlenül. Módosítja a PRD
    1. és 11. pontját, a DECISIONS 23. pontját és a 2. fázis mai C döntését
    (Zoltan).
49. Az időzítő szkriptek (mondattábla, jelenet-időzítés) és a többi pipeline-eszköz
    is újraírva az app saját kódjaként, nem a kánon portjaként (Zoltan).
50. Három külön, opcionális varázsló az onboarding után: Brand, Mozgás, CTA. A CTA
    varázslóban: visszatérő szegmensek (generált, feltöltött saját videó vagy AI
    avatar, hosszkorlát nélkül), kulcsszó-készlet, végképernyő (Zoltan).
51. A kulcsszavas komment-CTA visszajön (a 35. pontot módosítja), alapból a
    vidrev.app 15 kulcsszavával, a márkanév említése nélkül. Részletek később
    (Zoltan).
52. Mozgás varázsló: a kamera kikapcsolható, a lüktetés 0 is lehet. Bezáruló
    gyűrű, haladásjelző nincs. Fejezetek igen: az app kiírja a YouTube
    fejezetlistát a script szakaszaiból és a hang időzítéséből (Zoltan).
53. YouTube végképernyő helye: alapból 20 mp, a Settingsben 5-20 mp között
    állítható, a varázsló nem kérdezi (Zoltan kérésére Claude döntése).
54. A kész brand-frames PR #6 (`--outdir`, helyi GSAP, semleges alapértékek) bent
    marad a kánonban, Zoltan saját menetének sem árt. A második (semlegesítő) PR
    leállítva, mert az appnak nem kell.
55. **A könyvtár v1: 15 komponens a HyperFrames registryből** (Zoltan jóváhagyta a
    18-at, a próba után 15 maradt). Mondat-szerepenként 2-3 lehetőség, hogy az AI
    váltogathasson és a user cserélhessen, de ne kelljen választania: nyitás
    (titlecard-lockup, titlecard-calm), kulcsmondat (per-word-rise,
    kinetic-type-swap, headline-slam), kiemelés (vox-annotate, marker-highlight),
    bizonyíték (count-up, chart-story, conic-progress-ring), felsorolás
    (grid-card-assemble, constellation-hub), magyarázó rajz (whiteboard-ink),
    zárás (cta-close, logo-brand-close). A próbán kiesett, mert nem követi a
    témát vagy üres makettet mutat: decline-chart, marker-checklist-card,
    comparison-split. Kihagyva: termékdemó és kurzor (felvétel kell), feliratok
    (a v1 SRT-t ad), átmenetek (Mozgás varázsló), zajos effektek, vélemény- és
    logó-kártyák (az AI kitalált véleményt vagy cégnevet írna). A bővítés a 3.
    kapu naplójából jön: ahol nem talált illő szerepet.
56. **LEZÁRVA 2026-10-28 (130): "all 234".** Eredetileg: NYITOTT, Zoltan később átnézi: a teljes registry, 234 komponens. Ennyi van
    a rögzített commiton (`9a27b9f`). Érvek, ha mind bekerülne:
    - PRO: a legnagyobb változatosság; nincs előzetes válogatás; mind ugyanaz a
      licenc (Apache-2.0) és ugyanaz a beillesztési szerződés; a méret nem gond
      (a 18 komponens 432 KB, a 234 kb. 5-6 MB a telepítőben); egy sorral
      bármelyik hozzáadható a `library/components.json`-ban.
    - CON: kb. kétharmaduk nem explainerhez való (termékdemó, kurzor, UI makett,
      feliratstílus, átmenet), felvétel vagy saját kép nélkül üres; a régebbi,
      szerep-címke nélküli részük nem követi a témát vagy makettet mutat (a
      próbán a 18-ból 3 így esett ki); mindegyiket két témával végig kell vinni
      a próbán (lint, check, render, kontakt lap); a 3. kapu promptja kb. 13-szor
      hosszabb (a 18 leírása 42 KB, a 234-é kb. 550 KB, kb. 140 ezer token
      jelenet-táblánként a user kulcsán), és a sok hasonló lehetőség közül az AI
      bizonytalanabbul választ; a user cserelistája is hosszú.
    - Köztes út: mind a 234 a telepítőbe kerül, de az AI csak az ellenőrzött és
      az adott videótípushoz engedélyezett készletből választ (explainer ma,
      később screenrecording és talking_head saját készlettel).
57. **A jelenet-tábla kezdő határai** (3. kapu, `runner/gates/scenes/index.mjs`),
    az első éles videók után pontosítandók (Zoltan):
    - Egy jelenet legalább 2 mp: a komponensek belépő animációja 1-3 mp (a
      count-up 1,7 mp alatt pörög fel), ennél rövidebben a kész állapot alig
      látszik. Mért alap.
    - Legfeljebb 12 mp, ha több mondatot fog össze: ízlés alapján, nem mérve.
      Egyetlen hosszú mondatot nem vág szét.
    - A képernyőn legfeljebb 6 szó egy szövegben, listaelemenként 3: általános
      olvashatósági ökölszabály (a néző egyszerre hallgat és olvas), nem mért.
    Pontosítás: a számok egy helyen vannak (MIN_SECONDS, MAX_SECONDS, MAX_WORDS),
    átírásuk perc; a mérésükhöz valódi videók és nézői adat kell.
58. **Az első valódi videó javításai** (Zoltan visszajelzése, 2026-09-30):
    - A komponensek futás közben nem látják a jelenet hosszát: a HyperFrames
      leveszi a beillesztett gyökérről a `data-duration`-t, így a script a
      beégetett alapértékre (3,5-5 mp) esett vissza, és a hosszabb jelenet
      végén üres kép maradt (0:03-0:07, 0:11-0:15). Az assembler a jelenet-
      másolatban a `root.dataset.duration` olvasását a jelenet hosszára cseréli.
    - Komponensenkénti szókorlát (`roles.mjs`): a `headline-slam` legfeljebb 3
      szó (hosszabb sornál a fix betűköz összepréseli a betűket), a
      `kinetic-type-swap` előtagja 3, utótagja 2 szó.
    - A szakaszok előtti szünet 1,2 helyett 0,6 mp (üresjáratnak hatott).
    - A `vox-annotate` kikerült (15 helyett 14 komponens): a vonal nem a szóra
      mutat, a kiemelés elcsúszik, a jegyzet kilóg. A kiemelés szerepben a
      `marker-highlight` marad, az tetszett.
59. **A videó kinézete a Brand varázslóig: a `config.brand.preset`**, amit az
    onboarding már most is beállít. Alap és irány: a HyperFrames
    **Blue Professional** presetje (krém háttér, egyetlen kobaltkék kiemelő,
    Space Grotesk és Inter), Zoltan jóváhagyta a próba kontakt lapja alapján.
    Választható még: **Warm paper** (az első próbavideó témája, azt is szerette).
    A preset áttetsző kártya- és keretszíne átlátszatlan megfelelőre cserélve,
    mert a constellation-hub a kártyák mögé rajzol. Külön sötét téma nincs a
    felületen (Zoltan: a Blue Professional "helyette", nem mellette).
60. **Háttérzene, ebben a sorrendben** (Zoltan, 2026-09-30):
    1. ElevenLabs Music, ha a usernek van ElevenLabs kulcsa (ugyanaz a
       szolgáltató, mint a hang, a videó hosszára készül, fizetős csomagon
       kereskedelmi használatra is).
    2. Ha nincs: öt ingyenes zongoradarab a Wikimedia Commonsról, mind CC0 vagy
       public domain (Satie, Bach-Siloti, három Chopin-nocturne), rögzített
       URL-lel, mérettel és SHA256-tal, első használatkor letöltve
       (`runner/providers/music/free.mjs`). Egy CC BY-os jelölt kiesett, mert
       feltüntetést kér. A FreePD, az eredeti ötlet, 2025-ben bezárt.
    3. Saját fájl, vagy zene nélkül.
    A HeyGen zenekatalógus (`GET /v3/audio/sounds`) kimarad, amíg nem tisztázott,
    hogy a zene HeyGenen kívül készült videóban is használható-e (a
    dokumentáció és a feltételek erről hallgatnak). Zene csere a kész hang alatt
    újrakeverés, a hangot nem olvassa fel újra. Az Autopilot ugyanezt a
    sorrendet követi.
61. **Avatar (5. kapu, opcionális):** a HeyGen v3 API-val, a user kulcsával. Az
    avatar a videó saját narrációját mondja, szájszinkronnal (Audio to Video:
    a jelenet idejére kivágott narráció feltöltve, `POST /v3/videos`
    `audio_asset_id`-vel). Nyitás és/vagy zárás, teljes képen, a téma
    háttérszínén, így átlátszó videó nem kell (saját videóból betanított
    avatarral is megy). Előtte becslés (másodperc alapján) és a valódi egyenleg
    (`GET /v3/users/me`), jóváhagyó kérdés. Az Autopilot soha nem csinálja,
    mert pénzbe kerül. A klipek a kompozícióban `<video>` elemek a jelenetek
    fölött; ha a hang később megváltozik, a build nem használja őket csendben,
    hanem szól. Élesben Zoltan kulcsával kell kipróbálni.
62. **Zene: ElevenLabs kulcs nélkül nincs háttérzene** (Zoltan, 2026-09-30; a 60.
    pontot módosítja). A CC0 zongoradarabok kikerültek, mert Zoltannak nem
    tetszettek. Marad: ElevenLabs Music (kulccsal), saját fájl, zene nélkül. Az
    Autopilot kulccsal ElevenLabs zenét tesz alá, kulcs nélkül zenét nem.
63. **Avatar: behúzzuk, nem duplikáljuk** (Zoltan ötlete, 2026-09-30). Az app a
    HeyGen-fiókban már meglévő avatarokat listázza karakterenként, a lookjaikkal,
    a HeyGen saját előnézeti képével és videójával. Létrehozás és szerkesztés a
    HeyGenben marad ("Open HeyGen" gomb). Zoltan régi, sokszor használt
    avatarjai eddig nem voltak elérhetők; ha a kulcs nem lát saját avatart, az
    app kiírja, hogy a kulcs valószínűleg másik munkaterülethez tartozik. Élesben
    kell ellenőrizni.
64. **vidIQ kulcsszó-ötletek az 1. kapuban** (a 42. pontot valósítja meg). A
    vidIQ-nak nincs REST API-ja; az app az MCP szerverüket hívja
    (`https://mcp.vidiq.com/mcp`, JSON-RPC HTTP-n, JSON vagy eseményfolyam
    válasz) a user MCP API kulcsával (app.vidiq.com/account/settings/mcp, csak
    MCP-re szól, visszavonható). Kulcsteszt: `vidiq_balance` (0 kredit). Ötletek:
    `vidiq_keyword_research` "research" módban a projekt címére; a kiválasztott
    kulcsszó a script adataiba kerül. Élesben Zoltan kulcsával kell kipróbálni
    (a Claude-munkamenetben a vidIQ OAuth-tal működött, 4100 kredittel).
65. **Avatar elhelyezése** (Zoltan, 2026-10-01). Forma: kivágott (átlátszó háttér,
    HeyGen `output_format: "webm"`, a HeyGen saját maszkolásával, nem
    színkulccsal), kör, kártya vagy teljes kép; hely: a négy sarok; méret:
    kicsi, közepes, nagy. Alap: kivágott, jobb lent, közepes. A Settingsben az
    alap, az 5. kapuban videónként felülírható, kis előnézettel. A HeyGen
    `aspect_ratio: "auto"`-val kapja a klipet, az app csak méretez és vág, soha
    nem nyújt. Háttér-leválasztás nélküli régi looknál az app magától kártyára
    vált, és kiírja. Hely, méret és forma HeyGen-költség nélkül váltható, csak
    a kivágotthoz kell átlátszó klip. Mért: a render megtartja a WebM alfa
    csatornáját (próba 2026-10-01).
66. **Mentés (Backup) aloldal a Settingsben** (Zoltan ötlete, 2026-10-01;
    **eldöntve és most épül**, az Identity után, a varázslók előtt; terv:
    `docs/backup.md`). Zoltan döntései (2026-10-01): a mentési szintet a user
    választja (alap a Settingsben, ONE Videónként felülírható, alapérték 4);
    ugyanebben a körben **helyi napló** (Log), nagyon részletes, hogy Claude
    képernyőkép nélkül lássa, mit csinált az app és mit látott a user; a napló
    nem törlődik magától, csak ha a user törli. Az eredeti javaslat: Kiderült: a
    projektek (hang, avatar klipek, MP4) és a beállítások csak helyben vannak,
    géphalálnál elvesznek. Javaslat:
    - **1. változat, saját felhő-kapcsolat nélkül:** a user kiválaszt egy
      mentési mappát, ami a Google Drive, Dropbox vagy OneDrive asztali
      kliensének mappájában van; a kliens tölti fel. Nincs OAuth, nincs
      kulcs, nincs szerver, nincs díj (PRD szabály), és minden szolgáltatóval
      megy. Közvetlen Drive vagy Dropbox API csak akkor, ha ez kevés.
    - **Szintek, a user választja:** csak a script (néhány KB); script és
      hang (kb. 1-2 MB videópercenként); plusz a jelenet-tábla és a build
      (kicsi); plusz a kész MP4 és az avatar klipek (kb. 10-40 MB
      videópercenként). Előtte méret-becslés a meglévő projektekből, és a
      szint projektenként felülírható.
    - **Nevek** (Zoltan, 2026-10-01): a videó címe mindig teljes hosszában,
      a szavak között `_`, szóköz nélkül; a dátum csak a mappanév végén:
      `IdeaToVideo_Backup/Freelancer_to_Owner_2026-10-01/`, benne
      `Freelancer_to_Owner_script.md`, `Freelancer_to_Owner_voice.mp3`,
      `Freelancer_to_Owner_video.mp4`. A címből kimarad, amit a Windows nem
      enged fájlnévben (`\ / : * ? " < > |`), az ékezet ékezet nélküli
      betű lesz. Ugyanaz a cím ugyanazon a napon: `_2` a mappanév végére.
      Rövidítés csak akkor, ha a teljes útvonal elérné a Windows 260
      karakteres határát; ilyenkor az app kiírja.
    - **Mikor:** egy kapu jóváhagyásakor és render után, magától; plusz "Back
      up now" gomb; állapot projektenként ("backed up 14:02").
    - **Visszatöltés:** "Restore from backup" a Projects oldalon, ami a
      mentésből visszahozza a projektet (a hiányzó részek újragenerálhatók).
    - **Beállítások mentése** (Zoltan jóváhagyta, 2026-10-01; ugyanabban a
      sessionben készül, mint a projektmentés): a Settings fájl kulcsok nélkül
      a mentési mappába kerül (`IdeaToVideo_Backup/IdeaToVideo_settings.json`),
      új gépen "Import settings", így a 12 lépéses beállítást nem kell újra
      végigcsinálni. A kulcsok soha nem kerülnek bele, azokat újra be kell írni.
    - A törlés a mentésből soha nem automatikus.
67. **Identity: meta szint a videók fölött** (Zoltan, 2026-10-01). Eldöntve:
    egy szint, nem kettő, a neve **Identity** (szerzőnek, álnévnek, SMB-nek és
    ügyfélnek is érthető); a varázslók előtt készül, külön chatben. A
    lenti szövegben "egység" = Identity.
    Cél: egy ember több brandet, írói álnevet vagy ügyfelet futtathasson
    párhuzamosan, mindegyik a saját hangjával, kinézetével és CTA-jával.
    - **Egy szint.** Szerző > projekt > videó kavarodás lenne. A meta egység
      egy brand, álnév vagy ügyfél; pontosan 0 vagy 1 YouTube channel
      tartozik hozzá (Zoltan: több kavarodás lenne). Két YouTube channel két
      Identity ("Duplicate").
    - **Szavak a felületen** (Zoltan): a mai "project" neve **ONE Video**,
      mert egyetlen videó, nem playlist, nem stratégia. **Mindig egyes
      számban** (Zoltan, 2026-10-01: a "ONE Videos" nem angolos): a fül és a
      lista címe is "ONE Video"; ahol a mondat többes számot kíván, ott
      "videos". Ahol YouTube
      csatornáról van szó, mindig "YouTube channel" áll, soha nem csak
      "channel".
    - **Egységenként:** Channel Profile, Audience, Brand Voice, YouTube
      channel, landing és CTA, tartalom nyelve, brand preset és logó,
      Narrator Voice, alap avatar és elhelyezése, vidIQ be/ki, a szótár
      (68.), és a három varázsló (Brand, Mozgás, CTA) minden eredménye. A
      ONE Videók az egység alá tartoznak.
    - **Licencszintek az app felépítésében** (Zoltan, 2026-10-01): két szint
      már most megkülönböztetendő: **Agency** (korlátlan Identity) és
      **Solo** (egy Identity; a nevet Zoltan elfogadta, 2026-10-01). A kód egy helyen
      tartja a szintet és az Identity-korlátot (most: korlátlan, licenc még
      nincs, az a 4. fázisban jön). Nyitva hagyandó, nem építendő: affiliate
      és white label. Ehhez: a termék neve és a felületi szövegek egy helyen,
      hogy később cserélhetők legyenek.
    - **Kulcsok: öröklés** (Zoltan: ez az irány). Az App szinten megadott kulcsok minden egységnek
      szólnak; egy egység felülírhatja a sajátjával (ügynökségi eset: az
      ügyfél HeyGen, ElevenLabs vagy AI kulcsa, hogy a költség nála
      jelentkezzen). Ugyanígy az AI szolgáltató és a modell. Kulcstárban az
      egység azonosítójával.
    - **Felület:** választó a felső sávban; a Settings két része: App (az
      ügynökségi szint: alap kulcsok, mappák) és az aktuális egység. "New"
      a beállító varázsló egység-részét futtatja, "Duplicate" egy meglévőből
      indul.
    - **Mappák:** `<projektek>/<Egység>/<ONE Video>`; mentés:
      `IdeaToVideo_Backup/<Egység>/<Cím_dátum>/` (a 66. pont kiegészül).
    - **Átállás:** a mai beállításokból lesz az első egység. Zoltan szerint a
      tesztadat elveszhet; a legegyszerűbb megoldás így is az átvétel.
    - **A terv jóváhagyva** (Zoltan, 2026-10-01): `docs/identity.md`. A
      felületi szó végleg **Identity** (a Solo a csomag neve, nem a tárgyé:
      "12 Solo" nem értelmes, és faceless channelre, SMB brandre félrevinne).
      Az első Identity neve "My Identity", átírható, a YouTube `@handle` nem
      követve. A Duplicate viszi a saját kulcsokat, felülírhatóan (jelölő, az
      alapérték egy helyről, Agency: be). Futó munka közben lehet Identity-t
      váltani; a helyi nehéz munkák (build, check, render) egy sorban, ma 1
      egyszerre; a hálózati munkák (script, hang, zene, avatar) a render
      mellett futnak, de **egy kulcson egyszerre csak egy** (Zoltan:
      összekavarodhat). Az állítható render-korlát és a mérés később.
    - **Identity export és import** még a 2. fázisban (Zoltan, 2026-10-01):
      egy fájl kulcsok nélkül, amiből egy másik user a saját Identity-jét
      indítja. Lásd 71.

68. **Szótár az egységben** (Zoltan ötlete, 2026-10-01; a Brand varázsló
    chatjében készül). Listák, amiket a script kapu betart és ellenőriz:
    - kedvelt szavak és írásmódjuk (például "Owner", nagy O-val);
    - tiltott szavak (például "blasting email");
    - fogalompárok, amiket nem szabad összemosni (például YouTube Subscriber
      és Email Subscriber; Avatar mint AI avatar és mint ügyfélkép);
    - ellenfél-fogalmak és pozicionáló álláspontok, amikkel a csatorna
      vonzza, akit akar, és kiszűri, akit nem.
    A prompt megkapja; a kész scriptben a tiltott szavakat egy gépi
    ellenőrzés jelzi (nem az AI ítéli meg). Valódi személyek nevénél a
    script véleményként fogalmaz, tényállítást nem tesz róluk. A varázsló
    ehhez segítő példákat ad: személy helyett jelenség vagy típus is
    lehet ellenfél (például "hustle culture", "hustle bro").

69. **Az app a suite-ban: ONE Video** (Zoltan, 2026-10-01; irány, nem kód).
    A sorrend: 0. ajánlat és célcsoport; 1. tervezés (playlist, kulcsszavak,
    cím és thumbnail-koncepció a gyártás ELŐTT); 2. IdeaToVideo (ONE Video);
    3. publikálás (cím, leírás, tagek, thumbnail, YouTube); 4. kommentek és
    mérés. A határ egy fájl: a **Video Brief Card** (már létezik:
    `validate-brief`, "Import from Planner"). A tervezés ezt adja át, az
    IdeaToVideo ebből indul; a stratégia nem az IdeaToVideo dolga. A vidIQ
    az 1. kapuban marad könnyű kulcsszó-ellenőrzésnek annak, akinek nincs
    tervező eszköze; a valódi kulcsszókutatás a tervezésbe tartozik. A
    publikálás logikája két helyen kell: a csomagolás (cím, thumbnail) a
    tervezésben, a végleges adatok a kész videó után. A Brief Card a két app
    közötti szerződés, mint egy API: verziózott séma, mindkét oldal
    validálja.
    - A Publishing Dream Team ingyenes lead magnet marad azoknak, akik még
      csak a videó után gondolnak a publikálásra; a tervező a tudatosaknak
      szóló "előre tervező" változat.
    - **Két külön SaaS, nem egy termék két modullal** (Zoltan, 2026-10-01;
      irány, most nem épül). Más a céljuk és a felépítésük (kérdőív, utána
      annak GHL-ben egy kattintásos megvalósítása), ezért külön app, akár
      ugyanazon a domainen, két külön subdomainen. Web, mert lead magnetként
      így könnyebb elérni, és a munka könnyű (LLM és vidIQ hívás).
      - **Ajánlat és tervezés app**, kimenete: (1) **Offer Card**, Identity-nként,
        ez tölti ki az Identity Audience, landing és CTA mezőit; (2) **Video
        Brief Card**, videónként, ez az IdeaToVideo bemenete; (3) **Landing
        implementation** (a landing oldal megvalósítása).
      - **Lead Magnet app**, kimenete: (1) **Lead Magnet Card**; (2) **Lead
        Magnet implementation**.
      - Nyitott: hogyan jön ebbe a GHL megvalósítás (például PDF lead
        magnet), és honnan jön hozzá a design. Gond: a design külön lépés
        lenne, és duplikáció, mert az IdeaToVideo Brand varázslója már
        tartalmazza, és kell a Lead Magnethez és a YouTube Brand Channel
        varázslóhoz is. **Javaslat** (Claude, 2026-10-01, döntés később): egy
        közös, verziózott **Brand Identity Card** Identity-nként (színek, betűk, logó
        világos és sötét, sarkok), ugyanúgy szerződés, mint a Brief Card. Az
        a varázsló készíti, amelyikkel a user először találkozik, a többi
        importálja, egyik sem kérdezi újra. GHL-ben Custom Value-kra képeződik
        (szín, betű, logó URL), így a landing és a PDF sablonok egy
        kattintással a user kinézetét kapják; a PDF lead magnet kész
        sablonokból választ, nem külön design lépés. Az IdeaToVideo Brand
        varázslója a Brand Identity Cardot írja és olvassa. A név Zoltané
        (2026-10-01): "Brand Identity Card", hogy ne keveredjen semmivel.
    - **3x AI Agent In A Box:** külön, önálló SaaS (Zoltan, 2026-10-01; nem
      az IdeaToVideo része, Notionban vezetve).
    - **YouTube Brand Channel varázsló** (később, valószínűleg SaaS, a
      tervezés fázisba): egy YouTube channel teljes felállítása end-to-end
      (channel art, logó, leírás, kulcsszókutatás), Zoltan meglévő menete
      alapján (így készült a VoxFlow YouTube channel). Különbséget tesz a
      **Personal** és a **Brand** YouTube channel között. Önálló lead
      magnetnek is alkalmas.
      - **Alapja** (Zoltan, 2026-10-01): a VoxFlow YouTube channel öt
        fázisa, amin Claude végigvezette (forrás:
        `freedomOS/channels/voxflow/STATUS.md` és DECISIONS, Drive tükör
        `VoxFlow_YT_Channel_HANDOVER`): fiók és profil; Brand Channel,
        handle és ellenőrzés; azonossági dokumentumok és kulcsszókutatás;
        a csatorna testreszabása; YouTube Studio alapbeállítások és
        közösségi moderálás. Mellette a `yt-flywheel-team`
        `agent-00-channel-foundation` skill (Brand vagy Personal döntés,
        jogi lista, beállítás, EEAT, Hero story, Avatar).
      - **Kötelező első lépés: a tulajdonjog** (Zoltan tapasztalata,
        2026-10-01). A Zoltan Gero channel Personal channelként indult egy
        Google Workspace címmel (zoltan@zoltangero.com); az előfizetés
        lejárta után az inbox elérhetetlen lett, és a Primary Owner átadása
        egy másik fiókra hosszú, kínkeserves harc volt. A varázsló ezért az
        elején megkérdezi, kinek a fiókja lesz a Primary Owner, és olyan
        címet ajánl, ami a user kezében marad akkor is, ha egy előfizetés
        lejár; Brand channelt hoz létre az elejétől; és második tulajdonost
        vagy menedzsert kér. Ez a lead magnet egyik legerősebb része.

70. **0. lépés: ajánlat-kérdőív** (Zoltan ötlete, 2026-10-01; később, nem az
    IdeaToVideo része). Egy kb. 12 kérdéses kérdőív, aminek a végén kijön:
    kinek, mit, mennyiért, egyszeri vagy havi, upsell, headline, GYIK.
    Külön részek: (a) az ajánlat ("Offer Card" fájl), (b) a landing oldal
    szekciói ebből, (c) a Lead Magnet külön folyamat (Zoltan később
    kifejti). Opcionálisan GHL implementáció is: a landing és a GHL Custom
    Value-k azonnal létrejönnek (Zoltan referenciája egy korábbi
    tanácsadásból; nem egy különálló chatbot, hanem a folyamat része). Az Offer Card tölti ki az egység Audience, landing és CTA
    mezőit. Saját kérdőív, harmadik fél módszer-neve nem szerepel benne.

71. **Árazás: nyitott** (2026-10-01). A GHL affiliate bónuszt Zoltan szerint
    a GHL engedi. A licencszintek felépítése a 67. pontban. Először Zoltan használja, saját
    álneveivel, utána más szerzőknek, csak utána eladás. A lehetőségek és
    érveik a 2026-10-01-i chatben: GHL affiliate bónusz; egyszeri licenc;
    egységenkénti ár; Creator és Agency szint; white label; affiliate
    program. Javaslat: bónusszal indul, utána egyszeri Creator és Agency
    licenc, white label a legvégén. Döntés később.
    - **Mintázó üzlet** (Zoltan ötlete, 2026-10-01): nem ügynökség, hanem
      egy saját használatra felépített minta-üzlet, amiből "1000 kisüzlet nő
      ki". Technikailag egy minta-Identity: Brand Identity Card, szótár, CTA,
      mozgás, hang, ajánlat. Ezt a user Identity exportként (kulcsok nélkül)
      kapja meg, importálja, és a saját kisüzletét abból indítja. Árazásban:
      a minta maga is termék lehet (Solo vevő egy kész mintából indul). Az
      export és import a 2. fázisban épül (67).
    - **Zoltan válaszai** (2026-10-01):
      - **Kié a kisüzlet:** a cél, hogy 100 százalékban Zoltané legyen. Az
        elején valószínűleg 2-12 ügyfél is kell, ügynökség-szerűen, hogy
        legyen aktív bevétel, és rajtuk kísérletezhet.
      - **Az átmeneti ügynökségi szakasz:** csak rövid, Zoltan szerint 3
        hónap reális, ha nekifekszik (a 90 napos fókusz). Claude javaslata:
        a feltétele, hogy minden ügyfél ugyanazt a mintát kapja (egy
        Identity és ugyanaz a GHL snapshot), rögzített tartalommal, árral és
        záró dátummal; 3-5 ügyfél, nem 12, mert közben a minta is épül.
        Így az ügyfélmunka a mintát érleli, nem egyedi ügynökségi munka.
      - **Bevétel:** AdSense, hamarosan főleg GHL affiliate, az elején az
        ügyfelek.
      - **Mintából egy, legfeljebb kettő.** A fókusz-csapda ellen: elején
        csak 1-2 saját egység. A platformfüggés átmenetileg rendben, ha nem
        csak YouTube (GHL is); a szerelés nem kerülhető el.
      - **Minta-típusok sorrendje** (Claude javaslata, Zoltan még
        megerősíti): előbb a **módszer-minta** (szakértői kisüzlet, a
        Zoltan Gero channel maga), utána a **niche-minta** (például helyi
        kisvállalkozás), ami a módszer-minta egy kitöltött változata.
      - **Megerősítve** (Zoltan, 2026-10-02): a sorrend (előbb módszer-,
        utána niche-minta) és az átmeneti szakasz keretei (3 hónap, ugyanaz a
        minta, rögzített tartalom, ár és záró dátum). Cél: kb. 1500-1600 USD
        havonta, 4 ügyféllel. A módszer-minta három personája: tipikus
        online marketer ("From Freelancer To Owner"), kezdő online marketer
        (97 USD-s GHL affiliate), nem marketer szakértő. A niche-minta:
        **Local biz** (Google Reviews, local SEO, local ads, Merchynt).
      - **Második kör** (Zoltan, 2026-10-02): két ICP, a havi díj vagy-vagy,
        **setup díj nincs**: vagy Local biz szolgáltatás (reviews kezelés,
        local SEO), vagy course creator csomag (vidrev, PDT). A 90 nap
        mércéje **csak a bevétel**, az email lista nem. Zoltannak is GHL
        Agency csomag kell (API, sub-account minden ötlethez és demóhoz),
        így az ügyfélnek továbbadott GHL díj 100 százalékban az övé, nem a
        szokásos 40 százalékos jutalék. Az első 3-4 ügyfél akár GHL
        Certification nélkül. Számlázás az elején magánszemélyként.
        **vidrev** = a C2C önálló SaaS neve. A lead magnet ötletek gyűjtője:
        Drive `22_Lead_Magnet_Ideas`.
      - **A korábbi stratégiai doksik feltételesek** (Zoltan, 2026-10-02): a
        Drive Strategic_Overview mappa 00-20 doksija és a Strategy Overview
        v2 vázlat, bármi felülírható; az érvényes összefoglaló a
        `21_Strategy_Update_2026-10-02 (READ FIRST)` Drive doksi.
      - **YouTube channelek szerepe:** **Zoltan Gero** (régi, emberi,
        kb. 1100 feliratkozó, nem monetizált): minden YouTube marketing,
        GHL és a minta-üzlet, ez a fő Living Proof. **Privi** (régen vett,
        már nem monetizált, átnevezhető): kísérleti terep, például a
        kambodzsai (KH) videók; ha a YouTube bezárja, nem fáj. **VoxFlow**:
        Mátéé, a különválás után kimarad; a felépítése a YouTube Brand
        Channel varázsló alapja (69).

## 2026-10-02 (Brand varázsló)

72. **Brand varázsló és szótár** (Zoltan jóváhagyta a tervet, 2026-10-02;
    leírás: `docs/wizards/brand.md`). Eldöntve:
    - **Egy design-forrás Identity-nként:** a Brand Identity Card
      (`brand/brand-identity-card.json`, séma `brand-identity-card/1`, csak
      hex szín, ismert név, fájlnév). A `FRAME.md` generált nézet belőle,
      minden mentéskor újraíródik (K1). Kártya nélkül a `brand.preset` adja.
    - **Logó a videóban nincs**, vízjel sincs (K2). A logó (világos és
      sötét) a kártyán van a többi eszköznek.
    - **Csak az app betűi**, saját feltöltés nincs, amíg nincs rá kérés
      (K3). 18 OFL család a fontsource 5.3.0-ból, rögzítve, SHA256-tal,
      build közben letöltve (1,7 MB). **Hiányos ékezetű betű kimarad** a
      presetjével együtt (Fredoka One és Daisy Days, Shrikhand és Bold
      Poster): a build elbukik, ha egy betűből a 10 tartalomnyelv bármelyik
      betűje hiányzik, így felületi figyelmeztetés nem kell. 11 preset
      marad, plusz a Warm paper (a Georgia helyett EB Garamonddal, amivé a
      render amúgy is cserélte).
    - **Mérés:** a HyperFrames a komponenseket egy dokumentumba fűzi, és
      csak a `@font-face` nélküli családokat tölti le. A gyökérbe írt
      helyi `@font-face` és a csak általános tartalék (`serif`,
      `sans-serif`, `monospace`) mellett üres gyorsítótárral sem jött létre
      a betű-gyorsítótár mappája. Az e2e ezt minden futáskor ellenőrzi.
    - **A presetek a csomagban**, nem első használatkor (a 24. pontot
      pontosítja): a `FRAME.md`-k a library rögzített commitjáról; a
      szerepkiosztás (`library/presets.map.json`) csak neveket tartalmaz.
    - **Szótár** (K4): Settings, Identity, "Dictionary", négy szekció. A
      prompt adatként kapja; gépi ellenőrzés (szóhatár, kis- és nagybetű,
      ékezet) a scriptben és a jelenet-tábla szövegeiben; nem blokkol.
    - **Gemini 429** (K5): egyszer a másik Gemini modell, ugyanazzal a
      kulccsal (az ingyenes kvóta modellenként számol). A korábbi "kvóta
      nem túlterhelés" szabály ezzel megváltozik.
    - **Közös varázsló-keret** (`WizardShell.svelte`) és mintavideós valódi
      előnézet (`brand-preview`, mérve 8-15 mp): a Mozgás és a CTA varázsló
      ezt kapja.
    - **Nyitva, Zoltan döntésére:** az open-design semleges design
      rendszerei a galéria második forrásaként, és egy "Import tokens.css"
      gomb (híd a Claude Design és az open-design felé). Canvának nincs
      paletta API-ja (`docs/wizards/brand.md` 12b).

73. **Brand varázsló, második kör** (Zoltan, 2026-10-02, a próbája után: a
    napló 0 hibát mutatott; leírás: `docs/wizards/brand.md` 12 és 12b).
    - **Warm paper törölve** (nem HyperFrames preset, csak karbantartás és
      ügyfélszolgálati kockázat). 11 HyperFrames preset marad.
    - **open-design: mind a 152 design rendszer** a galériában, a márkákat
      idézők is (Zoltan: ezek a kipróbált, jól konvertáló minták), rögzített
      commitról (`53231d4`), SHA256-tal. Jogtiszta átvétel: csak tények
      (színek, sarok, árnyék vagy keret, a megnevezett betű); a `tokens.css`
      megjegyzései és a manifest leírása letöltés után kimarad; logó,
      márkaszöveg, `DESIGN.md` soha; márkabetű soha, helyette a
      legközelebbi szabad OFL betű (az open-design sem csomagolja őket, csak
      megnevezi). Név: **"<márka> style"**, kiírással: "Style names describe
      a look only. Not affiliated with or endorsed by the brands named."
      (Zoltan választása a három lehetőség közül.)
    - **35 betű** (2,8 MB): a presetek, az open-design által megnevezett
      szabad betűk és a márkabetűk helyettesei. A Press Start 2P kimaradt
      (hiányzik a román ș), helyette Space Mono.
    - **Import tokens.css** a varázsló Start képernyőjén (Claude Design,
      open-design, shadcn és a gyakori nevek), és **Export / Import Brand
      Identity Card** (`.brand.zip` vagy `.json`) a Brand oldalon.
    - Javítva: a Settings menü kattintásainál a napló a helyes csoportot
      írja (korábban mindig "App"-ot).

## 2026-10-04 (Mozgás varázsló)

74. **Mozgás varázsló** (Zoltan jóváhagyta a tervet, "mind az ajánlott",
    2026-10-04; specifikáció: `docs/motion-wizard.md` 3. változat,
    megvalósítás: `docs/wizards/motion.md`). Eldöntve:
    - **Minden mozgás a HyperFrames-é**, rögzített verzióval: a hangulat- és
      energia-táblája (`transitions/overview.md`, 9 hangulat, 3 energia, a
      "mozgás design system"), a CSS átmenet-jegyzéke (`faceless-explainer`
      `transitions.json`, 5 recept, a saját injektorának módszerével), a
      `@hyperframes/shader-transitions` csomag 14 átmenete (0.8.22, mint a
      motor), a háttér-komponensei (grain-field, aurora-drift), a kamera-
      szabályai az explainer-doktrínája szerint (`motion-language.md`).
    - **Egy Identity, egy profil** (`motion.json`); profil nélkül a build
      bájtra a régi (mérve). Hatás a következő buildtől.
    - **Narratív pozíciók** (HyperFrames): fő átmenet a szakaszon belül,
      kiegészítő az elején és új szakasznál, a végén lassú crossfade.
    - **Kamera**: Off (ajánlott), Subtle jitter, Push in (az első félidőben,
      utána tart). Úszó kamera és közös lüktetés nincs (a doktrína szerint
      "inkább semmi mozgás, mint rossz"); ez a DECISIONS 52 "a lüktetés 0
      is lehet" pontját teljesíti.
    - **Háttér**: Plain (ajánlott), Dot field, Aurora (csak sötét
      kinézetnél, mert az alapja mindig sötétkék). 5-15 mp-es, varrat
      nélküli darabokban. A jelenet-komponensek saját talaját a build
      átlátszóvá teszi, ha van háttér (Zoltan választása, 2026-10-04):
      automatikusan felismert szabály, csak a háttere változik.
    - **Kimaradt**: filmszemcse (CSS `@keyframes`, a doktrína tiltja), a
      slot-átmenetek (a shaderek lefedik), a shader-bemutató blokkok.
    - **Ajánlás a Brandből**: az open-design stílus mozgás-tokenjei csak ott,
      ahol eltérnek az átlagtól (152-ből 14 stílus); különben Premium.
    - **Komponensek szerepenként** ki- és bekapcsolhatók (legalább egy
      marad), stílus-változóik rögzíthetők; a zárás szerep a CTA
      varázslóé. Zoltan: a logo-brand-close szinte biztosan nem kell, a CTA
      chat dönti el.
    - **Render-költség**: nem dobunk ki semmit a lassúság miatt (a régi
      20%-os küszöb hüvelykujj-szabály volt); a mért arány a varázslóban
      áll. Mérés: `docs/wizards/motion.md` 6.
    - **Ellenőrzés**: mozgásos buildnél a check JSON-ját olvassuk; a csak
      átmenet-ablakon belüli szöveg-átfedés nem hiba (ott két jelenet
      szándékosan együtt látszik), minden más igen.
    - **Javaslat a DECISIONS 56-hoz** (a teljes registry, nyitott): a
      HyperFrames katalógus (hyperframes.heygen.com/catalog) csoportjai
      szerint válogatni: "Transitions" és "Motion & effects" a Mozgás
      varázslóé, "Scenes & demos" és "Data & charts" a jelenet-könyvtáré.

## 2026-10-05 (CTA varázsló)

75. **CTA varázsló: Comment Routing** (Zoltan, 2026-10-05; leírás és a
    K1-K14 válaszok: `docs/wizards/cta.md`). Eldöntve:
    - **A 15 kulcsszó a vidrev katalógusa** (`c2c-saas`
      `src/lib/keyword-catalog.ts`), hőmérséklettel és a "mit kap" szöveggel.
      Teszt rögzíti, csak a vidrevvel együtt változik. Saját kulcsszó és
      fordítás nincs, amíg a vidrevben sincs. A kulcsszó minden nyelvű
      videóban angol és nagybetűs.
    - **Az alap a módszer**: 1 videó = 3 különböző kulcsszó, GUIDE az elején
      (cold), COURSE a közepén (warm), TRIGGER a végén (hot). Akkor is ez
      érvényes, ha a user soha nem nyitja meg a varázslót.
    - **Helyek a script szerkezetéhez kötve**, százalék nélkül: eleje = az
      ígéret után (`open.cta`), közepe = a legértékesebb szakasz után
      (`ownershipCta`), vége = a zárásban, a végképernyő előtt (`own.cta`).
      A szám 0, 1, 2 vagy 3; kevesebbnél előbb a közepe esik ki, egynél a
      vége az alap, a user választhat. Bármelyik helyen bármelyik kulcsszó
      állhat, ugyanaz többször is (például egy csak cold videó).
    - **Mit kap a néző**: kulcsszavanként opcionális saját szöveg; üresen a
      vidrev "mit kap" szövege. A script ebből írja a mondatot.
    - **Szint**: Identity-szintű `cta.json`, videónként az 1. kapuban
      felülírható; a script mellé `commentCalls` kerül (mivel készült).
    - **A landing link csak a YouTube leírásba kerül**: a narráció nem
      mondja ki, a képen sincs (K10). A régi "link a leírásban" CTA ezzel
      megszűnt a scriptben.
    - **A képen**: a CTA mondata saját jelenetet kap a HyperFrames
      `cta-close` komponensével ("Comment GUIDE below" és a kulcsszó egy
      gombon), pontosan a mondat idejére. A gomb színe a hőmérsékleté
      (cold kék, warm borostyán, hot piros, a vidrev színei), olyan
      sötétre igazítva, hogy a felirata 4,5:1-gyel olvasható legyen. A
      sáv (alsó csík a futó jelenet fölött) kimaradt: új komponens és új
      réteg kellene hozzá.
    - **Ellenőrzés**: a script minden tervezett helyen kimondja a kulcsszót
      nagybetűvel, máshol nem; a jelenet-tábla minden CTA-mondatnak saját
      `cta-close` jelenetet ad, a gomb mindig a kulcsszó, ez a jelenet nem
      cserélhető. A hang a kulcsszót sima szóként kapja ("Guide"), hogy ne
      betűzze; a PDF marad betűzve.
    - **logo-brand-close**: kivezetve (K12), az AI nem tervezi, nem
      cserélhető rá; régi jelenet-táblák vele is buildelnek.
    - **A varázsló** jelzi, hogy a kulcsszavas kommentekre valakinek
      válaszolnia kell (kézzel vagy egy eszközzel); a vidrev neve nem
      szerepel az appban (független brand).
    - **Előnézet**: olcsó, render nélkül: idővonal, a mondatok vázlata, és
      állókép a CTA-jelenetről a brand színeivel.
76. **A videó fő színe mindig olvasható**: ha a Brand kártya fő színe 3:1
    alatt van a háttéren (Zoltan próbája: #fe90e8 a #fffdf5-ön, 1,99:1), a
    videó egy sötétebb változatot kap (`cardTheme`); a kártyán az eredeti
    marad. Oka: a komponensek egész mondatokat írnak `--brand` színnel.
77. **Publikálási adatok a videó mellett** (Zoltan, 2026-10-05): render után
    `<video>.publish.json` (séma `itv-publish/1`,
    `runner/schema/itv-publish.schema.json`) és `<video>.comments.txt`. Csak
    tények, amiket az app pontosan tud: fejezetek a hang idejéből, a script
    szó szerint, a felvett mondatok idővel, a komment-CTA-k kulcsszóval,
    hőmérséklettel és időponttal, a landing URL, a keresési kulcsszó, a
    következő videó. Cím, leírás, tag nem (az a publikáló eszköz dolga, nincs
    duplikáció). Nem teljesen csendes: "Export publishing data" gomb a 4.
    kapuban (a Rust `export_publish` csak ezt a fájlt, csak a projektmappából
    másolja), és "Copy comment keywords". A séma a közös nyelv a PDT felé: ma
    fájl, később egy API-hívás törzse; csak bővül, törő változás új verzió.
78. **Újrahasznosítható CTA-szegmensek és a végképernyő farok** (Zoltan,
    2026-10-05, S1-S8; `docs/wizards/cta.md`). Eldöntve:
    - **Egy hely, egy hang**: egy CTA-helyet vagy a narrátor tölt ki
      (CTA-mondat és `cta-close` jelenet), vagy a saját szegmens, soha nem
      mindkettő. Ahol szegmens szól, a script oda nem ír CTA-mondatot.
    - **A kulcsszó a kapocs**: minden szegmens egy kulcsszóé (kötelező), a
      helyen csak a hely kulcsszavának szegmensei választhatók.
    - **Könyvtár Identity-nként** (`<identity>/segments/`), legfeljebb 30 mp,
      kulcsszavanként legfeljebb 3; több közül alapból a legrégebben
      használt jön (váltakozás), az 1. kapuban kiválasztható.
    - **Forrás**: feltöltött videó (kulcs és költség nélkül, hogy a HeyGen
      kredit elfogyása se állítsa meg a publikálást), vagy az appban: a
      narrátor felolvassa a mondatot, a HeyGen teljes képes avatar-videót
      készít rá. A hely ugyanaz, bármelyik forrásból jön.
    - **Beszúrás szakaszhatáron**: eleje az OPEN után, közepe a
      legértékesebb szakasz után, vége az OWN után. A szegmens hangja a
      hangsávba kerül a narráció blokkjai közé, a zene ugyanúgy szól alatta
      (a legegyszerűbb megoldás); a klip a buildben néma, teljes képes, a
      jelenetek fölött. A szegmens a projektbe másolódik (mentés, másik gép).
    - **"Previously selected"**: egy új videó 1. kapuja a legutóbbi videó
      választásával indul (`cta-last.json`).
    - **Végképernyő farok** (a DECISIONS 53 megvalósítása): a vége-CTA után
      N mp csend, az utolsó kép kitart, a zene lecseng; alap 20 mp, a
      Settings, Identity, CTA oldalon 0, 5, 10, 15 vagy 20. A farok más,
      mint a vége-CTA: a YouTube rakja alá a saját elemeit.
    - **Ellenőrzés**: a jelenetek hosszába nem számít a szegmens és a farok
      ideje; a HyperFrames check a szegmens alatt rejtett jelenet
      találatait nem számolja (`covered.json`).
    - A `publish.json` a szegmenses CTA-kat is tartalmazza (`via`), és a
      végképernyő kezdetét.
79. **"Previously used" hang és avatar, Identity-nként** (Zoltan,
    2026-10-05): minden brand (Identity) megjegyzi az utoljára használt
    narrátor-hangot és avatar-lookot (`<identity>/last-used.json`, a sikeres
    hang- és avatar-készítéskor frissül). A 2. és az 5. kapu ezzel indul,
    "previously used" jelöléssel; a lista csak a "Choose another" gombra
    nyílik ki. Sorrend: a videó saját korábbi választása, utána a brand
    legutóbbija, utána a Settings alapja. Brandenként külön, így több brand
    futhat párhuzamosan más hanggal és avatarral; egy brand később bármikor
    válthat. Az Identity export és Duplicate a teljes mappát viszi, ezzel
    együtt.
80. **Javítások Zoltan 2026-10-05-i próbája után** (`feedback/2026-10-05/NOTES.md`):
    a kontakt lap a kamera-keret nélküli lapról készül (a keret üres
    pillanatképeket adott); a `cta-close` sora a buildben 0,68 em
    betűszélességgel méreteződik (a registry fájl változatlan); a script
    hossza 85-120% a kért percekhez, egy javító hívással; a CTA-hely alapból
    "auto" (a szegmens szól, ha a kulcsszóhoz van); a lista-komponensek elemei
    a kimondásukkor jelennek meg (`cues` a szóidőkből); a jelenet-tervező
    listát, rajzot és kiemelést kér a sima kulcsmondat helyett; a fejezetek
    és a kulcsszavak a 4. kapuban összecsukva, a publikálási adatban. Nyitott:
    B-roll (valódi felvétel vagy kép), Zoltan dönt.
81. **CTA második kör javításai** (Zoltan, 2026-10-05, `feedback/2026-10-05/NOTES.md`
    második rész): a választó sorrendje mindig Cold, Warm, Hot; a többi hely
    kulcsszava jelölve; a szegmens-választó jelöli a CTA kulcsszavait; a
    feltöltés két külön út (A: saját klip opcionális "mit mond" szöveggel a
    felirathoz és a publikálási adathoz, B: HeyGen); szegmensnél nincs "mit
    kap" szöveg; a régi mentések "Narrator"-ja "auto" (`modesV`); a script
    minimum szószámot kap és a hosszra két javító kört; a Gemini tartalék
    harmadik modellel (Flash Lite); a 2 mp alatti jelenetet a gép összevonja.
82. **Saját felvétel-könyvtár (B-roll) Identity-nként** (Zoltan, 2026-10-05,
    B1-B3): Settings, Identity, Footage. A klip némán szól, a hang végig a
    narrátoré. Eldöntve:
    - **B1**: minden klipnek leírása van (mi látható rajta); a jelenet-tervező
      ezt párosítja a mondatokkal. Feltöltéskor az AI a klip három
      állóképéből magától megírja (a user AI-kulcsával), a user átírhatja.
    - **B2**: alapból "Its own scene" (csak a felvétel, teljes képen);
      választható "Behind the words" (a felvétel a jelenet alatt, a háttér
      színével halványítva, a jelenet szövege rajta).
    - **B3**: egy hosszú klipből minden videó más darabot kap: a darab mindig
      egy vágásnál kezdődik (ffmpeg jelenet-felismerés), és a legkevésbé
      használt részt választja; a használat videónként tárolva, újrabuildnél
      nem duplázódik. A rövid klip ismétlődik.
    - A tervező legfeljebb minden negyedik mondat alá tesz felvételt, CTA-
      mondat alá soha; a `scenes.json` `footage` listája. Legfeljebb 200 klip,
      klipenként 10 perc.
    - Kutatás (2026-10-05): a HeyGen API-n nincs stock-videó keresés (csak hang
      és zene, `GET /v3/audio/sounds`), ezért a stock kereső Pexels és Pixabay
      ingyenes kulccsal jön (a Getty fizetős); az OpenArt csak MCP-n érhető el
      (OAuth), sima API nincs, az appba nem köthető be.
83. **Eleven v4 választható** (2026-10-05): a 2. kapuban "Voice model":
    Multilingual v2 (tesztelt, alap) vagy Eleven v4 (`eleven_v4`, 2026-09-28,
    a legkifejezőbb); a brand megjegyzi. Az ElevenLabs a v4-nél a magyart
    még nem sorolja fel. A kipróbálás Zoltané (kulccsal). (2026-10-06: a v4
    az alap, és tud magyarul, DECISIONS 96.)
84. **Jelenet-tábla a 8 perces teszt után** (2026-10-05, `feedback/2026-10-05/NOTES.md`
    harmadik rész): a CTA-szegmensek és a YouTube végképernyő saját sort kapnak
    (`sceneRows` `inserts`); a sor hossza a jelenet saját ideje; sorszám és
    "Go to scene N" a jegyzeteknél; az egyetlen fajta jelenet jelölve; a
    jóváhagyás után a következő lépés kiírva; a csere csak az első jelenetet
    nézi.

## 2026-10-05 (UI szebbé tétele, "Ford-elv")

85. **A ONE Video tabokra bontva** (Zoltan, 2026-10-05, K1-K11). Elv: a user
    mindig egyetlen döntést lát, egy képernyőn, és minden futó munka azonnal
    látszik. Eldöntve:
    - **K1** hat tab: 1 Script, 2 Voice and music, 3 Scenes, 4 Avatar
      (optional), 5 Preview, 6 Your video. Nincs külön Render tab: a Preview
      "Approve and render" gombja elindítja a renderelést, és átvisz a 6.
      tabra, ahol a haladás, majd a kész videó, a letöltés, a mentés és a
      backup van.
    - **K2** minden tab mindig kattintható. Ahol egy korábbi lépés kell, a tab
      megmondja, mi hiányzik, és egy gombbal odavisz. Kiút AI nélkül: (a) a
      script mindig beírható vagy beilleszthető AI nélkül ("Write it
      myself"); (b) a jelenet-táblánál "Simple plan without AI" (runner
      `simple-scenes`, szabály alapú terv, ugyanazokkal az ellenőrzésekkel).
    - **K3** nincs "Render anyway". A Preview-ban jelenetenként lehet
      változtatni: a képre kattintva panel nyílik (mit mond a narrátor, a
      képernyő szövege szerkeszthető, másik jelenet ugyanabból a fajtából,
      "Ask for a change" saját szavakkal, egy kis AI-hívás: `refill-scene`
      `request`), a változtatások gyűlnek, "Update the preview" egyszerre
      építi újra. Mindig látható útmutató: "How to change things before the
      render".
    - **K4** választók a HeyGen mintájára: az avatarnál először az emberek
      (egy kártya, egy kép), kattintásra csak az ő lookjai; két fül ("Your
      avatars", "HeyGen avatars" kereséssel); fix magasságú, saját magában
      gördülő keret. A hang ugyanígy: "My voices" és "Library", kártyák
      lejátszás gombbal. Nyitott: van-e máshol is ilyen hosszú lista (zene,
      B-roll, Brand galéria).
    - **K5** a megnyomott gomb helyén jelenik meg a haladásjelző, és a lap
      odagördül; kész lépés után az eredményhez gördül; jóváhagyás után a
      következő tab nyílik meg magától; minden tab alján mindig látható sáv
      az egyetlen fő gombbal; futás közben a tab neve alatt is látszik a
      százalék; ugyanaz a gomb mindenhol tiltva, amíg a munka fut (az app
      központi munkalistájából, `work.svelte.ts`, akkor is, ha a nézetet
      bezárták és újranyitották).
    - **K6** ha már van eredmény, az Approve az egyetlen kiemelt gomb; a
      "Make again" sima gomb, és megkérdezi, mibe kerül.
    - **K7** "Save a copy to Google Drive / OneDrive / Dropbox" a gépen lévő
      szinkronmappába (nincs bejelentkezés, nincs API, nincs költség), mellette
      "Download". Rust `export_video`, soha nem ír felül.
    - **K8** nincs közvetlen YouTube feltöltés (OAuth, Google audit, közös
      napi kvóta, PRD 4: a publikálás a PDT-é). Helyette "Open YouTube
      Studio": megnyitja a Studiót, megmutatja a fájlt a mappában, mellette
      másolható cím, leírás (a fejezetekkel) és tagek, lásd 86.
    - **K9** most csak a Preview-n belüli jelenet-javítás (K3). Az élő, hangos
      előnézet renderelés nélkül később, Zoltan még nem döntött.
    - **K10** (a) egy képernyő, egy döntés, egy fő gomb; (b) az app előre
      dolgozik, de csak ingyen (az avatar-lista és a képei a videó
      megnyitásakor töltődnek); (c) hosszú lépés végén, ha az app nincs
      előtérben, néma jelzés (a tálca gombja villog), **az app soha nem ad ki
      hangot**; (d) élő előnézet: később; (e) idő- és költségösszesítő: nem kell.
    - **K11** a tab színe és szava: Done (zöld), Now (kiemelt keret), Next
      (normál), Optional (halvány), Failed (piros). Nincs pipa ikon. Célméret
      1100x620 (Zoltan gépén az ablak 1100x700-zal indul, teljes ablakban
      1280x650); a hosszú tartalom a saját keretében gördül.
    - A haladásjelző javítva (mérés a naplóból, 2026-10-05): a render a
      kockaszámból számol (a HyperFrames saját százaléka 2 mp alatt 20%-ot
      mondott, utána percekig állt); a javító és újrapróbáló AI-körök növelik
      a becsült időt; a zene becslése a videó hosszából (eddig mindig 20 mp
      volt, valójában 95).
    Állapot (2026-10-05 késő este): **kész, Zoltan próbájára vár.** Tabok,
    munkalista, haladásjelző, a hat tab, a Settings választói is kártyásak,
    `simple-scenes`, `skip-gate`, `refill-scene request`, `youtube-texts`,
    `export_video`, az app teljes ablakban indul. Próba a böngészős
    próbakörnyezetben 1100x620-ban (képek: `feedback/2026-10-05/ui-tabs/`).
    Tesztek: 197 Node, 43 Rust, e2e 33/33.
86. **YouTube szövegek: csomagolás a gyártás előtt** (Zoltan, 2026-10-05,
    K8; frissítve 2026-10-07): a DECISIONS 77 eddig a címet, a leírást és a
    tageket csak a PDT-nek hagyta. Az app is megírja őket, de **már az 1.
    kapuban (Script)**: a script írásakor egy kis AI-hívás három
    cím-ötletet, egy rövid összefoglalót és tageket ír
    (`<project>/packaging.json`, `runner/gates/render/youtube.mjs`). A
    user ott választ címet (vagy sajátot ír), szerkeszti az összefoglalót
    és a tageket; a választott cím a script címe is (`script.json`, a
    `script.md` fejléce, a projekt neve). Újraírt scriptnél a csomagolás
    újragenerálható ("New ideas"), de a user választása megmarad, amíg ő
    nem cseréli; addig csak az ötletlista bővül. A render után a leírás
    ebből és a pontos adatokból áll össze kóddal (landing link,
    komment-kulcsszavak, fejezetlista), nem az AI-tól; a Video tabon
    másolás gombbal. Nem duplikáció: a PDT a sajátját csinálja. A
    lokalizáció és a fordítás (YouTube API, napi 10000 egység kvóta, egy
    teljes fordítás kb. 400) később, Zoltan most nem kéri.
87. **Az app a tálcán él, mint a Claude** (Zoltan, 2026-10-05, A változat):
    az ablak X gombja nem lép ki, csak elrejti az ablakot; az app és minden
    futó munka (render, hang, avatar) megy tovább. Tálca-ikon (Windows: a
    tálca sarka, macOS: a menüsor): kattintásra visszajön az ablak, a
    menüje "Open" és "Quit"; a Quit futó munkánál rákérdez, mert leállítja.
    Az első elrejtéskor egy üzenet megmondja, hová lett az app. A tooltip
    mondja, mi fut (a rendernél százalékkal). Egy példány: újraindításkor a
    meglévő ablak jön elő (`tauri-plugin-single-instance`). macOS-en a Dock
    ikon is visszahozza. Hang nincs. A gép alvása vagy a lefedett laptop így
    is leállítja a munkát. Kód: `app/src-tauri/src/tray.rs`.
88. **Natural voice (humanizer) a script után** (Zoltan, 2026-10-05, H1-H4).
    Kutatás (2026-10-05): a YouTube 2026 júliusától "Inauthentic Content"
    néven nem engedi pénzt keresni a generikus, sablonos, tömegből gyártott
    tartalommal, a felkavaró tartalommal és az érzékeny témáról beszélő
    AI-personával; az AI-eszköz használata rendben van, ha van valódi emberi
    hozzáadott érték. A scriptet nem AI-detektor méri. Ezért a humanizer egy
    szerkesztői kör: kiírja a gépies mintákat (töltelékszavak, mindig hármas
    felsorolás, "nemcsak X, hanem Y", egyforma mondathossz), élőbeszédszerű
    ritmust ad; Strongnál személyes, beszélt hangot (te és én, kérdés a
    nézőnek, konkrét példa, csak a meglévő tényekből). Az app nem ígéri, hogy
    bármilyen szűrőn átmegy. Eldöntve:
    - **H1** csúszka három állással: Off, Light, Strong.
    - **H2** Identity-nként a Settings Brand Voice oldalán, videónként a
      Script tabon felülírható.
    - **H3** "Your own angle": opcionális, lenyíló mező a Script tabon (saját
      történet, vélemény, példa), üresen hagyható; az AI erre építi a scriptet.
    - **H4** alapállás Off (minden kör egy plusz AI-hívás).
    Csak a kimondott mezőket írja át (szerkezet, kulcsszavak maradnak), utána
    ugyanazok az ellenőrzések; ha egy javító kör után sem megy át, az első
    script marad, és az app megmondja. Kód: `runner/gates/script/humanize.mjs`.
89. **AI-modell és effort lépésenként; natív Claude csatlakozó** (Zoltan,
    2026-10-05, M1-M4). Settings, AI and keys (az App és az Identity oldalán
    is): az alap modell és effort, alatta a "Choose a model for each step"
    kapcsoló, három sorral: Script (a script és a natural voice), Scenes (a
    terv és a jelenet-javítások), Small texts (YouTube szövegek, javaslatok,
    B-roll leírás). Minden választás két lista: Modell (például Claude Opus
    5.5, Sonnet 5.5, Haiku 4.5, Gemini 3.5 Flash, vagy "Other model") és
    Effort (Low, Medium, High, Claude-nál Extra high és Max is; Default a
    szolgáltató sajátja). Kikapcsolva minden lépés a Settings alap modelljét
    használja (M4). A Script és a Scenes tabon "AI: Claude Opus 5.5, High
    effort · Change"; a Change az Identity beállításaiba ment, így a
    következő videó is azzal indul ("previously used", egyetlen igazságforrás
    a Settings). A hang, a zene és az avatar saját szolgáltatást használ, a
    build, a Preview és a render semmilyen AI-t.
    **Eltérés a PRD 9. pontjától, Zoltan jóváhagyásával:** a Claude effort csak
    a natív Messages API-n állítható, ezért a Claude saját csatlakozót kap a
    hivatalos Anthropic SDK-val (`@anthropic-ai/sdk` 0.131.0, pinnelve, a
    runner mellett, `runner/providers/claude.mjs`); a többi szolgáltató marad
    az OpenAI-kompatibilis kapun (Gemini és OpenAI: `reasoning_effort`,
    OpenRouter: `reasoning.effort`). Claude: `output_config.effort`, a
    gondolkodás adaptív (a mai modelleken nem kapcsolható ki), nincs
    temperature, elutasításnál szerver oldali tartalék modell (`fallbacks:
    "default"`). Az alap Claude modell `claude-sonnet-5-5`. Mérés nincs
    (Zoltan: elég, ha a saját kulcsával használhatja). A Claude Pro és Gemini
    Pro előfizetés nem API kulcs; ingyen tesztelni a Gemini API ingyenes
    keretével és az OpenRouter ingyenes modelljeivel lehet.
90. **Stock kereső: a pilot után, terv** (Zoltan, 2026-10-05). Még nem épül;
    a pilot (3. fázis) dönti el, hiányzik-e a kezdő usernek a valódi kép.
    Cél: B-roll annak, akinek nincs saját felvétele (a "diavetítésszerű"
    visszajelzés, `feedback/2026-10-05/NOTES.md` 9). A saját
    felvétel-könyvtár (DECISIONS 82) már kész, a stock arra épül.
    Miért nem a HeyGen: az API-ján nincs stock videó keresés (csak hang és
    zene); a szerkesztőjében lévő stock az appból nem érhető el.
    Források (kutatás 2026-10-05): ingyenes, API-val, kereskedelmi célra,
    forrásmegjelölés nélkül: **Pixabay** (4,3 millió kép, videó, zene; kulcs
    ingyen), **Coverr** (fejlesztői API, ingyenes, a próba-alkalmazás havi
    1000 hívás), **Pexels** (ingyenes, de 2026-10-05-én új kulcsot nem adott
    ki; akinek van, használhatja). Fizetős, saját kulccsal később: Storyblocks
    (egyedi ár), Shutterstock, Vecteezy. Mixkit és Videvo: nincs nyilvános API.
    Javasolt felépítés:
    - egy közös "stock source" réteg a runnerben (keresés, előnézet, letöltés,
      licenc és szerző), forrásonként egy kis illesztő; elsőnek Pixabay és
      Coverr, a Pexels annak, akinek van kulcsa;
    - Settings, Identity, Footage: "Add from stock" kereső a meglévő
      kártyás választóval (LookPicker mintája), előnézettel; a kiválasztott
      klip a saját könyvtárba kerül, a forrással és a licenccel együtt;
    - a Scenes tabon opcionális "Find clips for this video": az AI a script
      szakaszaiból keresőszavakat javasol, a user választ, soha nem tölt le
      magától;
    - a jelenet-tervező onnan úgy használja, mint a saját felvételt;
    - a publish.json `credits` mezőt kap (forrás, szerző, licenc);
    - kulcs nélkül a gomb nem látszik, az onboardingba nem kerül új lépés.
91. **Megbízható futás és átláthatóság** (Zoltan, 2026-10-06, a hibátlanítás:
    "sose jelenjen meg váratlan hiba, mindig tudja a user, mi a státusz,
    várnia kell-e, lecsukhatja-e a gépet; ha valami történt vagy épp semmi,
    ki tudjuk nyomozni"). Zoltan a hét kérdésre a javaslatokat fogadta el.
    - **Folyamatfa:** minden runner-futás egy Windows Job Objectben (macOS:
      saját folyamatcsoport). A Stop, az őrkutya és a kilépés a Node mellett
      a render Chrome-ját és az ffmpeg-et is leállítja; korábban kilépés után
      ezek gazdátlanul tovább futottak.
    - **Stop gomb** minden haladásjelzőn. A várakozó munka kikerül a sorból,
      a futó leáll mindenével. Fizetős lépésnél (AI, hang, zene, HeyGen) egy
      megerősítés mondja meg, mi marad kifizetve. A leállítás nem hiba: szürke
      dobozban "Stopped by you." (ITV-STOPPED).
    - **Őrkutya:** az automatikus leállítás aznap kikerült, helyette
      checkin: DECISIONS 92.
    - **Türelmes újrapróbálás:** AI: modellenként 3 gyors próba, a többi
      modell, majd várakozás és új kör (15, 30, 45, 60 mp, kb. 3 perc), a sáv
      kiírja ("Gemini is busy (HTTP 503). Trying again in 30 s"). A "Test key"
      nem vár. Hang (Gemini TTS mondatonként, ElevenLabs blokkonként) és HeyGen:
      hívásonként kb. 3 perc türelem. Egy elutasított kulcs vagy kérés nem
      próbálkozik újra.
    - **Nincs dupla fizetés:** a hang kész blokkjai egy elbukott futás után
      megmaradnak (`audio/blocks-cache/`), egy kész hang törli őket (az
      "újra" új felolvasás). A HeyGen megrendelt videóinak azonosítója
      `avatar/pending.json`-ba kerül, az újrafuttatás átveszi őket; a
      lekérdezés kibírja a hálózati kiesést (ébredő laptop) a 30 perces
      határig.
    - **Javító körök:** a script és a jelenet-tábla legfeljebb két javító
      hívást kap (SPEC 5: egy volt). A jelenet-táblánál ami a javítások után
      csak ízlés (ugyanaz a komponens egymás után, 12 mp-nél hosszabb jelenet),
      az figyelmeztetés, nem hiba. A hibaüzenet megmondja a kiutat (Simple
      plan, saját script).
    - **Lecsukás, lépésenként** (a sáv alján): HeyGen avatar: le lehet csukni,
      a HeyGen a saját gépein dolgozik, az app ébredéskor átveszi; AI, hang,
      zene: nyitva kell maradnia, mert élő kapcsolat; render, build: nyitva,
      mert a gépen fut. A runner észreveszi, ha a gép aludt ("The computer
      slept for 12 min"), és ha egy lépés 60 mp-nél tovább csendes ("No news
      for 2 min, but it is alive" vagy "No sign of life").
    - **Beragadt "Running":** a Rust mag átadja, min dolgozik valóban
      (`liveProjects`); a régi PID-ellenőrzés csak tartalék (Windows
      újrahasznosítja a PID-eket). Az üzenet: "Interrupted: this step stopped
      before it finished".
    - **Autopilot folytatás:** `project.json` `autopilotRun` jelzője; ha a
      felület újratölt vagy az app bezárul, a videó megnyitásakor magától
      folytatja, és kiírja. Ami kész és jóváhagyásra vár, azt jóváhagyja, nem
      csinálja újra; egyszerre csak egy fut.
    - **Render állapot** a `project.json`-ban (`render`: running, done,
      failed), így egy elbukott render újraindítás után is látszik. A render,
      a zene és a zenecsere kudarca a videó `log.txt`-jébe is bekerül.
    - **Hibák emberi nyelven:** a runner minden váratlan hibát elkap (a
      részlet a stderr-en a naplóba, a user egy mondatot lát); a "fetch
      failed" mellé: "The internet connection may be down". A felület egy
      hibahatárt kapott: ha egy oldal rajzolás közben elbukik, nem fehér
      képernyő jön, hanem "This page ran into a problem", "Try again" és
      "Back to the list" gombbal, naplózva (`ui_crash`).
    - **Export diagnostics** (Settings, App, General): egy zip a naplóval
      (30 nap), a beállításokkal és minden ONE Video `project.json`-jával,
      `log.txt`-jével és a motor naplóival. Kulcs, hang, videó és script
      szöveg nincs benne. A naplóban mostantól a modellnevek (from, to) is
      olvashatók, és egy elbukott futásnál a runner stderr-je.
    - **Windows fájlzár:** a `project.json` egyedi ideiglenes fájllal és kb. 2
      mp-es újrapróbálással íródik (vírusirtó, felhő-szinkron).
92. **Checkin az őrkutya helyett: előbb megnézi, a user dönt** (Zoltan,
    2026-10-06). A 91. pont automatikus leállítása (5 perc csend, a motornál
    15 perc) kikerül: egy lépést soha nem állít le az app magától, csak a
    Stop gomb.
    - A Rust mag 15 mp-enként ránéz a futásra: beszél-e a runner (20 mp-es
      életjel), és dolgozik-e bármelyik folyamata (a teljes folyamatfa
      processzorideje nő-e; Windows: a Job Object elszámolása, macOS: `ps`).
    - A sávon csak az állapot látszik, szám nélkül: "Checked 8 s ago:
      working", "waiting for the service" vagy "seems stuck".
    - "Seems stuck": 10 percig se életjel, vagy egy a gépen futó lépésnél
      (render, build, ellenőrzés) se munka, se új lépés. Egy szolgáltatásra
      váró lépés (AI, hang, HeyGen) várakozás közben nem dolgozik, ezért ott
      ez nem számít elakadásnak. A sáv ilyenkor kiírja, hogy lehet várni
      vagy Stopot nyomni.
    - A naplóba egyszer kerül be, amikor elakadtnak tűnik ("stalled"), és
      egyszer, amikor újra mozog ("moving").
    - A kilépés marad, ahogy volt: az X a tálcára tesz, minden fut tovább;
      a Quit (megerősítés után) mindent leállít, a Chrome-ot és az ffmpeg-et
      is.
93. **Stock videó és kép: új terv, még nem épül** (Zoltan, 2026-10-06),
    `docs/stock.md`, a 90. pont vázlatát váltja. Zoltan pár nap múlva dönt.
    - Első kör: Pixabay és Coverr (mindkettőhöz van kulcsa). Az Unsplash
      (jelentkezés beadva 2026-10-06) és a Pexels (új kulcs szünetel) rejtve
      marad, amíg nincs kulcs. Shutterstock, Storyblocks, Getty félretéve.
    - Nagyon egyszerű kereső, a HeyGenéhez hasonló: Videos és Images fül,
      Landscape vagy Portrait, licenc szerinti szűrő, HD vagy 4K, kártyák
      "Use" gombbal; a Scenes tabon jelenetenként és a Footage oldalon.
    - Licenc minden elemhez eltéve, `credits` a `publish.json`-ban, forrássor
      a YouTube leírásban.
    - **Mennyi stock (Claude döntése, Zoltan rábízta; felülbírálható):** csak
      ahol a narráció valami láthatót mond; legfeljebb minden harmadik
      jelenet, kettő nem jön egymás után, CTA alá soha, a saját felvétel
      előnyt kap. Később a Settingsben választható (Off, Some, More).
    - Képek lassú mozgással, saját mozgás nélkül: jelölt a registry
      `yt-camera-move` komponense és a Motion profil "Push in" kamerája.
94. **AI B-roll: generált, egyedi klipek, terv, még nem épül** (Zoltan,
    2026-10-06), `docs/ai-broll.md`. Zoltan: a videó alatti forráslista és a
    copyright vita kockázata helyett egyedi, generált klip. A runner a user
    saját kulcsával hívja a generátort (HeyGen Video 1 a meglévő HeyGen
    kulccsal, Veo 3.1 Lite a meglévő Gemini kulccsal), letölti a klipet,
    ami a felvétel-könyvtárba kerül; a HyperFrames rendereli. Becslés egy 8
    perces videóra (kb. 60 mp B-roll): 1,8 USD (HeyGen Video 1) vagy 4,8 USD
    (Veo 3.1 Lite, 1080p). Becsült ár és jóváhagyás minden megrendelés előtt,
    költségplafon videónként, Autopilotban alapból ki. A Remotion nem
    generátor, és a render a HyperFrames marad. A YouTube "altered or
    synthetic content" jelölését az app jelzi. A stock tervben
    (DECISIONS 93) a forrásmegjelölés csak belül tárolódik, a videó alá nem
    kerül.
95. **AI B-roll és stock: Zoltan döntései; a sorrend** (Zoltan, 2026-10-06).
    Felírva, nem épül; az AI B-roll a 2. fázis lezárása után, külön chatben.
    - **Alapból kikapcsolva.** Bekapcsolva az alap generátor a **HeyGen
      Video 1**; a Veo 3.1 csak második választás, és lehet, hogy kimarad.
    - **Költségplafon videónként: a user csúszkája a Settingsben** (Settings,
      Identity, Footage), **alap 1 USD** (a csúszka 1 és 10 USD között, 0,50-es
      lépésekkel). Indok: a HeyGen avatar már pénzbe kerül, egy videó
      összesen pár dollár maradjon. A plafon fölött az app mindig kérdez.
    - **Elkészült klipek a userénél maradnak, újrahasznosíthatóan:** Settings,
      Identity, Footage alatt külön rész, "AI B-roll" (a saját felvételek
      mellett). Minden klip a képleírásával, a generátorral, a dátummal és
      azzal, hogy melyik videókban szerepelt. Egy újabb videónál a tervező
      előbb ezek közül választ (ingyen), csak a hiányzót rendeli meg.
    - **A stock (Pixabay, Coverr) felfüggesztve**, amíg Zoltan másképp nem
      dönt (`docs/stock.md`, DECISIONS 93). Csak az AI B-roll iránya marad,
      így copyright kockázat nincs.
    - **Sorrend:** előbb a 2. fázis lezárása (új chat), utána az AI B-roll
      (új chat, `docs/ai-broll.md` 7). A Mac build ráér: nem a 2. fázis
      lezárásához kell, hanem a 3. és 4. fázis után (a kiadás előtt).


## 2026-10-06 (a 2. fázis lezárása)

96. **Javítások Zoltan c105d15-ös próbája után** (`feedback/2026-10-06/NOTES.md`).
    - **A check a kamera nélküli lapon fut.** A Mozgás profil kamera-burkolója
      miatt a `hyperframes check` minden jelenetet 0 px magasnak mért, és a
      constellation-hub címkéi "átfedtek"; a build hatszor elbukott. A render
      jó volt (kivágott renderrel ellenőrizve). A kontakt lap és a check közös
      segédet kap (`withoutCameraPage`), a build utána visszakapja a kamerát.
      A check hibaüzenete a jelenet számát mondja.
    - **Eleven v4 az alap ElevenLabs modell** (Zoltan: meghallgatta, sokkal
      jobb, és tud magyarul; a 83. pont "a v4 nem sorolja fel a magyart" része
      elavult). A v2 választható marad ("older"), nyelvkódot nem kap; egy
      visszadobott nyelvkód után a runner egyszer nélküle próbál.
    - **A kapuk sorrendje a tabok szerint:** script, voice, scenes, avatar,
      review (`GATES`). Eddig a Preview build a már jóváhagyott, kifizetett
      avatart "todo"-ra állította.
    - A külső linkek (kulcs-oldalak, YouTube Studio) engedélyezve a Tauri
      capability-ben, csak a nevezett hostokra.
    - Az AI hibák a szolgáltató saját mondatával; az elfogyott kredit külön
      mondattal.
97. **A 2. fázis lezárva** (2026-10-06). A kimenet megvan: az appból kész
    videó, a teljes menettel (Script, Voice and music, Scenes, Avatar,
    Preview, Your video), Autopilottal, a Brand, Motion, CTA varázslóval,
    Identityvel, mentéssel és naplóval. Tesztek: 218 Node, 47 Rust, e2e 33/33,
    mind zöld. PR `phase-2` a main felé, Zoltan előzetes engedélyével Claude
    merge-öli (Zoltan, 2026-10-06: "te merge-ölöd, elég ha tájékoztatsz").
    A Drive tükör a 3. és 4. fázis után frissül (Zoltan). A SPEC és a PRD
    menet-leírása a kódhoz igazítva (avatar a Preview előtt, Gemini TTS az
    Edge TTS helyett, a könyvtár a 39 archetípus helyett). Következő: AI
    B-roll (DECISIONS 94-95, `docs/ai-broll.md`), utána a 3. fázis (pilot).


## 2026-10-06 (AI B-roll)

98. **AI B-roll: Zoltan döntései az építés előtt** (2026-10-06, a HeyGen
    Video 1 mai leírása után, `docs/ai-broll.md` 8). A 94-95. pontot
    pontosítja.
    - **Minőség: 480p, 768p (alap) és 1080p**, a Settings, Identity, Footage,
      AI B-roll részben. A HeyGen Video 1 csak 480p, 768p és 2k felbontást
      ad; a "1080p" a 2k klipet rendeli (a 768p árának háromszorosa, csak
      16:9 és 9:16), és a render 1920x1080-ra kicsinyíti. 2K és 4K videó
      most nem kell.
    - **Próba mód a telepítőben:** generátor "Test clips (free,
      placeholder)", ingyenes teszt-minta a gépen, hogy a menet a HeyGen
      kredit előtt végigpróbálható legyen. A próbaklip jelölve van, és a
      jelenet-tervező magától nem teszi videóba.
    - Ebben a chatben nincs fizetős hívás (Zoltannak most nincs HeyGen API
      kreditje). Az első valódi próbaklip (legfeljebb 5 mp) a kredit után,
      Zoltan kifejezett jóváhagyásával.
    - A Veo illesztő nem épül, csak ha Zoltan külön kéri.
99. **AI B-roll: megépült** (2026-10-06, branch `ai-broll`). Claude döntései
    építés közben, Zoltan felülbírálhatja (`docs/ai-broll.md` 8):
    - Klip nem kerül az első és az utolsó jelenetbe, kommentkérő jelenetbe
      és saját felvétel alá; legfeljebb a jelenetek harmada, szomszédos
      jelenetbe soha. Egy klip 1-3 mondat alá kerül egy jeleneten belül
      (2-15 mp narráció), a `scenes.json` `footage` listájában, mint a saját
      felvétel (DECISIONS 82), így a build és a render változatlan.
    - A rendelt hossz egész másodperc, legalább 5 (a HeyGen minimuma). A
      becslés a rendes árral számol, az októberi féláras akció alatt tehát
      felfelé téved. Az egyenleg a fiókból jön (`GET /v3/users/me`).
    - A plafon a videóra elköltött összeget is beszámítja; fölötte a rendelés
      csak a user külön igenjével megy (`allowOverCap`), magától soha.
    - Nincs dupla fizetés: `broll/pending.json` a leadott rendelésekkel, és
      a HeyGen `Idempotency-Key` fejléce (ugyanaz a klip ugyanaz a rendelés).
      Egy korábbi tervhez leadott rendelés sem vész el (újratervezés vagy új
      hang közben): a következő Make letölti a könyvtárba, ingyen. A
      videóra elköltött összeg az újratervezés után is számít a plafonba.
      A lecsukás szabálya az avataréval azonos (a HeyGen dolgozik).
    - Remove: ki a videóból, a könyvtárban marad. Make again: új rendelés,
      előtte ár és kérdés; a régi klip a könyvtárban marad.
    - Új jelenet-terv után az elkészült klipek visszakerülnek a mondataik
      alá; új hang után a B-roll terv elavul.
    - A klip a jelenet-tábla változása: a Preview újra kell, a jelenetek és
      az avatar jóváhagyása marad.
    - `publish.json` `syntheticMedia` (a séma bővül, nem törik); a Your video
      tab a YouTube lépésnél kéri az "Altered or synthetic content" igent,
      ha egy klip valóságosnak látszik.
    - A klipek az Identity könyvtárába kerülnek (`source: "generated"`,
      `generated` rekord: generátor, minőség, képleírás, ár, dátum), és a
      ONE Video saját példányt kap (`broll/clips/`). Az Identity export a
      `broll.json` beállítást viszi, a klipeket nem (mint eddig a saját
      felvételeknél).
    - A HeyGen feltételei linkként a Settingsben (`www.heygen.com/terms`,
      az opener engedélyben csak ez az egy cím).
    Tesztek: 231 Node (13 új), 47 Rust, e2e 39/39 (6 új lépés, a próba
    móddal a renderig).
100. **Avatar: motorválasztás és import a HeyGenből, később** (Zoltan,
    2026-10-06, külön chatben épül). Az app ma nem küld `engine` mezőt, így
    a HeyGen alapja, az Avatar IV fut. Lesz: választás a Settings, Identity,
    Voice and avatar oldalon (`avatar_iii`, `avatar_iv`, `avatar_v`, csak
    amit a look támogat), **alap az Avatar III** (a HeyGen nagyvállalati
    árlistája szerint kb. hatoda a IV és az V árának; a webes csomag
    "Unlimited" kerete az API-ra nem vonatkozik). És "Import from HeyGen" a
    CTA-szegmensekhez a fiók videólistájából (`GET /v3/videos`, ingyenes
    olvasás). Addig a kész szegmensek letöltve és feltöltve kerülnek be,
    ez ingyen van.

## 2026-10-06 (a 3. fázis kezdete)

101. **3. fázis terv, avatar motor és import, szegmens-szöveg** (Zoltan,
    2026-10-06, `docs/phase-3-plan.md`):
    - **Ingyenes lépésekkel haladunk** (a pénz 1-2 hét múlva jön). Későbbre:
      Windows aláírás, Apple Developer ID, a Mac build és Mac teszt, a PRD 14
      nyitott kérdései (név, cégforma, domain). **Baráti tesztek egyelőre
      nincsenek**, nem tudni, mikor. A pilot első köre Zoltané, tiszta
      környezetben (Windows Sandbox), a végén, egyben.
    - **A telepítő egyszer épül újra, a 4. fázis végén**; addig minden
      megvalósul a kódban. A Mac build egyetlen alkalommal, Windows és Mac
      együtt, utána. Ez eltér a PRD 12-től (a pilot Mac-es része a kiadás elé
      csúszik); a DECISIONS 95 szerinti sorrend marad.
    - A phase-3 PR CI-ja piros maradhat a 4. fázis végéig (`ci-test-order`,
      Actions perc).
    - **Avatar motor** (a DECISIONS 100 megvalósítása): `avatar_iii` (alap),
      `avatar_iv`, `avatar_v`; az Identity `avatar.engine` mezője, és
      videónként az Avatar tabon. A megrendelés `engine.type`-ot küld; a look
      `supported_api_engines` listája szerint csak támogatott motor
      választható, az alap nem támogatott motornál a legolcsóbb támogatottra
      esik vissza, kiírva. Becslés motoronként (HeyGen súgója, 2026-10: III
      0,60-0,99 USD/perc, IV 2,31-4,83; az V ára nem publikus, a IV tartományával
      becsülünk és jelöljük).
    - **Az "Unlimited" Avatar III az API-ra nem vonatkozik** (utánanézve): az
      API külön dollár alapú rendszer; a webes unlimited csak a régi csomagokon
      él, az új kreditalapú csomagokon az Avatar III 3 kredit percenként. A
      Settingsben ez egy mondattal kiírva. Következmény: a CTA-szegmenseket a
      webes HeyGenben érdemes elkészíteni, és letöltve (A) vagy importálva (C)
      használni, API-hívás nélkül.
    - **Import from HeyGen** (CTA, Your segments, C): `GET /v3/videos`
      (olvasás), a kész videók listája, kiválasztás, kulcsszóhoz rendelés,
      letöltés (`source: heygen-import`, a szegmens megjegyzi a `heygenId`-t,
      így látszik, mi van már importálva). **Kipróbálva Zoltan kulcsával
      (2026-10-06, csak olvasás, ingyen, a kulcs nem került sehova):** a lista
      50 videót ad oldalanként (van következő oldal), a kész videókhoz van
      letöltési cím és kép (`files2.heygen.ai`), és a webes felületen készült
      videók is benne vannak (például az "Avatar Video" és a "Meet your
      avatar"). A lista zsúfolt (az app saját open és close klipjei, tesztek),
      ezért az importnak címkereső mezője és dátuma van. Nem próbáltam: a
      letöltés és a klip minősége (vízjel nincs-e), azt az első importnál látjuk.
    - **Szegmens szövege 1500 karakter** (volt 400): egy 30 mp-es klip teljes
      szövege beleférjen, a mezők alatt számláló. A felirat és a publikálási
      adat (`said`) ezt használja.
    - Az újrahasznosítás modellje változatlan (DECISIONS 78): egy szegmens egy
      kulcsszóé, a kulcsszó a kapocs, kulcsszavanként legfeljebb 3, váltakozva.
    Tesztek: 233 Node (2 új a motorokra és az importra, 1 a szövegre), cargo
    test zöld.
102. **Sampler, licenclista, updater kulcs, javítások Zoltan esti videója
    után** (2026-10-06, `docs/pilot/sampler.md`, `feedback/2026-10-06/NOTES.md`):
    - **Sampler (PRD 14.5):** `scripts/phase2/pilot.mjs --preset all`, a 11
      HyperFrames preset, 13 komponens és egy magyar ékezetes sor: mind a 11
      build és check 0 hiba, az ékezetek jók. Talált hiba: a második és
      harmadik szín nem volt olvashatóra igazítva (sárga kiemelt szó krémen).
      Javítva: `cardTheme` mindhárom színt 3:1-re igazítja (teszt).
    - **Betűköz:** a build-másolat soha nem szorosabb -0.01em-nél (`trackingFit`),
      mert a registry szoros betűköze a user vastag betűjével összeér (Zoltan
      videója: Archivo Black, headline-slam). A registry fájl érintetlen.
    - **Nincs üres kép a kimondásra váró listánál:** a grid-card-assemble és a
      constellation-hub első eleme a jelenet elején megjelenik, a többi a
      kimondáskor (Zoltan: 3 mp üres kép).
    - **THIRD-PARTY-NOTICES.md** (`scripts/notices.mjs`, a lockfájlokból, a
      Rust crate-ekből és a csomagolt részekből), a telepítőbe kerül, az About
      oldal hivatkozik rá, és kiírja a Node.js és az FFmpeg (GPL-3.0, külön
      program, a forrás helye) sorát (DECISIONS 43 teljesítve).
    - **Updater kulcspár** (Zoltan kérte): a nyilvános kulcs a repóba kerül az
      updater beállításakor; a privát kulcs és a jelszava csak
      `C:/Users/gdp/ITV-updater-key` alatt, onnan Zoltan a jelszókezelőjébe
      teszi, és a mappát törli. Repóba, logba, chatbe nem került.
    - Nyitott, Zoltan döntésére (lásd a NOTES-ot): ikonkönyvtár a rajzokhoz (a
      HyperFrames registryben nincs ikonkészlet, csak két ikon-mozgás elem), a
      kimondott szó kiemelése, élénkebb jelenetek, és a CTA-szegmens, nyitó és
      záró klip közös modellje.
103. **Videóminőség: Zoltan döntései** (2026-10-06, `docs/video-quality-plan.md`):
    - **Sorrend:** (1) élénkebb alap, (2) ikonok, (3) kimondott szó és
      feliratok, (4) a 39 archetípus csomagként, Import és Export gombbal,
      (5) Scenes varázsló, (6) kép és videó források. Csak utána a README, a
      `release.yml` és az updater.
    - **Scenes varázsló: igen, negyedikként, bőségesen** (nem rövid; minden
      lépés átugorható). Ide tartozik a blokk-csomag és az ikoncsalád is,
      külön blokk- vagy ikonvarázsló nem kell.
    - **Ikonok: Lucide, Tabler, Iconoir**, mind a három.
    - **Feliratok: mind a 17 registry felirat-stílus választható** a Motion
      varázslóban, nem csak három, a kimondott szó kiemelésével együtt.
    - **A 39 archetípus: a kánon NEM módosul.** Egy importálható csomag-fájl
      készül belőle (a kánonból csak olvasva), a változók a csomag
      másolatába kerülnek; az appban Import és Export gomb. Előtte alapos
      átnézés és javaslatlista (Zoltan kérése). A csomag nem kerül az app
      repójába és telepítőjébe (DECISIONS 18, 48 marad).
    - **Képforrás:** AI kép a Gemini kulccsal, amikor lesz rá pénz (1-2 hét).
      Stock: a Pexels új kulcsot nem ad; Zoltannak Pixabay és Coverr kulcsa
      van, az Unsplash jelentkezés folyamatban (`docs/stock.md`). A stock
      felfüggesztésének feloldása Zoltan döntésére vár.
    - **(1) élénkebb alap, első rész kész:** a kamera push a jelenet teljes
      hosszán fut (5%, folyamatos, jelenetenként váltakozó oldalirányú
      sodródással), nem áll meg a felénél; a Motion profil alapja push; profil
      nélkül is van kamera (vágások, push: `BASE_MOTION`). A HyperFrames
      explainer doktrínája ("no slow push in the back half") itt Zoltan
      visszajelzésének enged: semmi nem állhat meg.
    - **(1) élénkebb alap, második rész: új kép 3-5 mp-enként.** A tervező
      minden mondatnak külön jelenetet ad, csak a nagyon rövideket vonja
      össze; több mondatos jelenet legfeljebb 7 mp (volt 12), különben a
      javító hívás szétbontja; a Simple plan legfeljebb 6 mp-ig von össze.
      Zoltan videójában a hosszú képek fő oka az összevonás volt (0-11,4 mp
      egy címkártya). Egy hosszú mondat egy jelenet marad; a mondaton belüli
      bontás a kimondott szó kiemelésével (3. lépés) jön. Próba: 46 mp-es
      render, egy jeleneten belül 0,8 mp alatt a kép mozdul (SSIM 0,98).
104. **Tempó választható, stock kulcsok** (Zoltan, 2026-10-06: "ez nem olyasmi,
    amiben a usernek kéne döntenie?"; "Pixabay és Coverr menjen már most"):
    - **Tempó a Motion varázsló első képernyőjén:** Calm (új kép 5-8 mp-enként,
      összevont jelenet legfeljebb 10 mp), Balanced (3-5 mp, legfeljebb 7 mp,
      ajánlott, az alap), Fast (2-4 mp, legfeljebb 5 mp). A Motion profil
      `pace` mezője; a tervező promptja, a gépi ellenőrzés és a Simple plan
      ezt követi (`roles.mjs` PACES). A Camera képernyő ajánlása Push in lett.
    - **Stock felfüggesztés feloldva** (Zoltan): Pixabay és Coverr most, az
      Unsplash a jóváhagyása után. Most a kulcsok: Settings, Identity,
      Footage, "Stock photos and videos" (Test key). A keresés a kép és videó
      források lépésében jön (DECISIONS 103 sorrend, 6.).
    - **Figyelem, Coverr:** az API leírása szerint az ingyenes hozzáférés
      addig jár, amíg az app nem kér érte pénzt, és a videókat nem használják
      kereskedelmi célra; a forrást (logó, kattintható) mutatni kell. A
      Pixabay licence kereskedelmi célra is szabad, forrásmegjelölés nélkül;
      a találatokat 24 óráig gyorsítótárazni kell, a képeket letölteni. A
      Coverr használata a kiadás előtt Zoltan döntése.
105. **Ikonok a rajzos jelenethez** (Zoltan: "ugyanaz a rajz minden
    videóban"; Lucide, Tabler, Iconoir, mind a három):
    - **Letöltés a buildben** (`scripts/fetch-icons.mjs`, a `fetch-library`
      futtatja): rögzített npm csomagok (`library/icons.json`: lucide-static
      1.52.0, @tabler/icons 3.49.0 outline, iconoir 7.12.1 regular), sha512
      ellenőrzéssel. Családonként egy JSON: ikononként path adat a 24-es
      rácson és keresőszavak (a Lucide és a Tabler saját címkéi). 2130 + 5184
      + 1382 ikon, 2,6 MB. A licencek mellettük, a THIRD-PARTY-NOTICES-ben is.
    - **A tervező** minden whiteboard-ink jelenethez `icon` mezőt ad: egy-három
      angol szó egy kézzelfogható tárgyra, minden rajzhoz más; enélkül a
      gépi ellenőrzés visszaküldi.
    - **A build választ** (`runner/icons/index.mjs`): a legjobban illő ikon,
      egy videóban soha kétszer, és lehetőleg nem az Identity előző 12
      videójának ikonja (`<identity>/icons-used.json`; az újrabuild a saját
      ikonjait megtartja). Márkalogó soha (Tabler `brand-*` és a többi
      logó). A "kikapcsolt" változat (például `lightbulb-off`) csak kérésre.
      A felirat vagy a mondat szövegéből csak erős találat jöhet; különben
      a jelenet saját rajza marad. A rajz a jelenet saját helyén (strokes
      slot), vonalról vonalra, egy kiemelt vonallal; a registry fájl érintetlen.
    - A tiltott nevek szabálya az ikonok nevére és címkéire is áll: a
      tiltott szót tartalmazó címke kimarad, egy Iconoir ikon emiatt kimaradt.
    - Később: a rács-kártyák ikonjai, és a Scenes varázslóban a családok és
      a kedvencek Identity-nként.
106. **Feliratok és a kimondott szó** (Zoltan: "mind a 17", "a kimondott szó
    legyen kiemelve, mint egy átiratban, rázás helyett"):
    - **15 felirat-stílus** a HyperFrames registryből (`caption-*`), a
      rögzített commitról, SHA256 lockkal, előnézeti képpel és a saját
      fájljaikkal (a Texture hat textúrája). A 17 felirat-címkés elemből kettő
      nem felirat-stílus: a `caption-blend-difference` csak egy CSS keverési
      hatás, a `caption-camera-follow` egymondatos jelenettípus (a Scenes
      varázslóba kerülhet).
    - **Build-másolat** (`runner/captions/`): a videó saját szavai és
      időzítése (`words.json`), saját csoportok (legfeljebb 4 szó, új csoport
      mondatjel vagy szünet után), a videó hossza, az Identity betűje, helyi
      GSAP, Google Fonts nélkül. A színek a márkából, 3:1 felett: világos
      kinézetnél a fehér és halvány betű a szöveg színét kapja, a neon és a
      kódzöld a fő színt; a karaoke pirula a felület színét. Egy fedőréteg az
      egész videó fölött (track 9); a HyperFrames futtató `caption-overrides.json`
      fájlját üres listával adjuk; a feliratszavak átfedés-jelölést kapnak
      (szándékos rétegzés).
    - **Motion varázsló, új "Captions" képernyő:** Off (alap) és a 15 stílus
      képpel, a hangos stílusok jelölve; a `.srt` mindig elkészül.
    - **A kimondott szó a jelenet saját szövegében** (`spoken.mjs`, alapból
      be, a Captions képernyőn kikapcsolható): a headline-slam és a
      per-word-rise szavai a kimondás idejére átszíneződnek (márkaszín, vagy a
      szöveg színe, ha már márkaszínű), a jelenet saját GSAP idővonalán; a
      headline-slam háromkockás rázása nincs többé.
    - Próba: mind a 15 stílus build, lint és check (Blue Professional). A
      check nem mindent lát: a kontakt lapokon a Gradient fill, a Clip wipe,
      a Neon és a Particle burst világos háttéren alig látszott, az Editorial
      a kép közepére került. Javítva: világos kinézetnél a sötét felvételre
      készült élénk palettákat (arany, neon, színátmenetek) a márka három
      színe váltja, a félig fehér betűt a halvány szövegszín, az Editorial az
      alsó harmadba került. A Parallax nagy háttérszava hangos marad, ezért
      jelölt. Render próba (Pill karaoke): a kimondott szó sorban sötétedik.
107. **Blokk-csomagok (.itvpack) és a 39 archetípus csomagként** (Zoltan,
    2026-10-06 és 07; `docs/pilot/archetypes-review.md`, `docs/import-export.md`):
    - **A kánon érintetlen.** Egy általános csomagkészítő
      (`scripts/make-pack.mjs`) a kánon blokkjaiból csak olvasva gyártja a
      csomagot; a forrás-leíró (`C:/Users/gdp/ITV-packs/explainer-archetypes/pack.src.json`)
      és a csomag (`C:/Users/gdp/ITV-packs/explainer-archetypes.itvpack`,
      1,1 MB) a repón kívül van, az app telepítőjében sincs.
    - **Formátum:** zip (`runner/packs/zip.mjs`, saját kis író és olvasó; a
      Windows kibontója is olvassa): `pack.json` (`itv-pack/1`: id, név,
      kinézet, blokkonként szerep, leírás, változók és határaik, rajzolt
      hossz), `blocks/<id>.html`, `shared/fontface.css` (a betű egyszer).
    - **A csomagban javítva** (a kánonban nem): egységes változók (a
      deklarált és a használt egyezik); a sampler-feliratok (kick, subcap,
      caption) opcionálisak és üresen eltűnnek; a display-word blur nélkül;
      **márkanyom sehol** (Zoltan: "se saját márka, se C2C, se zg"): a
      megjegyzések ki, a kódnevek semlegesek, a márkás mintaszövegek
      semlegesek, a csatornánkénti színblokkok ki, és a készítő leáll, ha
      bármi marad. **Ikonok: Lucide** (ISC, Zoltan: ne a saját 37 legyen az
      alap, hanem egy bevált ingyenes készlet), a blokk saját körében; egy
      ikon-változóba írt bármely tárgyat a build a három ikonkészletből
      kikeres.
    - **Kinézet: alapból a user Identity Brandje** (Zoltan), kapcsolóval a
      csomag saját kinézete. Ismert korlát: néhány blokk fix színe (például a
      tölcsér sávjai) marad.
    - **Kitalált nevek:** a személy- és rekordkártyák szándékosan kitalált
      példák (Zoltan); a tervező utasítása: soha valódi márka, cég vagy
      híres ember.
    - **Az appban:** Settings, Identity, Scenes: Import pack, Export pack,
      Remove, "Use this pack", "Use this Identity's Brand", blokkonként be és
      ki. Identity-nként tárolva (`<identity>/packs/<id>/`); az Identity
      export és import viszi (a Rust oldal a `packs/` alatt a HTML és CSS
      fájlt is engedi, négy szint mélyen, máshol nem). A tervező a csomag
      blokkjait is látja (új szerepek: kapcsolat, ellentét, folyamat,
      részlet, felvétel fölé, komment-felhívás), a Scenes tab cserelistája
      is; a felvételt igénylő blokkok csak saját felvétellel. A build a
      blokkba teszi a betűt, a jelenet hosszát (rövid jelenetnél a belépők
      arányosan korábban), és a Brand színeit.
    - Próba: hét blokk egy videóban, a saját és a Brand kinézettel is,
      build, lint, check 0 hiba; az "arrow" Lucide villanykörte és rakéta
      ikonnal.
108. **A Coverr kivéve** (Zoltan, 2026-10-07: "semmi copyright kockázatot nem
    akarok"). Az API leírása szerint az ingyenes hozzáférés nem kereskedelmi
    célra szól. Kivéve a kulcsmezőt, a kulcslistából, a Test key-ből és az
    app jogosultságai közül. Stock: Pixabay (kereskedelmi célra is szabad),
    az Unsplash a jóváhagyása után.
109. **Zoltan saját márkája importálható fájlban, és az Open Sans** (Zoltan,
    2026-10-07: "a ZG és C2C pontos másolata kell, hogy ne kelljen újra
    kitalálni"; az Open Sans marad):
    - **Open Sans az app betűi között** (OFL, fontsource 5.3.0, rögzítve), mint
      bármelyik másik; a Brand kártya választhatja.
    - **A csomagkészítő két módja:** "neutral" (alap: márkanyom nélkül, Lucide
      ikonok, a befogadó Brandjében) és "original" (`neutral: false`: a
      tervező saját kinézete, ikonjai és nevei).
    - **A fájlok** (`C:/Users/gdp/ITV-packs/`, a repón kívül, leírás:
      `README.md`): `ZG-C2C.identity.zip` (teljes Identity: a kánon ZG/C2C
      színei és betűje, a kánon szerinti Motion, az eredeti csomag, a
      "Zoltan Gero" Identity csatornája, hangja és avatarja; CTA, kulcs és
      videó nélkül), `zg-archetypes-original.itvpack`,
      `neutral-explainer-archetypes.itvpack`. Elnevezési rend:
      `<MÁRKA>.identity.zip`, `<tulaj>-<tartalom>-original.itvpack`,
      `neutral-<tartalom>.itvpack`.
    - A ZG/C2C Motion a kánonból (`MOTION.md`, `BLOCKS.md`): folyamatos push
      kamera, Dot field háttér, egy átmenet ismétlődik (crossfade, a kánon
      fade-through-jához legközelebbi), Balanced tempó, a kimondott szó
      kiemelve, felirat ki.
    - A fájlok az új telepítővel működnek (csomag-import, Open Sans).
110. **Scenes varázsló** (Zoltan: "negyedik varázsló, bőséges"; DECISIONS 103):
    - **Identity-szintű `scenes.json`** (`runner/scenes-profile.mjs`): keverék
      (szöveg, ikon és rajz, kép, videó, százalékban, 100-ra kiegyenlítve),
      a kikapcsolt beépített jelenettípusok, az ikoncsaládok sorrendben, a
      kép- és videóforrások. Az Identity export viszi.
    - **Hét képernyő:** Start (Balanced, Visual, Drawn, Word-led ajánlatok),
      Mix (csúszkák, figyelmeztetés, ha egy fajtához nincs forrás), Scene
      types (szerepenként be és ki, legalább egy marad), Scene packs (a
      csomagok helyben, Import), Icons (családok minta-ikonokkal, sorrend),
      Pictures and video (saját felvétel, Pixabay, AI B-roll; AI kép később),
      Check and save. A tempó a Motion varázslóban marad.
    - **A be- és kikapcsolás átköltözött a Motion varázslóból** (ott a
      lépés neve "Scene styles", csak a kinézet maradt). Egy régi Motion
      profil kikapcsolásai továbbra is érvényesek, és az első Scenes profil
      átveszi őket.
    - **A tervező** a keveréket utasításként kapja (prompt `{{MIX}}`); egy
      fajta, amihez a videónak nincs forrása, a többibe olvad (a kép a
      Pixabay keresésig az ikonokhoz). A build a profil ikoncsaládjait
      használja.
    - Settings, Identity, Scenes: összegzés, "Open Scenes wizard", alatta a
      csomagok. A `ZG-C2C.identity.zip` a Scenes profilt is hozza.
    - Próba a böngészős UI-mockban: mind a hét képernyő; tesztek: 262 Node.

111. **Pixabay keresés: kép és videó a jelenetekhez** (`runner/stock/`,
    `docs/stock.md`; Zoltan: "6. Pixabay keresés", 2026-10-07):
    - **Egy panel a Scenes tabon**, a jelenettábla alatt: "Photos and
      videos". Keresőmező, a scriptből vett ötletek (cím, fejezetcímek, a
      gyakori szavak), Photos vagy Videos, 18 találat előnézettel, "Add".
      Kulcs nélkül csak a teendő látszik (Settings, Identity, Footage).
    - **A választott elem a felvétel-könyvtárba kerül**, mint a saját
      felvétel, licenc-rekorddal (forrás, azonosító, szerző, Pixabay
      Content License, oldal). A tervező a következő tervezésnél tesz alá
      mondatot, ami ugyanazt mutatja; a keverék képrésze csak akkor él, ha
      van ilyen klip. Ugyanaz az elem kétszer nem töltődik le.
    - **Fotó: 6 mp-es 1920x1080 klip lassú ráközelítéssel** (ffmpeg zoompan,
      5 százalék, középre vágva), így nem áll a kép. A `docs/stock.md` 5
      registry-komponense helyett ez, mert a klip a meglévő felvétel-útra
      megy, új jelenettípus nélkül.
    - **A Pixabay feltételei:** a találatok 24 órán át tárolva (nem kérdez
      újra), a fájl letöltve (nincs hotlink), a forrás a panelen látszik.
      Biztonságos keresés, fekvő formátum, legalább 1280 px; videóból a
      1920-as, soha 4K. Csak `pixabay.com` címről tölt; a felület csak a
      találat azonosítóját küldi vissza, a letöltési cím a runner saját
      tárából jön. A kulcs a kérés címében megy, hibaüzenetben maszkolva.
    - **Egyszerűbb, mint a `docs/stock.md` terve:** nincs jelenetenkénti
      "Find stock" gomb, nincs Settings-beli "Add from stock", nincs
      Autopilot-választás és 4K szűrő. Ezek a próba után jöhetnek.
    - Próba a böngészős UI-mockban (keresés, ötletek, Add); tesztek: 266
      Node (új: `runner/stock.test.mjs`, a fotó-klip ffmpeg-gel).

112. **Kulcsszavak a vidrevvel egyezően, kulcsszavanként egy szegmens**
    (Zoltan, 2026-10-07, D1 és D2):
    - **A 15 kulcsszó szó szerint a vidrevé** (`c2c-saas
      src/lib/keyword-catalog.ts` a forrás): Cold GUIDE, CHECKLIST,
      TEMPLATE, PDF, START; Warm TRAINING, WORKSHOP, WEBINAR, COURSE,
      SURVEY; Hot TRIGGER, CALL, BUY, APPLY, ACTION. A "mit kap" szövegek
      is egyeznek (az egyetlen eltérés a SURVEY volt: "a short survey
      (ASK)"). A `runner/cta.test.mjs` rögzíti a listát.
    - **Kulcsszavanként legfeljebb egy szegmens, így legfeljebb 15.** A
      váltakozás (legrégebben használt jön) és a kulcsszavanként 3
      megszűnt, vele a videónkénti szegmensválasztás (`segmentIds`) is, a
      sémából, a UI-ból és a "previously selected" mentésből. Új klip egy
      kulcsszóra: a régit (a fájlját is) lecseréli. Forrás: feltöltés,
      HeyGen generálás vagy HeyGen import. Szegmens nélkül a hely Narrátor
      módban megy. Legfeljebb 30 mp marad.
    - **Settings, Identity, CTA:** 3 sor (Cold, Warm, Hot), soronként 5
      kulcsszó-kártya a szegmens állapotával (none, uploaded, HeyGen),
      "Add" vagy "Replace", és "Delete". A kiválasztott kártya alatt a
      három forrás.
    - **Zoltan adatai:** a két Identity (`my-identity`, `updated-ui`)
      kulcsszavanként eleve egy szegmenst tartott (GUIDE, COURSE,
      TRIGGER), így nem kellett szegmenst törölni; a `cta-last.json`-ból
      a `segmentIds` mező kézzel törölve. Átállási kód nincs.
    - Az e2e jelenettáblája a 7 mp-es plafon (DECISIONS 103) óta elavult
      volt (S1 és S2 együtt 8 mp): a mainen is elbukott. Javítva, 6
      jelenet; 39/39.

113. **A csomagolás előrekerül az 1. kapuba** (Zoltan, 2026-10-07, a D5
    visszavonása után): a DECISIONS 86 szerint. A runner parancsai:
    `packaging-state`, `packaging-make`, `packaging-save`; a
    `youtube-texts` AI-hívás megszűnt, a Video tab a csomagolásból és a
    `publish.json`-ból rakja össze a szövegeket (`youtube.json` nincs
    többé). Ha a csomagolás AI-hívása elbukik, a script megmarad, és a
    Script tabon kézzel újrapróbálható. Tesztek: `runner/packaging.test.mjs`.

114. **Video Publishing Card, az itv-publish/1 utódja** (Zoltan, 2026-10-07,
    D3 és a D5 visszavonása utáni 3. és 4. pont):
    - **Séma `video-publishing-card/1`**
      (`runner/schema/video-publishing-card.schema.json`); a mezőnevek
      (camelCase) a régiek. Új: `cardId` (UUID, projektenként egyszer
      generálva, a `project.json`-ban megtartva), `videoId: null` (a
      publikáló app tölti), `endScreen.startSec` (ha van végképernyő), és
      `packaging {titles, title, summary, tags}` a Script tab
      csomagolásából (DECISIONS 86), `null`, ha még nincs.
    - **Fájl: `<video>.card.json`**, írás előtt a sémával ellenőrizve; a
      `comments.txt` marad. Az `itv-publish/1` sémája, a `.publish.json`
      írása és a Rust `export_publish` megszűnt (helyette `export_card`,
      csak `.card.json`), átállási kód nélkül. A már renderelt régi
      videók mellett maradt `.publish.json` fájlokat az app nem olvassa:
      egy új render megírja a kártyát.
    - **Video tab:** Files (MP4, `.srt`, `chapters.txt`, a kártya),
      Publishing ("Export card"), Upload on YouTube (YouTube Studio
      megnyitása, a cím, a leírás és a tagek másolás gombbal), Backup.

115. **Publishing kapcsolat, "Send to Publishing"** (Zoltan, 2026-10-07, D4):
    - **Settings, Publishing** (App szint): a publikáló app címe
      (`config.json` `publishing.url`) és a token az OS kulcstárban
      (kulcsnév `publishing`, mint a többi kulcs). A UI-ban nincs
      márkanév, csak "Publishing".
    - **Video tab:** "Send to Publishing": `POST {url}/api/v1/cards`,
      `Authorization: Bearer <token>`, a törzs a kártya. 200 vagy 201
      `{"cardId", "url"}`: a link megnyitható; 4xx `{"error"}`: a mondat
      változatlanul; hálózati hiba, 30 mp csend és 5xx: érthető üzenet
      "Try again" gombbal. Ugyanaz a `cardId` újraküldve frissít. Mellette
      "Export card".
    - **A kérést a runner (Node) küldi, nem az ablak**, ezért a CSP és a
      Tauri http jogosultság nem nyílik ki: szűkebb felület, mint a
      user-hoszt engedélyezése a webview-ban. A cím csak https lehet
      (http csak localhost), felhasználónév, jelszó, `?` és `#` nélkül.
      A visszakapott linket csak a beállított hoszton nyitja meg az app
      (Rust `open_publishing_link`, mert az opener fix listája a user
      hosztját nem ismeri); más hoszt linkje nem jelenik meg linkként.
    - **Mock szerver:** `scripts/publishing-mock.mjs` (ugyanaz a
      szerződés, a kártyát a sémával ellenőrzi); kézi próbához
      `node scripts/publishing-mock.mjs --port 8787 --token test-token`.
      Tesztek: `runner/publishing.test.mjs` (201, 200 frissítés, 401, 400,
      503, nincs válasz, időtúllépés, címszabályok), Rust: a link-hoszt.

116. **HeyGen API v3, a v1 és v2 leállása előtt** (Zoltan, 2026-10-08;
    határidő 2026-10-31, a HeyGen táblázata szerint a v1 és v2 2026-11-01-től
    nem támogatott, developers.heygen.com/endpoint-version-comparison):
    - **Átnézve minden hívás:** az app minden HeyGen hívása már v3
      (`/v3/users/me`, `/v3/avatars`, `/v3/avatars/looks`, `/v3/assets`,
      `/v3/videos`, `/v3/videos/{id}`, `/v3/models/videos`), kód csere nem
      kellett. A `/v2/voices` és a `/v1/text-to-speech` az ElevenLabs API-ja,
      nem a HeyGené, ezek maradnak.
    - **Teszt rögzíti** (`runner/heygen-v3.test.mjs`): a `runner`, `app/src`,
      `app/src-tauri/src` és `scripts` egyetlen fájlja sem hív
      `api.heygen.com/v1` vagy `/v2` címet, és a két HeyGen kliens minden
      útvonala `/v3/`-mal kezdődik. Éles ellenőrzés csak ingyenes végponttal
      (`users/me`, avatar-lista), ha a `HEYGEN_API_KEY` be van állítva;
      videó nem készül.

117. **Unsplash forrás a Pixabay mellett** (Zoltan, 2026-10-08; a 111 mintájára,
    `runner/stock/unsplash.mjs`, `docs/stock.md` 10):
    - **Csak kép**, lassú ráközelítéssel, a felvétel-könyvtárba, licenc-rekorddal.
      Kereső a Scenes tabon, forrásválasztóval (csak a kulccsal bírók látszanak).
    - **Kulcs:** a user saját Access Key-e (BYOK), az OS kulcstárban
      (`unsplash`), Settings, Identity, Footage, "Get a key". A Secret key-t az
      app soha nem kéri.
    - **API Guidelines:** hotlinkelt előnézet (`images.unsplash.com`, CSP),
      `download_location` hívás a letöltés előtt, "Photo by X on Unsplash"
      linkekkel és utm paraméterrel minden kártyán. A videóba és a leírásba
      nem kerül megjelölés: a licenc nem kéri, a Guidelines csak az appban.
    - **Demo mód** (50 kérés óránként): egy órás keresés-tár, érthető hibaüzenet.
      A Production kérelem Zoltan lépése (`docs/stock.md` 10). Kockázat: a
      Guidelines a user saját fejlesztői fiókját nem szereti; ha elutasítják,
      Demo marad vagy proxy kell.
    - Tesztek: `runner/unsplash.test.mjs` mock válaszokkal; éles keresés, ha a
      `UNSPLASH_ACCESS_KEY` be van állítva.
    - **Production kérelem nem lesz** (Zoltan, 2026-10-08): az Unsplash
      végleg Demo módban marad.

118. **Mac v1, aláíratlan .dmg Apple Silicon gépre** (Zoltan, 2026-10-07 és 08;
    branch `mac-build`):
    - **Csak arm64** (`macos-latest`), macOS 11 vagy újabb. Intel Mac nincs:
      még egy teljes futás kellene, és a pilotban nincs Intel gép.
    - **Ad-hoc aláírás** (`tauri.conf.json` `signingIdentity: "-"`): Apple
      Silicon aláírás nélküli kódot nem futtat, és a "damaged" üzenet is
      ritkább. Apple Developer ID nincs (99 USD/év), a barátok az "Open
      Anyway" úton nyitják meg (`docs/pilot/install-guide-mac.md`; ha
      "damaged" jön, `xattr -cr /Applications/IdeaToVideo.app`).
    - **ffmpeg Apple Silicon Macen: Martin Riedl statikus release buildje,
      FFmpeg 9.0.2** (`ffmpeg.martin-riedl.de`, rögzített SHA256, a GPL
      szövege az FFmpeg n9.0.2 tagjéről). Az ffmpeg-static b6.1.1 arm64
      binárisa valójában 6.0 volt, és hiányzott belőle 11 szűrő, amit a menet
      használ (overlay, scale, loudnorm, amix...). Ez az első Mac CI futáson
      derült ki, a `check-ffmpeg` lépésen: e nélkül Macen minden render
      elbukott volna. Az Intel Mac ffmpeg-static forrása marad (nem építjük).
      Egy bináris kb. 66 MB, ezért a .dmg nagyobb, mint a Windows telepítő.
    - **Indítási próba a CI-ban, csak Macen** (`build.yml`, "macOS bundle
      smoke test"): `codesign --verify --deep --strict`, a bundle-ből indított
      node, ffmpeg és ffprobe, a runner és az engine megléte, és az app 15
      mp-ig fut összeomlás nélkül. Kb. 1 perc.
    - **Kódolvasással ellenőrizve, Macen nem futtatva:** a Keychain
      (`keyring` `apple-native`, a Publishing token és az Unsplash kulcs is
      ott), a runner HTTP hívásai (Node `fetch`, platformfüggetlen), az
      útvonalak (`path.join`, a projektek a `~/Documents` alatt), a render
      böngésző (a HyperFrames tölti le a `chrome-headless-shell` mac-arm64
      változatát), a Dock ikon.
    - **Nincs kipróbálva:** valódi Macen a Gatekeeper menet, a Keychain
      engedélykérés, a render böngésző letöltése, egy teljes videó a
      renderig, a Show in folder, az Export diagnostics. Ez a barátok próbáján
      derül ki; a naplót a `docs/pilot/send-logs.md` szerint küldik.

## 2026-10-08 (UI egyszerűsítés)

119. **UI egyszerűsítés: öt menü, egy hely minden kulcsnak és fájlnak**
    (Zoltan, 2026-10-08, `docs/ui-simplify.md`; branch `ui-simplify`):
    - **Felső menü** (D1, `app/src/lib/pages.ts`): Home, Videos, Wizards
      (CTA, Brand, Motion, Scenes), Identity (YouTube Channel & Audience,
      Voice & Avatar, Footage, Dictionary, Resources, Manage Identity),
      Settings (General, Connections, Import & Export, Folders, Backup,
      Plan). Menünként legfeljebb hat oldal. A szó "Identity" marad. A régi
      Settings csoportok (App, Identity) megszűntek; egy oldal `scope`-ja
      mondja meg, hogy az Appot vagy az aktív Identityt írja. Az
      Identity-választó a felső sávban marad, Import nélkül.
    - **Home** (D2, `Home.svelte`): "Ready to make videos?" sorokkal (AI
      kulcs, hang kulcs, Identity, a 3 CTA kulcsszó a klipje állapotával,
      Publishing "Optional"), mindegyik Ready vagy Missing, gombbal a
      helyére. Kell: AI kulcs, hang kulcs, Identity (közönség megadva); a
      CTA klip és a Publishing nem (klip nélkül a narrátor mondja). Ha a
      szükségesek készek: fő gomb "Make a video" (a Videos az új videó
      űrlapjával nyílik). Alatta a legutóbbi öt videó.
    - **Connections** (D3): minden kulcs egy oldalon (`ConnectionRow.svelte`):
      név, állapot (Connected, Not set, Failed egy elbukott teszt után),
      Get a key, Test, mentés. AI (szolgáltató, modell, lépésenkénti modell)
      és az összes AI szolgáltató kulcsa, ElevenLabs, HeyGen, Pixabay,
      Unsplash, vidIQ, Publishing (cím és token). Kulcsonként "Use a
      different key for this Identity"; a meglévő Identity-kulcsok
      bepipálva látszanak. Az AI-nál ugyanígy: "Use a different AI for this
      Identity". A régi App AI and keys, Identity AI and keys, Publishing
      oldal és a Footage kulcsai ide kerültek.
    - **Import & Export** (D4, `TransferPage.svelte`): legfelül az Identity
      Import és Export, alatta soronként: Brand Identity Card, tokens.css
      (csak Import: a design tokens az Identity kinézete lesz, a logó marad),
      .itvpack, HeyGen videó egy CTA kulcsszónak (`cta/HeygenImport.svelte`),
      Video Publishing Card (videó választóval, csak Export), Export
      diagnostics, Back up now. A régi helyeken link mutat ide (Manage
      Identity, Brand, Brand varázsló, Scenes, CTA, General, Backup). A
      videó saját kártya-exportja a videó tabján, a Files alatt marad (D7),
      a videónkénti "Back up now" a videó Backup részében.
    - **CTA: a házi hármas elöl** (D5, `cta/CtaPage.svelte`, `cta/clips.ts`):
      a választott három kulcsszó nagyban, mindegyik a klipforrásával; a
      többi 12 egy csukott "Other keywords" alatt. Források: feltöltött klip,
      korábbi HeyGen klip ("Previously used"), "Generate with HeyGen" (ár
      kiírva), Narrator. Az alap: feltöltött, különben korábbi HeyGen,
      különben HeyGen ha be van kötve (kulcs és avatar look), különben
      Narrator; mindig átválasztható. HeyGen nélkül a HeyGen opciók szürkék,
      mellettük "Connect HeyGen" link a Connectionsre.
      - **Új CTA mód: `heygen`** (séma `cta-profile`, `runner/cta/profile.mjs`):
        amíg nincs klip, a narrátor mondja (megjegyzéssel); ha van, szegmens.
      - **Mikor készül a HeyGen klip:** a Script tab "Write script" előtt
        az app megkérdezi (az árral), és elkészíti a hiányzó klipet, így a
        script már a klipre hagyja a hívást (semmi nem hangzik el kétszer).
        Nem: a narrátor mondja most. Az Autopilot nem rendel HeyGen klipet
        (ahogy avatart sem). Egy kulcsszónak továbbra is egy klipje van.
    - **Videó tabok** (D6, `Advanced.svelte`): tabonként egy kiemelt fő gomb
      ("Approve and continue", "Go to ...", vagy a tab saját szava: Write
      script, Plan scenes, Build the preview, Approve and render, Render
      video); minden más (újra, finomhangolás, "Write it myself", "Simple
      plan without AI", "Continue without an avatar") az "Advanced" alatt.
      A "Finish on Autopilot" a cím mellett, kiemelve.
    - **A kész videó tabja** (D7): fő gomb "Send to Publishing" (beállítás
      nélkül szürke, link a Connectionsre); a YouTube szövegek (címek,
      összefoglaló, tagek, leírás) nyitva, másolás gombbal; a fájlok (Open
      MP4, SRT, chapters.txt, kártya, Export card) a csukott "Files" alatt;
      a Render again és a minőség az Advanced alatt.
    - A runner és az app szövegei az új helyekre mutatnak (például "Settings,
      Connections", "Wizards, CTA", "Identity, Footage").
    - Tesztek: `scripts/app/pages.test.mjs` (öt menü, legfeljebb hat oldal,
      minden régi oldal megvan), `runner/segments.test.mjs` (`heygen` mód).
      Node 279 zöld (2 éles kihagyva), Rust 48, e2e 39/39, UI check 0 hiba;
      az oldalak a `scripts/ui-mock`-kal megnézve. Telepítő nem készült.

120. **Ki mondja a hívásokat: videónként négy választás, nincs alapértelmezett**
    (Zoltan, 2026-10-08 este, a 119 próbája után; branch `avatar-choice`):
    - **A gond:** HeyGen kulccsal az app mindig a HeyGent ajánlotta (a 119
      szerint a HeyGen lett az alap, ha be van kötve), a feltöltött
      szegmenst nem lehetett választani, akkor sem, amikor a HeyGen keret
      elfogyott. Az Avatar tabon a "Continue without an avatar" az
      Advanced alá került (D6).
    - **Most:** a Script tabon minden videónál "Who says the calls in this
      video?" négy opcióval: My uploaded clips, HeyGen avatar newly
      generated, HeyGen avatar previously used, No avatar. Nincs
      előválasztás. Ami most nem működhet, szürke, mellette link a helyére:
      feltöltés nélkül "Add one in Wizards, CTA"; HeyGen kulcs nélkül "You
      have not added a HeyGen key yet. Add it here" (Connections); avatar
      look nélkül Identity, Voice & Avatar. A "previously used" csak
      kulccsal és korábbi HeyGen klippel választható.
    - **Új CTA módok** (séma `cta-profile`): `upload` (csak feltöltött klip),
      `previous` (csak korábbi HeyGen klip), `heygen-new` (új HeyGen klip a
      script előtt). A videó saját hívásaiban mindhárom helyre ugyanaz.
      Ahol a választott klip nincs, a narrátor mondja.
    - **A HeyGen soha nem automatikus:** az Identity alapja ("auto") már nem
      vált HeyGenre; ami klip van, az játszik, különben a narrátor. A
      "newly generated" egy feltöltött klipet soha nem ír felül (egy
      kulcsszónak egy klipje van, az új a régit cserélné).
    - **Avatar tab:** klipek nélkül a "Make the avatar clips (HeyGen)" és a
      "Continue without an avatar" egymás mellett, a kihagyás a kiemelt.
    - **Hiba a naplóból:** a Rust mag engedélylistájáról hiányzott a
      `packaging-state`, `packaging-save`, `packaging-make` és a
      `brand-import`: a Script tab címei, összefoglalója és tagjei
      ("Unknown runner command") és a tokens.css import nem működött a
      telepített appban. Felvéve; új teszt (`scripts/app/commands.test.mjs`)
      ellenőrzi, hogy minden parancs, amit a UI hív, a magban és a
      runnerben is megvan.
    - Tesztek: Node 281 zöld (2 éles kihagyva), Rust 48, e2e 39/39, UI check
      0 hiba; a Script tab a `scripts/ui-mock`-kal megnézve.

## 2026-10-11 (Course import)

121. **Course import: egy kurzus leckénként egy előkészített ONE Video**
    (Zoltan, 2026-10-11; branch `course-import`; `runner/course/index.mjs`).
    A bemenet a Minicourse repo "Course Content Structure" fájlja
    (`schema/course-content-structure.md`, `schema_version 1.1`). A formátum
    a Minicourse repóé és fagyasztott: az IdeaToVideo csak olvassa.
    - **Két bejárat, egy olvasó:** Settings, Import & Export: "Course Content
      Structure (.json)" fájlválasztóval, és "Paste Course Content
      Structure" szövegmezővel (a Minicourse oldal "Copy for IdeaToVideo"
      gombjához). Az olvasó a `type`-ot és a major verziót nézi, minden mást
      érthető angol mondattal utasít el (más típus, a régi Video Course
      Content Brief, 2.x verzió, hibás JSON, használhatatlan slug vagy
      lecke-azonosító, két azonos azonosító). Az ismeretlen mezőket és az
      `outline` blokkot nem olvassa. Az 1.x későbbi minor verzióit olvassa.
    - **Előnézet, utána létrehozás:** kurzuscím, leckeszám, a leckék
      playlist-sorrendben, a playlist link. Létrehozás csak a "Create N
      videos" gombra.
    - **Mit tölt ki egy lecke** (a meglévő utakon, új menet nélkül):
      a projekt címe (`title`); `brief.json` (a meglévő Video Brief Card:
      cím, `keyword`, közönség a kurzus `ideal_client` mezőjéből, playlist
      név, pozíció, darabszám, a következő lecke címe, célhossz a három perc
      összegéből, legfeljebb 30); `seed.json` (séma `lesson-seed/1`: `hook`,
      `teach.points`, `do.exercise`, `review.check` ebben a sorrendben, a
      perceikkel, és a `cta` zárómondatként); `packaging.json`
      (`youtube.title` és `youtube.description`, választottként);
      `project.json` új, opcionális `series` blokkja (courseSlug,
      courseTitle, lessonId, playlistPosition, playlistCount, playlistId,
      playlistUrl).
    - **A script seed csak előkészül** (Zoltan döntése): az import nem hív
      AI-t. A "Write script" kapja meg a seedet a prompt új "Lesson outline"
      részében: a hook az első mondat, a TEACH szakaszok a pontok, utána a
      gyakorlat, a végén az ellenőrzés, a zárómondat az utolsó mondat. A
      kurzus ígérete csak háttér: a videó ígérete a leckéé, ezért a kurzus
      `bold_promise` mezője nem megy a brief `promise` mezőjébe.
    - **A lecke `cta` sora zárómondat, nem komment-hívás.** A
      komment-kulcsszavak videónkénti választása (120) változatlan, az
      import nem állít be semmit.
    - **Tagek és nyelv:** a fájlban nincsenek. A nyelv az aktív Identity
      tartalomnyelve. A tageket (és egy üres összefoglalót) az AI pótolja a
      "Write script" csomagoló lépésében; az importált címet és leírást nem
      írja felül (`mergePackaging`).
    - **Hosszú szövegek:** a YouTube cím 100, az összefoglaló 1000 karakter
      marad (a kártya sémája ennyit enged). Az előnézet figyelmeztet, ha a
      fájlban hosszabb; a teljes szöveg a megőrzött fájlban megvan.
    - **A kurzus csak csoport a videók fölött** (Zoltan döntése: szűrő, nem
      új képernyő): a Videos oldalon "Course" választó. Kurzust választva a
      leckék playlist-sorrendben, "Lesson N of M" jelzéssel és a videó
      állapotával, fölöttük a playlist link és az "Export Course Content
      Structure". Az "All videos" listában a kurzus videói alatt kis címke.
      A munka továbbra is egy videón folyik.
    - **A fájl megmarad, bájtra változatlanul:**
      `<az Identity videómappája>/_courses/<slug>/<slug>-course-content-structure.json`,
      mellette `course.json` (séma `course-group/1`: cím, playlist, leckék,
      import ideje). Az export ezt a fájlt másolja ki, a Videos oldalról és
      az Import & Export oldalról is.
    - **Újraimport:** a kulcs a kurzus slug és a lecke id; a videót a
      `project.json` `series` blokkja alapján találja meg, nem a mappanévből.
      Minden videóban `course-import.json` őrzi, mit töltött ki az utolsó
      import. Egy érték akkor frissül, ha még az, amit az import írt; amit a
      user kézzel átírt, marad. Az app saját címcseréje (a "Write script" a
      YouTube címet teszi a videó címévé) nem számít kézi átírásnak. A már
      megírt scriptet az új seed soha nem írja át, és kapu nem áll vissza.
      Második videó egy leckéhez soha nem készül; a törölt videó leckéje
      újra létrejön. Ami már nincs a fájlban, annak a videója marad. A
      végén leckénként: Created, Updated (mi), Left alone (mi), Nothing new.
    - **Az import semmit nem indít el:** nincs AI, hang, HeyGen, AI B-roll,
      render; az Autopilot a létrehozott videókon ki van kapcsolva; minden
      kapu "todo". Nincs új hálózati hívás, port vagy URL-séma. Feltöltés
      nincs, az YouTube Studio-ban kézi marad.
    - **Video tab:** az "Upload on YouTube" blokkban "Playlist: position N
      of M", a playlist linkkel és a mondattal, hogy a leckéket sorrendben
      kell feltölteni.
    - **Playlist link:** csak a
      `https://www.youtube.com/playlist?list=<azonosító>` forma jelenik meg
      linkként (a runner és a UI is ellenőrzi); az opener engedélylistájára
      csak ez a forma került fel. Más címet az app nem mutat linkként.
    - **Biztonság:** a slug mappanév lesz, ezért csak kisbetű, szám és
      kötőjel lehet, legfeljebb 60 karakter; a fájl legfeljebb 2 MB és 200
      lecke. A szöveg adat, soha nem utasítás (a script prompt DATA blokkja).
    - **Backup:** a kurzus-csoport és az előtöltött fájlok a mentésben
      vannak (123).
    - Runner parancsok: `course-preview`, `course-import`, `course-list`,
      `course-export` (a Rust mag engedélylistáján kulcs nélkül). Tesztek:
      `runner/course.test.mjs` a példafájl másolatával
      (`runner/fixtures/example-course-content-structure.json`), az e2e öt
      új lépése, a `scripts/ui-mock` `?course=1` módja.

122. **Video Publishing Card: series block** (Zoltan, 2026-10-11). Az
    IdeaToVideo a blokk forrása: a PDT később ezt a leírást másolja.
    - **Séma verzió: előtte `video-publishing-card/1`, utána
      `video-publishing-card/1`.** Nincs emelés: a 77 és a 114 szerint a
      séma csak bővül, és csak törő változás kap új számot. A blokk
      opcionális, így nem törő. Egy `/2` jelzést a mai fogadók (a mock és a
      PDT) elutasítanának, tehát az nem lenne ártalmatlan.
    - **Hol van:** a kártya legfelső szintjén, `series` néven. Csak akkor
      van jelen, ha a videó egy importált kurzus leckéje (121). Minden más
      videó kártyájából a kulcs teljesen hiányzik (nem `null`).
    - **Egy kártya a blokk nélkül pontosan úgy érvényes, mint eddig**; a
      kötelező mezők listája nem változott (teszt rögzíti).
    - **Mezők:**

      | Mező | Típus | Kötelező a blokkon belül | Jelentés |
      |---|---|---|---|
      | `courseSlug` | string, `^[a-z0-9]+(-[a-z0-9]+)*$`, legfeljebb 60 | igen | a kurzus slugja (a Course Content Structure `course.slug` mezője) |
      | `lessonId` | string, `^[a-z0-9]+(-[a-z0-9]+)*$`, legfeljebb 40 | igen | a lecke azonosítója, például `m1-l2` (`lessons[].id`) |
      | `playlistPosition` | integer, legalább 1 | igen | a videó helye a playlistben, 1-től (`lessons[].playlist_position`) |
      | `playlistId` | string vagy `null` | igen (a kulcs mindig ott van) | a YouTube playlist azonosítója; `null`, amíg nincs playlist |
      | `playlistUrl` | string vagy `null` | nem | a playlist címe; az app eleve hordozza a `project.json`-ban, ezért került be. Csak `https://www.youtube.com/playlist?list=...` forma lehet, különben `null` |

      A `courseSlug` és a `lessonId` együtt a lecke kulcsa. A fogadó az
      ismeretlen mezőket hagyja figyelmen kívül; a blokk később is csak
      bővülhet.
    - **Teljes példa** (egy kártya a blokkal; a séma szerint érvényes):

      ```json
      {
        "schema": "video-publishing-card/1",
        "cardId": "0b5c3c1e-6f4e-4f7a-9d3a-2c1b0a9e8f7d",
        "videoId": null,
        "createdAt": "2026-10-11T16:20:00.000Z",
        "app": { "name": "IdeaToVideo", "version": "0.1.0" },
        "video": {
          "file": "video-20261011-1620.mp4",
          "seconds": 598.4,
          "language": "en",
          "title": "How to Mix Sourdough Dough Without Kneading",
          "workingTitle": "How to Mix Sourdough Dough Without Kneading"
        },
        "searchKeyword": "how to mix sourdough dough",
        "landingUrl": null,
        "next": { "video": "Fold and shape: touch two", "playlist": "TEST Sourdough in a Weekend" },
        "chapters": [
          { "start": 0, "title": "Intro" },
          { "start": 38.2, "title": "The four ingredients and their ratio" },
          { "start": 221.5, "title": "Mix it now" },
          { "start": 498.0, "title": "Check your dough" }
        ],
        "chaptersText": "0:00 Intro\n0:38 The four ingredients and their ratio\n3:41 Mix it now\n8:18 Check your dough",
        "captions": { "file": "video-20261011-1620.srt", "language": "en", "srt": "1\n00:00:00,000 --> 00:00:04,100\nYou are about to do a third of all the work in four minutes.\n" },
        "script": [
          { "heading": "OPEN", "text": "You are about to do a third of all the work in four minutes." }
        ],
        "sentences": [
          { "start": 0, "end": 4.1, "text": "You are about to do a third of all the work in four minutes." }
        ],
        "commentCalls": [
          { "slot": "end", "keyword": "GUIDE", "temperature": "cold", "gets": "the ingredient card", "via": "narrator", "start": 560.2, "end": 566.9 }
        ],
        "endScreen": { "start": 578.4, "seconds": 20, "startSec": 578.4 },
        "packaging": {
          "titles": ["How to Mix Sourdough Dough Without Kneading"],
          "title": "How to Mix Sourdough Dough Without Kneading",
          "summary": "Four ingredients, one bowl, no kneading.\n\nLesson 2 of Sourdough in a Weekend.",
          "tags": ["sourdough", "how to mix sourdough dough", "no knead bread"]
        },
        "syntheticMedia": false,
        "series": {
          "courseSlug": "test-sourdough-in-a-weekend",
          "lessonId": "m1-l2",
          "playlistPosition": 2,
          "playlistId": "PLxxxxxxxxxxxxxxxx",
          "playlistUrl": "https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx"
        }
      }
      ```
    - Kód: `runner/gates/render/publish.mjs` (`buildCard`), séma:
      `runner/schema/video-publishing-card.schema.json`, teszt:
      `runner/course.test.mjs` ("card: the optional series block").

123. **A kurzus-csoport a Backupban** (Zoltan, 2026-10-11, a 121 nyitott
    pontja; `runner/backup.mjs`):
    - **Hova:** `<mentési mappa>/<Identity mappa>/_courses/<slug>/`, benne a
      megőrzött Course Content Structure fájl bájtra változatlanul és a
      `course.json`. Csak a változott fájl másolódik, semmi nem törlődik.
    - **Mikor:** a "Back up now" minden kurzus-csoportot ment (azt is,
      amelyiknek már nincs videója), és egy lecke saját mentése (jóváhagyás
      vagy render után) viszi a saját kurzusát. Minden mentési szinten megy:
      két kis fájl. A csoport mentési hibája soha nem buktatja el a videó
      mentését.
    - **Vissza:** az első visszatöltött lecke hozza a kurzus-csoportot, ha
      az a gépen nincs meg (egy itteni, újabb csoportot nem ír felül). A
      többi lecke a "Restore from backup" listából jön, vagy a kurzusfájl
      újraimportjával: a visszatöltött leckét a kulcsa alapján megismeri,
      nem duplázza.
    - **Videónként, az 1. szinttől:** `seed.json`, `course-import.json` és
      `packaging.json` is a mentésben van. Így visszatöltés után egy
      újraimport ugyanúgy tudja, mit írtál át kézzel. A `packaging.json`
      eddig egyetlen videó mentésében sem volt benne (a választott cím,
      összefoglaló és tagek visszatöltéskor elvesztek): ez most minden
      videóra javítva.
    - A "Restore from backup" lista a `_courses` mappát nem kínálja videóként.
    - Teszt: `runner/course.test.mjs` ("backup: the course group...").

124. **CTA: a teljes hívás szóról szóra** (Zoltan, 2026-10-16):
    - **Mi volt a baj:** a CTA wizard "What they get" mezője 80 karakternél
      levágta a szöveget, a séma 200 karakternél nem engedte menteni, és a
      HeyGen klip mindig így rakta össze a mondatot: "Comment GUIDE below and
      I'll send you <a mező>." Egy saját, teljes CTA így félbevágva vagy
      dupla mondattal jött volna ki.
    - **Mostantól:** a mező 4 soros, legfeljebb 600 karakter
      (`CtaWizard.svelte`, `OFFER_MAX` a `runner/cta/profile.mjs`-ben, és a
      `runner/schema/cta-profile.schema.json`). Ha a szöveg maga tartalmazza
      a kulcsszót (pl. GUIDE), az egy teljes hívás: a HeyGen klip és az
      előnézet szóról szóra azt mondja (`callText` a
      `app/src/lib/cta/clips.ts`-ben, `CallsPreview.svelte`). Rövid "mit
      kap" szövegnél marad az alap mondat.
    - Zoltan három klipje (ZG C2C Identity): GUIDE az elején, COURSE középen,
      TRIGGER a végén, a szövegük a CTA profilban.
    - **Későbbre (backlog):** "Generate now" gomb a CTA kártyán, ami a klipet
      azonnal legyártja, nem csak a következő videó szkriptjénél. Addig: új
      videó, gate 1-nél csak az az egy kulcsszó "Generate with HeyGen", a
      többi Narrator.
    - Telepítő helyben épült (Windows, NSIS), GitHub Actions nélkül: a
      `build.yml` csak PR-re és kézi indításra fut, sima pushra nem.

125. **Tech stack átnézés a HeyGen v3 emlékeztető után** (Zoltan, 2026-10-20):
    - **HeyGen:** újra összevetve a developers.heygen.com/endpoint-version-comparison
      táblázattal. Minden hívás v3 (lásd 116), a `POST /v3/videos` a v3
      `type: "avatar"` formát és az `engine` mezőt küldi. Kódcsere nem kellett;
      a `runner/heygen-v3.test.mjs` továbbra is őrzi.
    - **ElevenLabs:** TTS `eleven_v4` a `/v1/text-to-speech/{id}/with-timestamps`
      végponton, hanglista `/v2/voices`. Kivezetett modellt (`*_v1`, `scribe_v1`)
      nem használunk. A Music `model_id` nélkül megy, így `music_v1`; a
      `music_v2` és `music_v2_5` elérhető, de hangzásváltás, ezért Zoltan
      fülpróbája után dönthető.
    - **Függőségek:** az app semver-en belüli frissítései (Tauri 2.12.x,
      Svelte, Vite) és `cargo update`. Major ugrás (SvelteKit 3, adapter-static
      4, TypeScript 7) és a HyperFrames 0.8.22 -> 0.8.181 szándékosan külön
      lépés, saját e2e próbával (DECISIONS 18 szerint a motor verzióváltása
      tudatos döntés).

126. **HyperFrames 0.8.22 -> 0.8.181** (Zoltan, 2026-10-20, a 125 backlogjából):
    - **Mi változott:** `engine/package.json`: `hyperframes` és
      `@hyperframes/shader-transitions` 0.8.181, `gsap` 3.15.0, új
      `engine/package-lock.json`. A lecsupaszított engine 103 MB.
    - **CLI:** a runner hívásai változatlanul érvényesek. `snapshot -o --at
      --no-end --describe false`, `render -o --quality`, `lint`, `check --json
      --at` mind megvan. A shader lista (14 név) ugyanaz, a
      `runner/motion/transitions.mjs` csak a megjegyzésben kapott új verziót.
      A CLI hívásokon nem kellett igazítani.
    - **Render böngésző (Zoltan döntése, 2026-10-20):** a render indulás
      előtt `--version`-nel kipróbálja a böngészőt. A gépen lévő Google
      Chrome Windowson erre nem válaszol (60 mp, "Chrome cannot start"), a
      letöltött chrome-headless-shell (most `win64-152.0.7977.30`) igen.
      Ezért a render mindig a shellt használja: ha még nincs meg, a runner
      előbb letölti a HyperFrames saját letöltőjével (`hyperframes browser
      ensure`), a sávon közben "Downloading the render browser" áll
      (`renderBrowser` a `runner/tools.mjs`-ben). Renderre nincs rendszer
      Chrome tartalék. A lint, a check és a snapshot alatt a 25-ös pont
      tartaléka marad.
    - **ENAMETOOLONG:** a render a kimeneti fájl mellé nyit egy ideiglenes
      `.hf-transaction-XXXXXX` mappát, és hosszú projekt útvonalnál ez
      túllépte a Windows korlátot. Flag vagy env változó erre nincs, ezért a
      render egy rövid saját mappába ír (`<tmp>/itv-r/<8 hex>/video.mp4`,
      felülírható: `ITV_RENDER_TMP`), a kész MP4 innen kerül az `out/`
      mappába. A rövid mappa sikeres és sikertelen render után is törlődik.
    - **Tesztek:** `runner/tools.test.mjs` (hiányzó shellnél letöltés,
      meglévőnél nem, rendszer Chrome tartalék nincs) és
      `runner/gates/render/index.test.mjs` (kb. 260 karakteres projekt
      útvonal, takarítás hiba után is, a letöltés szövege).
    - **Próba helyben:** Node 299 zöld (2 éles kihagyva), e2e 44/44 a
      hosszú (kb. 200 karakteres) munkamappán is, UI check 0 hiba. Telepítő
      nem készült.

## 2026-10-23 (daily use for many channels)

127. **Channels board, Playlist Planner, Traffic Card, Uploaded tick** (Zoltan,
    2026-10-23; docs 27 and 26 section 7). Up to a dozen channels in daily use.
    - **Changes 69 in part.** 69 said strategy is not the app's job. Now the
      app has a thin Playlist Planner for its own user (Wizards, Playlist
      Planner). The boundary stays a file: the planner writes a Course
      Content Structure 1.0, the same format the course import reads (121),
      and hands it to that import. A later standalone Flywheel app can write
      the same file and replace the wizard; nothing else changes. No schema
      change to the file.
    - **Planner steps:** seeds (from the Traffic Card, or the typed topic;
      free), vidIQ keyword research with the user's vidIQ key, one call per
      seed (the app shows the credits left and asks first, then shows the
      credits used), the AI's plan (one video per strong keyword, 8 to 16,
      with "why this number"; volume and competition come from vidIQ, never
      from the AI; asks first), the editable table (title, keyword, order,
      add, remove), the AI outline (hook, teach, do, review, 10 to 20
      minutes each; asks first), then the import preview and "Create N
      videos". The file is built in code (`runner/planner/index.mjs`), not
      by the AI. The closing line of each video points to the next one; the
      3 comment CTAs stay the Identity's (GUIDE, COURSE, TRIGGER by default).
    - **Evergreen Traffic Card:** the .md of the Brand Channel Wizard
      (front matter `card: youtube-evergreen-organic-traffic-card`,
      version 1). Kept as it came in the Identity folder
      (`traffic-card.md`), so Identity export and backup carry it with no
      new code. On Identity, YouTube Channel & Audience it offers only fields
      that exist: channel name (the Identity name), audience, topic and
      promise (channel profile), content language. Filled fields are shown
      but not ticked. Save settings keeps them, as with any edit.
    - **Channels board on Home**, at the top: one row per Identity and
      playlist (or course): done "X of N", the next video and its step (the
      tab it opens on), Sent to Publishing, Uploaded "X of N". Open switches
      to that Identity and opens the video on its step. It reads `_courses`
      and project.json; no second store.
    - **project.json, two optional fields:** `publishing {sentAt, cardId}`
      (set when Send to Publishing worked; older sends show "No") and
      `upload {at, url, videoId}` (the user's Uploaded tick with the YouTube
      link). Upload stays manual in YouTube Studio; the app never uploads.
    - **vidrev handoff:** after the tick the video shows its 3 comment
      keywords (from script.json), "Open vidrev.app" and "Copy the video
      link". vidrev (read only, nothing changed there) already has a way:
      `POST /api/v1/cards`, then `POST /api/v1/cards/{cardId}/published`
      with `{"videoId"}` arms the campaigns, with a PDT style connect token.
      Not used yet: it needs a vidrev token in Connections and a check that
      PDT and IdeaToVideo do not send two cards for one video. Backlog.
    - **Labels:** the import says "Course or playlist"; its error help names
      the Minicourse page and the Playlist Planner.
    - **Tests:** `runner/board.test.mjs`, `runner/traffic-card.test.mjs`,
      `runner/planner.test.mjs` (a fake vidIQ MCP server; the planner's file
      is read and imported by the course import). Node 313 green, Rust 48,
      e2e 44/44, UI check 0 errors, the screens checked in `scripts/ui-mock`.
      No installer built.

128. **Playlist bridge lines in the script** (Zoltan, 2026-10-23). A ONE Video
    that is one lesson of an imported course or playlist gets two lines the
    app writes itself, not the AI (`runner/course/bridge.mjs`):
    - **After the hook** (lesson 2 on): "If you have not watched <previous
      title> yet, watch it first. The link is on screen."
    - **Before the end screen:** "Next, watch <next title>. It is the next
      step in this playlist." The last lesson: "If you missed any part of this
      playlist, start from lesson 1."
    - **From the order at script time:** the titles come from
      `_courses/<slug>/course.json` when the script is written, never from the
      Course Content Structure, so a new order (imported again) needs no fix
      by hand; the next "Write script" says it right. The file format is not
      changed. The Playlist Planner no longer writes a "watch the next video"
      closing line into the file.
    - **Fields:** `open.bridge` and `own.bridge` in script.json (optional);
      script.md has them right after the hook and as the very last line, so
      the voice reads them. For these videos the AI is not told the next
      video and gets no closing line, so it is never said twice.
    - **At most 12 seconds each** (150 words a minute, so 30 words): a long
      title is shortened. A title is made speakable: a colon, dash, quotes or
      brackets become a comma or go (the script's style rules).
    - **Comment calls untouched:** each video keeps its own CTA plan, 0 to 3
      calls with whatever keywords that video uses (its gate 1 choice, else
      the Identity's CTA profile). The bridge never names a keyword.
    - **Tests:** `runner/bridge.test.mjs`.

129. **Engine output read whole; the check report is not a version issue**
    (Zoltan, 2026-10-27). "Autopilot stopped: hyperframes check gave no
    readable report" showed the report's last lines (`_meta`, "latestVersion
    0.8.201, updateAvailable"), which looked like an outdated engine. It was
    not: the app runs its own pinned engine (0.8.181, DECISIONS 126), never
    a global `hyperframes`, so `npm install -g hyperframes@latest` changes
    nothing for the app, and the engine never updates itself
    (`HYPERFRAMES_NO_AUTO_INSTALL`, `HYPERFRAMES_NO_UPDATE_CHECK`).
    - **Cause:** `runHyperframes` cut each piece of output (64 KB on
      Windows) into lines on its own. A `check --json` report with scene
      changes is over 100 KB, so a piece could end inside a line; that line
      came back in two and the JSON did not read. It happened only now and
      then, wherever the cut fell. A cut inside a multi-byte letter broke it
      too.
    - **Fix:** each stream keeps its unfinished line until the rest comes
      (and is read as UTF-8 text); the run also returns the whole stdout.
      The build gate reads the report from stdout (`readCheckReport`: the
      first object starting a line that reads to the end, anything printed
      before it skipped, `_meta` ignored), else from the copy the engine
      saves in `build/.hyperframes/artifacts/checks/` (`savedCheckReport`).
    - **Version policy unchanged:** a new HyperFrames (0.8.201 now) is taken
      only as a deliberate step (new lockfile, e2e, new installer), never at
      run time. The update notice in `_meta` is not an error.
    - **Tests:** `runner/tools.test.mjs` (output cut mid-line and mid-letter;
      fails on the old code), `runner/build.test.mjs` (notices before the
      report, `_meta`, the saved copy). A real check on the 2026-10-26 video
      with the installed engine: report read, 0 errors.

## 2026-10-28 (the full scene catalog)

130. **All 234 registry components, a catalog, two-step planning, a picture
    check** (Zoltan, 2026-10-28: "every video looks like the same slide deck,
    and the scenes often do not match what is said"). The cause was DECISIONS
    55: the planner picked from 14 components. Building can be big; running
    must be smart, never cheap at the cost of quality.
    - **Closes 56 with "all 234".** `library/components.json` lists every
      component at the pinned commit `9a27b9f`; the same lock (SHA256 per
      file, 515 new files, the 96 old hashes unchanged) and a licence check
      (`checkLicense`): an item with another licence (`kinetic-center-build`,
      MIT, Remocn) and every font file in an item (Caveat, Permanent Marker,
      Courier Prime) must be listed, or the build stops. 11 MB in the
      installer. Nothing is deleted: a component that fails is "off".
    - **The catalog** (`library/catalog.json`, shipped as `CATALOG.json`):
      per component what it shows, when it fits, its role (opening, key
      sentence, highlight, proof, list, diagram, quote, transition, close),
      what it needs (text, number, image, recording), strong and weak
      points, an example sentence, status and the reason when off. Written
      from each component's own file and its test renders
      (`scripts/catalog/notes.json`, `build-catalog.mjs`), not from guesses.
      The build stops when the catalog and the component list differ.
    - **Every component tested** (`scripts/catalog/test-components.mjs`):
      a one-scene video per component and topic, built by the app's own
      assembler, two topics with two looks (groceries in coral, light; sleep
      in broadside, dark), then lint, check, three stills, a draft render,
      contact sheets. Off when any test fails in either topic, when the
      finished frame is empty, when both topics draw the same picture, or
      when the stills show the component's own fixed content or colours
      instead of the topic and the Brand. Result: **25 of 234 on, 209
      off**: 72 are paste-in recipes, not mountable scenes (no authored
      length, no composition); 48 fail `hyperframes check` in their
      finished state (clipped text, text under an element, contrast); 1
      fails lint; 19 end on an empty frame or draw the same picture for
      both topics; 69 show their own fixed content, placeholders, mock
      screens or their own colours and fonts (the review of the stills,
      reason per component in the catalog). The 25 on: opening
      (titlecard-calm, titlecard-lockup, logo-sting, scan-band), key
      sentence (per-word-rise, line-swap, push-in, typed-prompt), highlight
      (marker-highlight, vox-annotate, text-shimmer, ticker-takeover,
      particle-text-dissolve, camera-scan-gate), proof (count-up,
      chart-story, conic-progress-ring, star-rating-fill), list
      (grid-card-assemble, notification-stack, pan-stations), diagram
      (whiteboard-ink, a different icon per sketch), quote
      (testimonial-proof-card, only for a real quote), close (cta-close,
      cta-lockup). Three of the old library now fail the check
      (headline-slam: contrast in the light look; constellation-hub:
      clipped labels; kinetic-type-swap: contrast): never planned again,
      but older scene tables that use them still check and build.
    - **Two-step planning** (`gates/scenes`): step one reads the whole
      catalog and gives every scene 3 to 5 candidates, best first; step two
      reads the full code of those candidates (base64 left out), picks one
      per scene, fills it from the sentence's words and says in one line
      why. Long videos go in parts of at most 10 scenes and about 60 000
      tokens of code. The table keeps the ranked candidates and the reason;
      swaps offer the candidates first and read the component's code too.
    - **Variety:** never the same component twice in a row (now a hard
      rule, repaired, no longer a warning); at most max(2, scenes / 12) uses
      in one video; `<identity>/scene-history.json` keeps the last videos'
      components, and the catalog tells the planner how often each was used
      lately (rank the less used one first when two fit equally).
    - **Picture check** (`gates/review/visual.mjs`, runner `visual-check`):
      after the build and the engine's checks, the AI looks at two frames of
      every scene (past the middle, just before the end) and judges "fits
      what is said" and "reads well". A failing scene goes to its next
      candidate, is filled from that code, rebuilt, and only that part is
      drawn and judged again; at most two rounds, then one render. Done
      before the full render on purpose: the frames are the engine's own
      pixels, and a swap costs one scene's frames instead of a new render.
      The report shows on the Preview tab (`review/visual-check.json`).
    - **Price first** (`providers/prices.mjs`): planning, a swap, a change
      asked for and the picture check each show their price before they
      run (USD per million tokens; Claude from Anthropic's list, Gemini from
      third-party price pages, marked as a guess). Autopilot asks before the
      plan and before the picture check.
    - **No hand-made scenes, the look from the Brand:** block packs (the
      ZG archetypes in C2C blue and Open Sans) are no longer planned or
      offered as swaps. A table that already uses them still builds, always
      with the Identity's Brand colours and font (the pack's own look never
      reaches the video). The pack files stay in the Identity folder,
      untouched. The name example in Settings and the UI mock's channel
      link no longer name Zoltan.
    - **The build gate judges every scene once it has landed**
      (`gates/build lintAndCheck`): before, a build without scene changes
      was checked over its whole timeline (mid-entrance states counted as
      errors), a build with them only at the landed moments, so the same
      scene passed in one Identity and failed in another. Now always the
      landed moments, with the change windows told apart. The component
      tests use the same moment; checked over the whole timeline first, 56
      failed, at the landed moment 48 (the 8 that recovered were then
      judged by their stills).
    - **Length fitting:** a component that does not read its length now
      plays its timeline and holds its end state (the registry's contract)
      instead of being refused; its root is the element with the
      composition id when it has no `#root`. The test renders show which
      really hold (an empty end frame is off).
    - **Tests:** `runner/scenes.test.mjs` (two steps, repairs, variety,
      history, price, swaps), `runner/visual.test.mjs`, a fixed test
      catalog (`runner/fixtures/catalog.json`) so unit tests do not depend
      on the render results.

## 2026-10-29 (thumbnails)

131. **Thumbnail step after Your video** (Zoltan, 2026-10-29: "minden
    videóhoz kell, és most ez a legkellemetlenebb kézi lépés"; Phase 1 plan
    approved with the recommended choices).
    - **Profile photos per Identity:** `<identity>/photos/face-<n>.<ext>`,
      JPG, PNG or WebP, at most 3, at most 10 MB each (lib.rs
      `import_photo`, `remove_photo`; identity.rs). Remove asks first. Added
      on Identity, Voice & Avatar ("Thumbnail photos") or right on the
      Thumbnail tab. They ride in the Identity export like the logo (choice
      3), and the window says they go to Google when the face is on.
    - **Tab 7 "Thumbnail"** (`ThumbnailTab.svelte`): optional, never the
      step at hand, Done once one is picked. Switch "With my face" / "No
      face" (the face needs a photo). One button makes 3 variants; each
      shows full size and at YouTube's phone-list size (168 px); "Use these
      words" places new words for free; "Pick this one"; "Regenerate" one or
      all. Nothing is deleted: replaced variants go to
      `thumbnail/older/<stamp>/`.
    - **How a variant is made** (`runner/thumbnail/`): one small Gemini text
      call (`gemini-3.5-flash`, same key) writes the words (at most 4 words
      and 28 characters, checked and repaired once) and a picture idea per
      variant from the chosen YouTube title, the hook and the audience. One
      Gemini image call per variant (Interactions endpoint, as the free
      voice; JPEG, 16:9, 1K) draws the picture with no text and a calm left
      side; with the face on, the photos go in as references (choice 1).
      The app puts the words on a panel in the Identity's background colour
      and display font, the accent word in its first colour, pushed to 7:1
      and 4.5:1 contrast (`fixContrast`), as a one-frame HyperFrames
      composition photographed by `hyperframes snapshot` (no renderer of our
      own), then ffmpeg makes a 1280x720 JPEG under 1 MB. Why the app sets
      the words and not the AI: AI image text is often misspelled, in the
      wrong font, and breaks Hungarian accents.
    - **Models and prices** (`thumbnail/models.mjs`, Google's price page
      read 2026-10-29, standard tier, 1K): `gemini-nano-banana-2.1` $0.0336
      a picture, the default (choice 2); `gemini-3-pro-image` $0.134 in the
      picker; "Test pictures (free, placeholder)" like the B-roll test
      clips. Three variants cost about $0.10 to $0.12 with the default. The
      price is asked before every Make and Regenerate; the spend per video
      is kept in `thumbnail/thumbnail.json`.
    - **The card:** optional block `thumbnail {file, mime, width, height,
      bytes, sha256, words, withFace, data}` (base64 JPEG), the version
      stays `video-publishing-card/1` (as `series`, 122). Pick writes it
      into the latest card (same cardId), and a render keeps it. A copy
      sits next to the video as `<video>.thumbnail.jpg`. Send to Publishing
      refuses a card over 2 MB with a sentence. PDT's side (validate with
      its `thumbs.py`, show it, one-button thumbnails.set, no thumbnail
      prompts, strip `data` before vidrev) runs in a separate PDT chat from
      the prompt given on 2026-10-29.
    - **Backup:** `thumbnail/thumbnail.json` and `thumbnail/chosen.jpg` at
      level 1.
    - **Tests:** `runner/thumbnail.test.mjs` (11: words rule, ideas and
      their repair, the picture call against a stand-in, prompt, price,
      photos, contrast in the presets, card block, pick, the 2 MB refusal),
      `scripts/app/tabs.test.mjs`, Rust `photos_are_numbered_capped_and_
      removed_by_name_only`, e2e 10 thumbnail steps with the real engine
      (54/54). No paid call was made while building.

## 2026-11-02

132. **Channels: one locked recipe per channel, one start screen** (Zoltan,
    2026-11-02, `docs/BUILD_PLAN.md`, phase 1). A channel is an Identity plus
    `<identity>/recipe.json` (`runner/channels/recipe.mjs`): engine, style
    preset, voice, avatar on or off, music on or off, target length. Asked
    once. The word on the new screen is "channel"; the Identity menu keeps its
    word (DECISIONS 119). Each video copies the recipe into its project.json,
    so a later change never touches a video under way.
    - **Home is now the channel screen** (`channels/ChannelStudio.svelte`):
      pick a channel, the recipe, idea or script in. The run
      (`ProjectView recipeRun`) uses the same commands as the tabs and stops
      at the existing Preview step. Render, card, Thumbnail and Send to
      Publishing are untouched.
    - **An existing channel keeps what it has:** the recipe starts from its
      Identity (Zoltan's ElevenLabs clone, avatar and length), only a new
      channel starts on the free voice. Zoltan, 2026-11-02, mid-build:
      ElevenLabs stays his voice; Kokoro stays as an extra option because it
      was already built.
    - **Advanced toggle** in the top bar (`ui.advanced` in config.json): the
      Wizards menu, the readiness Home, and the long setup and New Identity
      wizards wait behind it. Nothing was deleted. The first setup without it
      asks for the AI key and a name.
    - **A pasted script needs no AI:** it is cut into parts of about 120 words
      unless it has its own `##` headings.
    - **Avatar rule:** the recipe forces `avatar_iii` and the new layout style
      `overlay`: transparent WebM, no mask, resize or new place, and no
      fallback to a card. Not tried against HeyGen yet (it costs credits).

133. **The free voice: Kokoro directly on the ONNX runtime, own pronunciation**
    (`providers/tts/kokoro.mjs`, `g2p.mjs`). The usual package `kokoro-js` was
    rejected: it brings `phonemizer`, a wrapper around espeak-ng, which is GPL.
    Instead: `onnxruntime-node` (MIT) and the CMU dictionary (BSD), own mapping
    to the model's phonemes, own number reading. English only, American voices.
    - **Word timings come from the speech model:** the timestamped export
      returns each phoneme's duration. The first version used the raw values
      and drifted 0.2 s late in a long sentence, measured against the audio's
      energy. The model rounds each duration (at least 1) before it makes the
      sound; rounding the same way adds up exactly (102 of 102 units).
    - **No Whisper yet:** ElevenLabs keeps its own character timings, which
      come with its audio. Phase 7 is the first to need a local transcriber.
    - **onnxruntime-node stays at 1.22.0:** 1.31.1 crashes with a segmentation
      fault on this Windows 11 when it creates a session (measured).
    - **`scripts/prune-runner.mjs`** drops other platforms and DirectML, which
      is Microsoft's license: from 294 MB to 21 MB. The model (86 MB) is
      downloaded once on first use and checked against a pinned hash.
    - **Speed:** about 1.8 times the audio's length on this 8 core machine, so
      an 8 minute video reads for about 15 minutes.
    - **Music by code** (`providers/music/synth.mjs`): a four chord pad that
      loops without a seam, four moods, seeded per video. A recipe can also take
      files from the channel's `music/` folder. Nothing is downloaded.

134. **The preset engine** (`runner/presets/`, `gates/scenes/templates.mjs`). A
    preset is a folder with `preset.json`: tokens, 8 to 15 templates, shot rules,
    checked by `checkPreset`. Its style sheet PNG is rendered from the tokens
    through the engine's own snapshot.
    - **The LLM only fills templates:** at most 24 sentences per call, a
      prompt under 5000 characters. Every answer is walked sentence by sentence
      and mended by rule; over a third mended means one more ask. A part the
      AI cannot answer is planned by rule, so the plan never fails on the AI.
    - **A number the sentence does not say never reaches the screen.**
    - **Preset 1, Motion Frames:** 13 templates, each naming the channel's own
      zg-frames block first and a bundled component second. Same build, same
      Brand and Motion profile as before. This reverses a part of DECISIONS 130
      for channel videos: the blocks are planned again when the channel has the
      pack. The Scenes tab's catalog plan is unchanged.
    - **Found by looking at every template's picture:** `highlighter` has a
      fixed second line, `rail` lands its last stop after any scene over 4.2 s;
      both are left out, the canon is not changed. A pack made before
      `window.ITV_ICONS` drew empty circles: `fitPackBlock` now makes the same
      one-line change in the build copy. Pack files stay untouched.

135. **The asset license module** (`runner/assets/`). `refusal()` is the one
    check: an allowed source, a CC0 or PD license that source can give, source
    URL, author and date, and no words pointing to a person. Every external
    asset of a channel video goes into its `assets_license.json` (in the backup,
    level 1); a clip without proof (Pixabay, Unsplash) stops the channel video's
    build with a sentence. Searches read the license again from each answer.
    Identity, Footage has the panel. Wikimedia Commons answered live (12 hits).
    On 2026-11-02 Openverse's own server gave a 504 in a browser too, and the
    Library of Congress puts a Cloudflare bot check in front of its JSON, which
    the app does not try to get past: the search says it did not answer and
    shows the others. Those two are tested against stand-ins only.

136. **Week batch** (`runner/channels/batch.mjs`): one AI call for 7 ideas, then
    7 scripts through the same gate as a single video, each queued
    (`project.queue`). A failed script stays in the queue and stops nothing. No
    voice, no render, nothing published. On the channel screen each row has
    Make the video. A channel video's Thumbnail starts on a new free maker
    (Brand gradient, the title's words, no key).

    Tests: Node 393 of 396 (the one red is `traffic-card.test.mjs`, red on main
    before; 2 live tests skipped), Rust 49, UI check 0 errors, e2e 54/54, the
    new `scripts/phase2/channel-e2e.mjs` 29/29. No paid call was made while building, and
    no real AI answered the template planner yet: it was tested with stand-in
    answers, and by rule through a real render.

137. **The B-roll engine** (Zoltan, 2026-11-02, `docs/BUILD_PLAN.md` phase 1b;
    `runner/broll/engine.mjs`). Moving video under the sentences that name something
    visible, shared by every preset and later the Recorded engine. The cheapest source
    that fits, in this order: public domain film, a free still moved in 2.5D, Pixabay,
    a paid Kie AI clip. Same `broll.json`, footage library and scene table as the Scenes
    tab's panel, whose HeyGen path is unchanged.
    - **A parallax clip is a HyperFrames composition:** one canvas, a shader over the still
      and its depth map, seeked by the engine's timeline. No frame code of our own
      (the canon's border). About 70 s a clip on this computer. Tested with a real NASA
      still in all three moves.
    - **Depth Anything V2 Small on the existing ONNX runtime:** 27 MB, once, pinned hash.
      Only the Small size is Apache 2.0.
    - **Kie AI: Seedance 1.0 Lite,** the cheapest per second that gives a 16:9 clip of
      about 5 seconds. Only the engine can order it, not the Scenes tab's panel.
    - **No yes, no money:** the Preview tab sends the total it showed, and `approvePaid`
      refuses any other total, a missing total (a test found this one: `NaN` passed
      the first version's comparison), the switch off, or a limit. The month is per
      channel (`<identity>/broll-spend.json`); a clip Kie AI cannot make comes back on
      the month and the video, and its free clip stays.
    - **Who sees the frame (Claude's decision, can be overruled):** with an AI key the AI
      looks at the frame of a film or still: does it show what is said, can a face be
      recognized. Without a key only an exact word match counts, and no old film,
      whose title says nothing about a given frame.
    - **NASA's site hosts other people's work (found in the ledger of the first real
      run: a launch company's film):** a NASA item counts only when its own credit says
      NASA. Stricter than it has to be, on purpose: other sources remain.
    - **A recipe locked before this keeps B-roll off,** like DECISIONS 132; a new channel
      starts with it on. The switch is in the recipe, paid clips under it.
    - **Prompt rule by code too** (`promptRefusal`): a capital inside a sentence, a list of
      famous names, "in the style of". Checked when planned, edited and ordered.
    - Pixabay is now allowed in a channel video, logged as a free license, not CC0.
      Unsplash stays refused. No Pexels: a test reads the code for the word.
    - **Keys:** Kie AI added to the keychain's names, stored in Windows Credential Manager
      as `default.ideatovideo.kie`. Pixabay's was already there and was not touched.

    Tests: Node 423 of 426 (the one red is `traffic-card.test.mjs`, red on main before; 2
    live tests skipped), Rust 49, UI check 0 errors, e2e 54/54, channel e2e 38/38 with
    real footage from NASA through a real render. The still path through the engine, real
    still, depth and render: 61 s. Kie AI: only the free balance call was made (80 credits).
    No paid call was made while building, and no real AI answered the plan or the frame
    check: stand-ins and the rule only.

138. **The Recorded engine** (Zoltan, 2026-11-02, `docs/BUILD_PLAN.md` phase 2;
    `runner/recorded/`). A camera file, a screen file, both, or one combined file in;
    an edited video out through the same Preview, render, Publishing Card, Thumbnail and
    publishing app. Own implementation: no third-party editing skill was opened.
    - **Same gates, so the tail is untouched:** `script` is the words and the cut list,
      `voice` is the cuts applied, `scenes` is the plan, `avatar` is skipped, `review` is
      the composition. It writes the files the tail already reads (`words.json`,
      `sentences.json`, `audio/vo_bgm.mp3`, `script.md` with chapter headings,
      `scenes.json`), so the card's chapter times come from the real cut video. One tab,
      Recording, stands for the first three gates; a script video keeps its seven tabs.
    - **Inside the composition, not laid over it:** the canon (PIPELINE.md) says a
      talking head's overlays are rendered with alpha and laid on the untouched recording.
      Here the recording plays inside the composition, as the canon says for a screen
      recording, because a big word must sit between the camera and the person cut-out and
      B-roll must cover both. The camera is encoded once more for it. Speed: 40.8 s of
      video in 95 s at draft quality on this computer.

139. **The speech model: Whisper Base on the ONNX runtime the app already ships**
    (`recorded/whisper.mjs`, MIT, 79 MB, downloaded once, pinned hashes). No new program
    and no new package. `whisper.cpp` was rejected because it has no Mac binary.
    - **Word times from the model's attention:** the same method as Whisper's own word
      timestamps, a dynamic time warp through its cross attention, then snapped to the
      sound. Against the transcript of a real clip the times sit within about 0.1 s.
    - **The int8 encoder does not load:** ONNX Runtime 1.22 has no ConvInteger on the
      CPU. The q4 encoder does (measured). 3 to 5 times faster than the sound on 8 cores.
    - **One run lost its result** after the work was done: the step had finished, but the
      process printed nothing more and gave no error. The likely cause is the model going
      down with the process, so the sessions are now released first. 6 of 6 repeats since then
      delivered. The cause itself was not proved.
    - **"Checked against the video":** every word is snapped to the recording's own
      sound. Then it counts the words on speech, the speech with a word on it, how far word
      starts sit from where sound starts, and that no word runs past the file. The same
      check runs again on the cut sound. A transcript that fails it never deletes sound it
      cannot name, and the Recording tab says so.
    - **Files that do not line up:** the file's own stream offset is applied, and a second
      file is lined up by the loudness of its sound. Two separate takes do not match, so
      they start together, and the tab says so.

140. **What comes out** (`recorded/cuts.mjs`). Whole frames, so sound and picture are cut
    at one moment, with a 6 ms fade at each join so a cut never clicks.
    - **Silences:** a pause over 0.5 s becomes a short one; a sentence's end keeps a breath.
    - **Filler words:** whole words only, per language. Whisper hides many "um"s, so a
      prompt full of them keeps them in, and a sound with no word on it between two words
      is cut too. "You know" and the like go only between commas.
    - **Repeated takes:** the same words again within the next three phrases, with only
      short remarks between. The last take that finishes its sentence stays; a last try that
      stops short loses to the good one before it. A word said twice in a row goes once.
    - **Nothing is lost:** every cut has a Put back on the Recording tab, and the steps run
      again from the same words.

141. **The four presets** (`runner/presets/talking-head`, `screen-recording`, `screen-share`,
    `profile-silhouette`; `recorded/shots.mjs`, `compose.mjs`). No transition sound anywhere:
    the composition's only audio is the recording's voice, with the recipe's music.
    - **The AI only names chapters and picks words:** its answer is checked word by word,
      repaired once, else a rule fills it. A dead AI still gives a video. Every entrance is
      the exact start of the word it shows.
    - **Talking head:** B-roll through the Phase 1b engine, unchanged. Big words carry their
      own outline, because no contrast can be promised over a moving picture.
    - **Screen share:** a change about every 8 s, always where a sentence starts, never one
      layout twice, and a sentence that points ("click", "here") goes to the big screen. The
      engine's lint refuses animated left, top, width and height, so both pictures move by
      transforms and a clip path.
    - **Person:** MODNet (Apache 2.0, 26 MB, on the same runtime). The int8 export has the
      same ConvInteger problem, so the plain one. Masks at 15 frames a second, blended up by
      ffmpeg; the cut-out and the silhouette are VP9 with alpha, which the engine renders
      (checked by eye in a real render). Only the person is run through the model, and for a
      big word only that word's seconds.
    - **Cursor** (`recorded/cursor.mjs`): a recording holds no mouse data, so it is found
      in the pixels. Spots where something keeps changing in place are ruled out, then a
      small search over the whole recording follows the thing that travels. A click is a
      stop with the screen answering next to it, after a quiet moment.
    - **A wrong drawn cursor is worse than the filmed one:** on three real recordings the
      tracker followed enough to zoom, but pages with their own animation fooled it at times.
      So the original is painted out and redrawn smooth only when almost nothing else on the
      screen travels; otherwise the filmed cursor stays, the view still zooms, and the tab says
      so. When the cursor stands still, only its own pixels are patched, so what opens under it
      stays live. The clean picture never takes the area around the cursor. Known limit: at one
      stop of the test clip a sliver of the filmed cursor stayed visible next to the drawn one;
      two other stops checked were clean. The recipe has a switch. This is
      one of the two places where our code touches pixels (with the person masks).
      Both prepare footage for the composition; HyperFrames still makes every frame.

142. **Direction, one recipe for both** (Zoltan, 2026-11-02, `docs/BUILD_PLAN.md` phase 3;
    `runner/channels/recipe.mjs`, `start.mjs`). The start screen has three choices, each starting
    from the recipe: the direction, the text (empty: a topic; else Finished or Notes), research.
    - **`recipe.directions` keeps the other direction's choices,** so a script channel can edit a
      recording without its recipe being asked again, and back. A recording channel that never had a
      voice says so instead of guessing one. Nothing on the start screen is saved to the recipe.
    - **Notes: nothing added.** The prompt keeps the user's ideas and way of speaking, and has no word
      target, because a target would ask the AI to add what the notes do not say. Words are the AI's to
      judge, but digits can be checked: any number not in the notes or the approved brief goes to the
      repair call.
    - **A finished script with research on is only checked.** Its words never change; the flags are
      for the user to act on.

143. **Research** (`runner/research/index.mjs`, `searchChat` in `providers/llm.mjs`). Gemini searches
    through `google_search` on its own `generateContent` API, with the same retries and model hand-over
    as every other call. Sources are what the search really used, never what the model says it read.
    - **Another AI cannot search here:** its brief says it comes from memory, and a source it names stays
      only if the address answers. Nothing pretends to be researched. Adding a search for the other
      providers is possible later; each has its own price.
    - **Gemini can answer without searching:** then the brief is marked the same way.
    - **The run stops at the brief,** one click goes on, and the script gets an approved brief only.
    - **Sources go in the card as `researchSources`, never in the description** (tested). The card
      schema stays version 1: an optional block.
    - **Open for Zoltan:** Google's grounding terms ask apps to show its Search Suggestions with grounded
      answers. The tab lists the searches as links to Google, not Google's own widget, because the app's
      content rules block outside markup. For one person's own tool this may be fine; it is not checked.
    - **Links:** the opener only opens a fixed list of hosts, so a source could not open. The same held
      for the B-roll "source" link on the Preview tab, which is a bug from phase 1b, fixed here. New Rust
      command `open_source_link`: only an address found in this video's own files.

144. **Week batch in every mode.** Pasted texts split on a `---` line, at most 7, one video each, without
    the ideas call. **With research on, each video stops at its brief (Claude's decision, can be
    overruled):** the plan says the brief comes before the script, so a batch with research gives 7 briefs
    to approve, not 7 scripts. Finished scripts need no key (`week-batch-local`).

145. **The Shot map** (`runner/shots/index.mjs`). A stage after the voice, no AI, no cost. It works on the
    same `scenes.json` through three row fields, so preview, render and stills needed no other change:
    `at` (the exact start of a word), `cut` (a plain cut inside a sentence), `camera: "off"` (too short
    to move). `sceneTimes` honours `at`; it is the one place that says when a scene starts.
    - **A row starts on the word of its main text.** The shot before holds until then; if that would be
      too long, the words before get a shot of their own, filled by rule.
    - **A long template row is cut** at a comma, a pause, a sentence start or a word that opens a clause.
      Kokoro leaves no pauses, so punctuation and those words do most of it.
    - **Overrides:** a row with no `template`, or changed by hand (`override`), stays that block.
    - **Known limit, said on the tab:** "every element on its word" holds for a block's main element and
      for lists that take cues. A second line inside one block keeps that block's own animation, because
      a block's inner timeline is not ours to change generally. The tab counts both.
    - **A result that fails the table's checks is thrown away** and the video goes on with its sentences.
    - **Order, one change from the plan:** the plan puts "B-roll and assets" after the Preview's approval.
      The free search still runs before the Preview, because the price it shows depends on which hero
      moments found nothing free, and because the user must look at old film for faces. Only money waits
      for the yes.

146. **Hero moments and the picture tier** (`generate/kie-image.mjs`, `broll/engine.mjs`). Automatic: with
    no hero marked, the clips that name the most become hero, with a rule's prompt. Cheapest first:
    free sources, then one Kie AI picture moved in 2.5D here, then a Kie AI video.
    - **Z-Image:** 0.8 credits, about 0.004 USD a picture (kie.ai/z-image, read 2026-11-02), takes 16:9,
      PNG. Shown as 0.01 USD: estimates are whole cents, rounded up. Its pixel size is not published, so it
      may look soft at 1080p: to check on the first real picture.
    - **Video only on a new yes:** when a picture fails, its row offers the video and nothing is ordered.
      The row can also be switched to video by hand. Never above the channel's limits.
    - Kie AI's terms question (phase 1b) applies to pictures too.

147. **The Google Flow slot.** Per shot, off by default: a ready prompt checked by the same prompt rule, a
    copy button, the exact length, and the mp4 back by dropping it on the shot or with a button. It goes
    into the footage library and the ledger as "Google Flow (Veo), own generation", with its prompt and
    model, and counts as synthetic media for YouTube's question. It starts and ends on the shot's own
    words (`at`, `until` on the footage row). A new B-roll plan keeps it and goes around it.

    Tests: Node 524 of 527 (the one red is `traffic-card.test.mjs`, red on main before; 2 live tests
    skipped), Rust 50, UI check 0 errors, channel e2e 56/56 with the real voice and render. No real AI
    and no paid call were used while building: the brief and the notes were tested with stand-ins.

## 2026-11-03

148. **The 3D Explainer preset** (Zoltan, 2026-11-02, `docs/BUILD_PLAN.md` phase 4; `runner/presets/explainer-3d/`).
    14 templates, one strange question per video: soft-shaded objects, cutaway views, scale comparisons, bright clean
    materials, one smooth camera move per scene. All drawing is own code in `pack/shared/world3d.js`, from three.js
    primitives: no model files, nothing downloaded at run time, no third-party skill opened. 38 objects, a person is a
    faceless figure.
    - **HyperFrames still makes every frame.** A block registers a paused timeline like any other block, and one tween
      on it gives the frame's time to the code, so any seek gives the same picture. No engine of our own.
    - **One renderer per page, not one per scene.** A page may hold about 16 WebGL contexts and a video has far more
      scenes. Each scene copies the frame to its own canvas, so it always shows its own picture; a scene's objects and
      canvas memory are released when two newer scenes have drawn.
    - **three.js 0.180.0 (MIT) is pinned in `engine/`** with the rest of the render toolchain. Reduced to the one file a
      build reads (`build/three.cjs`, 2 MB of the package's 21 MB), wrapped into a global when it is put on the page.
    - **A preset brings its own pack** (`runner/presets/<id>/pack/`, `builtinPacks`), as phase 1 planned. It is never
      offered to the catalog plan or another channel. `scripts/make-3d-blocks.mjs` writes the thin blocks, the manifest
      and the templates from one list, so they cannot disagree; a test holds that.

149. **The look belongs to the preset here, not to the channel** (`presetLook`). Own colors, and the OFL fonts Outfit
    and DM Sans from the fonts the app already ships. Tokens without `from: "brand"` give the build those. Scenes change
    on plain cuts and no 2D camera wraps them, because the 3D camera is the scene's, so the channel's Motion wizard does
    not touch a video on this preset. **What stays the channel's (Claude's decision, can be overruled):** its captions
    and spoken word setting, which are about the audience and not the look. Motion Frames and the Recorded presets are
    exactly as before. The video's own copy of the recipe says which preset applies, so nothing changes under a video
    already made.

150. **What the AI fills, and what a rule fills.** The AI names an `object` from the preset's list; anything it names
    that the code cannot draw falls back to what the sentence names, else to the neutral one. New: rules that fill a
    template only when the sentence really says that thing (`ownRule`): scale ("bigger than" and two things to compare),
    cutaway ("inside"), versus ("but"), cause ("because"), question. A dead AI gets a varied video, not a rotation of text.
    - **A ratio the voice says is the ratio on screen.** "4 times wider" draws one 4 times the other; with no ratio said
      the difference is only a clear one, and no number shows.
    - **A number under 10 shows exactly that many objects.** Over that, nine: a crowd, with the number on screen.
    - **Object words are kept narrow on purpose.** "you", "think", "key" and Hungarian words that are English words too
      (hold, nap, fog) were taken out after the first test showed them pulling in the wrong object. Other languages get
      fewer matches, so a rule-made video shows the neutral object more often there; the AI's choice has no such limit.
    - **The question mark stays** on a template of this preset (`capFor`). Motion Frames still drops it, as before.
    - **One fix reaches Motion Frames, on purpose:** a rule's line now stays inside one sentence when the Shot map
      hands it the words of two. Only a shot filler can get that text, and "number The Moon is" was a bug there too.
    - `scriptNote` and `ideaNote` in the preset tell the script writer and the week batch the video's shape. With notes
      or research they add no fact: the prompt says so. Not tried against a real AI yet.
    - **B-roll off when this style is chosen in the recipe** (`defaults.broll`): its pictures are its own. The switch
      stays, so a user can turn it back on.

151. **Two bugs only the real render showed.**
    - **The engine moves every scene's timeline on every frame, also a scene's that is over.** The first version drew on
      each of those, so past scenes were rebuilt and evicted again on every frame. Each scene alone rendered at about 10
      frames a second, and 15 s across several took 145 s; a 43 s video had not finished after 12 minutes. A scene now
      draws only inside its own time: the same 15 s takes 40 s, and 43 s takes 86 s, the same pace as Motion Frames.
      At exactly a scene's first frame nothing is drawn, and its objects have not popped up by then, so nothing is lost.
    - **A block's script runs in the runtime's scope** (its own `document` and timeline registry per mount), and is
      injected into the page's body, not inside the block. A shared file sees the plain page, so the second mount of the
      same block could not find its root. The block's own two lines now ask for the root and register the timeline;
      `make-3d-blocks.mjs` says why they must stay there.
    - **`THIRD-PARTY-NOTICES.md` is generated, and a section had been added by hand in phase 2** (the Whisper and MODNet
      models). Regenerating it for three.js would have dropped that section, so it is in `scripts/notices.mjs` now.

    Tests: Node 547 of 550 (the one red is `traffic-card.test.mjs`, red on main before; 2 live tests skipped), UI check 0
    errors. Rust was not touched and its tests were not run again. New `scripts/phase2/explainer3d-e2e.mjs` 42/42 with the
    real free voice and real renders: one video by rule, one with every template once, each looked at frame by frame.
    A real AI was not used: the plan was tested by rule and with stand-in answers. Longest video tried: 43 s.

152. **The Stick World preset** (Zoltan, 2026-11-03, `docs/BUILD_PLAN.md` phase 5; `runner/presets/stick-world/`).
    14 templates, what-if stories told to "you". All drawing is own code in `pack/shared/stick.js`, lines and circles
    on a 2D canvas: no image files, no new library, nothing downloaded, no third-party skill opened. 28 things drawn by
    code; the first, `none`, leaves the figure alone. Colors are its own, the fonts are Rubik and Quicksand (OFL, both
    with latin-ext, from the fonts the app already ships). B-roll off when this style is chosen; the switch stays.
    - **HyperFrames still makes every frame,** the same way as the 3D Explainer: a paused timeline, one tween, any seek
      gives the same picture. Not a frame engine of our own.
    - **The hero:** one accent-colored item of clothing, a scarf (Claude's choice, can be overruled). Nothing else
      drawn uses the accent; on screen only the underline of a marked word does.
    - **A blink every 3.5 to 4 seconds on the video's own clock,** read from the host's `data-start`, and not on the
      shot's. A clock per shot would have blinked more often across cuts. Each figure has its own times. Seen in the
      real render: the eyes shut at the frame the code computes. A shot shorter than the gap can have no blink.
      **Eyes are the whole face,** because a blink needs them. The 100 tiny people have none.
    - **Feet stay planted because they are a function of the distance walked** (`gait`): one foot moves at a time and
      the other stays exactly where it landed. Legs are solved to reach the feet, never the other way round. Tested for
      every quarter pixel of a walk, and seen frame by frame in the render. A walk is a whole number of steps, at most 3
      a second, so a short shot gets a short walk ending beside the thing.
    - **Nearly still:** a push in of 1.6% over the shot, nothing else, plain cuts.
    - **A number:** 1 to 9 shows exactly that many people, more is a row of 13 with the number on screen. **A percent:**
      100 people, as many in ink as the voice says. Same honesty as DECISIONS 150.
    - `scripts/preset-blocks.mjs` is what make-3d-blocks had, shared. The 3D pack's files came out the same, plus its
      `camera` line, which the Shot map tab read from a fixed text before.

153. **One short sentence per shot, and where the app's floor limits it.** Pace "fast", and the script writer is told
    to write sentences of 6 to 12 words. **A shot still lasts at least 2 seconds** (`MIN_SECONDS`, for every preset, not
    changed), so a sentence shorter than that shares a shot with its neighbour. The first test script, with sentences
    like "Go home.", gave 11 shots for 21 sentences; sentences of the told length gave 21 for 21. Open for Zoltan if he
    wants real one-second shots: that means lowering the floor for this preset.

154. **What a rule fills on this preset, and three small changes to shared code.** New rules: thought (imagine, wish,
    wonder), talk (says, asks, tells; a quoted line wins), walk (walk, run, go, leave). They come after versus and cause,
    because in the first test "You run, but..." and a following "because" became one more walk.
    - **`capFor`:** on a preset with objects, a line it must cut no longer stops on a word that needs the next one.
    - **`toScene` and `checkScenes`:** a preset's own block may state a limit over the general 6 words. A what-if
      question needs it: the title may have 8. The general limit is unchanged for every other component.
    - **The Shot map's camera text** comes from the pack's manifest (`camera`).

    Tests: Node 567 of 570 (the one red is `traffic-card.test.mjs`, red on main before; 2 live tests skipped), UI check 0
    errors. Rust was not touched and its tests were not run again. New `scripts/phase2/stickworld-e2e.mjs` 45/45 with the
    real free voice and real renders, one video by rule and one with every template once, each looked at frame by frame;
    Motion Frames' channel e2e 56/56. A real AI was not used. Longest video tried: 61 s.

155. **The Archive Collage preset** (Zoltan, 2026-11-03, `docs/BUILD_PLAN.md` phase 6; `runner/presets/archive-collage/`).
    15 templates, documentary collage explainers. All drawing is own code in `pack/shared/collage.js`, on a 2D canvas: no
    image files, no new library, no third-party skill opened. Its own colors, one hot accent for strokes, underlines and
    arrows, one teal used only on the date stamp, and the fonts Archivo Black and Newsreader (OFL, both with latin-ext, from
    the fonts the app already ships). B-roll off when this style is chosen; the switch stays.
    - **HyperFrames still makes every frame,** the same way as Stick World: a paused timeline, one tween, any seek gives
      the same picture. What is costly (the paper, a cutout's dots, a map) is made once from a seed and kept.
    - **The cutouts are drawn by code, 32 things and generic faceless figures, not photos** (Claude's choice, can be
      overruled). The plan says "halftone black-and-white cutouts", and a code-drawn gray shape turned into print dots is
      that with no license question and no real person. Real Public Domain photos through the same dots would be a later
      addition: `sticker` takes any gray picture.
    - **Parallax is real:** six depths (paper, back sheet, map, cutout, words, front scraps) under one camera, and the
      DOM layers move with the same numbers as the canvas. One slow drift per scene, seeded, so it differs from scene to scene.
    - **The paper is a picture behind the canvas** and not drawn on it, because a scene draws nothing at exactly its first
      frame (DECISIONS 151). So a cut shows paper, never an empty frame. Seen in the real video, frame by frame around cuts.
    - **Print grain is one still layer,** on top of everything, the same on every frame. It costs file size: the draft of 69 s is
      about 85 MB. Open for Zoltan if that is too much.

156. **Maps from Natural Earth, bundled** (public domain, release 5.1.2, `scripts/make-map.mjs`). 242 countries at 1:50m,
    simplified, and 236 cities: 262 KB on the page, nothing downloaded when a video is made. In `THIRD-PARTY-NOTICES.md`, and in
    every video's `assets_license.json` through the new `assets` list of `preset.json`, never in a YouTube description.
    - **A new parameter type, `place`.** The list of 444 names is never in the prompt, so the prompt stays small: the AI
      names a place, and a name the maps do not have becomes the one the sentence says, else another template.
    - **`placesIn` needs the capital letter,** so "turkey" and "reading" are not places, and takes Hungarian endings
      (Párizsban, Angliából). Words that are mostly not a place (Man, Chad, Jordan, Georgia, Guinea) are left out of the
      rule; the AI can still name them.
    - **The marked country is ink dots and never the accent,** which the plan keeps for strokes: the pin and the route line.
    - **The view fits a country's biggest piece,** so France is France, not its overseas parts.

157. **The rare alert, and small changes to shared code.** `rare: { every: 16 }` on a template, and `spaceRare` over the whole
    plan: at most one flood per 16 scenes. A rule never picks it for one sentence. After the parts are planned it gives one to a
    scene whose words say crisis, collapse, crash or the like, over any picture but the title. An AI's extra ones become
    the rule's choice.
    - **New rules:** year (in, since, by... plus a year; a bare 1859 ships is a number), route (two places), map (one place), alert.
    - **`headlineOf` and rule-cut lines** no longer stop on when, if, through and the like, on presets with objects. Motion
      Frames has no objects and is unchanged. Stick World and 3D Explainer get the better cut.
    - **A pack's `script` can be a list,** and `explainer3d.test.mjs` no longer assumes its pack is the first built-in.

    Tests: Node 590 of 593 (the one red is `traffic-card.test.mjs`, red on main before; 2 live tests skipped), UI check 0 errors.
    Rust was not touched and its tests were not run again. New `scripts/phase2/collage-e2e.mjs` 51/51 with the real free voice
    and real renders, one video by rule and one with every template once, each looked at frame by frame. A real AI was
    not used. Longest video tried: 69 s.
