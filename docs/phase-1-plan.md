# 1. fázis: terv és állapot

Kimenet (PRD 13): **telepíthető app, ami scriptet ír.** Tauri váz, onboarding,
config és kulcstár, LLM integráció.

Branch: `phase-1`. A fázis végén PR a main felé, utána Zoltan jóváhagyása.

**Állapot 2026-09-30: kész.** A részletek: `STATUS.md`, DECISIONS 38-47.

## Kész (2026-09-24)

- `runner/` (Node sidecar, függőség nélkül), 32 unit teszt zöld (`npm test`):
  - `main.mjs`: parancsok JSON-nal a stdin-en, JSON sorok a stdout-on
    (`progress`, `result`, `error`). Parancsok: `providers`, `validate-config`,
    `validate-brief`, `test-llm`, `test-service`, `create-project`,
    `list-projects`, `load-project`, `write-script`, `save-script`, `approve-gate`.
    A kulcs csak a `STUDIO_API_KEY` env változóban jön, soha nem kerül ki.
  - `providers/llm.mjs`: egy OpenAI-kompatibilis kliens, 6 szolgáltató (SPEC 5),
    3 próba 429/5xx esetén, érthető hibaüzenetek, a kulcs kitakarva.
  - `providers/keys.mjs`: ElevenLabs és HeyGen "Test key".
  - `gates/script/`: Ownership Framework prompt (OPEN, TEACH, OWN), JSON válasz
    séma- és stílus-ellenőrzéssel (csak vessző és pont a narrációban), egy javító
    hívás, `script.json` + `script.md`.
  - `project.mjs`: projekt mappa (SPEC 4.3), `project.json` (SPEC 4.4), a későbbi
    kapuk érvénytelenítése újrafuttatáskor.
  - `schema/`: config, project, brief card, script séma + kis validátor.
  - A tiltott nevek tesztje (DECISIONS és memória: harmadik fél módszer-nevei).
- `app/`: Tauri 2 + SvelteKit (SPA, adapter-static) váz a `create-tauri-app`
  sablonból, `identifier` `com.zoltangero.studio`. Még a sablon tartalma.

## Hátravan, ebben a sorrendben

1. **Build eszközök ellenőrzése.** `rustc --version`, és hogy megvan-e az MSVC
   `link.exe` és a Windows SDK (`C:/Program Files (x86)/Windows Kits/10/Lib`).
   Ha nincs, a Visual Studio Installerben a Build Tools 2026-hoz a "Desktop
   development with C++" munkacsomag kell (látható ablakkal, nem `--passive`).
2. **Node sidecar.** `scripts/fetch-sidecars.mjs`: a Node bináris letöltése a
   nodejs.org-ról, rögzített verzióval (a gépen ma 24.16.0), SHA256 ellenőrzéssel,
   `app/src-tauri/binaries/node-<target-triple>[.exe]` néven (Tauri `externalBin`).
   A `runner/` a bundle `resources` része. A user nem telepít Node-ot (DECISIONS 26).
3. **Rust mag** (`app/src-tauri/src/`):
   - `config.rs`: `config.json` az `app_config_dir`-ben; mentés előtt a runner
     `validate-config` parancsa ellenőriz; atomikus írás.
   - `keys.rs`: `keyring` crate, szolgáltatásnév `studio.<provider>` (SPEC 4.2).
     Parancsok: `set_key`, `key_status` (csak igen/nem), `delete_key`. A kulcs
     soha nem megy vissza a UI-ba. Engedélyezett nevek listája: a 6 LLM +
     `elevenlabs`, `heygen`, `vidiq`.
   - `runner.rs`: a sidecar indítása (`current_exe` mellől a `node`, a
     `resource_dir`-ből a `runner/main.mjs`), a kulcs a keychainből az env-be
     (`STUDIO_API_KEY`), `HYPERFRAMES_NO_TELEMETRY=1`, Windowson `CREATE_NO_WINDOW`.
     A `progress` sorok Tauri eventként mennek a UI-nak. Parancs-fehérlista.
   - Alap projektmappa: `Dokumentumok/Studio Projects` (Settings-ben állítható).
   - Szigorú CSP a `tauri.conf.json`-ban; a UI semmilyen külső címet nem hív,
     minden kimenő hívás a runnerből megy.
   - `productName` "Studio" (munkanév), ablak kb. 1100x760.
4. **UI (Svelte 5)**, angolul (DECISIONS 7):
   - Onboarding varázsló a PRD 5 szerinti 12 lépéssel, minden lépésen: kitölti /
     **Use recommended** / **Skip, use default**, kulcsos lépésen **Test key**.
     Az AI kulcs kötelező. A "subscription is not an API key" figyelmeztetés.
     A Brand lépés: preset név (alap `blue-professional`) + logó fájl; a galéria a
     2. fázisban jön (DECISIONS 23, 24). Az Audience és a Brand Voice "Use
     recommended" gombja egy rövid LLM hívás (új runner parancs kell hozzá).
     A vidIQ kulcs csak eltárolva (SPEC 12.1 nyitott, lásd lent). Az "Import from
     Planner" lépés ma csak Skip (a Planner app még nincs).
   - Settings: ugyanezek a mezők bármikor szerkeszthetők.
   - Projects lista + New video (téma, hossz, opcionális Video Brief Card JSON
     import `validate-brief`-fel).
   - Projekt nézet, 1. kapu: Recommended (AI írja), Custom (kézi szerkesztés,
     `save-script`), Approve. A státusz és a kapu állapota látszik.
5. **Tesztek:** runner (`npm test`), Rust unit tesztek (`cargo test`: config,
   kulcsnév-fehérlista, parancs-fehérlista), és egy build: `npm run tauri build`
   Windowson NSIS telepítőt ad.
6. **Kézi elfogadás Zoltannal:** telepíti a buildet, végigmegy az onboardingon a
   saját Gemini kulcsával (azt csak ő írja be, soha nem kerül fájlba vagy chatbe),
   és ír egy scriptet. Ez a fázis kilépő feltétele.
7. **Mérések, amik ebbe a fázisba kerültek:**
   - ffmpeg build (DECISIONS 30): kisebb statikus build x264, aac, vp9 dekódolás,
     psnr szűrő; méret és GPL licenc. Javaslat Zoltannak, döntés nélkül.
   - SPEC 12.1 vidIQ: van-e user-kulcsos nyilvános API. Ha nincs, a v1-ből kimarad.
8. **CI:** `.github/workflows/build.yml` Windows + macOS (SPEC 10). A privát repó
   Actions perckerete véges, a macOS 10x szorzóval fogy: csak PR-re és kézi
   indításra fusson, és ezt Zoltannak jelezni kell, mielőtt bekapcsol.
9. Fázis vége: STATUS, DECISIONS, Drive tükör, PR, megállás.

## Nem ebben a fázisban

brand-frames bekötése (saját brand nélkül), presetek, TTS, jelenet-tábla, render,
avatar: 2. fázis. Aláírás, updater, nyilvános telepítő repó: 4. fázis.
