# Omniscribe - Live Status

**P0 is done. P1 is built and gated locally (0.2.0); the work is uncommitted.** The charter is `docs/OMNISCRIBE.md`; this file is reality.

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

Gates run green locally for P1: syntax, lint, format, 100 unit tests, 27 browser scenarios,
accessibility over 26 states (zero violations), contrast, deferrals, deferral scan and release check.
P0 passed the same gates in CI (run 44647504403, commit e14c5d6), and the repository has a Pages site and
a branch ruleset (DEF-068).

## Phases

Planned in `docs/OMNISCRIBE.md` 7. Each gate is in `PLAN.md`; a regression blocks the next phase.

- [x] **P0 - Foundation.** Tooling, shell, schema, store, persistence with blobs, tab guard, library,
      character stub, palette, git and the GitHub repository. (DEF-068, DEF-072)
- [x] **P1 - Characters and PDFs.** Identity record, portrait, PDF attachments, the vendored PDF viewer,
      tags, status. Gate: a PDF survives a reload and renders; a wrong or oversize file is refused.
      (DEF-075, DEF-076)
- [ ] **P2 - The sheet engine and game systems.** Templates, formulas, value sheet, pools, conditions,
      rests, the system editor, derived systems, import and export, the generic system, then 5e and 3.5e.
      (DEF-001, DEF-003, DEF-005, DEF-006, DEF-007, DEF-070)
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

P2, in order. Nothing past P2. Spec first: write `docs/SHEET.md` before any code.

- [ ] `L` Commit and push P1 (needs your go-ahead).
- [ ] `L` Watch one transient failure seen once locally: Chrome exiting before DevTools was ready on a
      first launch. The other transient (a scenario that cancelled and reopened a confirmation) was a real
      app bug, fixed in 0.2.0 and now covered by a deterministic scenario. If the launch failure recurs,
      the runner prints the scenario name and saves a screenshot to `test-results/e2e/`.
- [ ] `L` Bump `actions/checkout` and `actions/setup-node` in CI (GitHub is retiring Node 20 for actions).
- [ ] `H` `P2` `docs/SHEET.md`: the template format, the formula language and its grammar, evaluation and
      cycles, pools, conditions, rests, orphans, derivation by base and overlay (S-1 to S-10, A-8).
- [ ] `VH` `P2` `src/sheet/formula.js`: tokenizer, parser, evaluator, step and length budget, cycle
      report; fixtures and a hostile-input property test (DEF-070).
- [ ] `H` `P2` `src/sheet/template.js` and `resolve.js`: validation, base and overlay, missing-base and
      cycle reports; `evaluate.js` over a template and values.
- [ ] `H` `P2` The generic system as JSON, with a fixture that evaluates it.
- [ ] `H` `P2` The Sheet page: typed inputs, derived values, pools, conditions, orphans, rests (DEF-005).
- [ ] `H` `P2` The Game systems page and editor: create, derive, edit, import and export (DEF-001,
      DEF-003); a template migration diff for characters.
- [ ] `H` `P2` Built-in D&D 5e and 3.5e systems as read-only bases (DEF-006, DEF-007).
- [ ] `M` `P2` Tests, browser scenarios and a11y states for every page and dialog above.

## Recently landed

- **P1 characters and PDFs (0.2.0, uncommitted).** `docs/PDF.md` written first; PDF.js 6.5.438 vendored
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
