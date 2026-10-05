# Feedback 2026-10-05: CTA, szegmensek, végképernyő

Zoltan a 14:44-es telepítővel (commit b1c0dca) a "Branding v2 copy" Identityben
végigvitt egy 3 perces ONE Videót renderig. A napló: 625 esemény, 0 hiba. A
képek: `C:/Users/gdp/Downloads/IdeaToVideo feedback/ujrahasznosithato/` (10 db).

| # | Mit láttunk | Ok | Állapot |
|---|---|---|---|
| 1 | A YouTube végképernyő farka | | jó, marad |
| 2 | A színes "Comment call" címke a jelenet-táblában | | jó, marad |
| 3 | A whiteboard rajz és az animációja | | jó: a jelenet-tervező mostantól szakaszonként keres helyet egy rajznak |
| 4 | A kontakt lapon a jelenetek üresek, csak a háttér (build-01) | a Mozgás profil kamerája ("Subtle jitter") keretbe csomagolja a jeleneteket, és a `hyperframes snapshot` a keretben lévő jelenetet nem tekeri a pillanatra; a renderre nincs hatás. Kísérlettel igazolva: shader nélkül is üres, kamera nélkül látszik | kész: a pillanatképek a kamera-keret nélküli lapról készülnek (`review/index.mjs` `withoutCamera`); a valódi projekt másolatán mind a 15 kép látszik |
| 5 | "Comment CHECKLIST below" kilóg a képből (kilog-01..03) | a `cta-close` a betűméretet 0,47 em átlagos betűszélességgel becsli; a vastag, nagybetűs brandbetű kb. 0,68 em | kész: a buildben a komponens másolata 0,68-cal számol (`widerFit`), a registry fájl változatlan; a valódi projekten mindhárom CTA belefér |
| 6 | 3 percet kért, a hang 2:08 (voiceover-hossza) | a script 318 szó lett a kb. 450 helyett, és a 2:08-ban a 10 mp-es farok is benne van; a script-kapu a hosszt nem ellenőrizte | kész: hossz-ellenőrzés (85-120%), egy javító hívás; a hang-kapu a hosszt részenként írja ki (narráció, szegmensek, végképernyő) |
| 7 | A 3 feltöltött szegmens nem szólt (cta-segments-01) | a szegmensek a GUIDE, COURSE, TRIGGER kulcsszóé, a CTA-beállítás CHECKLIST, WEBINAR, BUY; a szegmens kulcsszóhoz kötött, és a felület ezt nem mutatta | kész: alapból "auto" (ha a hely kulcsszavához van szegmens, az szól); a kulcsszó-kártyán "1 clip" jelölés; ha egy helyen nincs, a felület megmondja, melyik kulcsszavakhoz van; az 5. kapu megmondja, hogy a szegmens az 1. kapuban választható |
| 8 | A fejezetek és a kulcsszavak a 4. kapuban zavaróak, a PDT és a vidrev dolga (YT-chapters-comments) | | kész: összecsukva "What is in the publishing data" alatt; elöl az "Export publishing data"; minden a `publish.json`-ban marad |
| 9 | Minden jelenet diavetítésszerű, statikus, nincs B-roll, nincs kiemelés (very-static) | a lista-komponensek minden eleme egyszerre jelent meg (a `cues` változót nem használtuk); a tervező sok sima kulcsmondatot választott | részben kész: a lista elemei, a csillag pontjai és a szócsere akkor jelennek meg, amikor a narrátor kimondja őket (`speechCues`, a `words.json`-ból); a tervező listát, rajzot, kiemelést kér a sima kulcsmondat helyett, egymás után legfeljebb kettőt. B-roll (valódi felvétel, kép): új funkció, Zoltan döntésére vár |

## Második kör (a 16:22-es telepítővel)

Képek: `C:/Users/gdp/Downloads/IdeaToVideo feedback/cta-wizard/` (10 db). Napló:
538 esemény, 5 hiba (Gemini 503, egy jelenet-ellenőrzés).

