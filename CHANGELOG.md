# Changelog

All notable changes to Omniscribe are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to the version in `package.json`.

## [Unreleased]

### Added

- P6 spec: `docs/EXCHANGE.md` and decisions X-1 to X-12 (zip container, backup and restore, bundles, revisions, integrity, search, generated sheet).
- Backup and restore on the Data page: a zip with every record, game system and file; a review before anything changes; Add (keeps both, remaps ids and links) or Replace (keeps a safety copy you can go back to). Files are checked by SHA-256.
- Character and campaign bundles: Export on a character, and Share on a campaign (secret notes and secret journal entries left out unless ticked). A bundle carries the roster characters, their files and the user-made game systems they need, and imports from the Data page in Add mode only, keeping both copies of anything that already exists.
- Revisions: each character keeps up to 20 earlier states (50 MB in all), saved before an editing session, before a game system change, before a repair or restore, when it is deleted, and when you press Save a revision. The Revisions panel on the Overview restores one after saving the current state first; Undo also works. A deleted character's last state is kept for 30 days and can be brought back from the Data page.
- Check your library on the Data page finds and repairs links to missing files and characters, items in broken containers, and unused files.
- Import: an Import button on the Library and an Import command in the palette choose a backup or bundle and open its review on the Data page.
- Search everything: the command palette also searches characters, inventory, abilities, journal, relations, familiars, progression, campaigns, roster, sessions and handouts (secret session notes excluded). Type a word, or start with ? to search content only; up to 50 results.
- A generated sheet on the PDF sheets page: a PDF built from the character (values in the system's section order, pools, conditions, inventory, abilities, familiars, relations, journal titles), drawn with our own small PDF writer. It is the sheet unless you use an uploaded PDF as the sheet. View, Download, and Print the sheet; journal text and secret entries only if you tick the box.
- Portraits are cropped to a square in a dialog (drag or arrow keys, zoom); "Keep the whole image" keeps the old behaviour. PDF handouts open in the app's own viewer in a dialog instead of a browser tab.
- The zip reader refuses archives with too many entries, too much inflated data, suspicious compression, unsafe paths, zip64 or encryption before it inflates anything.
- The Data page warns when storage is 80% full, lists the largest files with their owners, and refuses new uploads at 95%.

## [0.6.0] - 2026-11-20

### Fixed

- On a phone the Sheet page (and any page built from a stack of panels) was wider than the screen. A wide table or
  toolbar made the grid track grow past the viewport; the stack now holds its column to the screen. A scenario
  measures the page width on a phone for the sheet, the character pages and the campaign pages.

### Added

- `docs/CAMPAIGN.md`, written before the code: campaigns that link to characters, the store holding both
  collections with one history, roster, a party view read from the sheets, sessions, an initiative tracker,
  handouts and secret rolls. Decisions K-1 to K-12; deferrals DEF-088 to DEF-090.
- **Campaigns** (`#/campaign/<id>`): tiles in the Library beside characters; an overview with fields of your own; a
  roster that links characters (a character can be in many; its Overview lists them and can add it); a **party
  view** whose columns are sheet formulas read from each character's own sheet, with a system's suggested columns,
  sorting and honest "No sheet" cells; a **session log** with attendees, secret notes and a recap copy that leaves
  secrets out; **handouts** (images and PDFs, judged by their bytes, shared by reference); and an **initiative
  tracker** that rolls the roster through the dice path (the campaign's expression, the system's, else 1d20),
  orders by value and tiebreak, steps turns and rounds with the current turn in text, resumes after a reload and
  ends with an undo. Campaigns are a second collection in the one store with one history, so deleting a character
  that sat on rosters is one undo step. Schema migration 6; the built-in systems suggest party columns and an
  initiative roll under `extensions.records`.
- **Secret rolls** (DEF-013): a Secret option on the dice page; marked in the log and left out of a campaign's
  recent rolls and recaps.

## [0.5.0] - P4 characters in depth

### Added

- `docs/CHARACTER.md`, written before the code: inventory with containers, carry weight and wallets,
  abilities, journal, relations with a derived reciprocal view, a progression log and familiars with their
  own sheets, the build order and the gate. Decisions C-1 to C-10; deferrals DEF-084 to DEF-086.
- **Six character pages** at `#/character/<id>/<page>`: Inventory (containers that cannot loop, carried weight with
  container multipliers, a wallet with typed changes that never go below zero, equip and quantity steppers),
  Abilities (use counters, restore all, a Roll button through the one rolling path), Journal (newest first, kind
  filter, goals you can tick), Relations (attitude with its word, links to characters, a derived "Others who know
  this character" view), Progression (experience total and last level) and Familiars (present toggle, make a
  character). Schema migration 5 adds the lists. Add, edit, reorder and delete with Undo; limits stated per page.
- **Extensible by design (C-11).** One descriptor per kind drives normalization, the store and a generic list page,
  and every record takes up to 30 fields of your own (text, number or yes/no) that are saved, duplicated and
  shown with it. Unknown keys are kept in `extensions`, so newer data survives older code.
- A system can set a carry limit, an attunement cap and currencies under `extensions.records` (C-12); the
  Inventory shows weight against the limit and says in words when it is over. Resting on the Sheet page also
  restores abilities that follow that rest, in the same undo step. A progression entry can be applied to the
  sheet's `xp` or `level` once. A familiar becomes a character in one undo step. The command palette opens any
  of a character's pages and the Overview shows counts and who is present.
- 15 more unit tests (262), 6 more browser scenarios (55 in all) and 8 more accessibility states.

## [0.4.0] - P3 the dice table

### Fixed

- On a phone the navigation drawer opened behind its own scrim, so taps dismissed it instead of navigating.
  Below 900px the sidebar is now a fixed overlay above the scrim. The scenario hit-tests the real stacking.

### Added

- **A character's Rolls page** (`#/character/<id>/rolls`): saved rolls with a name, group and an optional
  critical threshold; macros written as `name = expression` lines that fire as separate logged rolls sharing a
  group; add, edit, reorder, delete with undo; the system's rolls; and the character's recent rolls. The Sheet
  page gains a Rolls panel for the system's rolls and a Roll button on every `roll` field in a list row (which
  reads its own row through `$`). Pools and macros (DEF-010, DEF-011) are done. 2 more browser scenarios and
  2 more accessibility states.
