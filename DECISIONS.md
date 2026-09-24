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
