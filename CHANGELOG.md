# Changelog

All notable changes to Omniscribe are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to the version in `package.json`.

## [Unreleased]

## [0.1.0] - P0 foundation

### Added

- A working app: the Library of characters (search, sort, New, Duplicate, Delete with confirmation and
  Undo), a character page that autosaves, undo and redo, a command palette, shortcuts, a Data page,
  Settings with a dark and a light theme, and toasts.
- Per-record IndexedDB storage with a blob store, an in-memory twin for tests and a visible warning when
  storage is unavailable; debounced autosave with an honest save state; a request for persistent storage.
- A tab guard: a quiet tab reloads when another tab saves, and a tab with unsaved edits pauses and asks.
- Tooling adapted from Loreweaver: check, lint (no `innerHTML`, no `eval` or `Function`, a 1,500 line
  cap, a `SOURCE.md` per vendored library), format, serve, deferrals, deferral scan, release check,
  contrast, a headless-Chrome harness, 16 browser scenarios and an axe audit over 17 states.
- 75 unit tests over the schema, migrations, history, store, storage, autosave, tab guard, routes,
  library model, palette, preferences and utilities.
- `docs/PERSISTENCE.md` and `docs/UI.md`; a Content Security Policy in `index.html`; CI on GitHub.

### Fixed

- After loading another tab's changes, a focused field kept its stale text. Controllers now force a
  re-render on a reload from storage.

### Planning

- Planning documents: the charter (`docs/OMNISCRIBE.md`), the architecture and canonical model
  (`docs/ARCHITECTURE.md`), the decision log, the deferral ledger, the plan and gates, the live status,
  the documentation index and agent notes. No code yet; P0 is next.
- Decisions G-17 to G-20, S-8 to S-10, D-7, P-14 to P-16: user-created and derivable game systems,
  distribution, the generated PDF with an upload override, the vendored PDF libraries, random tables.

- Decision D-8 (vendored three.js, scripted physics-free dice) and P-15 settled on Electron for Windows.

### Changed

- The system editor moved from P6 into P2, random tables moved to post-v1, and the PDF viewer is the
  app's own vendored one (U-8). DEF-021 is dropped.
