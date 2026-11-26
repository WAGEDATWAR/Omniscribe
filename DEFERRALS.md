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
| DEF-001 | An in-app game system editor with create, derive, import and export | S-8 and S-9; built as a validated JSON editor with new, derive, import, export and delete; the visual editor is DEF-078 | P2 | done |
| DEF-078 | A visual system editor | forms for details, fields, pools, collections and their columns, tables, conditions, rests, rolls and sections, on top of the JSON editor; a derived system's edits are written back as overlay operations | P2 | done |
| DEF-006 | Built-in D&D 5e system as a read-only base | structure and formulas only (G-13); built with pre-filled skills, spell slot boxes and hit dice rests | P2 | done |
| DEF-007 | Built-in D&D 3.5e system as a read-only base | same rule as DEF-006; multiclass base attack and saves, iterative attacks, size, skills and spells | P2 | done |
| DEF-002 | Item effects that modify sheet values (an equipped item adds to AC) | needs effect records evaluated by the sheet engine, behind the same budget | P4 | scheduled |
| DEF-003 | Move a character to a newer template version with a diff | S-3; the Sheet page offers a review of added, removed and changed parts and which values would be kept aside, then moves with Undo | P2 | done |
| DEF-004 | Level-up assistant driven by template data | automation of progression steps per template | post-v1 | scheduled |
| DEF-005 | Rest actions: short and long rest reset pools | S-7; `applyRest` is built and tested, the buttons and undo come with the Sheet page | P2 | doing |
| DEF-079 | Renames in a system version: a new version declares old-key to new-key maps so a move carries values instead of orphaning them | S-17 stage 1; small, safe and fixes the common update case; the diff dialog shows renames | P4 | scheduled |
| DEF-080 | Translation between different systems: proposed field, row and column maps with conversion formulas, reviewed and confirmed in a dialog | S-17 stage 2; higher value, harder; needs maps authored per source system ; moved from P6 to P8 (needs per-pair maps and a review dialog; the spec allows the move) | P8 | scheduled |
| DEF-081 | A visual editor for translation maps | after DEF-080 works from a file | post-v1 | scheduled |

## D. Dice

| # | Item | Notes | Owner | Status |
|---|---|---|---|---|
| DEF-010 | Dice pools with success counting | grammar term and fixtures | P3 | done |
| DEF-011 | Macros: one preset that fires several rolls | attack then damage | P3 | done |
| DEF-012 | Optional animated 3D dice scene | D-6; plays back an engine result, never decides one; vendored three.js, no physics (D-8) | post-v1 | scheduled |
| DEF-082 | Custom-face dice such as `d[1,2,2,3]` | beyond the P3 grammar | post-v1 | scheduled |
| DEF-083 | Roll log export and a statistics view | after the log exists | post-v1 | scheduled |
| DEF-013 | Secret rolls hidden from the shared log | needs campaign context | P5 | scheduled |
| DEF-014 | Random tables (loot, encounters) with nested rolls and item awards | D-7; `docs/TABLES.md` is written first | post-v1 | scheduled |

## F. Files

| # | Item | Notes | Owner | Status |
|---|---|---|---|---|
| DEF-020 | Read and write an uploaded PDF's form fields and map them to sheet values | the libraries are approved (P-14); this is the mapping surface | post-v1 | scheduled |
| DEF-021 | A PDF fallback where inline viewing is unsupported | the in-app viewer (U-8) renders on every shell, so no fallback is needed | P7 | dropped |
| DEF-022 | Image handouts and portrait cropping | portraits are scaled to 512 px and kept whole in P1 | P6 | done |
| DEF-075 | Text selection and search inside the PDF viewer | needs PDF.js's text layer; the viewer draws canvases only | P7 | scheduled |
| DEF-077 | Assisted import from a flat (non-form) PDF | such sheets, e.g. a printed web sheet, have no fields to map (DEF-020); extract text and let the person confirm values | post-v1 | scheduled |
| DEF-076 | CJK character maps for PDFs with non-embedded Asian fonts | about 1.5 MB of `cmaps/` to vendor; excluded in P1 | P7 | scheduled |

## P. Persistence

| # | Item | Notes | Owner | Status |
|---|---|---|---|---|
| DEF-030 | Zip backup including every blob | the native container; built as `src/zip.js`, `src/backup.js` and the Data page (`docs/EXCHANGE.md` 5) | P6 | done |
| DEF-031 | Encrypted local data | passphrase-derived key; a G-12-compatible option | post-v1 | scheduled |
| DEF-032 | Per-character revisions and restore | P-6 and P-7; built as `src/revisions.js`, the Revisions panel and the Data page's recently deleted list | P6 | done |
| DEF-033 | Storage quota warnings with a per-file size list | extends the P0 storage panel; warns at 80%, refuses uploads at 95%, lists the largest files | P6 | done |

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
| DEF-052 | Character bundle export and import | one character or campaign with its blobs; built as bundles that import through the Data page (`docs/EXCHANGE.md` 7) | P6 | done |

## U. Surface

