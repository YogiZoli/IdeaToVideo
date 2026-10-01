# Mentés (Backup) és Napló (Log): terv

Állapot: **terv, Zoltan jóváhagyására vár** (2026-10-01). Kód csak utána.
Alapja: DECISIONS 66 (mentés), 67 (Identity), `docs/identity.md`. Zoltan
(2026-10-01): a Backup most jön, a varázslók előtt; és ugyanebben a körben az
app legyen átlátható: Claude lássa, mit csinált az app, és mit látott Zoltan,
képernyőkép nélkül.

## A. Mentés

### 1. Hova

- A user egy **mentési mappát** választ (Settings, App, Backup). Az app
  felajánlja, amit a gépen talál: Google Drive (`G:/My Drive`), OneDrive,
  Dropbox asztali mappája. A felhőbe a saját kliensük tölti fel: nincs
  OAuth, nincs kulcs, nincs szerver, nincs díj (DECISIONS 66, 1. változat).
- Alatta egy mappa: `IdeaToVideo_Backup/`. A termék neve az `edition`
  modulból jön (white label).

### 2. Szerkezet (DECISIONS 66 nevei, Identity-vel kiegészítve)

```text
IdeaToVideo_Backup/
  _settings/
    IdeaToVideo_settings.json          az App beállításai, kulcs nélkül
    Zoltan_Gero.identity.zip           minden Identity, a meglévő exporttal
    VoxFlow.identity.zip
  Zoltan Gero/                         az Identity mappája, ugyanaz a név
    Freelancer_to_Owner_2026-10-01/
      Freelancer_to_Owner_script.md
      Freelancer_to_Owner_voice.mp3
      Freelancer_to_Owner_voice_music.mp3
      Freelancer_to_Owner_timing.json  mondat- és szóidőzítés
      Freelancer_to_Owner_scenes.json
      Freelancer_to_Owner_video.mp4
      Freelancer_to_Owner_captions.srt
      Freelancer_to_Owner_chapters.txt
      Freelancer_to_Owner_project.json visszatöltéshez: kapuk, választások
```

- A cím teljes hosszában, a szavak között `_`, ékezet nélkül, a Windows
  tiltott karakterei nélkül; a dátum a mappanév végén; ugyanaz a cím
  ugyanazon a napon: `_2` (DECISIONS 66). Rövidítés csak a 260 karakteres
  Windows határ előtt, és akkor az app kiírja.
- Minden fájlnév a cím + egy állandó utótag, így a visszatöltés tudja,
  melyik mi. Ami újragenerálható (a `build/` mappa, az állóképek), az nem
  kerül bele.

### 3. Szintek

| Szint | Mi kerül bele | Méret (kb.) |
|---|---|---|
| 1. Script | script, project, brief | néhány KB |
| 2. + hang | + hang, zenés hang, időzítés | 1-2 MB videópercenként |
| 3. + jelenetek | + jelenet-tábla | + néhány KB |
| 4. + videó | + kész MP4, felirat, fejezetek, avatar klipek | 10-40 MB videópercenként |

- Az alap szint az App beállítása; projektenként felülírható.
- A választó mellett méret-becslés a meglévő ONE Videókból.
- **Javaslat: alapból a 4.** (minden), mert a hang és a render pénzbe és
  időbe került; a Google Drive ingyenes 15 GB-ja kb. 5-10 óra kész videót
  bír. Ha kevés a hely, a 2. a takarékos választás.

### 4. Mikor

- **Magától**, ha van mentési mappa: minden kapu jóváhagyásakor és render
  után, csak a változott fájlok (méret és dátum alapján).
- **"Back up now"** gomb a ONE Video oldalán és a Settings Backup oldalán
  (minden ONE Video egyszerre).
- Állapot a ONE Video oldalán: "Backed up 14:02" vagy "Not backed up yet".
- A mentés a Jobs listában látszik, de nem foglal render-helyet és kulcsot.
- **Törlés a mentésből soha nem automatikus.**

### 5. Visszatöltés

- **ONE Video:** a ONE Videos oldalon "Restore from backup": listázza az
  aktív Identity mentett, de a gépen nem lévő ONE Videóit, és visszahozza
  őket. Ami a szintből kimaradt, az a kapuknál újragenerálható.
- **Beállítások, új gépen:** az első indítás első képernyőjén "Restore from
  a backup": a mentési mappából visszajön az App beállítás és minden
  Identity (a meglévő Identity importtal). A kulcsokat újra be kell írni, a
  kulcsmezők jelzik, melyik hiányzik.

