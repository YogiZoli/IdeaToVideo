# A 39 archetípus: átnézés és javaslatok (2026-10-07)

Forrás: `C:/Users/gdp/HyperFrames/_frames/blocks/` (brand-frames, main,
`3efb25f`; a távoli main két committal előrébb jár, PR #6). **Csak olvasva,
a kánon nem módosult.** A cél: Zoltan saját csomagja (`.itvpack`) az
IdeaToVideo-hoz, Import és Export gombbal (DECISIONS 103).

## 1. Helyesbítés

Korábban azt írtam, hogy 36 blokknak nincs változója. Ez a brand-frames
STATUS 2026-08-30-i bejegyzéséből jött, és **elavult**: azóta a `475119c`
("data-vars, per-instance attributes") és a `85dcaa8` ("library round 2")
óta **mind a 39 blokknak van változó-felülete** (blokkonként 1-13 változó, a
`zg-frames/blocks/CATALOG.md` listázza). Négy blokknál a deklarált és a
ténylegesen használt változók száma eltér (lásd 4.1).

## 2. Mi van (szerepekkel, ahogy a tervező használná)

| Blokk | Mire jó | Változók | Javasolt szerep |
|---|---|---|---|
| statement | két soros kulcsmondat, a második sor hangsúlyos | 4 | kulcsmondat |
| display-word | egy nagy szó, homályból élesre | 3 | kiemelés |
| hero | nagy cím, betűnként, vonallal | 3 | nyitás |
| step-card | fejezetjelölő ("STEP THREE") | 3 | nyitás vagy fejezet |
| arrow | két pont kapcsolata ikonnal, vonallal, lüktetéssel | 6 | kapcsolat |
| rail | 4 lépéses sín, az utolsó landol | 6 | lépések |
| proportion-bars | két mennyiség aránya | 6 | bizonyíték |
| split | rossz és jó egymás mellett, nagy szóval | 4 | ellentét |
| state-flip | állapotok egymás után, az utolsó nő | 3 (5) | lépések |
| tiles | 4 csempe ikonnal | 9 | felsorolás |
| panel-list | ellenőrzőlista ikonokkal | 3 | felsorolás |
| countup-bars | szám felszámol, oszlopok | 8 (6) | bizonyíték |
| line-chart | trendvonal pontokkal | 4 | bizonyíték |
| lens | nagyító egy rekord részletén | 13 (12) | részlet |
| contact-record | CRM-rekord makett | 11 | felület-makett |
| form | űrlap, gépelés, kattintás | 6 | felület-makett |
| progress-ring | gyűrű, ami betelik | 5 | bizonyíték |
| pulse-ring | állapot: vár vagy aktív | 4 | állapot |
| keyword-pill | "Comment GUIDE below" pirula | 5 | CTA |
| end-card | zárókártya, szlogen, komment-felhívás | 4 | zárás |
| overlay-callout | cím és callout felvétel fölé | 3 | felvétel fölé |
| overlay-lower-third | névsáv felvétel fölé | 4 | felvétel fölé |
| overlay-quote | idézet felvétel fölé | 3 | felvétel fölé |
| device-footage | felvétel eszközkeretben, zoom, kurzor, lupe | 1 | képernyőfelvétel |
| short-scene | 4 mp alatti gyors ütem | 3 | gyors ütem |
| highlighter | szövegkiemelő filc | 3 | kiemelés |
| skitch-markers | jelölők: rossz, kérdés, figyelj, jó, szeretem | 7 | jelölés |
| signature-move | a "ház" gesztusa: a gyűrű bezárul | 2 | zárás |
| branch | elágazás: két út | 5 | döntés |
| funnel | tölcsér 4 szinttel, százalékkal | 10 | bizonyíték |
| cycle | körforgás (flywheel) ikonokkal | 8 | folyamat |
| gauge | mutató és szám együtt | 3 (4) | bizonyíték |
| grid | "sok van": 25 elemes rács | 2 | sokaság |
| question | kérdés, ami megállít | 2 | horog |
| quote | idézet névvel | 3 | idézet |
| lead-card | egy valódi ember kártyája | 9 | személy |
| library-card | márkakártya ("ZG-FRAMES") | 3 | márka |
| command | terminálparancs és eredménye | 5 | parancs |
| before-after | előtte és utána, törléssel | 2 | ellentét |

## 3. Ami nagyon jó (megtartandó)

- **A mozgásnyelv** (`zg-frames/motion.js` v1.7): négy elnevezett easing,
  tömegarányos időzítés, sebességplafon (60 px kockánként), a mozgásirány
  jelentést hordoz, minden belépő `fromTo` (seek-stabil), és **minden
  blokk alatt folyamatos 3%-os kameramozgás a jelenet teljes hosszán**, plusz
  lüktetés a landolás után. Ez pontosan az, ami Zoltan videójából hiányzott.
- **A blokkok tartalmi sokfélesége:** folyamat, döntés, tölcsér, körforgás,
  sín, ellentét, mutató, makett: ilyen a HyperFrames registryben kevés van.
- **A tokenek:** a `zg.css` CSS-változókkal dolgozik (`--blue`, `--navy`,
  `--bg`, `--card`, `--line`, `--muted`...), így a csomag a te színeidet
  tarthatja, vagy egy másik Identity Brandjére köthető.
- **Időzítés a hanghoz:** a blokkok mondat-horgonyt ismernek (`data-sent`),
  a kánon szerint a szám soha nem "kézzel gépelt".

## 4. Mit javítanék (hiba vagy kockázat)

1. **Változó-eltérések:** `countup-bars` (8 deklarált, 6 használt), `gauge`
   (3 és 4), `lens` (13 és 12), `state-flip` (3 és 5). A csomagban
   egységesítem: ami deklarált, az használt, és fordítva.
2. **A demo-szövegek mint változók:** minden blokkban van `kick` ("05 ·
   ARROW · 3 PHASES") és sok helyen `subcap`/`caption`, ami az archetípust
   írja le ("Icon. Line. Pulse.", "Navy sets up. Blue lands."). Videóban ezek
   nem maradhatnak: a csomagban a tervezőnek kötelező kitölteni, vagy
   üresen eltűnnek (ellenőrizni kell, hogy üres értékkel a blokk nem hagy-e
   lyukat).
3. **Méret:** egy blokk kb. 0,9 MB, mert mindegyik beágyazza az Open Sans
   betűt (base64). 39 blokk = 35 MB. A csomagban a betű egyszer lesz, vagy
   az Identity saját betűje (a build úgyis helyben adja, DECISIONS 72).
4. **A szabályt sértő elem:** a `display-word` (`blurword`) `filter: blur`-t
   használ, holott a saját mozgásszabályod tiltja (megduplázza a render
   idejét). Javaslat: blur nélkül, átlátszóság és méret.
5. **Kitalált adat kockázata:** a `lead-card`, `contact-record`, `quote`,
   `form` emberi nevet, e-mailt, idézetet mutat. Ha az AI tölti ki, könnyen
   kitalált személyt vagy idézetet ír (ugyanaz a gond, ami miatt a registry
   vélemény-kártyái kimaradtak, DECISIONS 55). Javaslat: ezek csak akkor
   választhatók, ha a script valódi nevet vagy idézetet mond, és a felület
   ezt jelöli.
6. **Felvétel nélkül üresek:** az `overlay-*` hármas és a `device-footage`
   felvétel fölé vagy köré készült ("your phone footage, untouched"). Csak
   akkor ajánlhatók, ha van saját felvétel a jelenet alatt (DECISIONS 82).
7. **Rögzített hossz:** a blokkok 4-6 mp-esek, a jelenet hossza viszont
   2-10 mp. A kamera és a lüktetés már igazodik a jelenet hosszához
   (`data-scene-dur`), a belépők nem: rövid jelenetnél a vége lemaradhat.
   Javaslat: a belépők időzítése a jelenet hosszához arányosan (mint a
   registry komponenseknél a `fitDuration`).
8. **Saját márka a szövegben:** `library-card` ("ZG-FRAMES"), `end-card`
   ("PURPOSEFUL · PEACEFUL · PROFITABLE"), `quote` ("Zoltan Gero"). A te
   csomagodban ez rendben van, de egy megosztott csomagban nem maradhat.

## 5. Mit változtatnék (minőség)

1. **Ikonok:** a blokkok a saját 37 ikonjukat használják (`icons.js`,
   körben, egy vonalvastagsággal). Javaslat: maradjon a 37 alapnak, de egy
   ikon-változó a három nagy készletből (Lucide, Tabler, Iconoir, 8700 ikon,
   DECISIONS 105) is választhasson, ugyanabban a körben, ugyanazzal a
   vonallal.
2. **A kimondott szó:** a szöveges blokkok (`statement`, `hero`,
   `highlighter`, `question`) kapják meg ugyanazt a kiemelést, mint az app
   jelenetei (DECISIONS 106).
3. **Számok a hangból:** a `countup-bars`, `funnel`, `gauge`,
   `progress-ring` csak olyan számot mutathat, amit a narráció kimond (az app
   ellenőrzője ezt már figyeli, a csomag blokkjaira is kiterjesztem).
4. **Magyar ékezetek:** az Open Sans tudja (ő, ű), de a hosszú magyar
   szavakhoz a blokkok sorhossza szűk (például a `split` kártyái). Próba
   magyar szöveggel minden blokkon.

## 6. Mivel bővíteném (új archetípus-javaslatok)

A te mozgásnyelveden, a meglévők mintájára:

1. **timeline**: idővonal 3-5 ponttal, a kimondott dátumnál landol.
2. **compare-table**: két oszlopos összevetés (mi és ők, előtte és utána,
   sorok pipával és kereszttel).
3. **checklist-build**: lista, ahol minden pont a kimondáskor kap pipát.
4. **stat-icon**: egy nagy szám egy ikonnal és egy mondattal (a leggyakoribb
   explainer-kép).
5. **three-reasons**: három kártya számozva, egyenként érkeznek.
6. **myth-fact**: "tévhit" áthúzva, alatta a "tény".
7. **map-pin**: egy hely kiemelése egyszerű térképen (a registry
   `world-map` elemével).
8. **icon-scene**: egy rajzos ikon (a három készletből) kirajzolódik, alatta
   a mondat lényege; a whiteboard-ink mintájára, de a te stílusodban.
9. **photo-frame**: egy kép (stock vagy AI) kártyában, lassú zoommal, a
   képaláírással; ez kell a "mindig legyen kép is" kéréshez.
10. **chapter-progress**: hol tart a néző a videóban (fejezet 2 a 4-ből).

## 7. A csomag (amit importálsz)

- **Fájl:** `zoltan-archetypes.itvpack` (zip), a kánonból egy átalakító
  szkript készíti, csak olvasva. A szkript az IdeaToVideo repóban él
  (általános csomag-készítő), a te blokkjaid és a csomag nem kerülnek a
  repóba.
- **Benne:** `pack.json` (név, szerző, verzió, blokkonként szerep, leírás,
  változók és határaik, javasolt hossz, kinézet: a saját C2C Blue vagy az
  Identity Brandje), a blokkok egyszer beágyazott betűvel, előnézeti képek, a
  közös mozgás- és ikonfájlok egyszer.
- **Az appban:** Settings, Identity, Scenes: Import pack, Export pack,
  Remove; a Scenes varázsló "Packs" lépése: blokkonként be és ki, előnézet.
- **Ellenőrzés importkor:** minden blokk build, lint, check egy
  mintajelenettel; ami nem megy át, nem kapcsolható be (és a felület
  megmondja, miért).

## 8. Döntés

Zoltan 2026-10-06-án azt kérte, hogy kérdés nélkül haladjak a
javaslataimmal. Ezért:

1. A 4. pont javításai mind bekerülnek a csomagba; a kánon érintetlen.
2. Az 5. pont változtatásai mind bekerülnek.
3. A 6. pont új archetípusai a csomag és az Import, Export után jönnek, ebben
   a sorrendben: icon-scene, photo-frame, stat-icon, checklist-build,
   compare-table, timeline, three-reasons, myth-fact, chapter-progress,
   map-pin. Zoltan bármikor átrendezheti.
4. A csomag kinézete alapból a saját C2C Blue (Zoltan Identity-jénél), egy
   kapcsolóval az Identity Brandjét követheti.
