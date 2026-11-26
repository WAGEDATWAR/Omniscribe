# Decisions

Locked choices and provisional answers, so design and code stay in sync. A guess is recorded only when
cheap to reverse.

**Status legend:** `locked` (not reversed without a new decision) -> `provisional` (cheap to reverse) ->
`open`.

**Series:** G = governance (product intent), A = architecture, S = sheet, D = dice, P = persistence, K = campaigns,
U = surface, C = character pages.

Most of G, A and P are inherited from Loreweaver on purpose. Where Omniscribe differs, the row says why.

---

## Product (G-series)

| # | Decision | Status |
|---|---|---|
| G-1 | **The sheet template is the hub.** The engine knows no game system; a system is a template file. | locked |
| G-2 | **Local-first, static hosting, no backend.** The browser is the database. | locked |
| G-3 | **`textContent` only.** A lint rule forbids `innerHTML`, `insertAdjacentHTML` and `document.write`. | locked |
| G-4 | **No runtime dependencies from a package manager.** Dev dependencies are `axe-core` and the release wrappers (P-15) only. A vendored library is allowed only by its own decision, as Loreweaver did for its tokenizer; P-14 approves the PDF libraries. | locked |
| G-5 | **Everything is data, validated.** No hardcoded special case for a system, field or item. | locked |
| G-6 | **Every destructive path is confirmation-gated**, and every import is backup-gated. | locked |
| G-7 | **Dark default, light opt-in**, both passing the contrast gate. | locked |
| G-8 | **Vanilla modules, no framework, no build step.** | locked |
| G-9 | **The product is Omniscribe.** Namespace `omniscribe`. | locked |
| G-10 | **Pre-1.0 semver, changelog per release, `vX.Y.Z` tags.** | locked |
| G-11 | **The sheet computes; the player applies the rules.** No combat or spell resolution engine. | locked |
| G-12 | **No account, cloud sync, telemetry or collaboration in v1.** | locked |
| G-13 | **No rules text ships.** Templates carry structure and formulas; the user brings their own PDFs and item data. | locked |
| G-14 | **A character is an aggregate; a campaign links, never copies.** Inventory, familiars, relations and journals live inside the character. A roster row holds a character id. | locked |
| G-15 | **The values are the character.** A PDF, uploaded or generated, is a view of them, not the source. | locked |
| G-16 | **Dice and formulas resolve against one evaluated character.** A roll never reads raw storage. | locked |
| G-17 | **Game systems are user content.** The app creates, edits, imports, exports and derives game systems in-app; built-in systems are read-only starting points, never a privileged path. | locked |
| G-18 | **Distribution:** GitHub Pages hosts the web app, and each tagged release also publishes a Windows build and an Android APK as downloadable runnable files. | locked |
| G-19 | **The PDF is generated from the data; an uploaded PDF overrides it.** A character shows its generated sheet unless the user chose an uploaded PDF, and the generated one is always available. Supersedes G-15's "never parsed": parsing is allowed after DEF-020. | locked |
| G-20 | **Scope grows by the catalogue.** Random tables, 3D dice and other expansions enter through the charter backlog into a phase or a ledger row; the engines are built so they plug in without a model change. | locked |

## Architecture (A-series)

