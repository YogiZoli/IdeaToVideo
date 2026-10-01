# Identity: terv (2. fázis, "Sorrend innen" 2. pont)

Állapot: **terv, Zoltan jóváhagyására vár** (2026-10-01). Kód csak utána.
Alapja: DECISIONS 67 (Identity), 66 (mentés), 68 (szótár), 69-71 (suite,
árazás). Modell: Opus 5.5, High.

## 1. Mit old meg

Ma az app egyetlen beállításkészlettel dolgozik: egy brand, egy hang, egy
közönség. Az Identity egy szinttel fölé kerül a videóknak: egy brand, írói
álnév vagy ügyfél, pontosan 0 vagy 1 YouTube channellel. Egy user több
Identity-t futtathat párhuzamosan, mindegyik a saját hangjával, kinézetével és
CTA-jával. A videók (a felületen: **ONE Video**) az Identity alá tartoznak.

Két szint van, nem több: **App** (a gép, az ügynökség) és **Identity**.

## 2. Mi App-szintű, mi Identity-szintű

| Beállítás | App | Identity | Megjegyzés |
|---|---|---|---|
| Felület nyelve | igen | | |
| Projektek gyökérmappája | igen | | az Identity mappák ez alatt |
| Aktív Identity | igen | | a felső sáv választója írja |
| Licencszint (Solo, Agency) és az Identity-korlát | igen (kódban) | | lásd 6. pont, nem a config fájlban |
| AI szolgáltató és modell | alap | felülírhatja | |
| Kulcsok (6 AI, ElevenLabs, HeyGen, vidIQ) | alap | felülírhatja | lásd 4. pont |
| Autopilot alapból | igen | | munkamód, nem brand |
| Gyorsítótárak (Chrome, engine, hangminták, avatar előnézetek) | igen | | közös, nagyok |
| Mentési mappa (DECISIONS 66, később) | igen | | |
| Név (a felületen és a mappanévben) | | igen | |
| YouTube channel URL (0 vagy 1) | | igen | |
| Channel Profile, Audience, Brand Voice | | igen | |
| Landing URL és CTA szöveg | | igen | később az Offer Card tölti (DECISIONS 70) |
| Tartalom nyelve | | igen | |
| Brand preset, logó, színfelülírás | | igen | |
| Narrator Voice (szolgáltató, hang) | | igen | |
| Avatar: be/ki, look, stílus, sarok, méret | | igen | |
| vidIQ be/ki | | igen | a kulcs App vagy Identity |
| Script-sablon, célhossz | | igen | |
| Szótár (DECISIONS 68) | | igen | később, a Brand varázsló chatjében |
| Brand, Mozgás, CTA varázsló eredménye | | igen | lásd 8. pont |

Szabály: ami a videó kinézetét, hangját, tartalmát vagy célját érinti, az
Identity. Ami a gépet, a fizetést vagy a munkamódot, az App.

## 3. Fájlok és mappák

```text
<app config dir>/                       (Windowson %APPDATA%/<app azonosító>/)
  config.json                           App, schema 2
  identities/
    zoltan-gero/
      identity.json                     az Identity minden beállítása, kulcs nélkül
      brand/logo.png                    a mai <app data>/brand/ helyett
      (később: FRAME.md, motion.json, cta/, dictionary.json)
    voxflow/
      ...

<projektek gyökere>/                    (alap: Dokumentumok/IdeaToVideo Projects)
  Zoltan Gero/                          az Identity mappája, olvasható név
    2026-10-01_freelancer-to-owner/     egy ONE Video, a mai felépítéssel (SPEC 4.3)
  VoxFlow/
    ...
```

- **Az Identity azonosítója** (`id`) a létrehozáskor születik a névből
  (ékezet nélkül, kisbetű, kötőjel), ütközésnél `-2`. Soha nem változik, ez
  köti össze a beállításfájlt, a kulcstárat és a mappát.
