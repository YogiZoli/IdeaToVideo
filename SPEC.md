# SPEC: IdeaToVideo

Verzió: 0.1, 2026-09-24, jóváhagyva (Zoltan)
Alapja: `PRD.md` 0.1 és `DECISIONS.md`
Olvasója: a Claude Code, ami megvalósítja, és Zoltan, aki jóváhagyja

A PRD azt mondja meg, **mit és miért** építünk. Ez a dokumentum azt, **hogyan**:
stack, architektúra, adatmodell, integrációk, biztonság, build.

Ami egy SaaS SPEC-ben szokásos, de itt **nincs**, mert nincs szerver: webhook,
felhős adatbázis, felhasználói fiók, kvótakezelés a mi oldalunkon, attribúció.
Ha a user saját szolgáltatói kvótája elfogy, azt a szolgáltató hibaüzenete
jelzi, az app csak érthetően megmutatja.

## 1. Architektúra egy képben

```text
+---------------------------------------------------------------+
|  Tauri app (a user gépén)                                     |
|                                                               |
|  UI (webview: HTML/TS)        Rust core (Tauri commands)      |
|  - onboarding varázsló  <-->  - config olvasás/írás           |
|  - Projects lista             - kulcstár (OS keychain)        |
|  - kapu-képernyők             - sidecar indítás, log stream   |
|  - Settings                   - fájlrendszer, updater         |
|                                     |                         |
|                                     v                         |
|                        Node sidecar: pipeline runner          |
|                        - LLM hívások (1 integráció)           |
|                        - TTS, HeyGen, vidIQ kliens            |
|                        - brand-frames .mjs szkriptek          |
|                        - npx hyperframes (render)             |
|                                     |                         |
|                                     v                         |
|                        ffmpeg / ffprobe sidecar               |
+---------------------------------------------------------------+
        |                         |                    |
   LLM szolgáltató          ElevenLabs, HeyGen      vidIQ
   (a user kulcsával)       (a user kulcsával)      (a user kulcsával)
```

Nincs saját szerver. Minden kimenő hívás a user kulcsával, közvetlenül a
szolgáltatóhoz megy.

## 2. Tech stack

| Réteg | Választás | Miért |
|---|---|---|
| Asztali héj | Tauri 2 | kicsi bináris, Windows és Mac, beépített updater |
| UI | TypeScript + Vite, keretrendszer nélkül vagy Svelte | kevés függőség, gyors build |
| Rust core | Tauri commands, `keyring` crate | kulcstár, fájl, sidecar vezérlés |
| Pipeline | Node 20+ sidecar: csomagolt Node bináris + lecsupaszított `node_modules` (`onnxruntime-node` nélkül) + a szkriptek | a brand-frames szkriptek már Node-ban vannak; SEA nem járható (DECISIONS 26) |
| Render | `hyperframes` npm csomag, pinnelt verzió (brand-frames `package.json`: ma `0.8.22`) | a kánon motorja |
| Média | ffmpeg + ffprobe statikus build, sidecarként | avatar composite, regress, hang |
| Adat | helyi JSON fájlok | nincs adatbázis, nincs szerver |
| CI | GitHub Actions, Windows és macOS runner | ingyenes keretben |
| Terjesztés | GitHub Releases | ingyenes, a Tauri updater innen olvas |

Költség az induláskor: 0. Nincs domain, nincs Railway, nincs Supabase, nincs Neon.

## 3. Repo szerkezet

```text
IdeaToVideo/
  PRD.md  SPEC.md  DECISIONS.md  STATUS.md
  app/                    Tauri projekt
    src/                  UI (TypeScript)
    src-tauri/            Rust core, tauri.conf.json, ikonok
  runner/                 Node pipeline runner (a sidecar belépési pontja)
    providers/            LLM, TTS, HeyGen, vidIQ kliensek
    gates/                kapunként egy modul (script, voice, scenes, avatar, review),
                          és build, render, channel
    schema/               JSON sémák (config, project, brief card)
  engine/                 a render lánc (hyperframes, gsap), pinnelt lockfile
  scripts/                build, sidecar letöltés, release
  .github/workflows/      build.yml (Win + Mac), release.yml
```