| # | Decision | Status |
|---|---|---|
| A-1 | **Pure core.** `schema`, `migrations`, `sheet/*`, `dice/*`, `inventory`, `relations`, `campaigns`, `search`, `integrity`, `projects`, `views` never import the DOM, storage or `main.js`. | locked |
| A-2 | **The UI never holds state.** It renders the store projection; a formula in a renderer is a bug. | locked |
| A-3 | **One writer.** The store mutates; controllers wire events; renderers render. | locked |
| A-4 | **Ids are opaque strings with a type prefix** (`char_`, `camp_`, `item_`, `blob_`, `roll_`) and are never reused. | locked |
| A-5 | **Unknown fields are preserved** in an `extensions` bucket and restored on export. | locked |
| A-6 | **`main.js` boots and routes only.** Each surface is one controller in `src/app/`. A source file over 1,500 lines fails `npm run lint`. Why: Loreweaver's `main.js` reached about 5,500 lines and needed a retrofit split. | locked |
| A-7 | **Evaluation is cached by content signature** and is pure; derived values are never stored. | locked |
| A-8 | **Own formula parser; no `eval`, no `Function`.** The language is total: no loops, no user functions, a step budget and a length cap, and cycles are reported, not looped. | locked |
| A-9 | **Controllers do not import each other.** They communicate through the store or a named event. | provisional |
| A-10 | **Tooling is copied from Loreweaver at P0, then owned here.** A shared tooling package is a separate decision if drift hurts. | provisional |

## Sheet (S-series)

| # | Decision | Status |
|---|---|---|
| S-1 | **Fields are addressed by stable keys.** `@key` and `@key.sub` are the only way formulas and dice refer to a value; a label change never breaks a roll. | locked |
| S-2 | **Values are typed.** A number field never holds text; a bad paste is rejected with a visible reason, not coerced. | locked |
| S-3 | **A character pins its template id and version.** Moving to a newer template is an explicit action with a diff (DEF-003). | locked |
| S-4 | **A value whose field disappears is kept as an orphan**, shown on the sheet, never deleted silently. | locked |
| S-5 | **Built-in templates are JSON data** in `src/templates/`; a template file is imported, validated and stored like any record. | locked |
| S-6 | **A generic system ships first.** D&D 5e and D&D 3.5e follow as built-in, read-only systems in P2 once the engine and editor exist, carrying structure and formulas only (G-13). More systems are user content (G-17). | locked |
| S-7 | **Pools carry their own rest rules** in the template (what resets on a short or long rest). | provisional |
| S-8 | **A system is created, edited, exported and imported in-app** as a `.omniscribe-system.json` file validated like any record. The editor ships in P2, not later. | locked |
| S-9 | **A system may derive from a base.** It stores `base: { id, version }` and an overlay of operations (add, override, remove for fields, sections, pools, rolls); the pure `resolveTemplate` flattens it. A built-in cannot be edited; "Derive" creates an editable overlay. | locked |
| S-10 | **A character pins the resolved system id and version** (S-3). When a base changes, derived systems and their characters see a diff before anything moves (DEF-003). Importing a derived system whose base is missing offers to bundle or skip the base. | locked |

## Dice (D-series)

