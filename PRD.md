# PRD: Studio (munkanév)

Verzió: 0.1 vázlat, 2026-09-24
Tulajdonos: Zoltan Gero
Állapot: jóváhagyva (Zoltan, 2026-09-24)

A termék neve, a cégforma és a domain még nincs eldöntve. A "Studio" csak
munkanév. A "HyperFrames" a HeyGen neve, termékként nem használható.

## 1. Összefoglaló

Helyben telepíthető asztali alkalmazás (Windows és Mac), ami **egyetlen
YouTube videót** visz végig ötlettől kész MP4-ig: script, narrátor hang,
márkázott motion graphics videó, opcionális avatar, feliratok.

A gyártás a user saját gépén fut, a user saját API kulcsaival (BYOK). Nincs
szerver, nincs kredit, nincs előfizetés. A render a HyperFrames publikus
motorján megy (0 kredit), és a Zoltan Gero féle blokk-könyvtár, mozgásrendszer
és 5 kapus menet adja a minőséget.

Egy mondatban: **amit a Subscribr-szerű SaaS eszközök kreditért, a saját
szerverükön és motion graphics nélkül csinálnak, azt ez a user gépén,
ingyen renderelve, a user saját brandjével.**

## 2. Helye az univerzumban

| Réteg | Mi | Termék | Ebben a PRD-ben |
|---|---|---|---|
| A réteg | Ownership Method, intent-based marketing: kit célzunk, mi az ajánlat, 8-16 videós Evergreen Flywheel playlist, lead magnet | a módszer és a kurzus része, plusz egy **külön Tervező app** | nem |
| B réteg | egy adott videó elkészítése végig | **ez az app (Megvalósító)** | igen |
| Publikálás | Publishing Pack a kész videóból | Publishing Dream Team (web, élesben) | nem |
| Lead magnet | PDF, mini-kurzus progress barral, reverse lead magnet | külön app(ok), külön szál | nem |

Kapcsolatok:
- **A lead magnet és a Studio között csak a Landing URL** a kapocs. A Studio
  ezt a videó CTA-jába és a végső képernyőbe teszi.
- **A Tervező és a Studio külön app marad.** Nincs közös adatbázis. Az átjárás
  import: "ha már van Tervező appod, innen importálhatod". Az átadó formátum a
  **Video Brief Card** (lásd 8. pont).
- A kész videó után egy "Open in Publishing Dream Team" gomb vezet tovább.

## 3. Célfelhasználó

Elsődleges: **kezdő YouTube alkotó vagy vállalkozó**, aki soha nem csinált
videót, nem techy, nem akar szerkesztőprogramot tanulni. Egy témát tud mondani,
és kész videót akar.

Másodlagos: haladó alkotó, aki minden kapunál bele akar szólni.

Első körben: Zoltan és 1-2 barát (pilot), utána a fizetős kurzus vevői
ingyenes bónuszként.

## 4. Célok és nem célok

### Célok (v1)
1. Kezdő user a telepítés után segítség nélkül elkészít egy kész videót.
2. A teljes 5 kapus menet benne van, de minden kapu átugorható.
3. 0 fix költség a usernek a saját API használatán túl, és 0 szerverköltség
   Zoltannak.
4. Windows és Mac az első verziótól.
5. A videó tartalma bármilyen nyelvű lehet, a felület angol.

### Nem célok (v1)
- Remotion támogatás. Kihagyva, a licence és a dupla blokk-könyvtár miatt.
- Csatorna-stratégia, playlist-tervezés, lead magnet: ez az A réteg és a
  Tervező app.
- Publikálás a YouTube-ra, Publishing Pack: ez a PDT.
- Competitor Intel, Channel Memory: később, ha kérik.
- Thumbnail generálás: v1-ben csak brief, a generálás később.
- Support ingyenes usernek. Lásd 11. pont.

## 5. Onboarding (első indítás)

Első indításkor varázsló, később minden mező a **Settings** képernyőn
módosítható. Minden lépésnél három lehetőség van: kitölti, **Use recommended**
vagy **Skip, use default**. Minden kulcsos lépésnél van "Test key" gomb.

