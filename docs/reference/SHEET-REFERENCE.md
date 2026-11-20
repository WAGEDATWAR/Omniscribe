# Sheet reference - what real derived-system sheets need

> **Authority:** none. This is prior art under `docs/reference/` (`DOCUMENTATION-INDEX.md` rule 0). It
> explains where requirements in `docs/SHEET.md` came from.

**Source.** Two flat character sheets (printed from a web page, no form fields) for a table's custom
d20 system that sits on a D&D 3.5e core and adds its own resource layer. They were supplied as
learning material, not as the intended product. They are private to their authors, so **they and their
names, lore and rules text are not in this repository**; only the structural patterns below are.

---

## 1. What the sheets contain

| Pattern | What was seen | What it means for the engine |
|---|---|---|
| A familiar core | Six ability scores with modifiers, armour class with touch and flat-footed variants, initiative, speed, base attack with iterative attacks (`+7 / +2`), grapple, three saves, skill totals, hit points | The 3.5e base needs derived values, a modifier on each ability and a display format for iterative attacks |
| A conversion layer | Values marked as converted from another system's numbers, and a level derived from the sum of levels in the other system | Derived values need a lookup over a sum of collection rows, and a field can carry a display `marker` |
| A second resource pool | A mana pool and an amulet store with a current value, a maximum, recovery rules and decay; "current" values are written in pencil | Pools have a maximum formula, a stored current value, rest rules, and a boxes display |
| Per-use limits | "1 / short rest", "1 / day", "reaction, 75 MP" | An item can carry a use counter that rests reset |
| Rows grouped by source | Powers, boons, racial gifts, spells and metamagic, each a row with cost, action type, limits, range and an effect | **Collections**: template-defined lists of typed records, grouped by a field |
| A rank ladder | Named ranks with a progress percentage per row, and "4 of 5 awakened" counted per group | A choice with ordered values, a number per row, and aggregate functions over a collection |
| A tier ladder | Spells by tier with a casting time and a mana cost that climbs an order of magnitude per tier | Lookup tables the formulas can read |
| Dice in the text | Damage like `2d12+4` and `30d6` beside each power, some depending on other values | Roll expressions stored as data and resolved against the sheet (G-16) |
| Computed difficulty | "Save DC 14 + Tier", "Essence DC 16" | Derived fields with formulas over other fields |
| Companions | Familiars with a role, a form, abilities, an upkeep cost and a cap on how many can be out | First-class familiars (P4) that share the sheet engine |
| Items | Equipment with a use and an effect, a container with a capacity | Inventory (P4) and a carrying limit |
| Tables of boxes | A session tracker of tick boxes for hit points lost and mana spent in tens | A pool display that draws boxes |
| Narrative blocks | Appearance, titles, a standing condition, and "how to play her" notes | Long text fields and notes, not computed values |
| Cross-character links | One character exists only inside another's realm; the two share a world | Relations and companions across characters (P4) |

## 2. What it changed in the design

- **Collections (S-11).** Powers, spells, attacks and similar rows are not hard-coded pages. They are
  collections defined by the system, so a derived system can add a list of powers with its own columns.
- **Pools carry rules (S-13).** A maximum formula, current and temporary values, a boxes display, and what
  each kind of rest does.
- **Aggregates and lookups (S-12).** `sum`, `count`, `min`, `max` over a collection column, a predicate for
  "awakened" rows, and `lookup` and `step` over named tables.
- **A marker on a field (S-16).** A display-only mark such as a dagger, so a sheet can say which numbers
  are converted without that being engine logic.
- **Derivation is layered (S-9).** The sheets are exactly a 3.5e core plus an overlay: new pools, new
  collections, new tables and a few overridden formulas. The base-and-overlay design covers it, and the
  overlay must reach into collections as well as fields.
- **Print-style layout (P6).** The generated PDF sheet should be able to reproduce this look: titled
  groups, two-column skill tables, row tables with cost and effect columns, and boxes for trackers.
- **Flat PDFs cannot be mapped (DEF-020).** These sheets have no form fields, so field mapping would not
  read them. Reading a flat PDF would need an assisted import from extracted text (DEF-077).

## 3. What is deliberately not engine logic

Ranks such as Iron and Bronze, mana, essences, tiers and the conversion rules are **content of one
system**, expressed in that system's file. The engine knows fields, pools, collections, tables and
formulas, and nothing about any of those names (G-1, G-5).
