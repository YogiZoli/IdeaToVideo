# SPEC: Studio (munkanév)

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
packaged-video-creator/
  PRD.md  SPEC.md  DECISIONS.md  STATUS.md
  app/                    Tauri projekt
    src/                  UI (TypeScript)
    src-tauri/            Rust core, tauri.conf.json, ikonok
  runner/                 Node pipeline runner (a sidecar belépési pontja)
    providers/            LLM, TTS, HeyGen, vidIQ kliensek
    gates/                kapunként egy modul (script, voice, scenes, review, avatar)
    schema/               JSON sémák (config, project, brief card)
  vendor/brand-frames/    a kánon, pinnelt commit (git submodule, privát)
  scripts/                build, sidecar letöltés, release
  .github/workflows/      build.yml (Win + Mac), release.yml
```

A `brand-frames` (blokkok, MOTION szabályok, pipeline szkriptek) **submodule**,
pinnelt committal. A kánon egy helyen él, az app csak egy rögzített verzióját
csomagolja. Kánon-frissítés = submodule léptetése + regress teszt + új release.

## 4. Adatmodell

Minden helyi. A helyek a Tauri platform-mappái (`app_config_dir`, `app_data_dir`),
Windowson `%APPDATA%`, Macen `~/Library/Application Support`.

### 4.1 `config.json` (nem titkos beállítások)

```json
{
  "schema": 1,
  "ui": { "language": "en" },
  "llm": { "provider": "gemini", "model": "gemini-3.8-flash" },
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

### 4.2 Kulcsok

OS kulcstár (`keyring` crate): Windows Credential Manager, macOS Keychain.
Szolgáltatásnév: `studio.<provider>`, pl. `studio.gemini`, `studio.elevenlabs`.
A UI soha nem kapja vissza a kulcsot, csak annyit: be van-e állítva, és
sikerült-e a "Test key".

### 4.3 Project mappa

Egy videó = egy mappa a `Projects/` alatt (alapból a Dokumentumok mappában,
Settings-ben átállítható).

```text
Projects/2026-09-24_how-to-start/
  project.json        állapot, kapuk, választások
  brief.json          Video Brief Card (beolvasva vagy az 1. lépésben kitöltve)
  script.md           1. kapu kimenete
  audio/vo.mp3        2. kapu kimenete (+ vo_bgm.mp3)
  audio/stt.json      szó-szintű időzítés
  sentences.json      3. lépés (sentences.mjs)
  words.json
  scenes.json         3. kapu kimenete (jelenet-tábla)
  build/index.html    build-video.mjs + stamp-timing.mjs
  build/compositions/
  review/contact.png  4. kapu (kontakt lap)
  out/video.mp4       render
  out/final.mp4       avatarral (5. kapu)
  out/video.srt       feliratok
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
    "review":  { "state": "todo" },
    "avatar":  { "state": "skipped", "reason": "no HeyGen key" }
  }
}
```

`status` értékei: `Idea`, `Scripted`, `Voiced`, `Scened`, `Reviewed`,
`Rendered`, `Done`. Kapu `state`: `todo`, `running`, `pending` (jóváhagyásra
vár), `approved`, `skipped`, `failed`. `mode`: `recommended`, `default`, `custom`.

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

Kötelező mező: `schema`, `title`. A többi opcionális, hiányzó mezőt a Studio
Recommended módban kitölt. A Tervező app ugyanezt a sémát írja; a séma
verziója a `schema` mezőben van, így a két app külön fejlődhet.

## 5. LLM réteg

Egyetlen OpenAI-kompatibilis kliens (`POST {baseUrl}/chat/completions`).
A szolgáltató csak `baseUrl` + kulcs + modellnév.

| Sorrend | Szolgáltató | baseUrl | Alapmodell (javaslat) |
|---|---|---|---|
| 1 | Gemini (default, ingyenes tier) | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-3.8-flash` |
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
szerint validálva; ha nem valid, egy javító hívás, utána hiba a UI-ban.

Hibakezelés: 429 (kvóta) és 5xx esetén exponenciális visszalépés, 3 próba,
utána érthető üzenet ("A Gemini ingyenes kvóta elfogyott. Várj, vagy válts
szolgáltatót a Settings-ben.").

## 6. A menet megvalósítása

| Lépés | Modul | Mit hív | Kimenet |
|---|---|---|---|
| 1. Script (1. kapu) | `gates/script` | LLM | `script.md` |
| 2. Hang, zene (2. kapu) | `gates/voice` | ElevenLabs vagy edge TTS, ffmpeg (ducking, -14 LUFS) | `audio/vo_bgm.mp3`, `audio/stt.json` |
| 3. Mondattábla | `sentences.mjs` | nincs | `sentences.json`, `words.json` |
| 4. Jelenet-tábla (3. kapu) | `gates/scenes` | LLM + CATALOG.md | `scenes.json` |
| 5. Build | `build-video.mjs`, `stamp-timing.mjs` | nincs | `build/index.html` |
| 6. Lint, check | `image-audio-lint.mjs`, `hyperframes lint/check` | hyperframes CLI | 0 hiba a feltétel |
| 7. Kontakt lap (4. kapu) | `gates/review` | `hyperframes snapshot` | `review/contact.png` |
| 8. Render | `hyperframes render` | hyperframes CLI | `out/video.mp4` |
| 9. Avatar (5. kapu) | `gates/avatar`, `avatar-composite.mjs` | HeyGen API, ffmpeg | `out/final.mp4` |
| 10. Feliratok | `gates/captions` | a `words.json`-ból | `out/video.srt` |

**Szó-időzítés hang után:** ElevenLabs esetén a TTS válasz időbélyegeiből (vagy
az ElevenLabs STT-ből), edge TTS esetén a word boundary eseményekből. Mindkettő
a `sentences.mjs` által várt `{ words:[{text,start,end,type}] }` formára
alakítva.

**Autopilot:** ugyanez a menet, a `pending` állapot kimarad, minden kapu
`recommended` módban fut. Hiba esetén megáll, és a hibás kapun nyílik meg.

**Megszakítás és folytatás:** a `project.json` a forrás. Az app újraindítás
után a legutolsó nem `approved` kapunál folytat. Egy kapu újrafuttatása
érvényteleníti a későbbi kapukat.

## 7. Integrációk

| Szolgáltatás | Mire | Megjegyzés |
|---|---|---|
| ElevenLabs | Narrator Voice + időbélyegek | opcionális |
| Edge TTS (Microsoft) | ingyenes Narrator Voice | Node könyvtárral a sidecarban, Python nélkül. Nem hivatalos API, ezért egy második ingyenes tartalék is kell (nyitott kérdés). |
| HeyGen | avatar klip (natív alfa webm) | opcionális, a user kreditje |
| vidIQ | kulcsszó adat | opcionális. Nyitott, hogy van-e user-kulcsos API (lásd 12. pont). |
| YouTube | csak a csatorna URL, publikus adat | nincs OAuth a v1-ben |

## 8. Render és a headless Chrome

A `hyperframes` headless Chrome-mal renderel.

**Döntés (2026-09-24, DECISIONS 25):** a render Chrome.

1. **Alap:** a hyperframes által letöltött, rögzített verziójú chrome-headless-shell
   (ma 152.0.7977.30), első indításkor, a felhasználói adatmappába (`hyperframes
   browser ensure`, mérve 31 mp és 282 MB). Nem frissül magától, így egy
   böngészőfrissítés nem töri el a rendert.
2. **Tartalék:** a gépen lévő Google Chrome, ha a letöltés nem sikerül. Az app a
   `HYPERFRAMES_BROWSER_PATH` változóval adja át, mert Windowson a hyperframes
   magától nem találja meg.
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

- `build.yml`: minden push-ra Windows és macOS build, a parity és a regress
  teszt lefut.
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
| Unit | sémák, `data-sent` feloldás, LLM JSON validálás | runner |
| Regress | a 39 archetípus vizuálisan nem változott (`regress.mjs`) | brand-frames, minden kánon-léptetésnél |
| E2E | egy rövid mintavideó végig, mock LLM-mel és edge TTS-sel | CI, mindkét platform |
| Pilot | egy barát, segítség nélkül | kézi, 3. fázis |

## 12. Nyitott technikai kérdések

1. **vidIQ:** van-e user-kulcsos, nyilvános API? Ha nincs, a v1-ben kimarad, és
   a kulcsszó kézzel vagy a Brief Cardból jön.
2. **Ingyenes TTS tartalék** az Edge TTS mellé (nem hivatalos API, bármikor
   változhat).
3. **Headless Chrome:** eldőlt (DECISIONS 25): letöltött, rögzített Chrome,
   tartalék a rendszer Google Chrome, Edge nem. Lásd 8. pont.
4. **Node sidecar formája:** eldőlt (DECISIONS 26): csomagolt Node +
   lecsupaszított `node_modules`, SEA nem.
5. **UI keretrendszer:** sima TypeScript vagy Svelte. Az 1. fázis elején dől el.
6. **Zene:** honnan jön ingyenes, licenctiszta háttérzene (a kánon `AUDIO.md`
   receptje szerint).

## 13. 0. fázis állapota

A PowerShell pipeline Node-ra portolva a `brand-frames` repóban, a régi
szkriptek mellé (`.mjs`). Minden szkript kimenete a régivel összevetve.

2026-09-24: kész. A C2C videó egy szimulált tiszta gépen végigment a Node
láncon (`scripts/phase0/e2e.mjs`). A 12.3 és 12.4 kérdésre mérésen alapuló
javaslat van, Zoltan döntésére vár. Mérések, javaslatok, találatok:
`docs/phase-0.md`.
