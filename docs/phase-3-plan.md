# 3. fázis: terv (pilot)

Kimenet (PRD 13, 12): **pilot siker vagy hibalista**, és a hibák javítása.
Pilot siker (PRD 12): egy barát egyedül, Zoltan segítsége nélkül telepít,
végigmegy az onboardingon és lerenderel egy videót.

Branch: `phase-3` (a mainről, `c2a8e87`). Állapot 2026-10-06: **jóváhagyva
Zoltan módosításaival** (lásd lent), az implementálás folyik.

## Eldőlt (Zoltan, 2026-10-06)

1. **Most csak ingyenes lépések.** Pénzbe kerülő tétel 1-2 hét múlva, addig
   nem indul: Windows aláírás (Azure Trusted Signing), Apple Developer ID,
   a Mac build és a Mac kézi teszt (felhős vagy barát Mac), a PRD 14 nyitott
   kérdései (név, cégforma, domain). Ezek a 4. fázis fizetős végére kerülnek.
2. **Nincs baráti teszt egyelőre**, nem tudni, kipróbálják-e és mikor. A
   barátok köre (B kör) a végére marad, a terv rájuk nem épül.
3. **Telepítő: egyetlen új, a 4. fázis végén.** Addig minden megvalósul a
   kódban, és Zoltan egyben teszteli. A mostani telepítő (a gépen lévő
   17:20-as) nem az aktuális main, de nem is kell új.
4. **Mac build: egyetlen egyszer, Windows és Mac együtt**, a 3. és a 4. fázis
   tartalma után (DECISIONS 95). A PRD 12 Mac-es pilot-feltétele ezért a
   kiadás elé csúszik; felírva a DECISIONS 101-be.
5. **Az avatar motorválasztás és a HeyGen import most készül el**, a 3. és a
   4. fázis előtt (megépült, lásd 2. pont), fizetős hívás nélkül.
6. **A tiszta környezet: Windows Sandbox.** Az A kör (Zoltan próbája) ebben
   fut, miután minden kész.
7. A phase-3 PR CI-ja piros maradhat a 4. fázis végéig (`ci-test-order`).

## 1. Az A kör (Zoltan próbája), a végén, egyben

Mi a B kör: a barátok köre, amikor egy barát egyedül telepít. Az A kör a
próbakör, amit Zoltan csinál egy tiszta Windowson, hogy a gépies hibák
előbb előkerüljenek. Az A kör nem pilot siker, mert Zoltan ismeri az appot.

- **Mikor:** a 4. fázis ingyenes tartalma és az új telepítő után, egyszer.
- **Hol:** Windows Sandbox (a Windows 11 Pro tudja, a funkciót be kell
  kapcsolni, ez újraindítást kér; még nem ellenőriztem, hogy be van-e
  kapcsolva). Tartalék: új helyi Windows felhasználó.
- **Mit:** telepítés (SmartScreen), első indítás, onboarding, első videó
  Autopilottal, Export diagnostics. Itt készülnek a képernyőképek a leíráshoz.
- **Pilot minimum, költség nélkül:** egy ingyenes Gemini kulcs. Hang: Gemini
  TTS. Nincs ElevenLabs, HeyGen, vidIQ, zene, AI B-roll (alapból ki).

## 2. Ami a 3. fázis előtt elkészült: avatar motor, import, szövegmező

Megépült (DECISIONS 101), tesztelve hamis HeyGen válaszokkal, valódi hívás
nélkül:

- **Motorválasztás** (Settings, Identity, Voice and avatar, és videónként az
  Avatar tabon): Avatar III (alap), IV, V. Az `engine` mező az Identity
  `avatar` beállításában. A look csak a támogatott motorokat engedi; ha az
  alap nem támogatott, a legolcsóbb támogatottra esik vissza, és ezt kiírja.
  Becslés motoronként (III: 0,60-0,99 USD/perc, IV: 2,31-4,83; az V ára nem
  publikus, ezért a IV tartományával becsül, és jelöli).
- **Import from HeyGen** (Settings, Identity, CTA, Your segments, C): a fiók
  kész videói (`GET /v3/videos`, olvasás, ingyen), kiválasztás, kulcsszóhoz
  rendelés, letöltés, szegmens lesz (`source: heygen-import`). Nyitott: a
  webes felületen készült videók benne vannak-e a listában, azt a valódi
  fiókkal kell kipróbálni. Ha nincsenek, marad a letöltés és feltöltés (A).
- **Szegmens szövege: 1500 karakter** (volt 400), hogy egy 30 mp-es klip
  teljes szövege beleférjen; számláló van a mezők alatt. A felirat (`.srt`)
  és a publikálási adat is ezt használja.
- **Az újrahasznosítás** a DECISIONS 78 szerint már megvolt: egy szegmens egy
  kulcsszóé, Identity-nként legfeljebb 3 kulcsszavanként, váltakozva.
  Zoltan terve: három klip (Cold, Warm, Hot: GUIDE, COURSE, TRIGGER) egyszer
  a HeyGen weben, letöltve és feltöltve (A) vagy importálva (C), és minden
  videóban ugyanaz a három szól, amikor az a kulcsszó a komment-CTA.

### Az "Unlimited" Avatar III (utánanézve, 2026-10-06)

