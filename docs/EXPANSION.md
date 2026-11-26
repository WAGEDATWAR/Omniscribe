# EXPANSION - the P8 plan

> **Scope.** What P8 builds, in what order, and why. P8 tracks v1 and never gates it (charter 7, G-20). Each slice is
> independent, ships behind the same gates as everything else, and has its own owning document when it needs one
> (`docs/TABLES.md` for random tables is written before its code). Decisions are `DECISIONS.md` E-1 to E-3; the
> rows are in `DEFERRALS.md` under owner P8.

## 1. How P8 is ordered

**E-1.** Slices are ordered by value at the table, then by how little of the model they disturb. The first slices
finish the sheet and the dice, which every player meets every session; the later ones add whole new surfaces.

| Slice | Contents | Rows | Status |
|---|---|---|---|
| P8-A | **The sheet and dice, finished.** Computed defaults, roll targets with a verdict, search across game systems; then tracks, markdown in long text and a drawn import preview | DEF-099, DEF-100, DEF-104, DEF-097, DEF-103, DEF-101 | built |
| P8-B | **Richer sheets.** Sub-collections, links between rows, per-character overrides of a system | DEF-095, DEF-096, DEF-098 | designed in SYSTEMS-REVIEW |
| P8-C | **Moving between systems.** Translation maps, a familiar's sheet editor | DEF-080, DEF-081, DEF-087 | not started |
| P8-D | **Random tables** as data on the dice engine | DEF-014 | needs `docs/TABLES.md` first |
| P8-E | **The 3D dice scene,** playing back a result the engine already chose | DEF-012 | needs vendored three.js (D-8) |
| P8-F | **Uploaded PDF forms:** read the fields and map them to sheet values, then fill them | DEF-020, DEF-077 | libraries approved (P-14) |
| P8-G | **Privacy and exchange:** encrypted local data, importers, a Loreweaver card | DEF-031, DEF-051, DEF-050 | not started |
| P8-H | **Table conveniences:** drag to reorder layouts, roll log export, custom-face dice, shared libraries | DEF-094, DEF-083, DEF-082, DEF-084 | not started |

## 2. P8-A as built

- **Computed defaults (DEF-099).** A number field may carry a `defaultFormula` (a formula or dice, such as `4d10` or
  `@level * 2`) that is worked out once when a sheet starts, from the fields before it; `default` is the fallback if it
  fails. Only number fields take one. It is validated like a saved roll (references must be single values), and
  `createSheet` accepts a random source so tests are exact.
- **Roll targets (DEF-100).** A saved roll may carry `target` (a formula such as `@skill`) and `compare` (`under`, the
  default, succeeds at or below; `over` succeeds at or above). The roll record gains `verdict`
  `{ target, compare, success, margin }`; the explanation ends `vs 60: success by 10`, and the result card says
  *Success by 10 (target 60)*. The margin is never negative; the words say which side.
- **Search across game systems (DEF-104).** The command palette finds an installed system by name, description or
  the label of any of its fields, pools, collections or rolls, and opens it.

- **Tracks (DEF-097).** A top-level field of type `track` has `boxes`: 1 to 20 names. Each box is empty, marked or crossed and a press moves it to the next state; the value is stored as a list of 0, 1 and 2. Formulas read `@track` (the marked boxes), `@track.crossed` and `@track.boxes`, and rolls and the party view read the same numbers. A track cannot sit in a collection row. If a later version of the system changes the number of boxes the stored list is padded or cut to fit.
- **Markdown in long text (DEF-103).** `src/markdown.js` parses headings, bullet and numbered lists, quotes, paragraphs and bold, italic and code into plain data; the UI builds it from text nodes only, so nothing can carry markup, links or scripts. Journal and ability text and session notes are shown this way; editing stays plain text.
- **A drawn import preview (DEF-101).** `src/sheet/preview.js` evaluates a fresh sheet and the import review draws each section with its starting values, the tables with their first rows and each tab it would add.

## 3. P8-B as built

- **Links between rows (DEF-096, E-6).** A collection field of type `link` has `to`, the key of another collection. The sheet shows a list of that collection's rows by name (the `name` field, else the first text field, else `Row 3`); the stored value is the row's id. A formula reads the linked row with `$.link.field`, a derived column included, in a column, a test inside `sum`/`count`, or a row roll. The dependency graph follows the link, so a loop through links is reported; an empty or removed link reads as 0, off or empty text. The PDF and the import preview print the row's name.

## 4. Not in P8

Anything that needs a server (a community library, accounts, sync) stays out (G-2); a hand-curated list of
importable files is DEF-102.
