# ARCHITECTURE - shape, data flow, canonical model

> **Scope.** This document owns the application shape, data flow, the canonical model, module boundaries
> and the storage layout. Product intent is `docs/OMNISCRIBE.md`; choices are `DECISIONS.md`.

**Status:** designed; the P0 rows of the module map are built.

---

## 1. Shape

A static single-page application using native ES modules. No framework, no bundler, no backend. The
browser is the source of truth during a session; IndexedDB is the primary persistence layer, with a
`localStorage` fallback for the small project index only (PDFs and portraits need IndexedDB).

```text
index.html
  -> src/main.js                 boot, route dispatch (kept small, A-6)
       -> src/app/<surface>.js   one controller per surface: library, character, sheet, dice, ...
            -> store.js          the only writer: mutations, undo, selection
                 -> schema.js    normalization and factories
                 -> sheet/*      pure sheet engine (templates, formulas, evaluation)
                 -> dice/*       pure dice engine (parser, roller, explain)
            -> ui/*              renderers; no state, no imports of main.js
       -> storage.js             records and blobs, serialized write queue
            -> storage/idb.js
       -> tabGuard.js            one writer tab
       -> views.js               route table
```

## 2. Data flow

1. Input reaches a controller in `src/app/`, which calls a `store.js` action. Controllers wire events;
   they hold no derived state.
2. Each mutation captures a bounded history step. Rapid edits to one field group coalesce.
3. The store marks the touched records dirty and notifies subscribers. `ui/*` re-renders the affected
   regions from the store projection (A-2). Typing never replaces the input being typed in.
4. A 400 ms debounced save writes **only the dirty records** (P-10) and updates the header save state.
5. Evaluation is a pure function: `evaluateSheet(template, values) -> computed`. It runs on change and is
   cached by a content signature. The UI never computes a formula (A-2).
6. A roll is a pure function of an expression, a character's computed values and an injected RNG. The
   result is a record appended to the roll log.
7. Import parses, detects and normalizes; the preview shows what will change. Confirmation backs up the
   current data first (G-6).

## 2.1 Pages and routes

`src/views.js` is the pure route table; the location hash is the only view state.

| Route | Shows |
|---|---|
| `#/library` (home) | characters and campaigns as tiles |
| `#/data` | backup, restore, import, export, storage, integrity |
| `#/settings` | theme, density, shortcuts, guide |
| `#/systems` | game systems: built-in, custom and derived; create, derive, edit, import, export |
| `#/systems/<id>` | the system editor |
| `#/dice` | the dice table: roller, presets, log, character picker |
| `#/character/<id>` | character overview; sub-pages `/sheet`, `/pdf`, `/inventory`, `/abilities`, `/familiars`, `/relations`, `/journal`, `/rolls` |
| `#/campaign/<id>` | campaign overview; sub-pages `/roster`, `/party`, `/sessions`, `/initiative`, `/handouts` |

Hub pages have no side menu. A character or a campaign shows an editor menu holding only its own pages
(the Loreweaver two-mode model, U-7).

## 3. Why vanilla

Inherited from Loreweaver: zero install friction, an auditable codebase, a canonical model independent of
rendering. The known risk is state and rendering complexity as surfaces multiply. The mitigation is
structural, not a framework: one controller module per surface and a size cap (A-6).

## 4. Boundaries

| Layer | May import | Must not |
|---|---|---|
| `schema.js`, `migrations.js`, `sheet/*`, `dice/*`, `inventory.js`, `relations.js`, `campaigns.js`, `search.js`, `integrity.js`, `projects.js`, `views.js` | `utils.js`, each other where noted | DOM, storage, `main.js` |
| `sheet/*` and `dice/*` | `utils.js` only (they never see a character record) | everything else |
| `pdf/*` | `src/vendor/*` (lazy), pure `sheet/*` output | storage, the store |
| `src/vendor/*` | nothing | being imported by the pure core or by anything but `pdf/*` and the 3D scene |
| `storage/*` | `schema.js`, `migrations.js` | DOM |
| `ui/*` | `store.js` reads | own state, `main.js` |
| `app/*` | `store.js`, `ui/*`, pure modules | each other (go through the store or an event) |
| `main.js` | `app/*`, `views.js`, `storage.js` | domain logic |

The pure modules are unit-tested under `node` with no DOM shim.

## 5. Canonical model

### Project (in memory)

```text
{
  version,
  ui: { searchQuery, sortMode },
  characters: Character[],
  campaigns: Campaign[],
  templates: Template[],          // custom and imported; built-ins are code-shipped data
  rollLog: Roll[]                 // bounded
}
```

