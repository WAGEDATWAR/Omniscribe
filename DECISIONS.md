# Decisions

Locked choices and provisional answers, so design and code stay in sync. A guess is recorded only when
cheap to reverse.

**Status legend:** `locked` (not reversed without a new decision) -> `provisional` (cheap to reverse) ->
`open`.

**Series:** G = governance (product intent), A = architecture, S = sheet, D = dice, P = persistence,
U = surface.

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

## Open

| # | Question | Needed by |
|---|---|---|
None open.

Resolved: O-1 generic first, then 5e and 3.5e (S-6). O-2 the dice table is a roller and log with an
optional 3D scene, and random tables are separate data (D-6, D-7). O-3 GitHub Pages plus Windows and
Android releases (G-18). O-4 git is initialised. O-5 the Windows wrapper is Electron (P-15). O-6 the 3D
scene uses vendored three.js with scripted, physics-free tumbles (D-8). O-7 the repository is the public
`Omniscribe` repository on GitHub.
