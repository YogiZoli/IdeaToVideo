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
