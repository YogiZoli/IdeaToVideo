IdeaToVideo: Mac telepítő v1 (aláíratlan), külön chatben.

Repó: C:/Users/gdp/projects/IdeaToVideo (github.com/YogiZoli/IdeaToVideo, private).
Indulás előtt olvasd el: STATUS.md, DECISIONS.md (a végét, 95 és 101-111), docs/hatralevo.md,
.github/workflows/build.yml, docs/pilot/install-guide.md. Mondd vissza röviden: end goal, hol tartunk, következő lépés.

Cél: egy Mac telepítő (.dmg), amit 1-2 Mac-es barátomnak adhatok, egy rövid angol Mac telepítési
leírás, és egy rövid angol leírás arról, hogyan exportálják és küldik el nekem a naplót.
A Windows-os próba közben fut a barátaimnál, ahhoz ne nyúlj.

Lépések:
1. Új branch: mac-build (a mainből).
2. A CI piros a 2. fázis óta: a ci-test-order branch (cd9a3e9) javítását hozd be, hogy a
   build zöld legyen. Nézd meg a hibát: gh run view a legutóbbi build futásra.
3. Ellenőrizd a Mac-specifikus részeket a kód olvasásával, MIELŐTT futtatsz: a sidecarok
   (scripts/fetch-sidecars.mjs: Node aarch64-apple-darwin), ffmpeg Mac-re (fetch-ffmpeg),
   a render böngésző letöltése Macen, a kulcstár (keychain), az útvonalak, a futtatási jog (chmod)
   a bundle-ben, a tauri.conf.json dmg beállítása. Célgép: Apple Silicon (macos-latest).
   Intel Mac csak ha olcsón megy.
4. PÉNZ: a GitHub a macOS perceket tízszeresen számolja. Futtatás előtt nézd meg a fiók
   Actions keretét (gh api), mondd meg, hány percbe kerül egy futás, és csak az igenem után
   indítsd: gh workflow run build -f platforms=macos --ref mac-build. Egy igen egy futásra szól,
   ha többször kell, kérdezz újra, és mondd, mennyi keret maradt.
5. Hiba esetén a log alapján javíts, és kérdezz az újabb futás előtt.
6. Kész .dmg: töltsd le (gh run download), nevezd el így:
   IdeaToVideo_0.1.0_<commit>_aarch64.dmg, és másold ide: G:/My Drive/IdeaToVideo-pilot/
   (ha nincs G: meghajtó, indítsd el a Google Drive asztali appot).
   A mappa megosztását NE állítsd át, azt én döntöm el.
7. Leírások angolul, egyszerűen, nem-technikus embernek:
   a) docs/pilot/install-guide-mac.md (egy oldal): letöltés a Drive linkről, a .dmg megnyitása,
      az app áthúzása az Applications mappába, az aláíratlan app megnyitása (macOS 15:
      System Settings, Privacy and Security, Open Anyway; ha "damaged" üzenet jön, a Terminal
      parancs: xattr -cr /Applications/IdeaToVideo.app, pontosan leírva), első indítás, a render
      böngésző letöltése, a Gemini kulcs, az első videó, hol a videó. Az install-guide.md
      Windows-os leírást vedd mintának.
   b) docs/pilot/send-logs.md (rövid, Windows és Mac): Settings, General, Export diagnostics,
      a zip mentése, elküldése nekem e-mailben vagy WhatsAppon; mi van benne és mi nincs
      (nincs kulcs, hang, videó, script). A Windows leírás 7. pontja hivatkozzon rá.
   Mindkét .md-t töltsd fel a G:/My Drive/IdeaToVideo-pilot/ mappába is.
8. Mac gépem nincs, te sem tudod kipróbálni. Amit lehet, ellenőrizz a CI-ban (a build után egy
   indítási próba a runneren, ha olcsón megy). Mondd meg őszintén, mi nincs kipróbálva.
9. A végén: tesztek zöldek, DECISIONS új pont (Mac v1), STATUS és docs/hatralevo.md frissítve,
   commit, push, PR a mainre. Jóváhagyás előre megadva, merge: gh pr merge --merge.

Szabályok (CLAUDE.md is): magyarul válaszolj, a kód és a komment angol. Nincs emoji, nincs
gondolatjel. Útvonal mindig code blockban, per-jellel, minden válasz végén Fájlok blokk.
A nekem adott parancs PowerShell 5.1, soha nem &&. Kulcs soha nem kerül fájlba, logba, commitba
vagy chatbe. Fizetős lépés (Apple Developer ID, felhős Mac, HeyGen, ElevenLabs) nem kell, ne indítsd.
Saját render- vagy videómotort nem írunk.
