# Sampler: a könyvtár a presetekkel (PRD 14.5)

Futtatva 2026-10-06, a `phase-3` branchen:

```text
node scripts/phase2/pilot.mjs --work <ideiglenes mappa> --preset all --no-render --out feedback/2026-10-06/sampler
```

Egy 46 mp-es videó, a 13 tervezhető komponens egyszer (a kivezetett
`logo-brand-close` nélkül), és egy magyar sor a hosszú ékezetekkel ("ŐSZINTE
SZÓ, GYŰJTSD ŐKET"). Hang nélkül (csendes hang, kézi mondattábla), mint a
2. fázis registry-próbája. Presetenként build, lint, check, kontakt lap; kb.
35 mp presetenként. A kontakt lapok: `feedback/2026-10-06/sampler/<preset>.png`.

| Preset | Build | Check | Megjegyzés |
|---|---|---|---|
| blue-professional | ok | 0 hiba | rendben |
| biennale-yellow | ok | 0 hiba | sárga "today" a krémszínen alig olvasható; keskeny, szoros betű |
| blockframe | ok | 0 hiba | sárga "today" alig olvasható |
| broadside | ok | 0 hiba | rendben (sötét) |
| capsule | ok | 0 hiba | sárga "today" alig olvasható |
| cartesian | ok | 0 hiba | szürke kiemelés, fakó, de olvasható |
| cobalt-grid | ok | 0 hiba | rendben |
| code-editorial | ok | 0 hiba | rendben |
| coral | ok | 0 hiba | csupa nagybetűs keskeny betű, rendben |
| creative-mode | ok | 0 hiba | rózsaszín "today" a krémszínen gyenge |
| editorial-forest | ok | 0 hiba | rendben (sötét) |

Az ékezetek (ő, ű) mind a 11 preset betűjével helyesek.

## Javítva a sampler alapján

1. **A második és harmadik szín olvashatósága.** Csak a fő szín kapta meg a
   3:1-es igazítást (DECISIONS 76); a kiemelt szó és a diagram oszlopa a
   második vagy harmadik színt is használhatja. Most mindhárom 3:1 a
   háttéren (`runner/brand/card.mjs` `cardTheme`, teszt mind a 11 presetre).
2. **Betűköz:** -0.01em-nél szorosabb nem lehet a build-másolatban
   (`trackingFit`, Zoltan 2026-10-06-i videója nyomán), ez a keskeny betűs
   preseteken is segít.

## Nyitva

- **A rács-kártyák felirata kicsi** minden preseten (a grid-card-assemble
  2,2cqh betűmérete), az ikonok pedig fixek (pajzs, grafikon, felhő),
  nem a tartalomhoz illenek. Az ikonkönyvtár javaslattal együtt kezelendő.
- **Render a presetekkel** (3 preset, kb. 2 perc videónként): a jelenet-
  javítások (rajz, kimondott szó, mozgás) után érdemes, hogy a mozgást is
  lássuk.
- A 152 open-design stílus szúrópróbája (5 darab) még nincs meg.
