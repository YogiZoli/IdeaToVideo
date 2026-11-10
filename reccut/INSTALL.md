# RecCut telepítése

Két út van: a kész telepítő (egyszerű), vagy a forrásból építés (új gépen, vagy ha nincs kész telepítő).

## 1. Új gépre költözés: a beállítások és videók átvitele

A régi gépen, mielőtt lecseréled:

1. Nyisd meg az IdeaToVideo-t, Settings, Backup. Válassz egy mappát (például Google Drive), és készíts mentést mindenről. Ebben vannak az Identityk, a Footage, a fotók és a videók. RecCut ugyanezt használja, neki külön mentés nem kell.
2. Írd fel, milyen kulcsaid vannak (Gemini, ElevenLabs, HeyGen, vidIQ, Pixabay). **A kulcsok soha nincsenek a mentésben,** az új gépen újra be kell írni őket.

Az új gépen:

1. Telepítsd az IdeaToVideo-t és a RecCutot (lent).
2. Indítsd az IdeaToVideo-t. Az első képernyőn: Restore from a backup, és válaszd a mentés mappáját.
3. Settings, Connections: írd be újra a kulcsokat.
4. Indítsd a RecCutot: mindent lát, amit az IdeaToVideo visszaállított.

## 2. Windows

### Kész telepítővel

1. Futtasd a `RecCut_0.1.0_x64-setup.exe` fájlt (és ugyanígy az `IdeaToVideo_0.1.0_x64-setup.exe`-t).
2. Ha a Windows SmartScreen figyelmeztet ("Windows protected your PC"): More info, majd Run anyway. Ez azért van, mert a telepítő nincs aláírva.
3. A Start menüben ott lesz: RecCut.

### Forrásból építés (Windows)

Egyszer kell telepíteni: Git, Node.js 24 (nodejs.org, LTS), Rust (rustup.rs, a Visual Studio C++ Build Tools-szal együtt, amit a rustup felajánl).

PowerShellben, soronként:

```powershell
cd C:/Users/<te>/projects
git clone https://github.com/YogiZoli/RecCut.git
git clone https://github.com/YogiZoli/design-system.git
cd RecCut/app
npm ci
npm run tauri -- build --bundles nsis --config src-tauri/tauri.editor.conf.json
```

A `design-system` mappának a `RecCut` mellett kell lennie, különben a build megáll. Az első build körülbelül 15 perc. Az eredmény:

```text
C:/Users/<te>/projects/RecCut/app/src-tauri/target/release/bundle/nsis/RecCut_0.1.0_x64-setup.exe
```

Az IdeaToVideo ugyanebből a mappából, `--config` nélkül:

```powershell
npm run tauri -- build --bundles nsis
```

## 3. MacBook

Fontos tudni: **Macre még nem készült kipróbált RecCut.** A kód úgy van megírva, hogy macOS-en is fusson (Phase 9 a tervben), de valódi Macen még senki nem futtatta. Az első Mac build az a pillanat, amikor ez kiderül. Claude Code-dal érdemes csinálni a Macen, mert ha valami Mac-specifikus elakad, ott helyben javítható.

### Egyszer kell telepíteni (Terminalban)

1. Xcode Command Line Tools:

```bash
xcode-select --install
```

2. Homebrew (brew.sh oldalon az egysoros parancs), utána Node és Git:

```bash
brew install node@24 git
```

3. Rust:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Építés

```bash
mkdir -p ~/projects && cd ~/projects
git clone https://github.com/YogiZoli/RecCut.git && git clone https://github.com/YogiZoli/design-system.git
cd RecCut/app && npm ci
npm run tauri -- build --bundles dmg --config src-tauri/tauri.editor.conf.json
```

Az eredmény: `~/projects/RecCut/app/src-tauri/target/release/bundle/dmg/RecCut_0.1.0_aarch64.dmg`. Az IdeaToVideo ugyanígy, `--config` nélkül.

### Az első indítás Macen

1. Nyisd meg a `.dmg`-t, húzd a RecCutot az Applications mappába.
2. Az app nincs aláírva, ezért az első indításnál a macOS azt mondja, hogy nem nyitható meg. Ilyenkor: System Settings, Privacy & Security, lent "RecCut was blocked", Open Anyway. Vagy Terminalban:

```bash
xattr -dr com.apple.quarantine /Applications/RecCut.app
```

3. A kulcsok Macen a Kulcskarikába (Keychain) kerülnek. Az első használatnál a macOS megkérdezheti, hogy engedi-e: Always Allow.
4. A beállítások helye Macen: `~/Library/Application Support/app.ideatovideo.desktop/` (közös), a RecCut saját naplója: `~/Library/Application Support/app.reccut.desktop/logs/`.

### Mac és lecsukás

Macen is igaz: amíg a felső sor azt írja, hogy Working, ne csukd le. A RecCut ébren tartja a gépet, de a fedél lecsukása így is elaltatja.

## 4. Tesztek (fejlesztéshez)

A repo gyökeréből:

```text
npm test                 az összes gyors teszt, kb. egy perc
npm run audit:quick      minden motor és hibaeset, render nélkül, kb. 30 perc, 0 USD
node scripts/phase2/recorded-e2e.mjs --work <mappa> --preset screen-recording     egy valódi felvétel végig, renderrel
```
