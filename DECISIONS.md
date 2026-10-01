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
66. **Mentés (Backup) aloldal a Settingsben: javaslat, a varázslók után**
    (Zoltan ötlete, 2026-10-01; még nem döntés, nincs kód). Kiderült: a
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
67. **Csatornák: egy meta szint a videók fölött** (Zoltan ötlete, 2026-10-01;
    javaslat, a név és a sorrend Zoltan jóváhagyására vár, kód még nincs).
    Cél: egy ember több csatornát, brandet vagy írói álnevet futtathasson
    párhuzamosan, mindegyik a saját hangjával, kinézetével és CTA-jával.
    - **Egy szint, nem kettő.** Szerző > projekt > videó kavarodás lenne. Egy
      egység van: a csatorna (egy brand, egy álnév, egy YouTube csatorna). Ha
      egy szerzőnek két csatornája van, az két csatorna. A mai "project"
      neve a felületen **Video** lesz, mert az egy videó.
    - **Csatornánként:** Channel Profile, Audience, Brand Voice, YouTube cím,
      landing és CTA, tartalom nyelve, brand preset és logó, Narrator Voice,
      alap avatar és elhelyezése, vidIQ be/ki, és a három varázsló (Brand,
      Mozgás, CTA) minden eredménye. A videók a csatorna alá tartoznak.
    - **Az appban egyszer, közösen:** API kulcsok (a fiókok a user sajátjai),
      AI szolgáltató és modell, a projektek gyökérmappája, a mentési mappa.
    - **Felület:** csatornaválasztó a felső sávban; a Settings két részre
      oszlik (App és az aktuális csatorna); "New channel" a beállító
      varázsló csatorna-részét futtatja (a részenkénti újrafuttatás már
      megvan), "Duplicate channel" egy meglévőből indul.
    - **Mappák:** `<projektek>/<Csatorna>/<videó>`; mentés:
      `IdeaToVideo_Backup/<Csatorna>/<Cím_dátum>/` (a 66. pont kiegészül).
    - **Átállás:** a mai beállításokból lesz az első csatorna, a meglévő
      videók hozzá kerülnek, semmi nem vész el.
    - **Sorrend (javaslat): a varázslók előtt**, külön chatben. A varázslók
      eredményének legyen már helye a csatornán belül; utólag mindhárom
      varázsló adatát át kellene költöztetni.
