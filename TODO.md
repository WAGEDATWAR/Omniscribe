# Omniscribe - Live Status

**Planned. Nothing is built.** The charter is `docs/OMNISCRIBE.md`; this file is reality.

**How to read this file.** Status is `[ ]` open, `[~]` in progress, `[x]` done. Every open item carries an
effort (`L`, `M`, `H`, `VH`) and its phase. The ledger (`DEFERRALS.md`) is authoritative for deferrals.
**Next Up** is the ordered slice to work top-down; a finished item moves to Recently landed with its
revision.

---

## Where we are

The planning documents are written. No code, tooling or git history exists yet. The foundations, tooling
and process are taken from Loreweaver, with the improvements its review found built in from the start
(tab guard, persistent storage, per-record saves, a split `main.js`, a size cap).

## Phases

Planned in `docs/OMNISCRIBE.md` 7. Each gate is in `PLAN.md`; a regression blocks the next phase.

- [ ] **P0 - Foundation.** Tooling, shell, schema, store, persistence with blobs, tab guard, library,
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
- [ ] **P8 - Expansion (post-v1).** Random tables, 3D dice, PDF form mapping, importers, encryption.
      (DEF-004, DEF-012, DEF-014, DEF-020, DEF-031, DEF-041, DEF-050, DEF-051)

## Decisions needed

See `DECISIONS.md` Open. Resolved so far: systems (S-6), dice table and tables (D-6, D-7), hosting and
releases (G-18), git (initialised).

None open. O-5 (Electron), O-6 (vendored three.js, no physics) and O-7 (public `Omniscribe` repository)
are resolved.

## Next Up

P0, in order. Nothing outside P0.

- [ ] `H` `P0` Scaffold: copy and adapt the Loreweaver tooling (`check`, `lint`, `format`, `serve`,
      `deferrals`, `deferral-scan`, `release-check`, `contrast`, the e2e harness, runner and a11y
      scenarios), `package.json`, `RELEASING.md` and CI. Rename the namespace. Add the `eval`,
      file-size and vendor-`SOURCE.md` checks.
- [ ] `L` `P0` Branch protection and Pages settings on the GitHub repository (DEF-068).
- [ ] `M` `P0` Shell: `index.html`, design tokens (dark and light), header, brand menu, toast, dialog
      helpers, the one page anatomy (U-6).
- [ ] `M` `P0` `views.js` route table and hash router; `projects.js` library item model.
- [ ] `H` `P0` `schema.js`, `migrations.js` (version 1), `store.js` and `history.js` with a character
      factory and undo and redo.
- [ ] `H` `P0` `storage.js` and `storage/idb.js`: record stores, the blob store, a serialized write queue,
      dirty tracking (P-10), autosave status, persistent-storage request (P-12).
- [ ] `M` `P0` `tabGuard.js` and the cross-tab pause (P-11).
- [ ] `M` `P0` Library hub: tiles, search, sort, New, Duplicate, Delete with confirmation. Centralised
      `limits.js` (DEF-072).
- [ ] `M` `P0` Character page stub with the shared anatomy: name, system label, tags, notes.
- [ ] `M` `P0` Command palette and shortcuts dialog; the Data and Settings stubs.
- [ ] `M` `P0` Tests: schema, store, history, migrations, storage, views; e2e: boot, create, reload,
      two-tab guard; a11y over every dialog.
- [ ] `L` `P0` A sample character shown on first run.

## Recently landed

- Planning documents: charter, architecture, decisions, deferrals, plan, agents notes, index.
- Decisions from the first review: generic system first with in-app custom and derived systems, 5e and
  3.5e as built-in bases, GitHub Pages plus Windows and Android releases, a vendored PDF library with a
  generated sheet and an upload override, the 3D dice scene and random tables as expansion.
- Git initialised with `.gitignore`, `.gitattributes` and `.editorconfig` (no commit yet).