| # | Item | Notes | Owner | Status |
|---|---|---|---|---|
| DEF-060 | UI evaluation and redesign before v1 | U-10; capture states at four widths, a keyboard pass, a ranked review | P7 | scheduled |
| DEF-061 | A signed release APK and keystore | milestone debug APKs are cut by the plan | P7 | scheduled |
| DEF-062 | A manual screen-reader pass on top of axe | | P7 | scheduled |
| DEF-063 | Relations graph view | the list ships in P4 | P4 | scheduled |
| DEF-064 | Generated PDF sheet from a character's data and system, with the uploaded PDF as an override | G-19; replaces the plain print view | P6 | done |
| DEF-065 | PWA shell: service worker, manifest, icons | network-first with a hashed cache, as Loreweaver | P7 | done |
| DEF-066 | Windows build published with each tag | Electron wrapper in `desktop/` (P-15) | P7 | scheduled |
| DEF-067 | Release workflow: Pages deploy, Windows build and APK attached to a GitHub release | G-18; Loreweaver's deploy workflow is the starting point | P7 | scheduled |
| DEF-068 | GitHub repository, remote and branch protection | O-7; repository, Pages from `main` and a ruleset blocking deletion and force pushes are in place | P0 | done |

## R. Robustness

| # | Item | Notes | Owner | Status |
|---|---|---|---|---|
| DEF-070 | Formula and dice step budgets under adversarial input | A-8 and D-3; the formula half is done (budgets, fuzz test); the dice half lands with P3 | P2 | doing |
| DEF-071 | Zip reader caps inflated size and entry count | avoids a zip bomb on import; `openZip` checks every cap before inflating | P6 | done |
| DEF-072 | Import limits centralised in one `limits.js` | Loreweaver scattered them | P0 | scheduled |
| DEF-084 | Shared item and ability libraries with give-to actions | across characters; the charter backlog | post-v1 | scheduled |
| DEF-085 | Journal attachments and images | text only in P4 | post-v1 | scheduled |
| DEF-086 | Roll presets on inventory items | abilities carry rolls in P4 | post-v1 | scheduled |
| DEF-087 | An editor for a familiar's own sheet on its page | a familiar keeps a sheet when promoted; editing one in place needs the Sheet builder to take a target other than the character ; moved from P6 to P8 (the store, Sheet page and dice are tied to a character id, so a target is a refactor of its own) | P8 | scheduled |
| DEF-088 | Conditions and effects on initiative entries | P5 tracks order, turns and notes only (K-12) | post-v1 | scheduled |
| DEF-089 | Campaign calendar and in-fiction time | sessions carry a date only | post-v1 | scheduled |
| DEF-090 | Handout PDFs open in the app's own viewer | P5 opens a PDF handout in the browser's tab and offers a download; the viewer is bound to a character's documents today | P6 | done |
| DEF-091 | Backup options for settings and the roll log (X-12) | the first backup holds characters, campaigns, systems and files | P6 | scheduled |
| DEF-092 | Old revisions that still hold anonymous `custom` entries are migrated when read | a revision written before layouts keeps its entries in the stored snapshot but restoring one drops them | P6 | done |
| DEF-093 | Fields of your own print in the generated sheet, and a bundle carries only the layouts its records need | L-B ships layouts in every backup and bundle and leaves the PDF without them | P6 | done |
| DEF-094 | Drag to reorder in the layout editor | L-C moves fields and sections with Up and Down buttons and a section menu, which work from the keyboard; drag was always an extra | P8 | scheduled |
| DEF-095 | True sub-collections: a collection inside a row of another | SYSTEMS-REVIEW 9; changes the sheet model, rests and the PDF; filtered aggregation and groupBy cover most uses | P8 | scheduled |
| DEF-096 | Link fields between rows of different collections | SYSTEMS-REVIEW 10; with DEF-095 | P8 | done |
| DEF-097 | A track field type: named boxes that can be unmarked, marked or crossed | SYSTEMS-REVIEW 14; a new type through the evaluator, the sheet, the PDF and the editor | P8 | done |
| DEF-098 | Per-character overrides of a system's defaults without forking it | SYSTEMS-REVIEW 15; a house version derived from the system is the supported route today | P8 | scheduled |
| DEF-099 | Computed field defaults | SYSTEMS-REVIEW 16 | P8 | done |
| DEF-100 | A roll with its own target that shows the verdict and margin | SYSTEMS-REVIEW 19; `@skill - d%` gives the margin as the total today | P8 | done |
| DEF-101 | A drawn preview of the sheet before a system import | SYSTEMS-REVIEW 22; the review shows an outline and an evaluation summary | P8 | done |
| DEF-102 | A hand-curated index of importable system files | SYSTEMS-REVIEW 26; a static list, since there is no server (G-2) | post-v1 | scheduled |
| DEF-103 | Basic markdown in long text, rendered safely for display | SYSTEMS-REVIEW 29 | P8 | done |
| DEF-104 | Search across installed game systems | SYSTEMS-REVIEW 30 | P8 | done |
