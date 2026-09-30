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
