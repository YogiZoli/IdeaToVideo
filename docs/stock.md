# Stock videó és kép: terv (még nem épül)

Állapot: **terv, Zoltan döntésére vár** (2026-10-06). Zoltan pár napig gondolkodik
rajta; addig az Unsplash is válaszolhat a jelentkezésre. A DECISIONS 90 vázlatát
ez a terv váltja fel (DECISIONS 93). Bármi felülírható.

## 1. Mire jó

B-roll annak, akinek nincs saját felvétele (a "diavetítésszerű" visszajelzés,
`feedback/2026-10-05/NOTES.md` 9). A saját felvétel-könyvtár (DECISIONS 82) már
kész: a stock klip ugyanoda kerül, és utána ugyanúgy működik, mint egy saját
felvétel.

## 2. Források

A HeyGen ezekből dolgozik: Pexels, Getty, Unsplash, Storyblocks.

| Forrás | Mit ad | Állapot (2026-10-06) | Az appban |
|---|---|---|---|
| Pixabay | videó, kép | Zoltannak van kulcsa | **első kör** |
| Coverr | videó | Zoltannak van kulcsa | **első kör** |
| Unsplash | csak kép | jelentkezés beadva 2026-10-06, válasz 5-10 munkanap | rejtve, amíg nincs jóváhagyás |
| Pexels | videó, kép | új kulcs kiadása szünetel | rejtve, amíg nem ad kulcsot |
| Shutterstock | videó, kép, fizetős licenc | félretéve (lásd lent) | később, ha Zoltan dönt |
| Storyblocks | videó, kép | API csak üzleti ügyfélnek, egyedi áron | félretéve |
| Getty | prémium | önkiszolgáló kulcs nincs, szerződés kell | félretéve |

Egy forrás csak akkor látszik, ha a kódban be van kapcsolva **és** van hozzá
kulcs. Az Unsplash és a Pexels illesztője elkészülhet, de rejtve marad.

**A Shutterstockról** (Zoltan kérdése): a fizetős licenc jogilag a
legtisztább. Klipenként megveszed, nem kell forrásmegjelölés, és a licenc
papíron megvan. Ugyanakkor klipenként pénzbe kerül, és külön API-előfizetés
kell hozzá. A YouTube Content ID ütközés (egy stock klipre más is jogot
formál) ingyenes és fizetős forrásnál egyaránt előfordulhat. Egyetértek vele,
hogy most félretesszük: az első kör két ingyenes forrással induljon, és a
pilot mondja meg, kell-e a fizetős.

## 3. Licenc és forrásmegjelölés (a viták megelőzése)

Zoltan, 2026-10-06: a videó alatt ne legyen forráslista.

- A Pixabay és a Coverr licence ingyenes kereskedelmi használatot ad, és
  **nem kér forrásmegjelölést**. A YouTube leírásba ezért semmi nem kerül.
- Minden letöltött elemhez belül eltesszük: forrás, azonosító, szerző, a
  licenc neve és címe, az oldal címe, a letöltés ideje. A klip mellett, a
  saját felvétel-könyvtárban, és a `publish.json` `credits` listájában. Ez
  csak a mi bizonyítékunk egy esetleges vitához (Content ID claim), a néző
  nem látja.
- Az Unsplash API szabálya a megjelölést az appon belül kéri (a kereső
  kártyáján), a videóban nem.
- A kereső szűrője a licenc szerint is szűr (lásd 4).
- Csak a felhasználó által kiválasztott elem töltődik le, magától soha.
- A copyright kockázat: egy ingyenes stock klipre ritkán valaki más is
  Content ID igényt jelent be (claim, nem strike); ilyenkor a tárolt licenc
  és oldalcím a vitához elég. Teljesen kockázatmentes az egyedi, generált
  klip: lásd `docs/ai-broll.md`.

## 4. Felület: nagyon egyszerű, a HeyGen keresőjéhez hasonló

Egyetlen panel, két helyről nyitható:

```
[ keresőmező: "laptop office"                    ] [Search]
  Videos | Images
  Landscape | Portrait      License: Any free | No credit needed      Quality: HD | 4K
  [kártya] [kártya] [kártya] [kártya]
  [kártya] [kártya] [kártya] [kártya]
```

