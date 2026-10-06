# Import és Export az IdeaToVideo-ban (2026-10-07)

Röviden: mit lehet egy fájlba kimenteni, mit lehet beolvasni, és hogyan
kapja meg Zoltan a saját 39 archetípusát.

## 1. Mit lehet exportálni

Egyik sem tartalmaz API kulcsot és videót. A kulcsokat az új helyen újra be
kell írni.

| Mit | Hol | Mi van benne | Állapot |
|---|---|---|---|
| **Identity export** | Settings, Identity, Identity: Export Identity | az Identity teljes beállítása: Brand kártya, logó, Motion profil, CTA, szótár, szegmensek beállítása; és ezután a blokk-csomagjai is | megvan, a csomagokkal bővül |
| **Brand kártya export** | Settings, Identity, Brand: Export | csak a kinézet: színek, betűk, formák | megvan |
| **Pack export** (blokk-csomag) | Settings, Identity, Scenes: Export pack | egy blokk-csomag, például a 39 archetípus | épül |

## 2. Mit lehet importálni

| Mit | Hol | Mi történik |
|---|---|---|
| **Identity import** | az Identity választó: Import | egy új Identity jön létre a fájlból, minden beállításával |
| **Brand kártya import** | Settings, Identity, Brand: Import | a kinézet átveszi a kártyát |
| **Import pack** | Settings, Identity, Scenes: Import pack | a csomag blokkjai jelenettípusként elérhetők abban az Identityben |

## 3. Hogyan kapja meg Zoltan a 39 archetípust

1. Claude a kánonból (`C:/Users/gdp/HyperFrames/_frames/blocks`, csak
   olvasva, a kánon nem változik) elkészíti a csomagfájlt:
   `zoltan-archetypes.itvpack`. A csomag nem kerül az app repójába és a
   telepítőbe, csak Zoltan gépére.
2. Claude megadja az útvonalát.
3. Zoltan az appban: Settings, Identity, Scenes, **Import pack**, és
   kiválasztja a fájlt.
4. Onnantól a 39 blokk a tervező AI-nak is elérhető, a Scenes tabon
   cserélhetők, a Scenes varázsló "Packs" lépésében be és ki kapcsolhatók.
5. A csomag kinézete alapból a saját C2C Blue; egy kapcsolóval az Identity
   Brandjét követheti.

## 4. Példa: Máté és a VoxFlow Identity

**Mit állít be Máté:**
- Brand: a VoxFlow színei és betűi (Brand varázsló, vagy `tokens.css`
  import).
- Motion: tempó, kamera, felirat-stílus, kimondott szó kiemelése.
- CTA: a komment-kulcsszavak és a szegmensek.
- Scenes: melyik csomag és blokk, melyik ikoncsalád, melyik képforrás.

**Mit tud exportálni:** a teljes "VoxFlow" Identityt egy fájlban. Ezt
odaadhatja egy kollégának, vagy áthozhatja egy új gépre: ott minden
ugyanígy működik, csak a kulcsokat kell újra beírni.

**Mit tud importálni:**
- egy kész Identityt, amit Zoltan készített neki;
- vagy csak egy blokk-csomagot, például Zoltan archetípusait, ha Zoltan
  odaadja. A csomag kapcsolójával a blokkok ilyenkor nem a C2C Blue-t,
  hanem a VoxFlow Brandjét viselik.

## 5. Miért nincs külön varázsló a csomagokhoz

Egy blokk kész, animált jelenettípus, HTML-ben és mozgásban tervezve. Egy
user ilyet nem készít, hanem kész csomagot importál, és a Scenes varázsló
"Packs" lépésében kiválasztja, mit használ belőle. Csomagot az készít, aki
tervez (most Zoltan Claude-dal, a kánonból átalakítva). Üzletileg a
"mintázó" irányhoz illik (DECISIONS 71): ahogy egy Identity, úgy egy
csomag is lehet ajándék vagy termék a kurzusvevőknek.
