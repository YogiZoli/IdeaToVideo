# Mentés (Backup) és Napló (Log): terv

Állapot: **jóváhagyva és megépült** (2026-10-01), döntések a 10. pontban.
Kód: `runner/backup.mjs` (ONE Video mentés és visszatöltés),
`app/src-tauri/src/backup.rs` (mentési mappa, beállítások mentése és
visszatöltése, felhő-mappák), `app/src-tauri/src/log.rs` és
`app/src/lib/logger.ts` (napló), `scripts/log-summary.mjs` (összefoglaló).
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
      Freelancer_to_Owner_sentences.json   mondat-időzítés
      Freelancer_to_Owner_scenes.json
      Freelancer_to_Owner_video.mp4        a legutolsó render
      Freelancer_to_Owner_captions.srt
      Freelancer_to_Owner_chapters.txt
      Freelancer_to_Owner_avatar_open.webm
      Freelancer_to_Owner_project.json     kapuk, választások
      Freelancer_to_Owner_backup.json      melyik fájl honnan jött (visszatöltéshez)
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
| 1. Script | `project.json`, `script.md`, `script.json`, `brief.json`, `log.txt` | néhány KB |
| 2. + hang | + `audio/vo.mp3`, `vo_bgm.mp3`, `music.*`, `stt.json`, `voice.json`, `sentences.json`, `words.json` | 1-2 MB videópercenként |
| 3. + jelenetek | + `scenes.json` | + néhány KB |
| 4. + videó | + a legutolsó `out/video-*.mp4`, a felirata és fejezetlistája, `avatar/` (klipek, hangok, `avatar.json`) | 10-40 MB videópercenként |

Ami kimarad, mert újragenerálható: `build/`, `review/`, `audio/blocks/` (a
`vo.mp3` ugyanazt a hangot tartalmazza), a régebbi renderek.

- **A user választja** (Zoltan, 2026-10-01): az alap szint a Settings, App,
  Backup oldalon; és ONE Videónként felülírható a videó oldalán.
- Alapérték a választás előtt: 4 (minden). A választó mellett méret-becslés
  a meglévő ONE Videókból.

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
  naponta egy fájl (`2026-10-01.jsonl`, soronként egy esemény). **Soha nem
  törlődik magától** (Zoltan, 2026-10-01): csak ha a user törli (Settings,
  App, General, "Delete logs"), mellette a méret. Csak helyben: nem megy
  sehova (SPEC 9, nincs telemetria).
- **Inkább több, mint kevesebb** (Zoltan, 2026-10-01: nem mindig Opus
  fejleszt, ezért a napló legyen bőséges): minden kattintás (a gomb
  felirata és hogy hol volt), minden választó és jelölő változása (az
  értékkel, ha nem tartalom), szövegmezőnél csak a mező és a hossz, minden
  nézet- és oldalváltás, varázsló lépés, az ablak előtérbe és háttérbe
  kerülése, minden Tauri hívás a felületről (név, időtartam, siker), minden
  runner parancs a biztonságos paramétereivel, a beállítás-mentések
  változott mezői, a jobok sora és várakozása, a mentések fájlonként.
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

## 10. Döntések (Zoltan, 2026-10-01)

1. A terv: jóváhagyva.
2. A mentési szint a user választása: alap a Settingsben, ONE Videónként
   felülírható; az alapérték 4 (minden).
3. A napló nagyon alapos és bőséges: inkább több információ, mint kevesebb;
   ami később jól jöhet, az is bekerül (tartalom és kulcs nélkül).
4. A napló nem törlődik magától, csak ha a user törli.
