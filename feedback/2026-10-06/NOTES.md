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

## Este: "What is a motion graphics video?" (3:50, Updated UI Identity)

Zoltan képei: `feedback/2026-10-06/motion-graphics-video/`. A projekt:
`Documents/IdeaToVideo Projects/Updated UI/2026-10-06_what-is-a-motion-graphics-video`.
21 jelenet 201 mp narrációra (átlag kb. 9,5 mp jelenetenként), Brand: Archivo
Black és Geist, Motion: dramatic, high, zoom-through, kamera Push in.

| # | Mit látott Zoltan | Ok (adatból) | Állapot |
|---|---|---|---|
| 1 | Üres kép 0:44-0:47 | A 4. jelenet (grid-card-assemble) kártyái akkor jönnek, amikor a hang kimondja őket; az első elem 3,4 mp-cel a jelenet kezdete után hangzott el, addig a kép üres volt | kész: az első kártya a jelenet elején ott van, a többi a kimondáskor (teszt) |
| 2 | Túl szoros betűk ("Understand motion graphics") | A headline-slam -0.5cqw betűközt ír elő (a registry Inter-szerű betűre tervezte), az Archivo Black ezzel összeér | kész: a build-másolat soha nem szorosabb -0.01em-nél, minden komponensben; a registry fájl érintetlen (teszt) |
| 3 | Ugyanaz a rajz minden videóban, egy videón belül is kétszer | A whiteboard-ink komponensnek csak 3 beépített rajza van (bulb, flow, rocket), a tervező ebből választ. A 21 jelenetből 4 rajz: bulb kétszer, flow kétszer | nyitott: javaslat lent (ikonkönyvtár a rajzhoz) |
| 4 | Rázkódás helyett a kimondott szó legyen kiemelve | A headline-slam "becsapódás" része egy háromkockás rázás (a komponens saját mozgása, nem a Motion beállításod) | nyitott: javaslat lent (kimondott szó kiemelése, Motion varázsló) |
| 5 | "Élettelen, mint egy unalmas slide" | A jelenetek egy belépő animáció után állnak: 4-11 mp ugyanaz a kép. A könyvtár 13 tervezhető komponense szöveg-alapú; fotó, videó, ikon csak a saját felvétellel vagy az AI B-rollal jön (a stock felfüggesztve). A beállításaid jók voltak (high energy, Push in) | nyitott: javaslat lent |
| 6 | "Azt hittem, a 39 archetípust varázslóként építettük" | A 39 archetípus Zoltan saját kánonja, a DECISIONS 48 szerint nem kerül az appba (D út). A három varázsló a kinézetet (Brand), a mozgást (Motion) és a CTA-t állítja; a jelenettípusok a HyperFrames registry 13 komponenséből jönnek | magyarázat; a bővítés iránya: DECISIONS 56 (a teljes registry) |
