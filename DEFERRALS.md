# Deferral Ledger

A single tracked home for everything deliberately put off. A deferral in prose with no owner and no
destination vanishes; this ledger gives every one an **id**, an **owner phase** and a **status**.

**Status legend:** `open` (owed) -> `scheduled` (a phase owns it; the normal state) -> `doing` -> `done` ->
`dropped` (with a reason).

**Rules:** any "later", "for now", "post-v1" or "deferred" in a doc adds or cites a row here in the same
change. A row has an owner or it is a bug. An owner phase cannot be called done while its rows are
`open`. A landed row is marked `done` with the revision; a dropped row says why. `npm run deferrals`
fails on a malformed or ownerless row; `npm run deferral-scan` reports prose deferrals with no id.

Owners are `P0`-`P7` or `post-v1`.

---

## S. Sheet

| # | Item | Notes | Owner | Status |
|---|---|---|---|---|
| DEF-001 | An in-app game system editor with create, derive, import and export | S-8 and S-9; pulled into P2 so custom systems exist from the first release | P2 | scheduled |
| DEF-006 | Built-in D&D 5e system as a read-only base | structure and formulas only (G-13); lands after the generic system | P2 | scheduled |
| DEF-007 | Built-in D&D 3.5e system as a read-only base | same rule as DEF-006 | P2 | scheduled |
| DEF-002 | Item effects that modify sheet values (an equipped item adds to AC) | needs effect records evaluated by the sheet engine, behind the same budget | P4 | scheduled |
| DEF-003 | Move a character to a newer template version with a diff | S-3; shows added, removed and orphaned fields before applying | P2 | scheduled |
| DEF-004 | Level-up assistant driven by template data | automation of progression steps per template | post-v1 | scheduled |
| DEF-005 | Rest actions: short and long rest reset pools | S-7; template-defined, undoable | P2 | scheduled |

## D. Dice

| # | Item | Notes | Owner | Status |
|---|---|---|---|---|
| DEF-010 | Dice pools with success counting | grammar term and fixtures | P3 | scheduled |
| DEF-011 | Macros: one preset that fires several rolls | attack then damage | P3 | scheduled |
| DEF-012 | Optional animated 3D dice scene | D-6; plays back an engine result, never decides one; vendored three.js, no physics (D-8) | post-v1 | scheduled |
| DEF-013 | Secret rolls hidden from the shared log | needs campaign context | P5 | scheduled |
| DEF-014 | Random tables (loot, encounters) with nested rolls and item awards | D-7; `docs/TABLES.md` is written first | post-v1 | scheduled |

## F. Files

| # | Item | Notes | Owner | Status |
|---|---|---|---|---|
| DEF-020 | Read and write an uploaded PDF's form fields and map them to sheet values | the libraries are approved (P-14); this is the mapping surface | post-v1 | scheduled |
| DEF-021 | A PDF fallback where inline viewing is unsupported | the in-app viewer (U-8) renders on every shell, so no fallback is needed | P7 | dropped |
| DEF-022 | Image handouts and portraits cropping | portraits are stored as given in P1 | P6 | scheduled |

## P. Persistence

| # | Item | Notes | Owner | Status |
|---|---|---|---|---|
| DEF-030 | Zip backup including every blob | the native container; see `docs/ARCHITECTURE.md` 7 | P6 | scheduled |
| DEF-031 | Encrypted local data | passphrase-derived key; a G-12-compatible option | post-v1 | scheduled |
| DEF-032 | Per-character revisions and restore | P-6 and P-7 | P6 | scheduled |
| DEF-033 | Storage quota warnings with a per-file size list | extends the P0 storage panel | P6 | scheduled |

## C. Campaigns

| # | Item | Notes | Owner | Status |
|---|---|---|---|---|
| DEF-040 | Initiative tracker | rolls from sheet values, orders, steps turns | P5 | scheduled |
| DEF-041 | In-game calendar and timeline | dates for sessions in fiction time | post-v1 | scheduled |
| DEF-042 | Handouts per campaign | images and PDFs via the blob store | P5 | scheduled |

## X. Exchange

| # | Item | Notes | Owner | Status |
|---|---|---|---|---|
| DEF-050 | Export a character as a Loreweaver card and lorebook | through the shared interchange model Loreweaver already uses | post-v1 | scheduled |
| DEF-051 | Importers for other tools' exports | each is an adapter at the rim | post-v1 | scheduled |
| DEF-052 | Character bundle export and import | one character with its blobs | P6 | scheduled |

## U. Surface

| # | Item | Notes | Owner | Status |
|---|---|---|---|---|
| DEF-060 | UI evaluation and redesign before v1 | U-10; capture states at four widths, a keyboard pass, a ranked review | P7 | scheduled |
| DEF-061 | A signed release APK and keystore | milestone debug APKs are cut by the plan | P7 | scheduled |
| DEF-062 | A manual screen-reader pass on top of axe | | P7 | scheduled |
| DEF-063 | Relations graph view | the list ships in P4 | P4 | scheduled |
| DEF-064 | Generated PDF sheet from a character's data and system, with the uploaded PDF as an override | G-19; replaces the plain print view | P6 | scheduled |
| DEF-065 | PWA shell: service worker, manifest, icons | network-first with a hashed cache, as Loreweaver | P7 | scheduled |
| DEF-066 | Windows build published with each tag | Electron wrapper in `desktop/` (P-15) | P7 | scheduled |
| DEF-067 | Release workflow: Pages deploy, Windows build and APK attached to a GitHub release | G-18; Loreweaver's deploy workflow is the starting point | P7 | scheduled |
| DEF-068 | GitHub repository, remote and branch protection | O-7 | P0 | scheduled |

## R. Robustness

| # | Item | Notes | Owner | Status |
|---|---|---|---|---|
| DEF-070 | Formula and dice step budgets under adversarial input | A-8 and D-3; a property test feeds hostile expressions | P2 | scheduled |
| DEF-071 | Zip reader caps inflated size and entry count | avoids a zip bomb on import | P6 | scheduled |
| DEF-072 | Import limits centralised in one `limits.js` | Loreweaver scattered them | P0 | scheduled |