`ui` is session state and never exported. `version` is the schema version; `migrations.js` is an
append-only list that upgrades stored and imported data on load (P-2).

### Character (an aggregate)

A character owns its sub-records, so duplicating or deleting one is a single atomic step. Campaigns link
to a character by id and never copy it (G-14).

```text
Character {
  id,                              // char_ prefix, never reused
  name, player, status,            // active | retired | dead | npc
  summary, tags: string[],
  portraitBlobId: string | null,
  systemId,                        // free label, e.g. "dnd5e"; informational
  template: { id, version },       // the template the sheet follows (S-3)
  sheet: {
    values:     { [fieldKey]: Value },   // authored inputs only
    pools:      { [poolKey]: { current, temp } },
    conditions: Condition[],
    orphans:    { [fieldKey]: Value }    // values whose field left the template (S-4)
  },
  documents: [{ id, blobId, name, size, kind, addedAt }],    // uploaded PDFs and other files
  pdf: { preference: "generated" | "uploaded", uploadedId | null },  // G-19: an upload overrides the generated sheet
  inventory: { items: Item[], wallets: { [currency]: number }, containers: Container[] },
  abilities: Ability[],
  familiars: Familiar[],
  relations: Relation[],
  journal:   JournalEntry[],
  progression: ProgressionEntry[],
  rollPresets: RollPreset[],
  notes,
  extensions,                      // unknown-field bucket, preserved on round trip
  createdAt, updatedAt
}
```

Derived values (`computed`) are never stored; they are recomputed from `values` and the template, so a
template fix corrects every character without a migration.

### Template (the hub for sheets)

```text
Template {
  id, version, name, system,        // system is a label only
  fields: Field[],                  // flat list, addressed by stable key
  sections: Section[],              // layout: titles, order, which fields where
  pools: PoolDef[],                 // hp, slots; with max formula and rest reset rules
  conditions: string[],
  rolls: RollDef[],                 // default roll presets, an expression each
  limits: { carry: formula | null }
}

Field { key, label, type, default, min, max, choices, formula, rollable, hint }
type: number | text | longtext | flag | choice | list | derived | table
```

A `derived` field has a `formula`; every other type is an authored input. See `docs/SHEET.md` once P2
lands. Built-in systems are plain JSON in `src/templates/` (generic first, then D&D 5e and 3.5e in P2),
read-only and loaded as data (G-13, S-6). Custom systems are stored records created in the in-app editor
or imported from a `.omniscribe-system.json` file (G-17, S-8).

### Derived systems

A system may derive from a base (S-9). It stores no copy of the base; it stores an overlay:

```text
Template {
  id, version, name,
  base: { id, version } | null,
  overlay: Op[]                      // present when base is set
}

Op { op: add | override | remove, target: field | section | pool | roll | condition, key, value }
```

`sheet/resolve.js` is pure: `resolveTemplate(template, lookup) -> flat template`, applying the base chain
(depth capped) and reporting a missing base, an op on a missing key and a cycle. Everything downstream
(evaluation, rolls, the sheet page, PDF generation) only ever sees the flat result. A character pins the
resolved id and version (S-10), and when a base is newer the diff shows added, removed and changed
fields before anything moves.

### Random tables (reserved, post-v1)

A table is data on the dice engine (D-7): rows with a weight or a die range, each row a text result, a
nested roll, a reference to another table or an item award. The roll record already carries nested
`terms`, so tables need a record type and a surface, not a model change. Owned by `docs/TABLES.md`
(DEF-014).

### Familiar

```text
Familiar {
  id, name, kind, summoned, portraitBlobId,
  template: { id, version },        // a compact companion template
  sheet: { values, pools, conditions },
  notes, linkedCharacterId | null   // set when promoted to a full character
}
```

### Relation

```text
Relation {
  id, targetType,                   // character | npc | faction
  targetId | null, targetName,      // id for a character in the library; a name otherwise
  kind, attitude, notes             // attitude is a bounded integer; kind is free text with suggestions
}
```

A character-to-character relation shows reciprocally on the target without storing a second record
(derived by `relations.js`).

### Campaign

```text
Campaign {
  id,                               // camp_ prefix
  name, system, description, status,
  roster: [{ characterId, role, status, joinedAt, notes }],
  sessions: [{ id, date, title, notes, attendeeIds }],
  handouts: [{ id, blobId, name, size }],
  initiative: { entries, turn, round } | null,
  createdAt, updatedAt
}
```

Deleting a campaign leaves its characters. Deleting a character removes its roster rows and says so in
the confirmation.

### Roll

