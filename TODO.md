# Omniscribe - Live Status

**P0 to P4 are done (0.5.0). P5, campaigns (records, roster, party view, sessions, initiative, handouts), is next.** The charter is `docs/OMNISCRIBE.md`; this file is reality.

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
- [x] **P2 - The sheet engine and game systems.** Templates, formulas, value sheet, pools, conditions,
      rests, the system editor, derived systems, import and export, the generic system, then 5e and 3.5e.
      (DEF-001, DEF-003, DEF-005, DEF-006, DEF-007, DEF-070, DEF-077)
- [x] **P3 - The dice table.** Grammar, roller, `@refs`, presets, log. (DEF-010, DEF-011, DEF-082, DEF-083)
- [x] **P4 - Character pages.** Inventory, abilities, familiars, relations, journal, progression.
      (DEF-002, DEF-063, DEF-079)
- [x] **P5 - Campaigns.** Records, roster, party view, sessions, initiative, handouts. (DEF-013,
      DEF-040, DEF-042)
- [~] **P6 - Durability and exchange.** Zip backup, bundles, revisions, integrity, search, the generated
      PDF sheet with the upload override. (DEF-022, DEF-030, DEF-032, DEF-033, DEF-052, DEF-064,
      DEF-071, DEF-080)
- [ ] **P7 - Release.** UI evaluation and redesign, PWA, GitHub Pages, Windows and Android builds,
      accessibility. (DEF-060, DEF-061, DEF-062, DEF-065, DEF-066, DEF-067)
- [ ] **v1.**
- [ ] **P8 - Expansion (post-v1, DEF-014).** Random tables, 3D dice, PDF form mapping, importers,
      encryption. (DEF-004, DEF-012, DEF-014, DEF-020, DEF-031, DEF-041, DEF-050, DEF-051, DEF-077, DEF-081)

## Decisions needed

See `DECISIONS.md` Open. Resolved so far: systems (S-6), dice table and tables (D-6, D-7), hosting and
releases (G-18), git (initialised).

None open. O-5 (Electron), O-6 (vendored three.js, no physics) and O-7 (public `Omniscribe` repository)
are resolved.

## Next Up

P5 is done (0.6.0). P6 has its spec (`docs/EXCHANGE.md`); the code follows in slices A to F.

- [x] `H` `P3` `docs/DICE.md`: the grammar, resolution, the roll record, presets, the log, the page, limits,
      tests (D-9 to D-15).
- [x] `H` `P3` Dice mode in `src/sheet/formula.js` (dice terms and every modifier, with static checks) and
      `src/dice/rng.js`; exact fixtures on a scripted source.
- [x] `H` `P3` `src/dice/roll.js` and `explain.js`: resolution, the result record, flags, limits; distribution
      tests on a seeded source and a hostile-input fuzz test (dice half of DEF-070).
- [x] `M` `P3` Schema migration 4 (`character.rollPresets`), `src/dice/presets.js`, the `rolls` store and a
      bounded persistent log with undoable clear.
- [x] `H` `P3` The dice table page (`#/dice`, `Alt+5`): roller, roll as, presets, result, log.
- [x] `M` `P3` A character's Rolls page and roll buttons on the Sheet page (system presets, row rolls).
- [x] `M` `P3` Pools (DEF-010) and macros (DEF-011) in the grammar, the presets and the page.
- [x] `M` `P3` Browser scenarios and accessibility states for every page and dialog above.
- [x] `H` `P4` `docs/CHARACTER.md`: the six record shapes, limits, containers, carry, reciprocal relations,
      progression and familiars, the build order and the gate (C-1 to C-10).
- [x] `H` `P4` Schema migration 5 and `normalize*` for every list; store methods with undo; the shared list
      editor UI (descriptor-driven, with fields of your own on every record); duplicate and delete cover every list.
- [x] `H` `P4` Inventory: `src/inventory.js`, page, wallets, containers, weight, and the system's carry limit,
      attunement cap and currencies (`extensions.records`, C-12).
- [x] `M` `P4` Abilities: page, use counters, restore all, roll button, uses that follow the system's rests.
- [x] `M` `P4` Journal: page with kinds, goals, filter and search.
- [x] `M` `P4` Relations: `src/relations.js`, page, reciprocal view.
- [x] `M` `P4` Progression: log, xp total, last level and "apply to the sheet" (once per entry).
- [x] `M` `P4` Familiars: record, present toggle and promotion to a character in one undo step. Editing a familiar's
      own sheet in place is DEF-087.
- [x] `M` `P4` Palette entries, Overview summary, browser scenarios and accessibility states for every page.
- [x] `H` `P4` Phase gate twice, release 0.5.0.
- [x] `H` `P5` `docs/CAMPAIGN.md`: the campaign record, store and history, pages, roster, party view, sessions,
      initiative, handouts, secrets, limits and the gate (K-1 to K-12).
- [x] `H` `P5` Groundwork: campaigns in the store with one history, migration 6, normalizer, autosave, delete cleanup.
- [x] `H` `P5` Campaign record, Library tiles, routes, overview, Roster and the character's Campaigns panel.
- [x] `M` `P5` Party view with columns read from sheets.
- [x] `M` `P5` Session log and Handouts.
- [x] `H` `P5` Initiative tracker (DEF-040).
- [x] `M` `P5` Secret rolls (DEF-013), palette entries, scenarios and accessibility states for every page.
- [x] `H` `P5` Phase gate twice, release 0.6.0.
- [x] `H` `P6` `docs/EXCHANGE.md`: the zip container, backup and restore, bundles, revisions, integrity, search,
      the generated sheet (X-1 to X-12).
- [x] `H` `P6-A` `src/zip.js` (writer, capped reader), backup and restore with review, quota warnings (DEF-030, DEF-071, DEF-033).
- [ ] `H` `P6-B` Character and campaign bundles with an import review (DEF-052).
- [ ] `H` `P6-C` Revisions and the integrity check with repair (DEF-032).
- [ ] `M` `P6-D` Search everywhere.
- [ ] `H` `P6-E` Generated PDF sheet, the main-sheet override and print (DEF-064).
- [ ] `M` `P6-F` Portrait cropping, handout PDFs in the viewer, familiar sheet editor, translation (DEF-022, DEF-090, DEF-087, DEF-080).
- [ ] `H` `P6` Phase gate twice, release 0.7.0.
- [x] `H` The Sheet page and the character pages fit a phone screen (a grid track let wide content push the page sideways).
- [ ] `M` Review the Sheet page and the visual editor by eye on a real phone.

## Recently landed

- **P2 visual editor (uncommitted after ee59d6d).** Tabbed forms over the resolved system for details,
  fields, pools, collections and their columns, tables, conditions, rests, rolls and sections, with a
  Visual and JSON switch. A derived system's form edits are written back as overlay operations by
  `makeOverlay` (round-tripped by tests); an override can clear a property or table entry with `null`.
  Also: the translation layer concept is scheduled (S-17; DEF-079 in P4, DEF-080 in P6, DEF-081 later).
- **P2 built-ins, diff and sidebar (uncommitted after 422cd88).** D&D 3.5e and 5e as built-in systems
  (generated from a script for the long lists, checked against hand-computed numbers including multiclass
  attack lines and expertise), `defaultRows` so a new sheet starts with its skill list, the newer-version
  diff dialog, and the left sidebar. 205 unit tests, 41 browser scenarios, accessibility zero violations.
- **P2 pages (422cd88, CI green).** The Sheet page and the Game systems page with editor, import,
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