| # | Decision | Status |
|---|---|---|
| S-11 | **Rows are template-defined collections.** Powers, spells, attacks, skills and similar lists are collections with typed columns, grouping and per-row use counters, not hard-coded pages. Inventory, familiars and relations stay first-class (P4) and may reuse the same row editor. | locked |
| S-12 | **The formula language is typed, total and has no coercion.** Numbers, strings and booleans; `@key`, `@key.sub`, `@collection.column` and `$` item references; the function list in `docs/SHEET.md` 3; budgets of 500 characters, 400 nodes, depth 40 and 20,000 steps; an over-budget formula is an error, never a clamp. | locked |
| S-13 | **A pool is a named value with a maximum formula, stored `current` and `temp`, a display of number or boxes, and a rule per named rest.** `current` is clamped to the maximum when evaluated. | locked |
| S-14 | **Evaluation returns errors as values.** A failing formula gives its field a message and a null value, dependents report which input failed, and the rest of the sheet still evaluates. The result also carries a flat scope (`str`, `str.mod`, `hp.max`) that the dice read. | locked |
| S-15 | **A system file is strict JSON with `format: "omniscribe-system"`**, validated on import. Unknown keys are kept in `extensions` and reported as warnings. The file is at most 1 MB. | locked |
| S-16 | **`marker` is display-only.** A field may carry a mark such as a dagger so a sheet can flag converted numbers; it never changes a value. | locked |
| S-17 | **Translation proposes, the person confirms, nothing is deleted on its own.** Moving a character between system versions or systems may map, convert or rename values, but every change is a reviewed proposal and one undoable step; anything unmapped is kept aside. Renames within a system's versions come first, cross-system translation later (`docs/SHEET.md` 10). | provisional |
| S-18 | **A number where a formula is expected is read as that number** (a pool's `max`, a rest's `add` and `set`), and the import review says so. Anything else is still judged strictly (S-2). | locked |
| S-19 | **Formula errors say what to write:** `and` and `or` point to `&&` and `||`, `=` to `==`, an unknown function to the nearest known one, and `.name` is accepted as `$.name`. | locked |
| S-20 | **The language gains `switch`, `join` and the text functions** (`contains`, `startsWith`, `endsWith`, `length`, `trim`, `lower`, `upper`), and `min` and `max` over a column take a row test like `sum`. The reference lists every function and a test keeps it complete. | locked |
| S-21 | **A section may name a `page`, which makes it a tab beside the Sheet** (`#/character/<id>/p-<name>`). It is a property of the section, so derived systems and the visual editor handle it as any other. | locked |
| S-22 | **A system import is reviewed before it is saved:** every error with its path, every warning, the values that fail on a new sheet, and an outline of the sheet. A new sheet may start with or without the system's suggested rows. | locked |
| D-1 | **The dice grammar is documented once** (`docs/DICE.md`) and every term has a fixture and a distribution test. | locked |
| D-2 | **The RNG is injected.** Production uses `crypto.getRandomValues`; tests use a seeded generator. | locked |
| D-3 | **Limits:** at most 1,000 dice per term, 1,000,000 sides, 500 characters per expression, and an explosion cap. Over a limit is an error, not a clamp. | locked |
| D-4 | **Every roll records its explanation:** the resolved expression, each die and the total. A total with no breakdown is a bug. | locked |
| D-5 | **The roll log is bounded** (default 500) and persists, oldest dropped first. | locked |
| D-6 | **The dice table is a roller page plus a log.** An optional 3D animated scene is a later layer on top; the result always comes from the engine, and the scene only plays it back (DEF-012). | locked |
| D-8 | **The 3D scene uses vendored three.js** (G-4 exception, recorded here and in `src/vendor/three/SOURCE.md`), lazy-loaded only when the scene is enabled. Dice tumble by scripted animation that lands on the face the engine already chose; there is no physics engine, which keeps it small and makes the result deterministic. Chosen over a bespoke renderer because polyhedral dice (d4 to d20) are costly to hand-build. | locked |
| D-9 | **Dice are an opt-in mode of the formula language.** A dice expression is a formula plus dice terms, parsed by the same parser with dice enabled, so references, functions, `if`, limits and errors are one thing. A sheet formula can never roll. | locked |
| D-10 | **The random source is `int(max)`, uniform from 1 to max**, by rejection sampling over `crypto.getRandomValues`; tests use a seeded and a scripted source. | locked |
| D-11 | **Advantage and disadvantage apply to a single d20 term** (`d20adv`, or a roll option on the first d20 term without one); `adv` is shorthand for `2d20kh1`. | locked |
| D-12 | **A pool counts successes minus failures** (`cs`, `cf`) after rerolls, explosions and keep or drop; a pool with failures and no successes is a botch. Modifiers apply in a fixed order, not the order written. | locked |
| D-13 | **A roll records every die and every reference it read**, plus flags (critical, fumble, botch); one pure `explain` sentence serves the log, the result card and screen readers. | locked |
| D-14 | **System presets live in the system file; character presets live on the character** (`rollPresets`, migration 4). A macro is an ordered list of rolls sharing a group id, each recorded on its own. | locked |
| D-15 | **A roll is one action from the sheet and has no animation in P3**; the result is announced in a polite live region. | locked |
| D-7 | **Random tables (loot, encounters) are data on the dice engine.** A table is rows with weights or ranges that can roll dice, reference other tables and award items; it ships after v1 (DEF-014). The roll record already carries nested terms, so no model change is needed. | locked |