- **The dice table** (`#/dice`, `Alt+5`, under Library): an expression field with live validation, quick dice,
  advantage and disadvantage, "roll as" a character so `@references` read their sheet, the system's saved
  rolls, a result card, and a persistent roll log (500, newest first) with search, a per-character view with
  an every-character option, roll again, and a clear that can be undone. Schema migration 4 adds
  `character.rollPresets`; `src/dice/presets.js` validates presets and macros. 3 new browser scenarios, 2 new
  accessibility states, 10 more unit tests.
- The formula parser has an opt-in dice mode (`parseFormula(source, { dice: true })`): terms with keep, drop,
  explode, reroll, min, max, pools and advantage. `src/dice/rng.js`, `roll.js` and `explain.js` roll an
  expression against a character's values and record every die. 21 new unit tests (exact scripted fixtures,
  seeded distributions, limits, hostile-input fuzz).
- `docs/DICE.md`, written before the code: dice as an opt-in mode of the formula language, the term grammar
  (keep, drop, explode, reroll, min, max, pools, advantage), resolution and the roll record, presets and
  macros, the bounded log, the dice table page, limits and the test plan. Decisions D-9 to D-15; deferrals
  DEF-082 and DEF-083.

## [0.3.0] - P2 the sheet engine and game systems

### Added

- `docs/SHEET.md`: game systems, derivation, the formula language, evaluation and limits, written before
  the code; `docs/reference/SHEET-REFERENCE.md`: what two real flat-PDF sheets for a derived 3.5e system
  showed (structure only; the sheets and their content are not in the repository).
- The sheet engine, pure and with no UI yet: a typed, total formula language with static checks and
  budgets (`src/sheet/formula.js`); strict system files with validation, cycle detection and errors by
  path (`template.js`); derivation by base and overlay (`resolve.js`); evaluation of fields, pools and
  collections in dependency order with errors as values, orphan reconciliation and rests
  (`evaluate.js`); the built-in Generic system (`src/templates/generic.json`).
- Decisions S-11 to S-16 (collections, the formula language, pools, errors as values, the file format,
  markers) and deferral DEF-077 (assisted import from a flat PDF).
- 68 unit tests (168 in all), including a 4,000-case fuzz test of hostile formulas and a 300-value,
  500-row performance test (about 17 ms).

- Character sheets: a `sheet` record pinned to a game system (schema migration 3), store actions with undo,
  a versioned system registry stored per version, and `subFormats` so a modifier reads `+3`.
- The Sheet page (`#/character/<id>/sheet`): a system picker, typed inputs that explain a refusal and never
  store it, derived values, pools as numbers or tickable boxes, row tables with grouping and use counters,
  conditions, kept-aside values, rest buttons with Undo, errors beside the value, and change system.
