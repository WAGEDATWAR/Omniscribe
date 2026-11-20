# Omniscribe - Live Status

**P0 is built and gated; it awaits its first commit and CI run.** The charter is `docs/OMNISCRIBE.md`; this file is reality.

**How to read this file.** Status is `[ ]` open, `[~]` in progress, `[x]` done. Every open item carries an
effort (`L`, `M`, `H`, `VH`) and its phase. The ledger (`DEFERRALS.md`) is authoritative for deferrals.
**Next Up** is the ordered slice to work top-down; a finished item moves to Recently landed with its
revision.

---

## Where we are

Omniscribe runs: a library of characters, a character page that autosaves, undo and redo, a command
palette, light and dark themes, a Data page, per-record IndexedDB storage with a blob store, and a tab
guard. The tooling and process come from Loreweaver, with the improvements its review found built in
from the start (tab guard, persistent storage, per-record saves, a split `main.js`, a size cap).

Gates run green locally: syntax, lint, format, 75 unit tests, 16 browser scenarios, accessibility over
17 states (zero violations), contrast, deferrals, deferral scan and release check. P0 is not called done
until the work is committed and the same gates pass in CI on GitHub (DEF-068).

## Phases

Planned in `docs/OMNISCRIBE.md` 7. Each gate is in `PLAN.md`; a regression blocks the next phase.

- [~] **P0 - Foundation.** Tooling, shell, schema, store, persistence with blobs, tab guard, library,
      character stub, palette, git and the GitHub repository. (DEF-068, DEF-072)
- [ ] **P1 - Characters and PDFs.** Identity record, portrait, PDF attachments, the vendored PDF viewer,
      tags, status.
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

Finish P0, then P1. Nothing past P1.

- [ ] `L` `P0` Commit the work, push, and confirm every gate is green in CI (needs your go-ahead to commit).
- [ ] `L` `P0` Branch protection and Pages settings on the GitHub repository (DEF-068).
- [ ] `L` `P0` Watch two transient failures seen once each locally: Chrome exiting before DevTools was
      ready on a first launch, and one browser scenario failing in a full gate pass (the name was not
      captured). Neither reproduced in 10 further runs, four of them under CPU load. If either recurs,
      the runner prints the scenario name and saves a screenshot to `test-results/e2e/`.
- [ ] `H` `P1` Write `docs/PDF.md` first: libraries and versions, limits, the viewer, the active-content
      risk and the upload override (G-19, P-14).
- [ ] `H` `P1` Vendor the PDF reader under `src/vendor/` with `SOURCE.md`; lazy-load it on PDF pages.
- [ ] `M` `P1` `src/files.js`: magic-byte and size checks (P-13), refused with a reason.
- [ ] `H` `P1` Character `documents`: upload, list, rename, remove, set as the override; blobs through
      `storage.putBlob`.
- [ ] `M` `P1` Portrait upload, shown on tiles and the character page.
- [ ] `M` `P1` Decide how Duplicate treats blobs (copy, or share with a reference count); today a copy
      would share `portraitBlobId`.
- [ ] `M` `P1` PDF viewer page, with e2e for upload, reload, view and refusal, and a11y states.

## Recently landed

- **P0 foundation (0.1.0, uncommitted).** Tooling adapted from Loreweaver (with `eval`, file-size and
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
