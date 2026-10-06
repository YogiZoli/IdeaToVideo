# 3. fázis: terv (pilot)

Kimenet (PRD 13, 12): **pilot siker vagy hibalista**, és a hibák javítása.
Pilot siker (PRD 12): egy barát egyedül, Zoltan segítsége nélkül telepít,
végigmegy az onboardingon és lerenderel egy videót.

Branch: `phase-3` (a mainről, `c2a8e87`). Állapot 2026-10-06: **terv, Zoltan
jóváhagyására vár.** Kódolás a jóváhagyás előtt nincs.

## Mi dőlt el (Zoltan, 2026-10-06)

1. **Az első kör Zoltané**, nem a barátoké. A barátok később jönnek: a
   többségüknek Windows, 1-2 embernek Mac. Rájuk a terv nem épül, a nevük és
   a gépük nem feltétel (PRD 14.4 részben megválaszolva, lásd 1. pont).
2. **A telepítő eljutása: Drive link** a `.exe`-re. Nincs GitHub fiók, nincs
   meghívás.
3. **Mac build: egyetlen egyszer, Windows és Mac együtt**, amikor a 3. és a
   4. fázis tartalma kész (DECISIONS 95, megerősítve). A pilot Mac-es része
   (PRD 12) ezért a 4. fázis végére csúszik. Ez eltér a PRD 12-től; a
   DECISIONS-be felírom a jóváhagyás után.

## 1. Pilot, két kör

| Kör | Ki | Gép | Mire jó |
|---|---|---|---|
| A | Zoltan, próbakör | a saját Windows 11 gépe, **tiszta környezetben** | a gépies hibák: telepítés, első indítás, onboarding, első videó. Itt készülnek a képernyőképek is. |
| B | 1-2 barát (Zoltan kérdezi meg őket) | a barát gépe, többnyire Windows | az igazi pilot siker: segítség nélkül. |

**A kör tiszta környezete.** Zoltan gépén ott a fejlesztői állapot (kulcsok a
kulcstárban, `AppData/Local/app.ideatovideo.desktop`, a letöltött Chrome).
Az A kör ezért vagy **Windows Sandboxban** fut (egy eldobható, tiszta Windows;
a Windows 11 Pro tudja, de a funkciót be kell kapcsolni, ezt még nem
ellenőriztem), vagy egy új helyi Windows felhasználó alatt. A választást és a
beállítást Zoltannal egyeztetem, mert a funkció bekapcsolása újraindítást
kér. Az A kör **nem** pilot siker: Zoltan ismeri az appot. A B kör az.

**A pilot minimális útja a barátnak, költség nélkül:** csak egy Gemini kulcs
(ingyenes tier) kell. Hang: Gemini TTS. Nincs ElevenLabs, HeyGen, vidIQ, zene,
AI B-roll (alapból ki). A leírás ezt az utat mutatja, a többi lépés
"Skip, use default".

## 2. Telepítő és eljutása

- **Melyik:** a main friss release build-je (`c2a8e87` és ami utána a
  `phase-3`-ra kerül). A gépen lévő
  `app/src-tauri/target/release/bundle/nsis/IdeaToVideo_0.1.0_x64-setup.exe`
  17:20-as, a main merge-e 19:49-es, ezért **nem az aktuális**: újra kell
  építeni. Helyi release build, mérve a 2. fázisban kb. 17 perc (10 perc
  fordítás, 7 perc NSIS), előre szólok, és nem pollozom.
- **Név:** `IdeaToVideo_0.1.0_<commit>_x64-setup.exe` (a másolat neve, hogy
  egy hibajelentésből látszódjon, melyik build volt).
- **Eljuttatás:** a `.exe` a `G:/My Drive` alatt egy mappába kerül, a megosztó
  linket Zoltan hozza létre (vagy az én kérdésemre, a konkrét "igen" után,
  mert a megosztás kifelé szóló lépés). Méret kb. 100 MB. A Drive a 100 MB
  körüli fájlnál "nem tudta vírusellenőrizni" oldalt mutathat: ezt a
  kiküldés előtt kipróbálom, és ha zavaró, a leírásba kerül egy sor róla.