## Persistence (P-series)

| # | Decision | Status |
|---|---|---|
| P-1 | **IndexedDB primary, no `localStorage` copy.** Blobs need IndexedDB and a second copy would be a second source of truth, so when it is unavailable the app runs in memory with a persistent warning (see `docs/PERSISTENCE.md`). | locked |
| P-2 | **Schema migrations are append-only**; a released migration is never edited. | locked |
| P-3 | **Storage uses the `omniscribe` namespace.** | locked |
| P-4 | **Autosave with explicit status**, never manual-save-only. | locked |
| P-5 | **Pre-import backups use the native container** and stay restorable. | locked |
| P-6 | **Revisions are bounded** by count and by size, deduplicated by signature (P6). | locked |
| P-7 | **A restore snapshots the current state first**, so it is undoable. | locked |
| P-8 | **A failed write removes its own partial payload.** | locked |
| P-9 | **The integrity dialog repairs** duplicates, dangling refs and orphaned blobs. | locked |
| P-10 | **Persistence is per record** with dirty tracking, so editing one character never rewrites the library. Why: Loreweaver saved the whole project on every edit, which scales badly with many characters and journals. | locked |
| P-11 | **One writer tab.** A cross-tab guard pauses saving in an outdated tab and asks the user; it never overwrites silently. Built in P0, not retrofitted. | locked |
| P-12 | **Request persistent storage at boot** and surface the result in the storage panel. Built in P0. | locked |
| P-13 | **File limits:** 25 MB per PDF, 8 MB per portrait, and a visible total in the storage panel. A file is checked by magic bytes, not by extension. | provisional |
| P-14 | **The PDF libraries are vendored**, lazy-loaded only on PDF surfaces: a viewer and reader (PDF.js style) from P1, and a writer (pdf-lib style) from P6. Each lives in `src/vendor/<name>/` with `SOURCE.md` (version, URL, licence, hash) and is never imported by the pure core. The reader is `pdfjs-dist` 6.5.438 (`docs/PDF.md`); the writer is chosen when P6 starts. | locked |
| P-15 | **Release wrappers are dev dependencies:** Capacitor for Android as Loreweaver does, and Electron for Windows. They package the same `www/` bundle and add no app code beyond a minimal Electron main file in `desktop/`. | locked |
| P-16 | **Each shell has its own storage origin** (browser, installed app, Windows build, Android). A backup file is the only bridge between them, and the Data page says so. | locked |
| P-17 | **Blobs are immutable and shared by reference; unused ones are collected by reachability.** Duplicating a character copies its document records, not its files. A blob nothing points at and older than ten minutes is deleted at start-up, and the Data page can remove unused files at once. | locked |
| P-18 | **`'wasm-unsafe-eval'` is allowed in `script-src`** so PDF.js can compile its WebAssembly decoders. It permits WebAssembly only; `eval` and `Function` stay forbidden (A-8). | locked |

## Surface (U-series)

