# Mozgás varázsló: specifikáció (2. változat)

Állapot: javaslat, Zoltan jóváhagyására vár. 2026-09-30.
Helye: a 2. fázisban, a Brand varázsló mellett (Zoltan, 2026-09-30).

## Mit csinál

A user egyszer végigmegy rajta, a kimenet egy **Mozgás profil**, amit minden
videója örököl. Így a playlist egy kaptafára megy, de a videók tartalma
(melyik archetípus melyik mondatra) videónként más.

A profil a kánon `motion.js` gombjait állítja (easingek, időtartam és
távolság szorzó, túllövés, stagger, lüktetés, kamera), és egy válogatott
HyperFrames komponens-készletből választ (jelenetváltás, háttér, kiemelés,
számok, zárás). Profil nélkül a kimenet bájtra azonos a mai kánonnal.

## Korlát: csak a MOTION szabályokon belül

A varázsló a "mennyit, milyen gyorsan, milyen stílusban" kérdéseket nyitja
meg. Ami nem választható, mert a kánon tiltja:

- teljes mozdulatlanság (5. szabály: semmi nem áll meg teljesen): a lüktetés
  legkisebb értéke 1%, a kamera mindig mozog, legalább 4%
- blur (kétszeres renderidő)
- túllövő számok (csak a formák lőhetnek túl)
- dísz-mozgás (1. törvény: minden mozgásnak oka van)
- két elem ugyanazzal a kezdő- vagy végidővel

## Menet

1. **Kiinduló stílus** (egy választás, kártyákkal): Nyugodt oktató (ajánlott,
   a mai kánon), Magabiztos üzleti, Energikus közösségi, Podcast klip. Ez
   kitölti az összes választ.
2. **Kilenc képernyő, csoportonként egy.** Minden válasz előre ki van töltve a
   kiinduló stílusból, és mindegyik mellett ott: "Later you can change this in
   Settings." A user végigkattint, így látja, mit fogad el. Minden képernyőn
   "Accept this section" és "Skip".
3. **Előnézet és mentés**: kb. 20 mp-es mintavideó 6-8 archetípussal, a user
   színeivel és mozgásával, helyben renderelve (kb. 1 perc).

Kérdéstípus-sorrend: igen/nem, egy választás, ritkán több választás. A
finomhangoló csúszka közvetlenül a hozzá tartozó kérdés után jön, "haladó"
jelöléssel, és átugorható. Minden kérdés egyszer szerepel.

## A kérdések

**A. Tempó**
1. Milyen tempójú legyen a mozgás? Nyugodt, Kiegyensúlyozott, Pörgős (háromfokú
   skála). Az animációk idejét állítja, a jelenetek hosszát nem: az a hangból jön.
2. Mekkora utat tegyenek meg az elemek? Kicsit, közepeset, nagyot (háromfokú
   skála). A távolságokat skálázza, a sebesség-plafonon belül.

**B. Érkezés**
3. Hogyan érkezzenek az elemek? Becsúszva, előtűnve, felnagyítva (egy választás).
4. Honnan ússzanak be? Az új dolog alulról, a folytatás balról (ajánlott, a
   kánon szabálya), vagy mindig alulról (egy választás).
5. A felsorolás elemei egyenként jelenjenek meg? (igen/nem)
6. Érkezzenek egy apró rugózással? (igen/nem). Ha igen, haladó: milyen erős
   legyen (csúszka).

**C. Szöveg**
7. A címek szavanként jelenjenek meg? (igen/nem). Ha nem: betűnként vagy
   egész sorban (egy választás).
8. A narráció kulcsszava kapjon kiemelést? (igen/nem)
9. Milyen legyen a kiemelés: szövegkiemelő filc, aláhúzás, bekarikázás vagy
   csak szín? (egy választás, előnézettel)

**D. Számok és adatok**
10. A számok pörögjenek fel a végértékig, vagy egyszerűen jelenjenek meg? (egy
    választás)
11. A diagramok rajzolódjanak ki? (igen/nem)
12. Mi történjen, amikor egy szám vagy diagram megérkezett: finoman lüktessen,
    vagy kapjon egy jelvényt (badge) fölé? (egy választás)