**Módosítva 2026-09-30 (DECISIONS 48, 49):** az app nem használja Zoltan
brand-frames kánonját (39 archetípus, MOTION, pipeline szkriptek), submodule
nincs. Az app saját részei:

- `engine/`: a render lánc, `package.json` + `package-lock.json` (hyperframes
  0.8.22, gsap 3.14.2). A `scripts/fetch-engine.mjs` build közben
  `app/src-tauri/engine/`-be telepíti, `onnxruntime-node` nélkül (154 MB).
- A könyvtár (jelenettípusok) a HyperFrames nyilvános registryjéből, az app
  saját összerakójával (a registry-próba után).
- Időzítés, mondattábla és a többi pipeline-eszköz: a runner saját kódja
  (`runner/timing/`).

## 4. Adatmodell

Minden helyi. A helyek a Tauri platform-mappái (`app_config_dir`, `app_data_dir`),
Windowson `%APPDATA%`, Macen `~/Library/Application Support`.

### 4.1 `config.json` (nem titkos beállítások)

```json
{
  "schema": 1,
  "ui": { "language": "en" },
  "llm": { "provider": "gemini", "model": "gemini-3.5-flash" },
  "brand": {
    "preset": "blue-professional",
    "logo": "brand/logo.png",
    "overrides": { "primary": "#1e2bfa" }
  },
  "channel": {
    "audience": "...",
    "brandVoice": "...",
    "profile": "...",
    "youtubeUrl": null,
    "landingUrl": null,
    "contentLanguage": "en"
  },
  "narrator": { "provider": "edge-tts", "voice": "en-US-AndrewNeural" },
  "avatar": { "enabled": false },
  "research": { "vidiq": false },
  "defaults": { "scriptTemplate": "ownership", "autopilot": false }
}
```

A kulcsok **nincsenek** benne. Csak az, hogy van-e (`"vidiq": false`).

**Módosítva 2026-10-01 (DECISIONS 67, `docs/identity.md`): két szint.** A
`config.json` schema 2 csak az App szintet tartja (`ui`, `llm` alap,
`projectsDir`, `activeIdentity`, `onboarded`, `defaults.autopilot`). A fenti
többi mező Identity-nként a `<app config dir>/identities/<id>/identity.json`
fájlban él (`runner/schema/identity.schema.json`), mellette az Identity saját
fájljai (`brand/logo`, később a varázslók eredményei). Az Identity `llm`
mezője felülírhatja az App AI-ját (`null`: az App-é). A kapuk az összefésült,
fenti formát kapják (`app/src/lib/identity.ts`). A régi egyfájlos config az
első indításkor átáll: belőle lesz a "My Identity" (`identity.rs`).

### 4.2 Kulcsok

OS kulcstár (`keyring` crate): Windows Credential Manager, macOS Keychain.
Szolgáltatásnév: `ideatovideo.<provider>`, pl. `ideatovideo.gemini`, `ideatovideo.elevenlabs` (DECISIONS 38).
A UI soha nem kapja vissza a kulcsot, csak annyit: be van-e állítva, és
sikerült-e a "Test key".

**Módosítva 2026-10-01:** fiók `default` = App kulcs (minden Identity-é),
fiók `identity-<id>` = egy Identity saját kulcsa. Egy munka az Identity saját
kulcsát használja, ha van, különben az App kulcsot. Hogy melyik Identity-é a
munka, azt a Rust a ONE Video mappájából állapítja meg, nem a felülettől
kapja. Egy kulcson egyszerre egy munka, a helyi nehéz munkák (build, check,
render) egy sorban, ma egyszerre egy (`jobs.rs`).

### 4.3 Project mappa

Egy videó = egy mappa a `Projects/` alatt (alapból a Dokumentumok mappában,
Settings-ben átállítható).