- **A mappanév** a név, a Windows által tiltott karakterek nélkül
  (`\ / : * ? " < > |`), az ékezet marad (a Windows és a Mac kezeli).
  Átnevezéskor a mappa is átnevezésre kerül, ha éppen nem fut munka; ha nem
  sikerül, a régi mappanév marad, és az app kiírja.
- `config.json` (App, schema 2): `ui`, `llm` (alap), `projectsDir`,
  `activeIdentity`, `onboarded`, `defaults.autopilot`.
- `identity.json` (schema 1): `id`, `name`, `folder`, `createdAt`, `channel`,
  `brand`, `narrator`, `avatar`, `research`, `defaults` (scriptTemplate,
  targetLengthMin), és opcionálisan `llm` (felülírás). Ugyanaz a mezőforma,
  mint ma a config megfelelő részei, így a kapuk kódja alig változik.
- A `project.json` új mezője: `identity` (az id). A mappa amúgy is mutatja,
  de a mentésnél és a visszatöltésnél ez a biztos kapocs.

**Az effektív beállítás.** A kapuk ma a teljes configot kapják (`llm`,
`channel`, `narrator`...). Ez marad: az app az App és az aktív Identity
összefésüléséből előállítja ugyanazt a formát (Identity felülírja az App
alapot), és ezt adja a kapuknak. Így a kapuk kódjában szinte csak a forrás
cserélődik, a logika nem.

## 4. Kulcstár: öröklés

- Ma: szolgáltatás `ideatovideo.<provider>`, fiók `default`. **Ez lesz az App
  kulcs**, átköltöztetés nélkül.
- Identity kulcs: ugyanaz a szolgáltatás, a fiók `identity-<id>`. Két külön
  bejegyzés a Windows Credential Managerben és a macOS Keychainben.
- **Feloldás** (csak a Rust magban, a kulcs soha nem megy a felületre): ha az
  Identity-nek van saját kulcsa az adott szolgáltatóhoz, az; különben az App
  kulcs; különben hiba ("No API key").
- **Melyik Identity?** Ha a kérés egy ONE Video mappájára vonatkozik, a Rust a
  mappából állapítja meg (melyik Identity mappája alatt van), nem a felülettől
  kapja. Ha nincs projekt a kérésben (például "Test key"), az aktív Identity.
  Így egy hosszú render akkor is a jó kulccsal fut, ha közben a user másik
  Identity-re vált.
- A felület továbbra is csak igen/nem állapotot kap, most kétszer: `app` és
  `identity` szolgáltatónként, és mellé, melyik érvényes ("Using the App key"
  vagy "Own key for this Identity").
- "Remove all keys" az App oldalon minden kulcsot töröl (App és minden
  Identity); az Identity oldalon csak az Identity sajátjait.
- Identity törlésekor a saját kulcsai is törlődnek.

## 5. Átállás a mai állapotból

Egyszer, az app indulásakor, csendben (ahogy a Studio névről átköltözés is):

1. Ha a `config.json` schema 1, az App részei (`ui`, `llm`, `projectsDir`,
   `onboarded`, `defaults.autopilot`) maradnak benne, a többi átkerül az első
   Identity `identity.json`-jába.
2. Az első Identity neve: a YouTube channel URL `@handle` része, ha van,
   különben "My Identity". A Settingsben átnevezhető.
3. A logó a `<app data>/brand/` mappából az Identity `brand/` mappájába
   másolódik, az útvonal átíródik.
4. A projektek gyökerében lévő ONE Video mappák (amiben `project.json` van)
   átkerülnek az Identity mappájába (átnevezés ugyanazon a lemezen, nincs
   másolás). Ami nem mozdítható (például nyitva van), az marad, és az app egy
   sorban kiírja.
5. A kulcsok maradnak, ahol vannak: ezek lesznek az App kulcsok.