**E. Élet a képen**
13. A megérkezett elemek finoman lüktessenek? (igen/nem). A "nem" a legkisebb
    megengedett értéket jelenti (1%), mert semmi nem állhat meg teljesen. Ha
    igen, haladó: milyen erős (1-4%, csúszka, ma 2%).

**F. Jelenetváltás**
14. Legyen éles vágás a jelenetek között? (igen/nem, oktatónál ajánlott)
15. Ha nem: áttűnés, eltolás, törlés vagy nagyítás? (egy választás). A kánon
    szerint egy videóban egyféle váltás, végig ugyanaz.

**G. Háttér**
16. Maradjon nyugodt a háttér? (igen/nem)
17. Ha nem: lassú színátmenet, filmszemcse, finom rács vagy fényfutás? (több
    választás, legfeljebb kettő)

**H. Kamera**
18. Mennyire közelítsen a kamera jelenetenként? Alig, közepesen (egy
    választás). Kikapcsolni nem lehet: minden jelenetben van kameramozgás.

**I. Visszatérő elemek (a playlist aláírása)**
19. Legyen a szakaszok végén egy visszatérő záró-mozdulat? Bezáruló gyűrű,
    pipa, aláhúzás, nincs (egy választás).
20. Visszatérő szegmensek: rövid (3-6 mp-es) részek, amik minden videóban
    ugyanott jönnek. Például feliratkozás-kérés, lead magnet ajánló, komment
    felhívás. A user megadja a szövegüket és a helyüket (eleje, közepe,
    vége). (igen/nem, utána szerkesztő)
21. Hagyjunk a végén 20 mp-et a YouTube végképernyőnek (két videó és a
    feliratkozás gomb helye üresen marad, a zene szól tovább)? (igen/nem,
    ajánlott: igen)
22. Látszódjon alul egy vékony haladásjelző, ami a videóval együtt telik, a
    fejezethatároknál egy kis jellel? (igen/nem)

Kimaradt: logó-intro (sokan már használnak saját introt, ne keveredjen bele).

## A komponens-készlet

Az archetípus a **jelenet**: mit mutat a kép egy mondatnál (kijelentés,
csempék, nyíl, számláló). Ebből a jelenet-tábla választ, mondatonként egyet.
A komponens **réteg vagy átmenet**: ami a jelenetek között, alatt vagy felett
történik (váltás, háttér, kiemelés, számláló-effekt, zárás). Nem dönt a
tartalomról.

Forrás: a brand-frames `BLOCKS.md` "adopted set" listája (Zoltan válogatása a
HyperFrames registryből), nem új válogatás. Induló méret kb. 20 elem, a
kérdések választási lehetőségei szerint:

| Hely | Darab | Példa |
|---|---|---|
| Jelenetváltás | 4 | fade-through, directional-wipe, iris-reveal, match-cut |
| Háttér | 4 | mesh-gradient-bg, grain-overlay, dynamic-grid, light-sweep-pass |
| Kiemelés | 4 | marker-highlight, hw-underline, hw-callout-circle, inline-highlight |
| Számok | 2 | count-up, number-wheel |
| Szöveg | 3 | per-word-rise, line-by-line-slide, kinetic-type-swap |
| Zárás, szegmens | 3 | cta-close, logo-outro, social-proof-card |

Mérőszámok, amik a méretet korlátozzák:

1. **Választás kérdésenként legfeljebb 4-5**, különben a user elveszik.
2. **Tesztmátrix:** minden elemet minden presettel és minden varázsló-opcióval
   le kell renderelni a regress tesztben. 20 elem x 13 preset már 260 kombináció,
   ez a valódi korlát, nem a letöltés.
3. **Renderidő:** a háttér-rétegek 5-20%-ot adnak hozzá, a blur alapúak 100%-ot,
   ezért azok kimaradnak. Egy elem akkor kerül be, ha a mintavideón a renderidő
   legfeljebb 20%-kal nő.
4. **Hibalehetőség:** minden új elem csak akkor kerül be, ha a lint és a check
   minden presettel 0 hibát ad.

A készlet verzióról verzióra bővülhet, mindig regress teszttel.