```text
Projects/<Identity mappája>/2026-09-24_how-to-start/   (2026-10-01 óta, DECISIONS 67)
  project.json        állapot, kapuk, választások, az Identity id-je
  brief.json          Video Brief Card (beolvasva vagy az 1. lépésben kitöltve)
  script.md           1. kapu kimenete
  audio/vo.mp3        2. kapu kimenete (+ vo_bgm.mp3)
  audio/stt.json      szó-szintű időzítés
  sentences.json      3. lépés (sentences.mjs)
  words.json
  scenes.json         3. kapu kimenete (jelenet-tábla)
  avatar/             HeyGen klipek (az Avatar lépés kimenete, a build előtt)
  broll/              AI B-roll: broll.json (terv, állapot, költés), pending.json,
                      clips/ (a generált klipek saját példánya; DECISIONS 99)
  build/index.html    gates/build/assemble.mjs
  build/compositions/
  review/contact.png  Preview (kontakt lap)
  out/video-<idő>.mp4 render (az avatar már benne, a HyperFrames rakja rá)
  out/video-<idő>.srt feliratok, .chapters.txt, .publish.json, .comments.txt
  log.txt
```

### 4.4 `project.json`

```json
{
  "schema": 1,
  "id": "2026-09-24_how-to-start",
  "status": "Scripted",
  "language": "en",
  "autopilot": false,
  "gates": {
    "script":  { "state": "approved", "mode": "recommended", "at": "2026-09-24T18:02:00Z" },
    "voice":   { "state": "pending" },
    "scenes":  { "state": "todo" },
    "avatar":  { "state": "skipped", "reason": "no HeyGen key" },
    "review":  { "state": "todo" }
  }
}
```

`status` értékei: `Idea`, `Scripted`, `Voiced`, `Scened`, `Reviewed`,
`Rendered`, `Done`. Kapu `state`: `todo`, `running`, `pending` (jóváhagyásra
vár), `approved`, `skipped`, `failed`. `mode`: `recommended`, `default`, `custom`.

Két további, opcionális mező (DECISIONS 91): `render` (`running`, `done`,
`failed`, idővel, minőséggel, a hiba szövegével), hogy egy elbukott vagy
megszakadt render újraindítás után is látszódjon; és `autopilotRun`, amíg a
"Finish on Autopilot" fut, hogy egy megszakadt Autopilot folytatódjon.

### 4.5 Video Brief Card (`brief.json`, séma v1)

```json
{
  "schema": "video-brief-card/1",
  "title": "How to start a YouTube channel in 2026",
  "promise": "A viewer knows the first three steps and takes the first one today.",
  "audience": "Aspiring entrepreneurs, zero video experience",
  "searchIntent": "how to start a youtube channel",
  "keyword": "start youtube channel",
  "playlist": { "name": "YouTube from zero", "position": 1, "of": 8 },
  "cta": { "text": "Get the free checklist", "landingUrl": "https://..." },
  "scriptTemplate": "ownership",
  "language": "en",
  "targetLengthMin": 8
}
```

Kötelező mező: `schema`, `title`. A többi opcionális, hiányzó mezőt az IdeaToVideo
Recommended módban kitölt. A Tervező app ugyanezt a sémát írja; a séma
verziója a `schema` mezőben van, így a két app külön fejlődhet.

## 5. LLM réteg

Egyetlen OpenAI-kompatibilis kliens (`POST {baseUrl}/chat/completions`).
A szolgáltató csak `baseUrl` + kulcs + modellnév.

| Sorrend | Szolgáltató | baseUrl | Alapmodell (javaslat) |
|---|---|---|---|
| 1 | Gemini (default, ingyenes tier) | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.5-flash` |
| 2 | OpenRouter | `https://openrouter.ai/api/v1` | user választ |
| 3 | Claude | `https://api.anthropic.com/v1/` | `claude-sonnet-5` |
| 4 | ChatGPT (OpenAI API) | `https://api.openai.com/v1` | user választ |
| 5 | DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| 6 | Grok (xAI) | `https://api.x.ai/v1` | user választ |