- **Két fül:** Videos és Images.
- **Három szűrő, egy sorban:**
  - forma: Landscape vagy Portrait (alapból a videó formája);
  - licenc: bármely ingyenes, vagy csak a forrásmegjelölés nélküliek;
  - minőség: HD vagy 4K.
- **Kártya:** előnézet (egérrel rámutatva lejátszik), a hossz, a forrás
  kis címkéje, egy "Use" gomb. Semmi más.
- **Hol nyílik:**
  1. A Scenes tabon jelenetenként egy "Find stock" gomb. A keresőmezőt az AI
     tölti ki a jelenet mondatából, de átírható.
  2. Settings, Identity, Footage: "Add from stock". Ugyanez a panel, a
     választás a könyvtárba kerül.
- Kulcs nélkül egyik gomb sem látszik. Az onboardingba nem kerül új lépés.

## 5. Képek

A kép a jelenetben lassú ráközelítéssel vagy úsztatással mozog. Saját mozgást
nem írunk. Jelöltek, amiket a megvalósítás előtt ki kell próbálni:

- a HyperFrames registry `yt-camera-move` komponense ("zoom, slide és 3D
  tilt-pan bármilyen keretre: videó, include, kártya"), a rögzített commiton
  (9a27b9f) megvan;
- a Mozgás profil már meglévő "Push in" kamerája (DECISIONS 74).

Ha egyik sem illik egy állóképhez, a kép marad ki, és csak a videó jön.

## 6. Mennyi stock kerül egy videóba (Claude döntése, felülbírálható)

Zoltan rám bízta (2026-10-06); a DECISIONS 93 jelzi, hogy felülbírálható.

- Az AI csak oda tesz stockot, ahol a narráció valami láthatót mond (tárgy,
  hely, cselekvés), elvont mondat alá nem.
- Legfeljebb minden harmadik jelenet lehet stock, és két stock jelenet nem
  jön egymás után.
- CTA jelenet alá soha.
- Ha van saját felvétel, az előnyt kap a stockkal szemben.
- Később a Settingsben (Identity, Footage) egy választó: Stock share: Off,
  Some (alap), More.

## 7. Autopilot

Egy kapcsoló, alapból kikapcsolva. Bekapcsolva az AI jelenetenként a legjobb
találatot választja a fenti szabályok szerint, a licencszűrő "No credit
needed" állásában.

## 8. Technikai felépítés

- `runner/stock/`: közös réteg (keresés, előnézet, letöltés, licenc), és
  forrásonként egy kis illesztő: `pixabay.mjs`, `coverr.mjs`; később
  `unsplash.mjs`, `pexels.mjs`, `shutterstock.mjs`.
- Egy találat formája: `{ id, source, kind, orientation, width, height,
  seconds, previewUrl, downloadUrl, author, license, pageUrl }`.
- Minden hálózati hívás a runnerben. Az előnézetek helyben, gyorsítótárban
  vannak, mint az avatar-előnézetek, mert a felület nem tölt be idegen címet
  (CSP).
- A letöltés 1080p (vagy a legnagyobb, ami nem nagyobb ennél; 4K csak ha a
  szűrő azt kéri) az Identity felvétel-könyvtárába, a licenc-rekorddal.
- A kulcsok az OS kulcstárban: `pixabay`, `coverr` (a kulcsnév-fehérlistára
  is fel kell venni őket). App szinten, Identity-nként felülírhatók, mint a
  többi kulcs.
- A forrás szabályai szerint: a Pixabay a keresési találatok 24 órás
  tárolását kéri, és percenkénti kéréskorlátja van; a runner tárolja a
  találatokat, és nem kérdez feleslegesen.
- A türelmes újrapróbálás és a Stop (DECISIONS 91, 92) itt is érvényes.
- Költség: a két első forrás ingyenes, nincs ismétlődő díj.

## 9. Nyitott kérdések Zoltannak (a döntéskor)

1. Indulhat az első kör Pixabay és Coverr forrással?
2. (Eldőlt: nincs forrássor a videó alatt, a licenc csak belül van eltéve.)
3. Képek: maradjanak benne, ha a `yt-camera-move` jól mozgatja őket?
4. Autopilot kapcsoló: elég, ha alapból kikapcsolt?