- **Aláíratlan:** a Windows SmartScreen figyelmeztet ("Windows protected your
  PC"): More info, Run anyway. A leírás ezt képernyőképpel vezeti át. A
  telepítés a Tauri NSIS alapja szerint felhasználónkénti (nem kér
  rendszergazdát); ezt az A körben ellenőrzöm.
- **Első indítás letöltései:** a render böngésző (kb. 282 MB, 42 mp mérve) az
  első indításkor jön; az onboarding "Download now" sávja ezt mutatja. Win10
  gépen a WebView2-t a telepítő hozza, internet kell hozzá (ezt a B körben, ha
  a barátnak Win10-e van, külön figyelni).

## 3. Egyoldalas telepítési leírás, angolul

`docs/pilot/install-guide.md` (és PDF), képernyőképekkel
(`docs/pilot/img/`), az A kör közben elkészített képekkel. Egy oldal, a
barát nyelvén (angol, nem techy):

1. Download the installer (a Drive link, a fájlnév).
2. If Windows warns you: More info, Run anyway (kép).
3. Install and start the app (kép).
4. First start: the setup wizard. The only thing you need is a free Gemini
   key (where to get it, kép), everything else "Skip, use default".
   A Claude/ChatGPT előfizetés nem API kulcs (PRD 5).
5. Make your first video: give a topic, "Finish on Autopilot" (kép), how long
   it takes (a render kb. 2 perc gépidő videópercenként, mérve), do not close
   the app, do not let the PC sleep.
6. Where is the video: Your video tab, Show in folder.
7. If something goes wrong: Settings, App, General, Export diagnostics, and
   send the zip to Zoltan.

A leírás a jóváhagyás után készül, a képek az A körből.

## 4. Hogyan jönnek vissza a hibák

Képernyőkép nélkül.

1. A barát: Settings, App, General, **Export diagnostics**: egy zip (az app
   naplója `logs/`, az App és az Identity beállítások `settings/` (kulcs
   nélkül), videónként `videos/.../` a `project.json`, `log.txt`,
   `build/render.log`, `lint.log`, `check.log`, avatar állapot; nincs benne
   kulcs, hang, videó, script szövege). A zip elküldése Driveon vagy
   üzenetben, Zoltan dönti el.
2. Zoltan a zipet kicsomagolja: `feedback/<dátum>/<barát>/` (a `feedback/`
   mappa a megszokott hely, a zip nem kerül commitba, ha személyes adatot
   gyanítunk; a `NOTES.md` igen).
3. Én: `node scripts/log-summary.mjs --dir <kicsomagolt>/logs`, utána a
   videók `log.txt` és `build/*.log` fájljai. A hibakódok `ITV-...` alakúak
   (`app/src/lib/errors.ts`), a barát megadhatja a kódot szöveggel is.
4. Minden hibából egy sor a `feedback/<dátum>/NOTES.md`-be: mi, melyik kód,
   javítva-e. A javítás után új telepítő, és ugyanaz a lépés újra az A körben.

## 5. Mit ellenőrzök a pilot előtt

- **Tesztek:** `npm test` (231 Node), `cargo test` (47 Rust), `npm run e2e`
  (39 lépés). Zöldek a mainen (STATUS szerint); a pilot előtt újra futtatom.
- **PRD 14.5, sampler render.** A 39 archetípus a D út óta nincs az appban
  (DECISIONS 48); a megfelelője a **15 komponensű könyvtár a presetekkel**.
  Javaslat: a meglévő `scripts/phase2/pilot.mjs` (minden komponens egyszer,
  kb. 50 mp) kap egy `--preset` kapcsolót, és lefut mind a 11 HyperFrames
  presetre: build, lint, check, kontakt lap (ez gyors, mérve kb. fél perc a
  buildre); renderelés 3 presetre (egy világos, egy sötét, egy erős színű),
  kb. 2 perc videónként. A kontakt lapokat én nézem át (olvashatóság, kilógó
  szöveg, üres jelenet). A kimenet: `docs/pilot/sampler.md` táblázat és a
  képek a `feedback/<dátum>/sampler/` alatt. A 152 open-design stílusra nem
  futtatom végig (az a Brand varázsló galériája, a próbája külön), csak
  szúrópróba 5 darabra.
- **Üres profilon:** az A kör maga a "friss gép" próba (e2e már ezt szimulálja
  mock LLM-mel és csendes hanggal).
- **CI:** az utolsó két PR Windows futása piros, az oka ismert: a runner
  tesztek a könyvtár letöltése előtt futnak ("The library has no component
  called titlecard-lockup"). A javítás a `ci-test-order` branchen van
  (`cd9a3e9`); STATUS szerint **a 4. fázis végén** kerül PR-be, mert Actions
  percet fogyaszt. Addig a phase-3 PR CI-ja is piros lesz ugyanezért, a helyi
  tesztek az mérvadóak. Ha mást akarsz, szólj.

## 6. Mi marad ki a 3. fázisból

- Mac build és Mac teszt (a 4. fázis végén, egyszer).
- Az első valódi HeyGen Video 1 próbaklip: a kredit után, külön jóváhagyással.
- Az avatar motorválasztás és az Import from HeyGen (DECISIONS 100), külön chat.
- A `ci-test-order` PR.

## 7. Zoltan döntésére vár

1. A tiszta környezet az A körhöz: Windows Sandbox (javaslat) vagy új helyi
   Windows felhasználó.
2. Az avatar motorválasztás (alap Avatar III) és az Import from HeyGen a B kör
   előtt készüljön-e el (javaslat: igen), vagy a pilot után.
3. A phase-3 PR piros CI-ja elfogadható-e a 4. fázis végéig.
4. Pénz: nincs fizetős hívás ebben a tervben. A Mac build egyszer, a 4. fázis
   végén, külön igenre.
