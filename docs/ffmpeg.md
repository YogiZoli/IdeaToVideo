# ffmpeg: mérés és javaslat (1. fázis, DECISIONS 30)

Mérve: 2026-09-30, Windows x64, ffmpeg 8.1.

## Mire kell

A hyperframes nem hoz saját ffmpeg-et, a gépen lévőt keresi. Az app a
`HYPERFRAMES_FFMPEG_PATH` és `HYPERFRAMES_FFPROBE_PATH` változóval a sajátjára
irányítja. A lánc ffprobe-ot is hív, tehát mindkét bináris kell.

Amit a lánc használ (a hyperframes `cli.js` és a brand-frames szkriptek alapján):

| Kell | Mire | Licenc |
|---|---|---|
| libx264 kódoló | a kész MP4 | GPL |
| aac kódoló (beépített) | hang az MP4-ben | LGPL |
| libvpx-vp9 dekódoló | a HeyGen avatar átlátszó webm-je (alfa csak libvpx-szel) | BSD |
| prores_ks (beépített) | átlátszó köztes render | LGPL |
| overlay, psnr, loudnorm, ebur128 szűrők | kompozíció, regress teszt, -14 LUFS | LGPL |

A libx264 miatt az ffmpeg build GPL. Ez külön programként, parancssorból hívva
rendben van egy zárt apphoz (nem linkeljük, csak mellé csomagoljuk), de a
csomagba kell a licencszöveg, a pontos verzió, és a forrás elérhetősége
(link a build forrására és a build szkriptre).

## Mérés

| Változat | Lemezen (ffmpeg + ffprobe) | Plusz a telepítőben (tömörítve) | Mindent tud? | Munka |
|---|---|---|---|---|
| BtbN GPL static | 330 MB (2 x 165 MB) | kb. 93 MB | igen | nincs, letöltés |
| gyan full (a gépen) | 485 MB (2 x 242 MB) | nem mérve, több | igen | nincs |
| **BtbN GPL shared** | **201 MB** (közös DLL-ek) | **kb. 58 MB** | igen | nincs, letöltés |
| Saját minimális build | becslés 20 40 MB | becslés 10 15 MB | csak ami kell | build szkript + CI, mindkét platformra |

A mostani telepítő 25 MB. A tömörített méret `xz -6`-tal mérve, az NSIS
tömörítése ehhez közeli. A saját build sora becslés, nem mérés: ahhoz egy
fordító lánc kell (a gépen nincs MSYS2 vagy Docker), ez CI feladat.

A macOS-t nem mértem (nincs Mac a közelben). Ott is van kész statikus GPL
build, a méret várhatóan hasonló nagyságrend.

## Javaslat

1. **Pilot (2. és 3. fázis): BtbN GPL shared, rögzített kiadással.** A
   `fetch-sidecars.mjs` ugyanúgy tölti le, mint a Node-ot: dátumozott BtbN
   kiadás (nem a `latest`), SHA256 a szkriptben. A telepítő kb. 25 MB-ról kb.
   85 MB-ra nő. Nincs build munka, minden szükséges funkció benne van.
2. **Kiadás (4. fázis): saját minimális build a CI-ban.** Csak a fenti táblázat
   elemei, így a telepítő kb. 40 MB körül maradhat. Ez akkor éri meg, amikor a
   CI és az aláírás úgyis készül.
3. A csomagba: `licenses/ffmpeg/` a GPL szöveggel, a verzióval és a forrás
   linkjével. Az About képernyőn egy sor: "Includes FFmpeg (GPL), built by BtbN".

Döntés: Zoltan.