A HeyGen saját súgója szerint az API külön, dollár alapú pay-as-you-go
rendszer, a webes csomag nem ad API-t és kreditet sem visz át. A webes
Avatar III "unlimited" csak a régi (legacy) unlimited csomagokon maradt meg;
az új kreditalapú csomagokon az Avatar III 3 kredit percenként (a Creator
csomag 600 kreditet ad havonta). Az API-ban az Avatar III is fizetős. Ezért
az olcsó út a CTA-szegmensekre: a három klip a webes HeyGenben készül, és az
app letöltve vagy importálva használja, így API-hívás nélkül.

## 3. Telepítő és eljutása (a 4. fázis végén)

- **Build:** helyi release build a mainről (kb. 17 perc, mérve a 2.
  fázisban), előre szólok. Név: `IdeaToVideo_0.1.0_<commit>_x64-setup.exe`.
- **Eljuttatás: Drive link** a `.exe`-re. A megosztás kifelé szóló lépés,
  konkrét igenre. Méret kb. 100 MB; a Drive a nagy fájlnál víruskeresési
  oldalt mutathat, ezt kiküldés előtt kipróbálom.
- **Aláíratlan:** SmartScreen ("More info", "Run anyway"), a leírás ezt
  képernyőképpel vezeti át. A Tauri NSIS alapja felhasználónkénti telepítés
  (nem kér rendszergazdát), az A körben ellenőrzöm.
- **Első indítás:** a render böngésző (kb. 282 MB) letöltése, az onboarding
  "Download now" sávja mutatja.

## 4. Egyoldalas telepítési leírás, angolul

`docs/pilot/install-guide.md` (és PDF), képekkel az A körből: 1. letöltés,
2. SmartScreen, 3. telepítés és indítás, 4. onboarding (csak egy ingyenes
Gemini kulcs kell, a többi "Skip, use default"), 5. az első videó
("Finish on Autopilot", a render kb. 2 perc gépidő videópercenként, ne
zárd be az appot, ne altasd a gépet), 6. hol a videó (Your video, Show in
folder), 7. hiba esetén Settings, App, General, Export diagnostics.

## 5. Hogyan jönnek vissza a hibák (képernyőkép nélkül)

1. Settings, App, General, **Export diagnostics**: zip (`logs/` az app
   naplója, `settings/` kulcs nélkül, videónként `videos/.../` a
   `project.json`, `log.txt`, `build/*.log`, avatar állapot; nincs benne
   kulcs, hang, videó, script szövege).
2. Kicsomagolás: `feedback/<dátum>/<kitől>/`.
3. `node scripts/log-summary.mjs --dir <kicsomagolt>/logs`, utána a videók
   `log.txt` és `build/*.log` fájljai; a hibakódok `ITV-...` alakúak.
4. Hibánként egy sor a `feedback/<dátum>/NOTES.md`-be, javítás, és az új
   telepítővel ugyanaz újra.

## 6. Mit ellenőrzök a telepítő előtt (ingyen, most is futhat)

- **Tesztek:** `npm test` (233 Node), `cargo test`, `npm run e2e` (a
  fázis végén).
- **PRD 14.5, sampler render.** A 39 archetípus a D út óta nincs az appban
  (DECISIONS 48); a megfelelője a 15 komponensű könyvtár a presetekkel. A
  `scripts/phase2/pilot.mjs` kap egy `--preset` kapcsolót, és lefut mind a
  11 HyperFrames presetre: build, lint, check, kontakt lap; renderelés 3
  presetre (világos, sötét, erős színű), kb. 2 perc videónként. A kontakt
  lapokat én nézem át. Kimenet: `docs/pilot/sampler.md` és a képek a
  `feedback/<dátum>/sampler/` alatt. A 152 open-design stílusból 5 darab
  szúrópróba. Hosszú futás: előre szólok, és nem pollozom.
- **CI:** a Windows futás piros, mert a runner tesztek a könyvtár letöltése
  előtt futnak; a javítás a `ci-test-order` branchen (`cd9a3e9`), PR a 4.
  fázis végén.

## 7. A 4. fázis ingyenes része, ami most megvalósítható

Nem kerül pénzbe, és nem kell hozzá név, domain vagy aláírás:

- `README.md`, hibaelhárítási oldal, az About oldal a "No support, no
  installation help." mondattal és a "Built on HyperFrames by HeyGen"
  felirattal, harmadik fél licencek (`THIRD-PARTY-NOTICES`), a zárt licenc
  szövege (PRD 11).
- `release.yml` (tag, telepítő a Releases-be, updater manifest) megírva, de
  **nem indítva**, mert Actions percet fogyaszt.
- Tauri updater beállítása (az updater saját kulcspárja ingyenes; a privát
  kulcsot Zoltan kezeli, nem kerül a repóba).
- A GSAP licenc-kérdés megfogalmazva (elküldés előtt Zoltan jóváhagyja).

Fizetős vagy külső, **későbbre** (Zoltan, 2026-10-06): Windows aláírás,
Apple Developer ID, Mac build és Mac teszt, név, cégforma, domain, a baráti
körök.

## 8. Zoltan döntésére vár

1. Az updater kulcspárja: megcsináljam-e most, a privát kulcsot hova tegyem
   (javaslat: Zoltan jelszókezelője, nem a gép és nem a repó).
2. A 4. fázis ingyenes részét ebben a sorrendben vigyem: sampler, README és
   About, `release.yml`, updater?