- The Game systems page (`#/systems`, `Alt+4`) and editor (`#/systems/<id>`): built-ins are read-only; new
  systems start from a base or empty; derive, import, export and delete; a JSON editor with live validation
  by path, a summary and a test evaluation, saving each change as a new version so characters keep the
  version they use. Deferral DEF-078 tracks a visual editor.
- 23 more unit tests (191), 12 browser scenarios (39 in all) and 14 accessibility states (40 in all, zero
  violations).

- Built-in game systems **D&D 3.5e** and **D&D 5e** (structure and formulas only): 3.5e has classes with
  base attack and save progressions that sum across multiclassing, iterative attacks, size, armour class
  variants, saves, a 42-skill list with class-skill bonuses, weapons, feats, spells with prepared casts and
  nightly healing; 5e has proficiency by level, saves, 18 skills with expertise, passive Perception,
  spellcasting numbers, spell slots as boxes, hit dice and short and long rests.
- `defaultRows` on a collection, so a new sheet starts with its skill list; validated like any stored value.
- The newer-version diff (DEF-003): when a system has a newer version, the Sheet page offers a review of
  what was added, removed or changed and which stored values would be kept aside, then moves with Undo.
- The navigation is now a collapsible left sidebar (remembered; a drawer on phones, closing after you
  choose a page) instead of a popup under the brand. The brand links to the Library.
- 14 more unit tests (205), 3 more browser scenarios (41 in all) and 4 more accessibility states.

- **The visual system editor.** The editor page opens in a Visual view with tabs for Details, Fields, Pools,
  Collections (with their columns), Tables, Conditions, Rests, Rolls and Sections; add, edit and remove with
  a confirmation, keys checked, formulas and choices edited as text. For a derived system the forms edit
  the resolved system and `makeOverlay` writes the difference back as overlay operations, so a derivation
  stays a derivation; for a standalone system they write the parts directly. The JSON view stays in step
  both ways, and built-ins are read-only. An override can clear a property or a table entry with `null`.
- The translation layer concept (S-17) is written up in `docs/SHEET.md` 10 and scheduled by ease and value:
  renames within a system's versions (DEF-079, P4), translation between systems with a reviewed proposal
  (DEF-080, P6), and a visual map editor (DEF-081, after v1).
- 12 more unit tests (217 in all), 3 more browser scenarios (44 in all) and 6 more accessibility states.

### Fixed

- A PDF page race: the empty state waited on an asynchronous file check before drawing; it now draws
  immediately and is refined afterwards. It caused one CI failure.
- Derivation: a derived system file's own description overrode an overlay `meta` operation; the overlay
  now wins.

## [0.2.0] - P1 characters and PDFs

### Added

- **PDF sheets.** A character keeps up to 20 PDFs (25 MB each): upload by button or drag and drop,
  rename in place, mark one as the sheet (the override for the generated sheet planned in P6), download,
  and remove with confirmation and Undo. Files are judged by their bytes, and a refused file is explained
  in a toast with nothing stored.
- **An in-app PDF viewer.** PDF.js 6.5.438 is vendored under `src/vendor/pdfjs/` with a `SOURCE.md` of
  hashes and loaded only when a PDF is opened. Pages draw to canvases as they scroll into view and are
  released when far away; zoom out, zoom in and fit width; a damaged or password-protected PDF shows a
  message and still downloads. PDF scripting is not vendored, so no PDF script can run.
- **Portraits.** Choose an image on the Overview; it is scaled to 512 px, stored as WebP and shown on the
  tile and the page, with initials when there is none.
- **A character link bar** (Overview, PDF sheets) with `aria-current`, routes `#/character/<id>/pdf`.
- **Shared files.** Blobs are immutable and shared by reference: duplicating a character shares its
  files, and a file nothing points at is collected at start-up after a ten minute grace. The Data page
  lists unused files and removes them on request.
- Schema migration 2 adds `documents` and `pdf` to stored characters; a browser scenario seeds version 1
  data to prove it.
- `docs/PDF.md`; decisions P-17, P-18 and U-11; deferrals DEF-075 and DEF-076.
- 25 more unit tests (100 in all), 11 more browser scenarios (27) and 9 more accessibility states (26).

### Fixed

- A confirmation dialog reopened in the same tick as the previous one closing could be resolved early as
  "cancelled" by the stale close event, so a Delete or Remove silently did nothing. This was the cause of
  an intermittent browser-scenario failure; a deterministic scenario now covers it.
- A Windows-style path was not stripped from an uploaded file's name.
- An oversize message could read "8.0 MB; the limit is 8.0 MB"; it now says the file is larger than the
  limit.
- A button's accessible name now contains its visible text ("Use as the sheet: Sheet.pdf").

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
