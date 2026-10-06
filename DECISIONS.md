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
56. **NYITOTT, Zoltan később átnézi: a teljes registry, 234 komponens.** Ennyi van
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
86. **YouTube szövegek a kész videó mellett is** (Zoltan, 2026-10-05, K8): a
    DECISIONS 77 eddig a címet, a leírást és a tageket csak a PDT-nek hagyta.
    Mostantól a 6. tabon is: runner `youtube-texts`, az AI három cím-ötletet,
    egy rövid összefoglalót és tageket ír; a leírásba a landing link, a
    komment-kulcsszavak és a fejezetlista kód írja be, nem az AI;
    `out/video-<stamp>.youtube.json`. Nem duplikáció: a PDT a sajátját
    csinálja. A lokalizáció és a fordítás (YouTube API, napi 10000 egység
    kvóta, egy teljes fordítás kb. 400) később, Zoltan most nem kéri.
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

