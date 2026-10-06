# Feedback 2026-10-01: hibátlanítás

Zoltan a telepített appal (commit 862344b) végigvitt egy meglévő projektet
avatarral, builddel és renderrel: a végső videó rendben.

| # | Mit láttunk | Ok | Állapot |
|---|---|---|---|
| 1 | A Settings nagyon hosszú, sokat kell görgetni | minden beállítás egy oldalon volt | kész: hat aloldal bal oldali menüvel (AI and keys, Channel, Look, Voice and avatar, Research, General), aloldalanként "Run setup for this part again", ami a beállító varázslót csak azon a részen nyitja meg. Teszt: `scripts/app/pages.test.mjs` |
| 2 | A haladásjelző 95%-on megáll, nem látszik, dolgozik-e még, mit fogyaszt, mit szabad közben | a becsült idő után a sáv 95%-nál megállt, a szöveg csak "Still working" volt | kész: a sáv a becslés után is lassan mozog 99 felé, "Running for 1:23" óra, a mostani részlépés szavakban ("Now: Mixing voice and music"), mit használ és mit nem ("Runs on this computer only. No AI tokens and no credits..."), és hogy ne altasd el a gépet. Teszt: `scripts/app/progress.test.mjs` |
| 3 | (átnézésből) Ha az app egy hosszú lépés közben bezárul, a lépés örökre "Running" marad | a "running" állapotot csak a futó lépés írta át | kész: a lépés a futó folyamat azonosítóját kapja; ha az már nincs, betöltéskor "failed" lesz "Interrupted..." üzenettel, és újra futtatható. Teszt: `runner/runner.test.mjs` |
| 4 | (próbakörnyezet) mentés után "Starting..." a böngészős másolatban | a `mock.js` nem ismerte a `save_config` parancsot, és a böngésző a régi `mock.js`-t tartotta meg | kész: `save_config` a mockban, a `mock.js` verziózott címen töltődik |