| # | Decision | Status |
|---|---|---|
| U-1 | **Dark tokens with AA contrast at intended size**, same token set as Loreweaver. | locked |
| U-2 | **Native `<dialog>` for every dialog.** | locked |
| U-3 | **Every new dialog joins `e2e/a11y.mjs` in the same change.** | locked |
| U-4 | **Two modes, two menus.** Hub pages have no side menu; a character or a campaign shows its own page menu. | locked |
| U-5 | **Routes are the location hash**, owned by `src/views.js`. | locked |
| U-6 | **One page anatomy.** Every character page and campaign page is built from the same header, section and empty-state components, so parity is a checklist, not a review. Why: Loreweaver needed a redesign to bring cards to parity with lorebooks. | locked |
| U-7 | **Icon-only buttons carry `aria-label` and `title`**, and `prefers-reduced-motion` disables animation. | locked |
| U-8 | **PDFs render in the app's own viewer** (P-14), page by page to a canvas, so they look the same on every shell including Android and no PDF script runs. Open and download stay available. | locked |
| U-9 | **Table-speed rule:** rolling, adjusting HP and toggling a condition take at most two actions from a character's sheet. | locked |
| U-11 | **A character's pages are a link bar under its header** (Overview, PDF sheets, and later Sheet, Inventory and the rest). It scrolls sideways on a phone and the current page is marked with `aria-current`. This replaces the side editor menu planned in U-4 for characters. | locked |
| U-10 | **A UI evaluation and redesign precedes v1** (DEF-060). It may change layout and style but not the model, the engines or the pure core. | provisional |

## Character pages (C-series)

| # | Decision | Status |
|---|---|---|
| C-1 | **Everything a player writes about a character is a list on that character.** Inventory, abilities, journal, relations, progression and familiars are records inside the aggregate (G-14), saved, duplicated, deleted and undone with it. | locked |
| C-2 | **No page needs a game system.** A system may enrich a page (a carry limit, currencies, rest ids, a companion template) through optional validated keys, but an empty system still gives a working page. | locked |
| C-3 | **Containers hold items by id and may not form a cycle;** deleting a container moves its contents out and says so. Carried weight counts nested contents, scaled by an optional container multiplier. | locked |
| C-4 | **A limit is a warning, never a block,** for carry weight and attunement; a record count limit is a plain-message refusal. | locked |
| C-5 | **Abilities are free-form records, not the template's collections** (S-11). They may carry a use counter that follows the system's rests and an optional dice expression that rolls through the one rolling path. | locked |
| C-6 | **Journal text is plain text** rendered with `textContent`; goals have a done flag; secret entries are marked and are hidden from party views in P5. | locked |
| C-7 | **A character relation is stored once.** The reciprocal view is derived by `relations.js` from the other characters; a deleted target leaves the cached name, never a dropped relation. | locked |
| C-8 | **Progression is a log, not a calculator.** Applying an entry to the sheet is an explicit, undoable button, and only when the sheet has the matching field. | locked |
| C-9 | **A familiar's sheet is the character sheet shape,** evaluated by the same engine against any system, so a companion needs no new engine. Promotion creates a linked character and keeps the familiar. | locked |
| C-10 | **Schema migration 5 adds every new list empty,** with a `normalize*` per record that drops a bad record and keeps the rest. | locked |
| C-11 | **Records are described by data, and every record takes fields of your own.** One descriptor per kind (`src/records/kinds.js`) drives normalization, the store and the generic list page; a record also carries up to 30 user-defined fields (name, type, value) and keeps unknown keys in `extensions`. A new kind or field is a descriptor change. | locked |
| C-12 | **A system tunes the record pages under its own `extensions.records`** (carry and attunement limits as numbers or formulas over the sheet, and currencies), validated by the records module. No change to the system format, derived systems inherit it, and a system that says nothing still gives a working page. | locked |

## Campaigns (K-series)

