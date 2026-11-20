# Omniscribe - Live Status

**P0 and P1 are done and green in CI (0.2.0). P2 is in progress: the sheet engine is built and tested but not committed; the pages are next.** The charter is `docs/OMNISCRIBE.md`; this file is reality.

**How to read this file.** Status is `[ ]` open, `[~]` in progress, `[x]` done. Every open item carries an
effort (`L`, `M`, `H`, `VH`) and its phase. The ledger (`DEFERRALS.md`) is authoritative for deferrals.
**Next Up** is the ordered slice to work top-down; a finished item moves to Recently landed with its
revision.

---

## Where we are

Omniscribe runs: a library of characters with portraits, a character page that autosaves with a link bar
(Overview, PDF sheets), PDF upload and an in-app viewer, undo and redo, a command palette, light and dark
themes, a Data page that lists and cleans unused files, per-record IndexedDB storage with a shared blob
store, and a tab guard. The tooling and process come from Loreweaver, with the improvements its review
found built in from the start.

P1 passed every gate in CI (run 44652158842, commit aecfbfd): syntax, lint, format, unit tests, 27 browser
scenarios, accessibility over 26 states, contrast, deferrals, deferral scan and release check. The
repository has a Pages site and a branch ruleset (DEF-068).

P2 now has the engine and its pages: `docs/SHEET.md`, the formula language, validation, derivation,
evaluation, reconcile and rests, the generic system, the character Sheet page, the Game systems page and a
validated system editor with derive, import and export. 191 unit tests, and the Sheet and systems pages are
covered by browser scenarios and accessibility states. A pair of real flat-PDF character sheets for a derived 3.5e system informed the design
(`docs/reference/SHEET-REFERENCE.md`, structure only).

## Phases

Planned in `docs/OMNISCRIBE.md` 7. Each gate is in `PLAN.md`; a regression blocks the next phase.

- [x] **P0 - Foundation.** Tooling, shell, schema, store, persistence with blobs, tab guard, library,
      character stub, palette, git and the GitHub repository. (DEF-068, DEF-072)
- [x] **P1 - Characters and PDFs.** Identity record, portrait, PDF attachments, the vendored PDF viewer,
      tags, status. Gate: a PDF survives a reload and renders; a wrong or oversize file is refused.
      (DEF-075, DEF-076)
- [~] **P2 - The sheet engine and game systems.** Templates, formulas, value sheet, pools, conditions,
      rests, the system editor, derived systems, import and export, the generic system, then 5e and 3.5e.
      (DEF-001, DEF-003, DEF-005, DEF-006, DEF-007, DEF-070, DEF-077)
- [ ] **P3 - The dice table.** Grammar, roller, `@refs`, presets, log. (DEF-010, DEF-011)
- [ ] **P4 - Character pages.** Inventory, abilities, familiars, relations, journal, progression.
      (DEF-002, DEF-063)
- [ ] **P5 - Campaigns.** Records, roster, party view, sessions, initiative, handouts. (DEF-013,
      DEF-040, DEF-042)
- [ ] **P6 - Durability and exchange.** Zip backup, bundles, revisions, integrity, search, the generated
      PDF sheet with the upload override. (DEF-022, DEF-030, DEF-032, DEF-033, DEF-052, DEF-064,
      DEF-071)
- [ ] **P7 - Release.** UI evaluation and redesign, PWA, GitHub Pages, Windows and Android builds,
      accessibility. (DEF-060, DEF-061, DEF-062, DEF-065, DEF-066, DEF-067)
- [ ] **v1.**
- [ ] **P8 - Expansion (post-v1, DEF-014).** Random tables, 3D dice, PDF form mapping, importers,
      encryption. (DEF-004, DEF-012, DEF-014, DEF-020, DEF-031, DEF-041, DEF-050, DEF-051)

## Decisions needed

See `DECISIONS.md` Open. Resolved so far: systems (S-6), dice table and tables (D-6, D-7), hosting and
releases (G-18), git (initialised).

None open. O-5 (Electron), O-6 (vendored three.js, no physics) and O-7 (public `Omniscribe` repository)
are resolved.

## Next Up

P2, in order. Nothing past P2.

- [ ] `L` Commit the P2 engine work (needs your go-ahead).
- [ ] `L` Watch one transient failure seen once locally: Chrome exiting before DevTools was ready on a
      first launch. The other transient (a scenario that cancelled and reopened a confirmation) was a real
      app bug, fixed in 0.2.0 and now covered by a deterministic scenario. If the launch failure recurs,
      the runner prints the scenario name and saves a screenshot to `test-results/e2e/`.