| # | Mit láttunk | Ok | Állapot |
|---|---|---|---|
| 1 | A 0-3 számláló, a színes szegmens-lista, a kiválasztás az 1. kapuban, a szabad "mit kap" szöveg | | jó, marad |
| 2 | A sorrend Cold, Hot, Warm (sorrend-01, -02, cta-szovege-01) | a Rust mag a hőmérséklet-térképet betűrendbe rendezi | kész: a választó mindig Cold, Warm, Hot |
| 3 | Csak az utolsó kiválasztott kulcsszó látszik a választóban (sorrend-01) | a választó csak az épp nyitott helyét mutatta | kész: a többi hely kulcsszava is jelölve, a hely nevével (Start, Middle, End) |
| 4 | A szegmens-választóban nem látszik, melyik kulcsszót használja a CTA (sorrend-02) | | kész: jelölve a hely nevével, és a "N clip" jelölés |
| 5 | Feltöltés után nem volt egyértelmű, hogy mentette (cta-szovege-01) | a visszajelzés a lap alján, kicsiben jelent meg | kész: zöld "Saved" sáv a gombok alatt, az új sor kiemelve és odagörgetve |
| 6 | "The sentence it says" zavaró feltöltésnél, más a szöveg, mint a klip hangja (cta-szovege-02) | a mező csak a HeyGen útra tartozott, de közösnek látszott | kész: két külön út (A: feltöltés, B: HeyGen); feltöltésnél opcionális "What does it say?", ez bekerül a feliratba (.srt) és a publish.json-ba |
| 7 | "What they get" szegmensnél felesleges (what-they-get) | | kész: ahol a szegmens szól, "Your segment says it" |
| 8 | 3 perc, 5-10 mp farok, mégis 1:35, és a 3 szegmens nem került be (audio-length-01) | a CTA-beállítást a régi telepítő mentette, mindhárom helyre "Narrator"-t írt; a script 265 szó lett | kész: a régi mentés "Narrator"-ja "auto"-nak számít; a script-prompt minimum szószámot kap, és a hosszra két külön javító kör jut |
| 9 | Gemini 503, mit tegyen a user (gemini-overloaded-01, -02) | mindkét Flash modell túlterhelt volt | kész: harmadik tartalék modell (Flash Lite), a hibaüzenet megmondja, hogy várjon és nyomja meg újra |
| 10 | "scene 15 lasts 1.854 s, under 2 s" a javítás után is (gemini-overloaded-03) | egy rövid utolsó mondat; a javító hívás nem vonta össze | kész: a gép magától összevonja a szomszédjával (CTA-jelenetbe soha) |

## Harmadik kör (8 perces teszt, a 17:00-s telepítővel)

Képek: `C:/Users/gdp/Downloads/IdeaToVideo feedback/teszt-8min/` (5 db). Napló:
497 esemény, 3 hiba (egy sikertelen jelenet-csere).

| # | Mit láttunk | Ok | Állapot |
|---|---|---|---|
| 1 | Nincsenek színes CTA-címkék (nem-volt-cta-badge) | mindhárom helyen a feltöltött szegmens szólt (GUIDE, COURSE, TRIGGER, a hangban benne vannak), a tábla ezt nem mutatta; az utolsó sor ezért 54 mp-esnek látszott | kész: a szegmensek és a YouTube végképernyő saját színes sort kapnak a helyükön (melyik klip, hány mp); a sorok hossza a jelenet saját ideje |
| 2 | Nem kattintható, nem gördül le (nem kattintható 01-02) | az Emphasis, a Sketch és a Closing fajtából csak egy jelenet van, nincs mire cserélni | kész: "(the only one of its kind)" felirat, és a táblázat fölött magyarázat az oszlopokról |
| 3 | "Scene 44" nem található, kellene link (odagorgeto-linkek) | a táblában nem volt sorszám | kész: sorszám-oszlop, és minden ilyen jegyzet mellett "Go to scene N" link, ami odaugrik és kiemeli a sort |
| 4 | "Approve nem sikerült" (odagorgeto-linkek) | a jóváhagyás sikerült (10:47:13), de a halvány "Approved" gomb letiltottnak látszott, és nem volt jelezve a következő lépés | kész: "Approved. Next: 4. Review and render, below." és a lap odagördül a 4. kapuhoz |
| 5 | A jelenet-csere hibája "scene 2: same component" | az AI egy helyett két jelenetet adott vissza | kész: csak az első jelenet számít |