| # | Decision | Status |
|---|---|---|
| K-1 | **A campaign links to characters and never copies them.** A roster row holds a character id; every figure shown is read from the character's sheet when viewed (G-14). Deleting a character removes its roster rows and initiative entries and the confirmation says so; deleting a campaign leaves the characters. | locked |
| K-2 | **Campaigns are a second collection in the one store.** State is `{ characters, campaigns }`, one history step snapshots both, and autosave writes each per record. Schema migration 6 adds `campaigns: []`. | locked |
| K-3 | **Roster, sessions and handouts are record kinds described by data** (C-11): the same normalizer, limits, generic list page and fields of your own. | locked |
| K-4 | **The party view stores nothing.** Columns are formulas over each character's own sheet (no dice); a missing sheet or an error shows as text, never as 0. A system may suggest columns under `extensions.records.party` (C-12). | locked |
| K-5 | **Initiative rolls through the one rolling path** with the character's own values: the campaign's expression, else the system's `extensions.records.initiative`, else `1d20`. Order is value descending, ties keep entry order unless edited; the current turn is marked in text and announced. | locked |
| K-6 | **The fight resumes after a reload:** round, turn and entries are saved with the campaign; ending an encounter is confirmed and undoable. | locked |
| K-7 | **Handouts are images and PDFs in the blob store,** judged by bytes, shared by reference, counted by integrity, images are shown in the app; a PDF opens in a browser tab until the in-app viewer takes it (DEF-090). | locked |
| K-8 | **A session recap is plain text copied to the clipboard,** without secrets. Nothing is sent anywhere. | locked |
| K-9 | **"Secret" means kept out of shared views and exports, not access control.** Secret journal entries, secret session notes and secret rolls are excluded by one function, `isShared(record)`, used by every shared view (DEF-013). There are no accounts. | locked |
| K-10 | **A character's campaigns are derived,** shown on its Overview from the campaigns; assignment can be made from either side and nothing is stored twice. | locked |
| K-11 | **Campaigns appear in the Library as tiles** beside characters, with shared search and a status filter; there is no separate hub page. | locked |
| K-12 | **Automation stays out of P5:** no attack or damage resolution, no ticking conditions, no maps. Conditions on initiative are DEF-088. | locked |

## Exchange (X-series)

| # | Decision | Status |
|---|---|---|
| X-1 | **The zip container is our own, over the platform's deflate.** `src/zip.js` writes and reads stored and deflate-raw entries with `CompressionStream` and `DecompressionStream` and its own CRC-32, so nothing is vendored. Already-compressed files are stored. | locked |
| X-2 | **The zip reader refuses before it inflates.** Caps on entries, total and per-entry size and ratio; no traversal paths, duplicates, zip64, encryption or unknown methods (DEF-071). A refused file changes nothing. | locked |
| X-3 | **One container shape for backup and bundles:** `manifest.json`, `project.json`, `files/<blobId>`, `files.json`, told apart by `manifest.kind`. Import migrates older schemas and refuses a newer one; blobs are checked by SHA-256. | locked |
| X-4 | **Restore is a review, then a choice of Replace or Add.** Replace writes a safety backup first and swaps in one transaction; Add never overwrites. Both are one Undo step for the records. | locked |
| X-5 | **Imported ids are remapped on collision and every link is rewritten in one pass** (roster, relations, containers, attendees); blobs match by hash and are reused. | locked |
| X-6 | **A bundle is the exchange format between people:** one character or one campaign, its files and the systems it needs; no settings, no roll log. Import shows a review and commits only on confirmation. | locked |
| X-7 | **Revisions are per character, bounded and labelled-last** (20 each, 50 MB total), taken before risky changes and once per editing session; a deleted character's revisions last 30 days; a revision keeps its blobs reachable (P-6, P-7). | locked |
| X-8 | **Shared exports leave secrets out by default** (secret session notes, secret rolls); a personal backup keeps everything (K-9). | locked |
| X-9 | **Backups are user-initiated and local.** The app shows when the last one was made and nags only inside the Data page; it never uploads or schedules one. | locked |
| X-10 | **Search is a pure in-memory index over records,** rebuilt lazily, capped at 50 hits, accent-insensitive, every word must match, and it never surfaces secrets in a shared view. | locked |
| X-11 | **The generated sheet uses our own minimal PDF writer** (built-in Helvetica and Courier, WinAnsi), no vendored library; an uploaded PDF overrides it only when marked as the main sheet (G-19). | locked |
| X-12 | **A backup may carry settings and the roll log as options; a bundle never does.** | locked |

## Layouts (L-series)

