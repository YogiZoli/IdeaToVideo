# Feedback 2026-09-30: az első teljes videó az appból

Projekt: `2026-09-30_from-idea-to-video`, telepítő 20:17. Képek: 1-10.png.

| # | Mit láttunk | Ok | Állapot |
|---|---|---|---|
| 1 | 0:03-0:07 és 0:11-0:15 üres kép | a runtime leveszi a gyökérről a `data-duration`-t, a komponens az alapértékével kilép | kész, `6118e67` (DECISIONS 58) |
| 2 | Keskeny, összepréselt betűk (headline-slam, kinetic-type-swap) | a komponens 2-3 szóra készült, hosszabb sornál a fix betűköz összenyom | kész, szókorlát, `6118e67` |
| 3 | vox-annotate: a vonal nem a szóra mutat, a kiemelés elcsúszik, a jegyzet kilóg | a komponens egy szavas, középen álló kulcsszóra készült | kész, kivéve a könyvtárból, `6118e67` |
| 4 | Hosszú csend a hang után (0:39-0:40) | 1,2 mp szünet szakaszok előtt | kész, 0,6 mp, `6118e67` |
| 5 | Nincs háttérzene | a telepítőben csak saját fájl volt | nyitott, a következő telepítőben |
| 6 | Miért fekete minden háttér | nincs még téma-választás, az alap sötét | Zoltan döntésére vár (világos vagy választó) |
| 7 | A 4. kapu érthetetlen: mit látok, kell-e, mi a következő, kattintásra semmi | a felület nem magyarázza el | nyitott |
| 8 | Haladásjelző minden lépésnél, %-kal és hátralévő idővel, "ne altasd el a gépet" | ma csak a rendernél van | nyitott |
| 9 | Tetszett: rajzoló effekt (whiteboard-ink), aláhúzás (marker-highlight), minőség-választó, haladásjelző a rendernél | | megtartva |
| + | A hang -15,8 LUFS lett a -14 helyett | az egylépéses loudnorm alul lő beszédnél | kész, `7fefbed` (-14,7) |
