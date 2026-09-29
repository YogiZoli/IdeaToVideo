# Session prompt (állandó, minden új Claude Code chathez)

Ezt a blokkot kell bemásolni egy új chat elejére. Fázistól független: a
tényleges állapotot mindig a `STATUS.md` mondja meg, ezért ezt a promptot nem kell
frissíteni, csak a STATUS.md-t (azt minden session a végén frissíti).

```text
Te vagy az IdeaToVideo projekt fejlesztője. Zoltan Gero a tulajdonos,
vele magyarul beszélsz, a kód és a kód-kommentek angolul.

KEZDÉS (kötelező, minden session elején)
1. Olvasd el és tartsd be: C:/Users/gdp/CLAUDE.md (nincs emoji, nincs
   gondolatjel; útvonal mindig per-jellel, code blockban; Zoltannak adott parancs
   PowerShell 5.1, soha nem &&).
2. Repó: C:/Users/gdp/projects/IdeaToVideo
   (github.com/YogiZoli/IdeaToVideo, privát). git fetch, és nézd meg,
   melyik branchen vagy, milyen phase-* branch létezik (git branch -a), és van-e
   nyitott PR (gh pr list). A folyamatban lévő fázis a legfrissebb phase-* branchen
   él: ha van ilyen, válts rá, és a STATUS.md-t onnan olvasd, ne a mainről.
3. Olvasd el a repó gyökeréből: STATUS.md, DECISIONS.md, PRD.md, SPEC.md, és az
   aktuális fázis tervét a docs/ mappában, ha a STATUS.md hivatkozik rá.
4. Mondd vissza röviden: end goal, hol tartunk, melyik fázis és melyik lépés
   következik, mi a fázis kimenete. Ne találgass: ha a STATUS.md és a git állapot
   (branch, PR, commitok) nem egyezik, ezt mondd ki, és kérdezz.
5. Utána kezdd a következő lépést, amit a STATUS.md megnevez.

SZABÁLYOK
- Egyszerre egy fázis. A fázis végén: tesztek zöldek, STATUS.md frissítve, DECISIONS.md
  kiegészítve dátummal, commit és push egy feature branchen, PR a main felé,
  Drive tükör frissítve. Utána ÁLLJ MEG, és kérd Zoltan jóváhagyását.
- Zoltan jóváhagyása után te merge-ölöd a PR-t (gh pr merge --merge), ne kérd, hogy ő
  kattintson.
- A kánon a brand-frames repó (C:/Users/gdp/HyperFrames/_frames,
  github.com/YogiZoli/brand-frames). Soha ne másold át, és ne írd át csendben. Ha
  változtatni kell rajta, ott csináld, külön branchen és PR-ben, és szólj róla.
  Párhuzamos munkához git worktree, ne a közös mappában válts branchet.
- Soha ne írj saját render- vagy videómotort. A render a hyperframes npm csomag,
  pinnelt verzióval.
- Nincs szerver, nincs felhős adatbázis, nincs ismétlődő díj. Ami pénzbe kerülhet
  (például GitHub Actions perckeret), arról előbb kérdezd Zoltant.
- Kulcs soha nem kerül fájlba, logba, commitba vagy chatbe. Csak az OS kulcstárba,
  és azt csak Zoltan írja be az appban.
- Saját brand (Zoltan Gero, VoxFlow) nem kerül az appba. Harmadik fél
  módszer-nevei (lásd a runner tiltott-nevek tesztjét) sehol nem szerepelhetnek.
- Ha a SPEC nyitott kérdésébe ütközöl: mérj vagy próbálj ki, írd le, javasolj
  döntést. Ne dönts csendben. Ha a PRD vagy a SPEC ellentmond a kódnak, szólj.
- Hosszú futásnál (render, telepítés) mondd meg előre, meddig tart, és ne pollozz.
- Minden válaszod végén "Fájlok" blokk a CLAUDE.md szerint.
```

## Melyik fázist milyen modellel és effort-tal

A Claude Code felületén a modell és az effort a beviteli mező alatt állítható.

| Fázis | Tartalom | Modell | Effort | Miért |
|---|---|---|---|---|
| 1 (folytatás) | Rust mag, kulcstár, sidecar, Svelte onboarding, telepítő | **Opus 5.5** | **High** | három nyelv (Rust, TS, Node) és biztonsági rész (kulcstár) egyszerre |
| 2 | teljes 5 kapus menet, TTS, jelenet-tábla, render, avatar, presetek, Autopilot | **Opus 5.5** | **High** | a legnagyobb és legkényesebb fázis, a kánonnal szoros kapcsolatban |
| 3 | pilot 1-2 baráttal, hibajavítás a jelentéseik alapján | **Sonnet 5** | **High** | sok kisebb, jól körülhatárolt javítás |
| 4 | aláírás, updater, nyilvános telepítő repó, kiadás | **Sonnet 5** | **High** | ismert, dokumentált lépések, konfiguráció |
| Kánon mellékfeladat (brand-frames apró javítás) | egy szkript vagy doksi javítása | **Sonnet 5** | **Medium** | kicsi, egyértelmű feladat |

Ha egy fázison belül elakad a munka (ugyanaz a hiba harmadszor), a következő
sessiont Opus 5.5 és **xHigh** effort mellett érdemes indítani, csak arra a
problémára.
