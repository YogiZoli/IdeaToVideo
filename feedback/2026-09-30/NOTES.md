# Feedback 2026-09-30: az első teljes videó az appból

Projekt: `2026-09-30_from-idea-to-video`, telepítő 20:17. Képek: 1-10.png.

| # | Mit láttunk | Ok | Állapot |
|---|---|---|---|
| 1 | 0:03-0:07 és 0:11-0:15 üres kép | a runtime leveszi a gyökérről a `data-duration`-t, a komponens az alapértékével kilép | kész, `6118e67` (DECISIONS 58) |
| 2 | Keskeny, összepréselt betűk (headline-slam, kinetic-type-swap) | a komponens 2-3 szóra készült, hosszabb sornál a fix betűköz összenyom | kész, szókorlát, `6118e67` |
| 3 | vox-annotate: a vonal nem a szóra mutat, a kiemelés elcsúszik, a jegyzet kilóg | a komponens egy szavas, középen álló kulcsszóra készült | kész, kivéve a könyvtárból, `6118e67` |
| 4 | Hosszú csend a hang után (0:39-0:40) | 1,2 mp szünet szakaszok előtt | kész, 0,6 mp, `6118e67` |
| 5 | Nincs háttérzene | a telepítőben csak saját fájl volt | kész: ElevenLabs Music a hang kapuban, saját fájl, zene csere újrafelolvasás nélkül; ElevenLabs kulcs nélkül nincs zene (DECISIONS 60, 62) |
| 6 | Miért fekete minden háttér | nincs még téma-választás, az alap sötét | kész: a videó a brand presetet kapja, alap a Blue Professional, választható a Warm paper (DECISIONS 59) |
| 7 | A 4. kapu érthetetlen: mit látok, kell-e, mi a következő, kattintásra semmi | a felület nem magyarázza el | kész: magyarázat, jelenetenkénti állóképek nagyítással és lapozással |
| 8 | Haladásjelző minden lépésnél, %-kal és hátralévő idővel, "ne altasd el a gépet" | ma csak a rendernél van | kész: haladásjelző minden hosszú lépésnél (valódi %, ahol mérhető, tanult becslés), az app ébren tartja a gépet |
| 9 | Tetszett: rajzoló effekt (whiteboard-ink), aláhúzás (marker-highlight), minőség-választó, haladásjelző a rendernél | | megtartva |
| + | A hang -15,8 LUFS lett a -14 helyett | az egylépéses loudnorm alul lő beszédnél | kész, `7fefbed` (-14,7) |
| + | ElevenLabs listában csak a premade hangok, a saját klón nem | a régi /v1/voices végpont | kész: /v2/voices, a saját hangok elöl, mintahallgatással |
| + | A saját HeyGen avatar és lookjai listából | | kész: saját karakterek a lookjaikkal, "Open HeyGen"; élesben ellenőrizendő (DECISIONS 63) |

## Második kör, telepítő 22:05 (képek: 11-13.png)

| # | Mit láttunk | Ok | Állapot |
|---|---|---|---|
| 10 | A Settingsben elmentett ElevenLabs kulcsot a projekt "nem látja", a 2. kapu nem enged tovább | a projekt nézet az induláskori kulcsállapotot használta | kész: a kulcsállapot frissül a Projects oldalra lépéskor és projekt megnyitásakor. Addig: az app újraindítása segít |
| 11 | A Test gomb csak mentés után működik, akkor meg minek | a Save már magától tesztelt, ez nem látszott | kész: "Save and test", a mentett kulcsnál "Test again" (ingyenes, megnézi, él-e még a kulcs és megvannak-e a jogai) |
| 12 | A vidIQ csinál-e valamit a script írásakor | a kulcsszó bekerült a script adataiba, de a prompt nem mondta meg, mit kezdjen vele | kész: a kulcsszó a címbe kerül, és természetesen elhangzik a nyitásban, legfeljebb még 1-2-szer |
| 13 | Az ElevenLabs és a HeyGen lista sosem jelent meg, a kézzel beírt "Zoltan BD" maradt | a lista csak a 2. és az 5. kapuban volt, a régi kulcsállapot miatt ott sem látszott; a Settingsben szabad szöveg volt | kész: a Settingsben ElevenLabs hanglista (saját hangok elöl, Play sample, a régi név alapján megtalálja) és HeyGen "Default avatar" lista (saját karakterek lookjai) |

## Harmadik kör, telepítő 23:15 (képek: 14-19.png)

| # | Mit láttunk | Ok | Állapot |
|---|---|---|---|
| 14 | "projectDir must be a string" az 5. és a 4. kapuban | a hosszú avatar-készítés alatt a Settingsre kattintva a projekt nézet bezárult, a még futó munka utána üres projektútvonallal hívott tovább | kész: a projekt nézet megjegyzi a saját útvonalát. Az avatar-klipek ettől függetlenül elkészültek (nyitó 7,3 mp, záró 5,7 mp, a projekt `avatar` mappájában), újra fizetni nem kell |
| 15 | A Settings nem kattintható (a kurzor változik, de semmi nem történik) | a Settings oldal indulás közben összeomlott: az új avatar-lista egy még nem létező beállítást kötött magához (Svelte props_invalid_value) | kész, böngészős másolaton ellenőrizve: a Settings megnyílik, a "Zoltan BD" név alapján megvan a hang |
| 16 | Az avatarlista "örökké tölt", 0% | az összes előnézeti képet egyenként töltötte le, jelzés nélkül, és a haladásjelző rossz parancsot figyelt | kész: 8 kép egyszerre, valódi százalék, a képek gyorsítótárban maradnak |
| 17 | A hibadoboz ideje 7 órával eltér | UTC-ben írta | kész: helyi idő, mellette az UTC-eltérés |
| + | Az avatar háttere a look saját felvett háttere, nem a téma színe | a HeyGen a háttérszínt csak háttér-eltávolítással tanított avatarnál cseréli | tudnivaló, nem hiba |