| # | Decision | Status |
|---|---|---|
| L-1 | **A page's fields come from a layout: a generated default plus a user overlay of operations** (add, move, hide, show, override, remove), resolved by pure code that never throws and drops operations that no longer apply. A layout is never a frozen copy. Supersedes C-11's trailing "fields of your own". | locked |
| L-2 | **Fields of your own are declared in the layout and hold a stable id;** a record stores only values, at `record.fields[id]`. There are no anonymous per-record fields. | locked |
| L-3 | **One active layout per surface for the whole library;** pinning a layout to a character or campaign is a later extension. | locked |
| L-4 | **Hiding never deletes; removing a field keeps its values aside** until the user purges them. A record's title field cannot be hidden. | locked |
| L-5 | **Layouts are edited in place** on the page, every move works from the keyboard, each change is one Undo step. The Sheet page keeps the game system's own layout (S-series). | locked |
| L-6 | **Today's `custom` entries migrate without loss** into own fields in an automatic section, in live data, backups and revisions. | locked |

## Release (R-series)

| # | Decision | Status |
|---|---|---|
| R-1 | **One bundle, four shells.** `npm run bundle` copies the shipped files to `www/`; Pages, the PWA, Electron and Capacitor all load that directory unchanged. There is still no build step for the app. | locked |
| R-2 | **The service worker is network-first with a hashed cache,** stamped by the bundle with a version and the full file list; it never touches non-GET or cross-origin requests. | locked |
| R-3 | **A tag publishes everything:** one workflow verifies, then deploys Pages, builds the Windows zip and the APK and attaches them to the GitHub release. Pages deploys from Actions, not from `main`. | locked |
| R-4 | **The Windows build is an unpacked Electron folder, zipped,** serving `www/` through a privileged `app://` scheme with the sandbox on, no preload and no IPC. No installer, no auto-update, no code signing in v1. | locked |
| R-5 | **The APK is debug-signed in v1** and says so; a release keystore is DEF-061. The app id is `sh.omniscribe.app`. | locked |
| R-6 | **The UI evaluation is scripted and ranked** (capture at four widths and both themes, a keyboard pass, a ranked review document), and everything that blocks or slows a task is fixed before v1 (U-10). | locked |
| R-7 | **A release is gated by the benchmark** (200 characters, 5,000 items) as well as the other gates. | locked |
| R-8 | **v1.0.0 is the first release with a Windows build and an APK attached.** | locked |

## Expansion (E-series)

| # | Decision | Status |
|---|---|---|
| E-1 | **P8 is delivered in independent slices ordered by value at the table, then by how little of the model they disturb;** it tracks v1 and never gates it. The plan is `docs/EXPANSION.md`. | locked |
| E-2 | **A number field may work its default out when a sheet starts** (`defaultFormula`, formula or dice, from the fields before it); the plain default is the fallback. | locked |
| E-3 | **A saved roll may carry a target and a direction** and its record then carries a verdict with a margin; the roll still only produces a number. | locked |

| E-4 | **A track is a field type with named boxes that are empty, marked or crossed,** read by formulas as counts (`@track`, `@track.crossed`, `@track.boxes`); it lives on the sheet, not in rows. | locked |
| E-5 | **Long text is shown through a small markdown subset built only from text nodes;** the stored text stays plain and nothing is ever parsed as markup. | locked |

## Open

| # | Question | Needed by |
|---|---|---|
None open.

Resolved: O-1 generic first, then 5e and 3.5e (S-6). O-2 the dice table is a roller and log with an
optional 3D scene, and random tables are separate data (D-6, D-7). O-3 GitHub Pages plus Windows and
Android releases (G-18). O-4 git is initialised. O-5 the Windows wrapper is Electron (P-15). O-6 the 3D
scene uses vendored three.js with scripted, physics-free tumbles (D-8). O-7 the repository is the public
`Omniscribe` repository on GitHub.
