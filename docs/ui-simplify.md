# UI egyszerűsítés (2026-10-08)

**Állapot: megépült** (Zoltan feladata, 2026-10-08, DECISIONS 119, branch
`ui-simplify`). Mi kész:

| Pont | Kész | Hol |
|---|---|---|
| D1 Felső menü: Home, Videos, Wizards, Identity, Settings, menünként legfeljebb 6 oldal | kész | `app/src/lib/pages.ts`, `routes/+page.svelte`, `Settings.svelte` |
| D2 Home: "Ready to make videos?" és a legutóbbi videók | kész | `Home.svelte` |
| D3 Connections: minden kulcs egy oldalon, Identity-felülírással | kész | `ConnectionRow.svelte`, `KeyField.svelte` |
| D4 Import & Export: egy oldal, a régi helyeken link | kész | `TransferPage.svelte`, `cta/HeygenImport.svelte` |
| D5 CTA: a házi hármas elöl, klipforrással, a többi 12 csukva | kész | `cta/CtaPage.svelte`, `cta/clips.ts` |
| D6 Videó tabok: egy fő gomb, a többi Advanced alatt, Autopilot kiemelve | kész | `Advanced.svelte`, a kapuk |
| D7 Kész videó: Send to Publishing, YouTube szövegek nyitva, Files csukva | kész | `VideoTab.svelte` |

Eltérés a lenti javaslattól: a 7. pont (Identity helyett Channel) nem
lett: Zoltan döntése, a szó "Identity" marad.

## Az eredeti javaslatok (2026-10-08)

Zoltan: a funkciók most a lényegesek, a UI-t menet közben egyszerűsítjük. Ez a
lista a következő UI-körhöz. Sorrend: a legnagyobb nyereség elöl.

1. **Egy Import / Export hely.** Ma 9 gomb van 6 helyen (felső sáv Identity
   menü, Settings Identity, Brand, Scenes, CTA, General, Backup, a videó tabja).
   Javaslat: Settings, Import and export egy oldalon, minden sor: mit visz, Import,
   Export. Az Identity import a felső menüben is maradhat, de ott legyen az első.
2. **Kezdőlap ellenőrzőlistával.** Egy "Ready to make videos?" kártya:
   kulcsok, Identity, a 3 CTA klip, Publishing; mindegyik kész vagy hiányzik,
   egy gombbal a helyére visz. Ez váltja ki a quickstart nagy részét.
3. **Connections: minden kulcs egy oldalon** állapotjelzővel (Gemini,
   ElevenLabs, HeyGen, Pixabay, Unsplash, Publishing), a "Get a key" linkkel.
   Ma a kulcsok több Settings oldalon szóródnak.
4. **A videó menete: tabonként egy fő gomb.** Minden tabon egy kiemelt "Next"
   (vagy "Approve and continue"); minden más (újragenerálás, finomhangolás) egy
   "Advanced" alá. Az Autopilot gomb látható helyen: "Finish on Autopilot".
5. **CTA: a házi hármas elöl.** A 3x5 kártyából alapból a választott három
   (GUIDE, COURSE, TRIGGER) látszik nagyban, a többi 12 egy "Other keywords"
   alatt. Klip nélküli választott kulcsszónál figyelmeztetés.
6. **A kész videó tabja:** fő gomb "Send to Publishing"; az Export card, az
   SRT, a chapters és a YouTube szövegek egy "Files and texts" részben, csukva.
7. **Elnevezés:** "Identity" helyett "Channel" (a user fejében csatorna van),
   és ugyanaz a szó minden képernyőn.
8. **Settings mélysége:** legfeljebb két szint (Settings, oldal). A mai
   Settings, Identity, Brand típusú harmadik szint lapos fülsorrá válik.
