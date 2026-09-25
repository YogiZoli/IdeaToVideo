# STATUS: Studio (munkanév)

Frissítve: 2026-09-25

End goal: helyben telepíthető asztali app, ami egy YouTube videót végigvisz ötlettől kész MP4-ig, a user saját gépén és kulcsaival, a HyperFrames motorral és Zoltan blokk-könyvtárával.

Fázisok (PRD 13): 0 pipeline Node-ra (**kész**, main) · 1 Tauri váz, onboarding, config és kulcstár, LLM (**folyamatban**) · 2 teljes 5 kapus menet a UI-ban · 3 pilot · 4 kiadás.

## Hol tartunk

**1. fázis, branch `phase-1`** (pusholva, még nincs PR). A terv és a lépések: `docs/phase-1-plan.md`.
- Kész: a Node runner (`runner/`, 32 unit teszt zöld: `npm test`), és a Tauri 2 + SvelteKit váz (`app/`, még a sablon tartalma).
- A gépen: Rust 1.98.1 (MSVC) telepítve, WebView2 megvan, Node 24.16.0 megvan. **A Visual Studio Build Tools 2026 C++ része félkész** (hiányzik az MSVC `link.exe` és a Windows SDK). Zoltan a Visual Studio Installerből pótolja: Modify, "Desktop development with C++". Enélkül a Rust mag nem fordul.

A 0. fázis: `docs/phase-0.md`. A kilépő teszt (`scripts/phase0/e2e.mjs`) a brand-frames `db476c7`-re van állítva, és zöld.

brand-frames (kánon): main `3efb25f`, nyitott PR nincs. Ebben benne van: Node dokumentáció, `package-lock.json`, avatar hang javítás, `image-audio-lint` a mountolt jelenetekre, a kötőjeles szavak és a `.subcap` kizárás, és az összes portolt `.ps1` törölve (csak Node).

## Következő lépés

1. Ellenőrizni, hogy megvan-e az MSVC `link.exe` és a Windows SDK (`docs/phase-1-plan.md`, 1. lépés). Ha nincs, Zoltannal pótolni.
2. Utána a `docs/phase-1-plan.md` 2. lépésétől: Node sidecar letöltő, Rust mag, UI, tesztek, telepítő build, kézi elfogadás Zoltannal.

## Zoltan döntésére vár

Semmi. A nyitott technikai kérdések (ffmpeg build, vidIQ API) az 1. fázis mérései között vannak, javaslattal jönnek.

## Hogyan indul egy új session

A `docs/SESSION-PROMPT.md` promptja, a táblázat szerinti modellel és effort-tal.

Forrás: Drive `10_HyperFrames_Shippability_and_Documentation_Review`
https://docs.google.com/document/d/1fOLZnrikPn-A_2tl2XNZPJnsdO9AOd1XpUY2u4VF4_4/edit

Drive tükör: https://docs.google.com/document/d/19PougSc18s97PBKP6mr_CnQUnEulNgkfq1eckCPDqJI/edit
