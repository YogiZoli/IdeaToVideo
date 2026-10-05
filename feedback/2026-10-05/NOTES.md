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