| # | Lépés | Ha kihagyja (default) |
|---|---|---|
| 1 | **AI kulcs**, sorrendben: Gemini, OpenRouter, Claude, ChatGPT, DeepSeek, Grok | Gemini ingyenes tier. Kötelező, enélkül nincs script. |
| 2 | **Brand**: preset választás galériából, logó feltöltés (színek kinyerése), betű | `blue-professional` preset |
| 3 | **Audience** (persona): kit céloz | Recommended: az AI javasol a csatorna vagy a téma alapján |
| 4 | **Brand Voice**: hangnem, stílus, tiltott szavak | Recommended: az audience-ből levezetve |
| 5 | **Channel Profile**: miről szól a csatorna, mitől más | Skip |
| 6 | **YouTube csatorna URL** | Skip |
| 7 | **Landing URL** (lead magnet) | Skip, nincs CTA |
| 8 | **Tartalom nyelve** | angol |
| 9 | **Narrator Voice**: ElevenLabs kulcs és hang | ingyenes `edge-tts`, a nyelvhez illő hanggal |
| 10 | **HeyGen kulcs** (avatar) | nincs avatar |
| 11 | **vidIQ kulcs** (kulcsszó adat) | nincs kulcsszó adat, a téma kézzel |
| 12 | Import Tervező appból (Channel Profile, Video Brief Card) | Skip |

A varázsló kiírja: a ChatGPT Plus vagy Claude Pro **előfizetés nem API kulcs**,
az API külön fiók.

Elnevezés: a UI-ban a **Brand Voice** (hangnem, stílus) és a **Narrator Voice**
(a hang, ami felolvas) mindig külön szó.

## 6. A fő folyamat

Egy videó = egy **Project**. A project státusza végigvezeti a usert:

`Idea` > `Scripted` > `Voiced` > `Scened` > `Reviewed` > `Rendered` > `Done`

A kapuk a kánon (PIPELINE.md) szerint:

| Lépés | Mi történik | Kapu |
|---|---|---|
| 1. Script | téma vagy Video Brief Card alapján, script-sablonnal és Brand Voice-szal | 1. kapu |
| 2. Hang és zene | Narrator Voice, zene, ducking, hangerő-normalizálás | 2. kapu |
| 3. Mondattábla | időzítés mérése a hangból | automatikus |
| 4. Jelenet-tábla | mondatonként archetípus a 39-ből, max 6 szó képernyőn | 3. kapu |
| 5. Build, lint, check | kompozíció összerakása, 0 hiba a feltétel | automatikus |
| 6. Kontakt lap | állókép jelenetenként, átnézésre | 4. kapu |
| 7. Render | egyszer, helyben | automatikus |
| 8. Avatar | HeyGen avatar a sarokba, ha van kulcs | 5. kapu |
| 9. Feliratok, export | MP4 és felirat fájl | automatikus |

Minden kapunál három gomb: **Recommended** (az AI dönt a kánon szerint),
**Default** (a preset alapértéke), **Custom** (kézi).

**Autopilot kapcsoló**: a user csak a témát adja meg, a kapuk lefutnak, de nem
állnak meg jóváhagyásra. A végén kész videó.

### Script-sablonok
A Subscribr "Templates" megfelelője: a script **szerkezete**, nem a kép. v1
system sablon: **Ownership Framework** (OPEN, TEACH, OWN), mellé 2-3 további.
A user klónozhat és saját sablont írhat.

### Nyelv
- UI: angol.
- Tartalom: projektenként választható. A script, a Narrator Voice, a feliratok
  és a képernyőn megjelenő szöveg ugyanazon a nyelven.
- Másik nyelvű változat ugyanabból a projektből: script fordítás, új hang,
  újrarenderelés. A kép és a mozgás marad.
- A preset betűkészletének ismernie kell a célnyelv ékezeteit (ő, ű).

## 7. Brand presetek

- A HyperFrames nyilvános frame presetjei **mind** bekerülnek (a repóban ma 13,
  a hyperframes.dev/design oldalon 15). Apache-2.0, betűk OFL.
- Zoltan saját brandjei (Zoltan Gero, VoxFlow) **nem** kerülnek ki presetként.
- Logóból színkinyerés: a választott preset színeit a logó színeire cseréli, a
  betűk és a kompozíció a presetből maradnak.
- A preset szerkezete (`FRAME.md` + tokenek) azonos a meglévő csatornákéval, a
  39 archetípus közvetlenül ráül.

## 8. Video Brief Card

Az átadó szerződés a Tervező és a Studio között. Ha a user nem használ
Tervezőt, a Studio maga tölti ki az 1. lépésben.