## B. Napló (Log): hogy Claude lássa, mi történt

### 6. A gond

Ma Claude csak azt látja, amit Zoltan a **Terminal** panelen futtat (ezt
olvassa a `read_terminal`). Amit a **telepített app** csinál, az nem
látszik: csak a képernyőn megjelenő hibaüzenet, képernyőképen. Ez nem
token-barát, és ami nem jut el a képernyőig (egy elnyelt hiba, egy
figyelmeztetés, egy lassú lépés), az láthatatlan marad, és később
meglepetésként jön elő.

### 7. A megoldás: helyi naplófájl, amit Claude közvetlenül olvas

Claude ugyanazon a gépen fut, mint az app, ezért a naplófájlt közvetlenül
el tudja olvasni. Zoltannak csak ennyit kell írnia: **"nézd meg a naplót"**.

- **Hely:** `C:/Users/<user>/AppData/Local/app.ideatovideo.desktop/logs/`,
  naponta egy fájl (`2026-10-01.jsonl`, soronként egy esemény), 30 napig
  marad, utána törlődik. Csak helyben: nem megy sehova (SPEC 9, nincs
  telemetria).
- **Mi kerül bele:**
  - az app indulása (verzió, rendszer), az átállások és figyelmeztetéseik;
  - minden runner parancs: indulás, várakozás és mire, a részlépések
    (csak a váltások, nem minden százalék), vége, időtartam, hiba és annak
    `ITV-...` kódja, a runner hibakimenetének vége;
  - minden hiba, ami a képernyőn megjelent (az `ErrorBox` szövege és
    kódja), és az is, ami nem: a felület el nem kapott hibái, és a mai
    csendes `catch {}` helyek figyelmeztetésként;
  - **mit látott Zoltan:** melyik nézetben és oldalon volt (ONE Videos,
    egy ONE Video, Settings és melyik aloldal, varázsló lépés), melyik
    Identity volt aktív, és melyik gombot nyomta meg a fő lépéseknél
    (Save, Approve, Render, Duplicate...). Tartalom nélkül.
- **Mi nem kerül bele soha:** kulcs (és minden, ami kulcsnak látszik,
  kitakarva), script szöveg, narráció, közönség-leírás. Csak hossz és
  azonosító.

### 8. Összefoglaló, token-barát módon

- `node scripts/log-summary.mjs` (Claude futtatja, Zoltan is futtathatja):
  az utolsó indulás óta, vagy `--since` dátumtól, egy rövid kép: hány
  hiba, hány figyelmeztetés, a hibák kódonként csoportosítva, az utolsó 20
  lépés. Claude ezt olvassa először, és csak a releváns részletet nyitja
  meg.
- **Settings, App, General, "Log":** a naplómappa útvonala, "Open log
  folder", és egy sor: "Since the app started: 0 errors, 2 warnings".
- **A munkamenetbe beépítve:** a `docs/SESSION-PROMPT.md` KEZDÉS része
  kiegészül: ha Zoltan az előző telepítővel tesztelt, Claude első lépése az
  összefoglaló. Így a több hiba egyszerre látszik, nem egyenként, később.

## 9. Tesztek

- Node: fájlnevek (ékezet, tiltott karakter, `_2`, 260-as határ), szintek,
  csak a változott fájl másolódik, visszatöltés az utótagokból, a napló
  kitakarja a kulcsot, az összefoglaló.
- Rust: a mentési mappa útvonal-ellenőrzése (a runner csak a beállított
  mentési mappába írhat), a beállítások mentése kulcs nélkül, napló-írás és
  30 napos takarítás.
- e2e: a render után automatikus mentés 4. szinten, egy ONE Video törlése,
  visszatöltés, az MP4 ugyanaz.
- UI próba a `scripts/ui-mock`-ban.

**Becsült idő a jóváhagyás után:** Mentés kb. 3-4 óra, Napló kb. 2 óra,
telepítő kb. 15 perc.

## 10. Zoltan döntésére vár

1. A terv egésze.
2. Az alap szint: 4 (minden) vagy 2 (script és hang)? Javaslat: 4.
3. A napló rögzítse-e a nézeteket és a fő gombnyomásokat (tartalom nélkül)?
   Javaslat: igen, ettől látja Claude, "mit látott Zoltan".
4. 30 nap megőrzés elég? Javaslat: igen.
