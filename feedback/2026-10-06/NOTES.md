# Feedback 2026-10-06: a c105d15 telepítő próbája

Zoltan a c105d15 telepítővel (a checkinnel) 08:07 és 09:04 (UTC) között
végigment a Settings minden oldalán (Identity törlés, új Identity, AI, Backup,
Export diagnostics, Brand, Motion, CTA szegmensek, Footage, Dictionary, Voice),
majd az "Updated UI" Identityben egy magyar ONE Videót vitt a Preview-ig
("Hogyan növeld a konverziód..."). A napló: 966 esemény, 25 hiba. Forrás:
`node scripts/log-summary.mjs --since 2026-10-06` és a videó `log.txt`-je.

| # | Mit láttunk (napló) | Ok | Állapot |
|---|---|---|---|
| 1 | A Preview build hatszor egymás után elbukott: "hyperframes check found problems: layout content_overlap div.ch-node at 75.89 s"; az Autopilot is megállt rajta | A Mozgás profil kamerája ("Subtle jitter") minden jelenetet egy burkolóba tesz. A `hyperframes check` a burkolón belül minden jelenetet 0 px magasnak mér, így a 9. jelenet (constellation-hub) négy címkéje egy sorba került, és "átfedett". A valódi render jó volt: kivágott 12 mp-es renderrel ellenőrizve, a kocka hibátlan. Ugyanez volt a kontakt lap üres képeinek oka (DECISIONS 80) | kész: a check is a kamera-burkoló nélküli lapon fut (`withoutCameraPage`), a build utána visszakapja a kamerát. A te projekted buildjének másolatán: 0 hiba. A hibaüzenet mostantól a jelenet számát mondja ("Scene 9: ...") |
| 2 | ElevenLabs HTTP 400: "Model 'eleven_multilingual_v2' does not support language_code 'hu'", "Try again later" | Az alap modell a v2 volt, és a runner magyar nyelvkódot küldött neki. A v4 a magyart elfogadta (a második futás, 286 mp) | kész: **Eleven v4 az alap** (Zoltan kérése); a v2 nem kap nyelvkódot; ha egy modell a nyelvkódot visszadobja, a runner egyszer nélküle újrapróbál; egy 400-as hibánál nem írja, hogy "próbáld később" |
| 3 | Jóváhagyott, kifizetett avatar (463 mp HeyGen) után a következő Preview build a 4. Avatar fület "Now"-ra állította, és ott a "Continue without an avatar" eldobta | A runner kapu-sorrendje még a régi volt (avatar a Preview után), ezért a Preview build indítása minden későbbi kaput, így az avatart is "todo"-ra állította | kész: a sorrend script, voice, scenes, avatar, review, mint a tabokon; a Preview build az avatart nem bántja; egy új avatar, layout vagy kihagyás a Preview-t érvényteleníti |
| 4 | "Get a key" (Claude): "Not allowed to open url https://console.anthropic.com/settings/keys" | Az app jogosultság-listája egyetlen külső címet sem engedett megnyitni | kész: a kulcs-oldalak és a YouTube Studio címei engedélyezve (csak ezek a hostok); teszt: minden link, amit a UI megnyit, benne van a listában |
| 5 | Claude: nyers JSON hiba "Your credit balance is too low..." | Az Anthropic fiókon nincs kredit; az app a választ nyersen mutatta | kész: "Claude says the account has no credit left. Add credit on the Claude website, or choose another AI in Settings." Más szolgáltatónál is a szolgáltató saját mondata látszik, nem a JSON |
| 6 | A videó `log.txt`-je Stop után: "a step was interrupted (the app was closed)" | rossz szöveg | kész: "a step stopped before it finished (Stop, no answer, or the app was closed)" |
| 7 | A naplóban az "Export diagnostics" fájlneve "[key].zip" | A kulcs-szűrő a hosszú, kötőjeles fájlnevet kulcsnak nézte | kész: a fájlnév olvasható marad (Rust teszttel) |
| 8 | A scriptnél a Stop után a futás befejeződött | Nem hiba: egy fizetős lépés Stopja egyszer megkérdez, és a futás közben 1 mp alatt magától véget ért | marad |