```text
Roll {
  id, at, characterId | null, campaignId | null,
  label, expression,                // as written
  resolved,                         // with @refs replaced by numbers
  terms: [{ kind, detail, value }], // every die and constant
  total, secret
}
```

## 6. Storage layout

IndexedDB database `omniscribe`:

| Store | Key | Holds |
|---|---|---|
| `meta` | key | schema version, settings, the project index, tab guard epoch |
| `characters` | `char_*` | one character aggregate per record |
| `campaigns` | `camp_*` | one campaign per record |
| `templates` | `tmpl_*` | custom and imported templates |
| `rolls` | `roll_*` | the bounded roll log |
| `blobs` | `blob_*` | `{ id, type, size, hash, data: Blob }` for PDFs, portraits, handouts |
| `revisions` | `rev_*` | bounded snapshots (P6) |

Records reference blobs by id. A record with a missing blob shows a visible "file missing" state;
`integrity.js` finds orphaned blobs and dangling references and can repair both (P-9).

## 7. Native container

- **Backup** (P6, DEF-030): a zip with `project.json` (version, characters, campaigns, templates) and
  `files/<blobId>` for every blob. The zip reader caps inflated size and entry count (DEF-071).
- **Character bundle** (P6): the same shape with one character and the blobs it references.
- JSON without blobs is offered for scripting and says plainly that PDFs are not in it.

## 8. Module map (planned)

| Path | Purpose | Phase |
|---|---|---|
| `index.html` | Shell, dialogs, toast region | P0 |
| `src/main.js` | Boot and wiring only | P0 built |
| `src/app/*.js` | One controller per surface (`shell`, `library`, `character`, `data`, `settings`, `palette`, `shortcuts`, `sync`) plus the `router`, `bus`, `actions` and `theme` helpers | P0 built |
| `src/schema.js`, `src/migrations.js` | Factories, normalization, append-only upgrades | P0 |
| `src/store.js`, `src/history.js` | The only writer; bounded undo | P0 |
| `src/storage.js`, `src/storage/idb.js`, `src/storage/memory.js` | Records, blobs, serialized writes; the IndexedDB and in-memory backends | P0 built |
| `src/autosave.js` | Debounced autosave over the dirty set | P0 built |
| `src/ui/*.js` | Renderers: `dom` helpers and page anatomy, `library`, `character`, `tagInput`, `data`, `settings`, `commandPalette`, `feedback` | P0 built |
| `src/tabGuard.js` | One writer tab over `BroadcastChannel` | P0 |
| `src/views.js`, `src/projects.js` | Routes; the library item model | P0 |
| `src/commands.js`, `src/ui/commandPalette.js` | Palette | P0 |
| `src/files.js` | Pure file checks: magic bytes, size limits | P1 |
| `src/sheet/formula.js` | Tokenizer, parser, evaluator, budget | P2 |
| `src/sheet/template.js`, `src/sheet/resolve.js`, `src/sheet/evaluate.js` | Template validation, base-and-overlay resolution, sheet evaluation | P2 |
| `src/templates/*.json` | Built-in systems as data: generic, then 5e and 3.5e | P2 |
| `src/app/systems.js`, `src/ui/systemEditor.js` | The game system manager and editor | P2 |
| `src/vendor/<lib>/` | Vendored PDF libraries with `SOURCE.md` (P-14) | P1, P6 |
| `src/pdf/view.js` | Lazy PDF viewer over the vendored reader | P1 |
| `src/pdf/generate.js` | Generated sheet from a resolved system and a character | P6 |
| `src/tables/*`, `src/scene3d/*` | Random tables and the 3D dice scene | post-v1 |
| `src/dice/parse.js`, `src/dice/roll.js`, `src/dice/explain.js` | Grammar, roller with injected RNG, breakdown text | P3 |
| `src/inventory.js`, `src/relations.js` | Pure helpers: weight, containers, reciprocal relations | P4 |
| `src/campaigns.js`, `src/initiative.js` | Roster and party projection, initiative order | P5 |
| `src/search.js`, `src/integrity.js`, `src/zip.js` | Search, repair, zip with caps | P6 |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA shell | P7 |

## 9. Extension points

- A new game system is one template file plus a fixture that evaluates it, or a derived overlay made in
  the app with no file at all.
- A random table or the 3D scene plugs in on top of the dice engine without changing the roll record.
- A new dice term is one parser rule and one roller rule, with a distribution test.
- A new character page is a controller in `app/`, a renderer in `ui/` and a route; no store change unless
  it adds a record type.
- A new importer is an adapter at the rim (post-v1, DEF-051); it never changes the canonical model.