Zoltan szerint a tesztadat elveszhet; az átvétel ennél nem sokkal több munka,
és nála nem kell újra végigmenni a beállításon. Az átállás egy tesztben, egy
mai formájú config mintán ellenőrizve.

## 6. Licencszint: Solo és Agency

- **Egy helyen**: egy kis modul (Rust `edition.rs`, mellette a felületnek
  `edition.ts`) tartja: a termék nevét, a szintek nevét (Solo, Agency), az
  Identity-korlátot (Solo 1, Agency korlátlan), és a felületi szövegeket, amik
  ezekre hivatkoznak. White label esetén ezt az egy helyet kell cserélni.
- **Ma**: a szint Agency (korlátlan), licenc nincs (az a 4. fázisban jön). A
  szint **nem** a config fájlban van, hogy ne lehessen kézzel átírni; a
  4. fázisban egy aláírt licencfájl adja.
- **Érvényesítés**: a Rust "új Identity" és "Duplicate" parancsa ellenőrzi a
  korlátot (nem csak a felület). Solo szinten a választóban a "New" és a
  "Duplicate" szürke, mellette: "Solo plan: one Identity. Agency: unlimited."
- **Affiliate és white label**: nem épül. Az útjuk: a termék neve és a
  szövegek egy helyen (fent), és a licencfájl helye kész.
- A mai beégetett "IdeaToVideo" előfordulásokat (felső sáv, ablakcím,
  ébrentartás oka, projektmappa neve) erre az egy helyre vezetem. Az ablakcím
  és a telepítő neve a `tauri.conf.json`-ban marad, az build-időben cserélhető.

## 7. Felület

**Felső sáv:** a termék neve után az **Identity választó**: az aktív Identity
neve (és ha van, a YouTube channel `@handle`-je). Lenyitva: az összes
Identity, alattuk "New Identity", "Duplicate this Identity", "Identity
settings". Váltáskor a ONE Videos lista az új Identity videóit mutatja.
Utána a két fül: **ONE Videos** (a mai Projects) és **Settings**. Egy futó
munka (hang, render) közben a váltás engedélyezett, a munka a saját
Identity-jével fut tovább (4. pont), és a haladásjelző mutatja, kié.

**Settings, két csoport** (a mai hat aloldal szétosztva):

| Csoport | Aloldal | Tartalom |
|---|---|---|
| App | AI and keys | alap AI szolgáltató és modell, az App kulcsok (mind a 9) |
| App | Folders | projektek gyökere (később a mentési mappa) |
| App | Plan | a szint (Agency vagy Solo), az Identity-k száma és korlátja |
| App | General | a mai General: Remove all keys, verzió, licencek |
| Identity | Identity | név, YouTube channel URL, Duplicate, Delete |
| Identity | Channel | Audience, Brand Voice, Channel Profile, landing és CTA, nyelv |
| Identity | Look | brand preset, logó (később a Brand varázsló) |
| Identity | Voice and avatar | Narrator Voice, avatar alapok |
| Identity | Research | vidIQ be/ki |
| Identity | AI and keys | "Use App settings" (alap) vagy saját szolgáltató, modell, kulcsok |

