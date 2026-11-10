# STATUS: RecCut

Frissítve: 2026-11-10 (megbízhatóság, saját repó, DECISIONS 186)

End goal: egy felvételből kész 16:9 MP4 és Publishing Card, a saját gépen, megbízhatóan, és mindig látszik, mi történik.

## Now (2026-11-10)

- **Kész és telepítve:** RecCut a saját nevével és ikonjával, a hat "What did you record?" választással, a buborék kijelöléssel és az AI avatar buborékkal.
- **Megbízhatóság:** a felső sor mindig mondja, fut-e valami és lecsukható-e a gép; alvás után az app megmondja, mi a teendő; Go on from where it stopped gomb; lemezhely ellenőrzés minden nehéz lépés előtt; sérült felvételre egy érthető mondat; a buborék kijelölés első kockája most már látszik (eddig nem jelent meg); a diagnosztikai zip mindkét naplót tartalmazza.
- **Tesztek:** lásd a gyökér `STATUS.md` legfrissebb "Now" részét.
- **Nem próbáltam:** valódi HeyGen avatar buborék (pénzbe kerül), valódi külső lip sync klip, saját Loom fájl, Mac build.

## Következő lépés

1. Zoltán kipróbálja egy saját felvétellel, mind a hat választással ahol van hozzá fájlja.
2. Mac: az első build egy MacBookon, Claude Code-dal (`reccut/INSTALL.md`, 3. rész).

## Ha új sessionben folytatod

Olvasd el: ez a fájl, `reccut/DECISIONS.md`, a gyökér `CLAUDE.md`. A RecCut kódja: `app/src/lib/editor/`, `runner/recorded/`, `app/src-tauri/tauri.editor.conf.json`.