Tartalma (javaslat): cím, fő ígéret, audience, keresési szándék és kulcsszó,
a playlist és a helye benne, CTA és Landing URL, script-sablon, nyelv, hossz.

Formátum: egy JSON vagy Markdown fájl, verziózott sémával, hogy a két app
egymástól függetlenül fejlődhessen.

## 9. Technikai keret

- **Tauri** asztali app, Windows és Mac. A build GitHub Actionsben mindkettőre.
- A Node és az ffmpeg sidecarként a csomagban.
- Render: `npx hyperframes` pinnelt verzióval.
- LLM: **egyetlen OpenAI-kompatibilis integráció**. Minden szolgáltató ezen
  megy, a Claude is (Anthropic kompatibilis végpont). Natív Claude csatlakozó
  csak ha a pilot indokolja.
- Kulcsok: az operációs rendszer kulcstárában (Windows Credential Manager, Mac
  Keychain). A config fájl (JSON) csak nem titkos beállítást tárol.
- A PowerShell pipeline szkriptek (`sentences.ps1`, `stamp-timing.ps1`,
  `regress.ps1`, `image-audio-lint.ps1`) átírva Node-ra, egy kódbázis mindkét
  platformra.
- Frissítés: Tauri updater, GitHub Releases.
- Telemetria: nincs.

## 10. Költségek

| Tétel | Pilot (barátok) | Kiadás (kurzusvevők) |
|---|---|---|
| Tauri, GitHub Actions, GitHub Releases | 0 | 0 |
| Apple Developer Program | 0 (aláíratlan) | 99 USD/év |
| Windows aláírás | 0 (aláíratlan) | kb. 10 USD/hó (Azure Trusted Signing) vagy 200-400 USD/év |
| Mac kézi teszt | barát Macje | bérelt felhős Mac kiadás előtt, kb. 30 USD/hó |
| LLM, hang, avatar | a user fizeti | a user fizeti |

Aláíratlan pilotban Windowson a SmartScreen, Macen a Gatekeeper figyelmeztet.
Egyoldalas, képernyőképes telepítési leírás jár mellé.

## 11. Terjesztés, licenc, support

- **Free**: nyilvános GitHub repó, telepítő a Releases-ből, README és
  hibaelhárítási oldal. Issues kikapcsolva, csak Discussions. Az About oldalon
  és a README-ben kiírva: **"No support, no installation help."**
- **Paid** (kurzusvevő): support, telepítési segítség, aláírt telepítő.
- Licenc, két réteg:
  - HyperFrames (HeyGen): Apache-2.0, licencszöveg és hivatkozás az appban
    ("Built on HyperFrames by HeyGen").
  - Zoltan rétege (39 archetípus, MOTION szabályok, pipeline, app): zárt
    licenc. Használható, nem csomagolható újra és nem adható el.
  - A user brandje, beállításai és az elkészült videók a useréi.

## 12. Siker mérése

Pilot siker: **egy barát egyedül, Zoltan segítsége nélkül** telepít, végigmegy
az onboardingon és lerenderel egy videót, Windowson és Macen is.

Kiadási siker (később): a kurzusvevők hány százaléka készít legalább egy
videót az első héten.

## 13. Ütemterv (fázisok)

| Fázis | Tartalom | Kimenet |
|---|---|---|
| 0 | PowerShell szkriptek Node-ra, pipeline CLI-ként Zoltan gépe nélkül | a pipeline fut egy tiszta gépen |
| 1 | Tauri váz, onboarding, config és kulcstár, LLM integráció | telepíthető app, ami scriptet ír |
| 2 | Teljes 5 kapus menet a UI-ban, Autopilot, presetek | kész videó az appból |
| 3 | Pilot 1-2 baráttal, Windows és Mac | pilot siker vagy hibalista |
| 4 | Aláírás, updater, free repó, kiadás kurzusbónuszként | publikus kiadás |

## 14. Nyitott kérdések

1. Név, cégforma, domain (később).
2. A Video Brief Card pontos sémája, közösen a Tervező app tervezésével.
3. A 2-3 további script-sablon kiválasztása az Ownership Framework mellé.
4. A pilot barátok: ki, milyen géppel (legalább egy Mac).
5. Sampler render a presetekkel a 39 archetípuson: a pilot előtt, minőségellenőrzésnek.