A modellnevek a Settings-ben szerkeszthetők, mert gyorsan változnak. Az első
indításkor a "Test key" egy rövid hívással ellenőriz.

Prompt-sablonok a `runner/gates/*/prompt.md` fájlokban, a kánonból levezetve
(script: Ownership Framework + Brand Voice + Audience; jelenet-tábla: CATALOG.md
+ MOTION szabályok + max 6 szó). A válasz minden LLM kapunál **JSON**, séma
szerint validálva; ha nem valid, legfeljebb két javító hívás (DECISIONS 91),
utána hiba a UI-ban. A jelenet-táblánál a csak ízlésbeli eltérés (ugyanaz a
komponens kétszer egymás után, egy kicsit hosszabb jelenet) a javítások után
figyelmeztetés, nem hiba.

Hibakezelés (DECISIONS 91): 429 (kvóta), 5xx és hálózati hiba esetén
modellenként 3 gyors próba, utána a szolgáltató többi modellje, és ha mind
foglalt, várakozás és új kör (15, 30, 45, 60 mp, összesen kb. 3 perc). A
várakozást a haladásjelző kiírja ("Gemini is busy (HTTP 503). Trying again in
30 s, round 2 of 4."). Csak utána érthető üzenet. A "Test key" nem vár. A hang
(Gemini TTS, ElevenLabs) és a HeyGen ugyanígy türelmes (kb. 3 perc hívásonként).

## 6. A menet megvalósítása

**Módosítva 2026-10-06 (DECISIONS 85, 96):** a menet a UI tabjai szerint;
a kapuk sorrendje a kódban (`runner/project.mjs` `GATES`): script, voice,
scenes, avatar, review. Az avatar a Preview előtt van, mert a build teszi a
klipeket a videóba (a régi "avatar a render után, ffmpeg-gel" terv nem épült).

| Lépés (tab) | Modul | Mit hív | Kimenet |
|---|---|---|---|
| 1. Script | `gates/script` | LLM | `script.md`, `script.json` |
| 2. Hang, zene | `gates/voice` | ElevenLabs (alap: Eleven v4) vagy Gemini TTS, ffmpeg (ducking, -14 LUFS) | `audio/vo_bgm.mp3`, `audio/stt.json` |
| (mondattábla) | `runner/timing/sentences.mjs` | nincs | `sentences.json`, `words.json` |
| 3. Scenes (jelenet-tábla) | `gates/scenes` | LLM + a könyvtár szerepei (`roles.mjs`) | `scenes.json` |
| 4. Avatar (opcionális) | `gates/avatar` | HeyGen API (átlátszó WebM) | `avatar/` |
| 5. Preview: build | `gates/build/assemble.mjs` | nincs | `build/index.html` |
| 5. Preview: lint, check | `gates/build/index.mjs` | `hyperframes lint/check` (a kamera-burkoló nélküli lapon) | 0 hiba a feltétel |
| 5. Preview: kontakt lap | `gates/review` | `hyperframes snapshot` | `review/contact.png` |
| 6. Your video: render | `gates/render` | `hyperframes render` | `out/video-<idő>.mp4` |
| 6. Your video: feliratok, fejezetek, publikálási adat | `gates/render/export.mjs`, `publish.mjs` | a `words.json`-ból | `.srt`, `.chapters.txt`, `.publish.json` |

**Szó-időzítés hang után:** ElevenLabs esetén a TTS válasz időbélyegeiből,
Gemini TTS esetén mondatonkénti felolvasással és a mondatok hosszából. Mindkettő
a `sentences.mjs` által várt `{ words:[{text,start,end,type}] }` formára
alakítva.

**Autopilot:** ugyanez a menet, a `pending` állapot kimarad, minden kapu
`recommended` módban fut. Hiba esetén megáll, és a hibás kapun nyílik meg.

**Megszakítás és folytatás:** a `project.json` a forrás. Az app újraindítás
után a legutolsó nem `approved` kapunál folytat. Egy kapu újrafuttatása
érvényteleníti a későbbi kapukat. Egy `running` kapu, amin a Rust mag szerint
már nem dolgozik semmi (`liveProjects`), `failed` lesz "Interrupted" üzenettel.
A megszakadt Autopilot a videó megnyitásakor magától folytatódik; ami már
elkészült és jóváhagyásra vár, azt jóváhagyja, nem csinálja újra.

**Megbízható futás (DECISIONS 91):**
- Minden runner-futás egy folyamatfában (Windows Job Object, macOS
  folyamatcsoport): a Stop, az őrkutya és a kilépés a Chrome-ot és az
  ffmpeg-et is leállítja.
- Checkin (DECISIONS 92): a mag 15 mp-enként megnézi, beszél-e a runner és
  dolgozik-e a folyamatfája; a sáv kiírja: working, waiting for the service,
  seems stuck. Az app soha nem állít le magától egy lépést, csak a Stop.
- A runner észreveszi, ha a gép aludt (óraugrás), és kiírja.
- A hang kész blokkjai egy elbukott futás után megmaradnak
  (`audio/blocks-cache/`), az újrafuttatás csak a hiányzót olvassa fel.
- A HeyGen megrendelt videóinak azonosítója `avatar/pending.json`-ba kerül;
  egy elbukott vagy leállított futás újraindítva átveszi őket, nem rendel
  újra.
- A `project.json` írása egyedi ideiglenes fájllal és rövid újrapróbálással
  (Windows fájlzár).
- Settings, App, General, "Export diagnostics": egy zip a naplóval, a
  beállításokkal és minden ONE Video állapotával, kulcs, hang, videó és
  script szöveg nélkül.

## 7. Integrációk

| Szolgáltatás | Mire | Megjegyzés |
|---|---|---|
| ElevenLabs | Narrator Voice + időbélyegek; zene (ElevenLabs Music) | opcionális. Alap modell 2026-10-06 óta: Eleven v4 (DECISIONS 96) |
| Gemini TTS | ingyenes Narrator Voice a Gemini kulccsal | az Edge TTS helyett (nem épült) |
| HeyGen | avatar klip (natív alfa webm) | opcionális, a user kreditje |
| HeyGen Video 1 | AI B-roll klip (`POST /v3/models/videos`, 480p, 768p, 2k) | opcionális, alapból kikapcsolva, a meglévő HeyGen kulccsal, plafon videónként (DECISIONS 95, 98, 99, `docs/ai-broll.md`) |
| vidIQ | kulcsszó adat | opcionális. Nyitott, hogy van-e user-kulcsos API (lásd 12. pont). |
| YouTube | csak a csatorna URL, publikus adat | nincs OAuth a v1-ben |

## 8. Render és a headless Chrome

A `hyperframes` headless Chrome-mal renderel.

**Döntés (2026-09-24, DECISIONS 25):** a render Chrome.

1. **Alap:** a hyperframes által letöltött, rögzített verziójú chrome-headless-shell
   (ma 152.0.7977.30), első indításkor (`hyperframes browser ensure`, mérve 31-42
   mp és 282 MB). Nem frissül magától, így egy böngészőfrissítés nem töri el a
   rendert. A hely az app saját helyi adatmappája: a runner a hyperframes
   gyerekfolyamatainak a `<app_local_data>/hyperframes-home` mappát adja otthonnak
   (`HOME`, `USERPROFILE`), így a böngésző és minden hyperframes gyorsítótár ott
   van, nem a user `~/.cache` mappájában (`runner/tools.mjs`).
2. **Tartalék:** a gépen lévő Google Chrome, ha a letöltés nem sikerül (vagy
   Windows ARM-on, ahol nincs rögzített shell). A runner a választott böngészőt
   mindig kifejezetten adja át (`HYPERFRAMES_BROWSER_PATH`), a hyperframes soha
   nem választ magától.
3. **Edge nem.** Mérve teljes értékű lenne, de Zoltan döntése szerint kimarad.

Mérés (a letöltött shell, a rendszer Chrome és az Edge egyforma gyors és ugyanazt
a képet adja): `docs/phase-0.md`.

## 9. Biztonság és adatvédelem

- Kulcsok csak az OS kulcstárában. Logba, `config.json`-ba, hibaüzenetbe soha.
- Nincs telemetria, nincs analytics, nincs "phone home" (a frissítés-ellenőrzés
  kivétel: a GitHub Releases manifest lekérése, személyes adat nélkül).
- Kimenő hívás csak a user által beállított szolgáltatókhoz.
- A Tauri capability-k szűkítve: fájlrendszer csak a Projects és az app mappák,
  shell csak a saját sidecarok.
- Import (Brief Card, preset) séma-validálva, a fájlból jövő szöveg adatként
  kezelve, soha nem utasításként.

## 10. Build, release, frissítés

- `build.yml`: PR-re csak Windows build; a macOS build kézzel indul
  (`gh workflow run build -f platforms=both`), a 3. és 4. fázis után, a
  kiadás előtt (DECISIONS 95). GitHub Actions percet fogyaszt: előbb Zoltan.
- `release.yml`: tag-re (`v0.x.y`) telepítő a GitHub Releases-re + updater
  manifest.
- Sidecarok: ffmpeg statikus build és Node bináris platformonként, a
  `scripts/fetch-sidecars` tölti le, ellenőrzőösszeggel.
- Aláírás: pilotban nincs. Kiadáskor Apple Developer ID + notarizáció, Windowson
  Azure Trusted Signing. A CI-ban titkos változóként, a repóban soha.

## 11. Tesztelés

| Szint | Mi | Hol |
|---|---|---|
| Parity | a Node szkriptek kimenete azonos a PowerShell-ével (0. fázis) | brand-frames, egyszeri |
| Unit | runner (`npm test`, Node) és Rust mag (`cargo test`) | runner, `app/src-tauri` |
| Regress | (a 39 archetípus a D út óta nincs az appban, DECISIONS 48) | brand-frames, nem az app része |
| E2E | egy rövid mintavideó végig, mock LLM-mel és csendes hanggal (`npm run e2e`) | helyben |
| Pilot | egy barát, segítség nélkül | kézi, 3. fázis |

## 12. Nyitott technikai kérdések

1. **vidIQ:** eldőlt (DECISIONS 42): MCP szerver user kulccsal, opcionális.
   Eredeti kérdés: van-e user-kulcsos, nyilvános API? Ha nincs, a v1-ben kimarad, és
   a kulcsszó kézzel vagy a Brief Cardból jön.
2. **Ingyenes TTS tartalék:** eldőlt, a Gemini TTS a user Gemini kulcsával;
   az Edge TTS nem épült.
3. **Headless Chrome:** eldőlt (DECISIONS 25): letöltött, rögzített Chrome,
   tartalék a rendszer Google Chrome, Edge nem. Lásd 8. pont.
4. **Node sidecar formája:** eldőlt (DECISIONS 26): csomagolt Node +
   lecsupaszított `node_modules`, SEA nem.
5. **UI keretrendszer:** eldőlt (DECISIONS 33): Svelte 5, SvelteKit SPA.
6. **Zene:** honnan jön ingyenes, licenctiszta háttérzene (a kánon `AUDIO.md`
   receptje szerint).

## 13. 0. fázis állapota

A PowerShell pipeline Node-ra portolva a `brand-frames` repóban, a régi
szkriptek mellé (`.mjs`). Minden szkript kimenete a régivel összevetve.

2026-09-24: kész. A C2C videó egy szimulált tiszta gépen végigment a Node
láncon (`scripts/phase0/e2e.mjs`). A 12.3 és 12.4 kérdésre mérésen alapuló
javaslat van, Zoltan döntésére vár. Mérések, javaslatok, találatok:
`docs/phase-0.md`.