Minden Identity aloldalon felül: kinek a beállítása ("Settings for: Zoltan
Gero"), hogy ne lehessen összekeverni.

**New Identity:** a mai beállító varázsló Identity-része, egy új első
lépéssel (név). Az AI kulcs lépés kimarad (az App kulcs érvényes), a kulcsos
lépéseknél (ElevenLabs, HeyGen, vidIQ) a szöveg: "Using the App key", mellette
"Use a different key for this Identity". Minden lépésen ugyanúgy: Use
recommended, Skip, use default.

**Duplicate:** egy meglévőből indul: másolja az `identity.json`-t és a
`brand/` mappát (és később a varázslók eredményeit), új névvel és id-vel; a
saját kulcsokat a Rust belül átmásolja (a felület nem látja őket). A ONE
Videók nem másolódnak. Utána a Settings Identity oldala nyílik, hogy a user
átírja, ami más (tipikusan: név, YouTube channel, nyelv).

**Delete:** megerősítéssel, a beállítást és a saját kulcsokat törli, a ONE
Video mappákat **soha** (a felirat ezt ki is mondja). Az utolsó Identity nem
törölhető.

**Első indítás (új telepítés):** a mai 12 lépés marad, a sorrend: AI kulcs
(App), az Identity neve, utána a többi (Identity). A végén "You can add more
Identities later" sor, Solo szinten nélküle.

**Szavak:** "ONE Video" (egy videó), "ONE Videos" (a lista), "Identity",
"YouTube channel" (soha nem csak "channel"; a mai "Channel" aloldal címe
ezért "Channel" helyett "YouTube channel and audience"). A felület angol
marad.

## 8. Mit kap ebből a Brand, a Mozgás és a CTA varázsló

- **Helyet**: az Identity mappája (`identities/<id>/`). A Brand varázsló a
  `brand/` alá ír (FRAME.md, logó világos és sötét változat, betűválasztás),
  a Mozgás varázsló `motion.json`-t, a CTA varázsló `cta/` mappát (visszatérő
  szegmensek, saját feltöltött videók, kulcsszavak). A szótár
  (`dictionary.json`) ugyanide.
- **Biztonságos utat**: a runner egy ellenőrzött `identityDir` útvonalat kap
  (ugyanúgy, mint ma a `projectDir`-t: a Rust csak az Identity-k mappáján
  belülit engedi).
- **Öröklést és másolást ingyen**: minden ONE Video az aktív Identity
  eredményét kapja; a Duplicate a varázslók eredményét is viszi; új Identity
  az alapértékekkel indul, és a varázsló a Settings Identity oldaláról
  indítható.
- **Egy jövőbeli kaput a suite felé**: a Brand Card (DECISIONS 69,
  javaslat) importja és exportja Identity-szintű lesz, ugyanígy az Offer Card
  importja (Audience, landing, CTA). Ma egyik sem épül, csak a hely.

## 9. Ami ebben a körben nem épül

Licenc és aktiválás (4. fázis); affiliate; white label; mentés (DECISIONS 66,
külön kör); szótár (Brand varázsló köre); Offer Card és Brand Card import;
Identity-k közötti ONE Video áthelyezés.

## 10. Tesztek és munkamenet

- **Rust** (`cargo test`): kulcs-feloldás (Identity, utána App), az Identity
  megállapítása a projektmappából, az átállás egy schema 1 config mintán
  (mezők, logó, projektek áthelyezése), az Identity-korlát (Solo 1, Agency
  korlátlan), id és mappanév képzés, Duplicate és Delete.
- **Node** (`npm test`): `config.json` schema 2 és `identity.json` séma, az
  effektív beállítás összefésülése, `project.json` `identity` mező.
- **E2E** (`npm run e2e`): a mai 11 lépés egy Identity alatt, plusz egy
  második Identity, és hogy a ONE Video a saját mappájába kerül.
- **UI próba** (`scripts/ui-mock`): választó, váltás, New, Duplicate, Delete,
  Settings két csoportja, Solo szint szimulálva (szürke New).
- **Becsült idő** a jóváhagyás után: kód és tesztek kb. 3-4 óra, a telepítő
  build kb. 15 perc. Közben nem pollozok, a végén jelzek.

## 11. Zoltan döntésére vár

1. A terv egésze (2-8. pont).
2. Az első Identity neve az átálláskor: `@handle` vagy "My Identity" (a
   javaslat a fenti; átnevezhető).
3. Duplicate viszi-e a saját kulcsokat (javaslat: igen, a Rust belül másolja).
4. Futó munka közben engedjük-e az Identity váltást (javaslat: igen, a munka
   a saját Identity-jével fut tovább).
