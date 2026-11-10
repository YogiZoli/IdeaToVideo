# RecCut

Egy felvétel bemegy, kész YouTube videó jön ki. A saját gépeden, a saját kulcsaiddal.

RecCut asztali app (Windows, később macOS). Egy képernyőfelvételből, egy kamerás felvételből vagy a kettőből kész 16:9 MP4-et csinál, mellé Publishing Cardot (cím, leírás, fejezetek a valódi hosszból), Thumbnailt, és elküldi a publikáló appodnak (PDT). Semmit nem tesz közzé magától.

## Mit csinál, lépésről lépésre

1. **What did you record?** Kiválasztod, mit vettél fel:
   1. Screen only: egy képernyőfájl. A kép a kattintásokra zoomol, a kurzor simán mozog.
   2. Screen with my face in a bubble: két fájl (képernyő és kamera), vagy egy fájl, amiben már benne a buborék. Ez utóbbinál egyszer bekeretezed a buborékot az első kockán, és a zoom soha nem vágja le az arcod.
   3. Talking head: egy kamerás fájl.
   4. Screen and camera, switching: két fájl, a kép váltogat közöttük.
   5. Profile silhouette: oldalról filmezve, a háttér eltűnik.
   6. Screen with an AI avatar bubble: a buborékban az Identity HeyGen avatarja beszél. Alapból ki van kapcsolva, és pénzbe kerül, ezért az árat előre megmutatja, és csak a gombnyomásod után költ.
2. **Szavak:** a gépeden egy helyi beszédmodell (Whisper) leírja, mit mondtál. Nem megy fel sehova.
3. **Vágás:** szabály szerint kivágja a hosszú szüneteket, a töltelékszavakat és az ismételt próbálkozásokat. Mindegyiket visszateheted.
4. **Terv:** fejezetek és kiemelt szavak. Ha van AI kulcsod (az ingyenes Gemini elég), jobb lesz, de AI nélkül is elkészül.
5. **Preview:** megnézed és jóváhagyod. Itt látod a fizetős dolgok árát is.
6. **Render:** a gépeden, a HyperFrames motorral. Kész MP4.
7. **Publishing:** Publishing Card, Thumbnail, küldés a PDT-be.

## Mit kell tudnod futás közben

- **A felső sorban mindig ott áll, mi a helyzet:** "Nothing is running. You can close the laptop." (lecsukhatod), "Working. Keep the laptop open and on until this is done." (nyitva kell hagyni), vagy "HeyGen is working on its own computers. You may close the lid." (lecsukhatod).
- **Az ablakot bezárhatod,** az app a tálca sarkában dolgozik tovább.
- **Ha lecsuktad a gépet munka közben,** ébredés után az app megmondja, mi történt. Minden kész lépés megmarad. Ha egy videó megállt, nyisd meg, és nyomd meg a Go on from where it stopped gombot.
- **Hibánál** egy egyszerű mondatot látsz arról, mit tegyél. A Copy details gomb kimásolja a részleteket annak, aki segít.

## Ha valami nem úgy ment

- **Settings, Import & Export, Diagnostics, Export:** egy zip a naplóval, a beállításokkal és minden videó állapotával. Kulcs, videó és szöveg nincs benne. Ezt kell elküldeni.
- A naplók helye (Windows):
  - RecCut naplója: `C:/Users/<te>/AppData/Local/app.reccut.desktop/logs/`
  - a munka közös naplója és a hibák: `C:/Users/<te>/AppData/Local/app.ideatovideo.desktop/logs/` (benne `errors.log`)
  - egy videó saját naplója: a videó mappájában a `log.txt`

## Mi közös az IdeaToVideo-val

RecCut és IdeaToVideo egy kódbázis, két app. RecCut ugyanazokat az Identityket, Footage klipeket, fotókat, kulcsokat és PDT kapcsolatot használja, amit az IdeaToVideo-ban beállítottál. Semmit nem kell kétszer beállítani. Az IdeaToVideo scriptből csinál videót, a RecCut felvételből.

## Telepítés

Lásd [INSTALL.md](INSTALL.md): Windows és MacBook, új gépre költözéssel együtt.

## A mappák

| Mappa | Mi van benne |
|---|---|
| `app/` | Az app ablaka (Svelte) és magja (Rust, Tauri). RecCut saját darabjai: `app/src/lib/editor/`, a beállítása: `app/src-tauri/tauri.editor.conf.json` |
| `runner/` | A munka: `runner/recorded/` a felvétel motorja, `runner/recorded/bubble.mjs` a buborék |
| `engine/`, `library/` | A rögzített render motor és a betűk, ikonok |
| `reccut/` | Ez a leírás, a telepítés, a [STATUS.md](STATUS.md) (hol tartunk) és a [DECISIONS.md](DECISIONS.md) (miért így) |