- [ ] `L` Bump `actions/checkout` and `actions/setup-node` in CI (GitHub is retiring Node 20 for actions).
- [x] `H` `P2` `docs/SHEET.md`: the template format, the formula language, evaluation, pools, rests,
      orphans and derivation (S-1 to S-16, A-8).
- [x] `VH` `P2` `src/sheet/formula.js`: tokenizer, parser, static checks, budgeted evaluator; unit tests
      and a 4,000-case hostile-input fuzz test (formula half of DEF-070).
- [x] `H` `P2` `src/sheet/template.js`, `resolve.js`, `evaluate.js`: validation with cycle detection,
      derivation, evaluation, reconcile and rests.
- [x] `H` `P2` The generic system as JSON, plus a d20-style core and a derived fixture that exercise every
      pattern in the reference sheets.
- [x] `H` `P2` Character `sheet` record and `template` pin: schema, migration 3, store actions with undo,
      the versioned system registry and its storage.
- [x] `H` `P2` The Sheet page (`#/character/<id>/sheet`): system picker, typed inputs that explain a refusal,
      derived values and modifiers, pools as numbers or boxes, row tables with use counters, conditions,
      orphans, rests, errors beside the value, change system with Undo.
- [x] `H` `P2` The Game systems page and editor: list, new (from a base or empty), derive, import, export,
      delete, and a JSON editor with live validation by path that saves new versions.
- [x] `M` `P2` Browser scenarios and accessibility states for the Sheet page, the systems page, the editor
      and the new-system dialog.
- [ ] `H` `P2` Built-in D&D 3.5e and 5e systems as read-only bases (DEF-007, DEF-006). Structure and
      formulas only (G-13); do 3.5e first, since derived 3.5e systems are the first real use.
- [ ] `M` `P2` The newer-version diff: when a base or a system gets a new version, show added, removed and
      changed fields before a character moves (DEF-003).
- [ ] `H` `P2` A visual system editor (forms for fields, pools, collections and overlay operations) on top
      of the JSON editor (DEF-078).
- [ ] `M` `P2` Review pass over the Sheet page on a phone and with a large 3.5e sheet (200 rows).

## Recently landed

- **P2 pages (uncommitted after ae972e1).** The Sheet page and the Game systems page with editor, import,
  export, derive and delete, with 12 new browser scenarios and 14 new accessibility states (42 and 40 in
  all, zero violations). Scenarios found no defects in the pages; one test expectation was wrong.
- **P2 sheet engine (d62c7b5).** `docs/SHEET.md` written first. The formula language (typed, total,
  no coercion, budgeted, with a fuzz test), template validation with cycle detection and per-path errors,
  derivation by base and overlay across fields, pools, collections, tables, rolls, rests, sections and
  conditions, evaluation in dependency order with errors as values, reconcile (orphans) and rests, the
  generic system, and `docs/reference/SHEET-REFERENCE.md` from two real derived-system sheets. Tests caught
  one real bug: a derived file's description overrode an overlay `meta` operation.
- **P1 characters and PDFs (0.2.0, aecfbfd, CI green).** `docs/PDF.md` written first; PDF.js 6.5.438 vendored
  with hashes and loaded lazily; byte-level file checks; documents on a character (upload, rename, mark
  as the sheet, download, remove with Undo); a viewer that renders pages to canvases as they scroll
  into view; portraits scaled to 512 px; shared immutable blobs with reachability collection and a Data
  page cleanup; the link bar; schema migration 2. Tests caught a lost backslash in file-name cleaning
  and a confusing size message; the browser scenarios caught PDF.js 6 moving `destroy()` to the loading
  task; the accessibility audit caught a label that did not contain its visible text.

- **P0 foundation (0.1.0, e14c5d6).** Tooling adapted from Loreweaver (with `eval`, file-size and
  vendor checks added), the shell and page anatomy, routes, the pure schema, migrations, history and
  store, per-record storage with a blob store and an in-memory twin, autosave, the tab guard with a
  stale-tab dialog, the Library, the character page, the command palette, Data and Settings pages,
  `docs/PERSISTENCE.md` and `docs/UI.md`. The browser scenarios caught and fixed a real bug: a focused
  field was not refreshed after loading another tab's changes.
- Planning documents: charter, architecture, decisions, deferrals, plan, agents notes, index.
- Decisions from the first review: generic system first with in-app custom and derived systems, 5e and
  3.5e as built-in bases, GitHub Pages plus Windows and Android releases, a vendored PDF library with a
  generated sheet and an upload override, the 3D dice scene and random tables as expansion.
- Git initialised with `.gitignore`, `.gitattributes` and `.editorconfig` (no commit yet).
