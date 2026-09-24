# STATUS: Studio (munkanév)

Frissítve: 2026-09-24

End goal: helyben telepíthető asztali app, ami egy YouTube videót végigvisz ötlettől kész MP4-ig, a user saját gépén és kulcsaival, a HyperFrames motorral és Zoltan blokk-könyvtárával.

Hol tartunk: PRD 0.1 és SPEC 0.1 vázlat kész. 0. fázis: a PowerShell pipeline Node-ra portolva a brand-frames repóban (commit 7997877), mind a 9 szkript a régivel azonos kimenetet ad. A .ps1 fájlok még maradnak. Nincs app kód.

Következő lépés: Zoltan átnézi a PRD-t és a SPEC-et. A 0. fázis maradéka: egy éles videót a Node szkriptekkel végigvinni, utána a dokumentációt (PIPELINE.md, TIMING.md, RUNNING-COMMANDS.md) átállítani, és a SPEC 12. pontjának mérései (Chrome, Node sidecar). Utána 1. fázis (Tauri váz).

Forrás: Drive `10_HyperFrames_Shippability_and_Documentation_Review`
https://docs.google.com/document/d/1fOLZnrikPn-A_2tl2XNZPJnsdO9AOd1XpUY2u4VF4_4/edit

Drive tükör: https://docs.google.com/document/d/19PougSc18s97PBKP6mr_CnQUnEulNgkfq1eckCPDqJI/edit
