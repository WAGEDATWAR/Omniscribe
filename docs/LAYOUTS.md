# LAYOUTS - page layouts and fields of your own

> **Scope.** How the pages that are not the Sheet decide which fields they show, in what order and under which
> heading, and how a user adds, hides, moves and groups fields. Supersedes C-11's "every record takes fields of
> your own" (the trailing editor). The Sheet page keeps its own layout, which belongs to the game system
> (`docs/SHEET.md`). Storage is `docs/PERSISTENCE.md`; exchange is `docs/EXCHANGE.md`.
>
> **Status:** decided (`DECISIONS.md` L-1 to L-6); slice L-A built (`src/layouts/`: limits, surfaces, values, resolve, migrate; `test/layouts.test.js`).

## 1. What is wrong today

- A record form ends with a fixed *Your own fields* block (name, type and value per row), and the campaign
  Overview ends with the same block plus its own Save button. It appears on every kind whether or not a kind
  needs it, under a heading that says nothing about the page it sits on.
- The fields are **per record and anonymous**: a field is a label typed again on every record, so two items can
  say "Rarity" and "rarity " and nothing connects them. Nothing can be sorted, searched by field, shown in the
  list row, or placed anywhere but the bottom.
- The character Overview has no such block at all, so the feature is inconsistent as well as intrusive.
- The built-in fields cannot be hidden, reordered or grouped either, so a user who never plays with weight still
  sees *Weight each* first.

## 2. Evaluation of the proposal

A template plus modifications is the right shape, and Omniscribe already has the machinery for it: a game system
is a base plus an overlay of add, override and remove operations (S-9, S-10), resolved by pure code that never
throws, with orphaned values kept rather than deleted (S-4). A page layout is the same problem with the same
answer. What to keep, and what to change:

| Proposal | Verdict | Refinement |
|---|---|---|
| Sections, fields, layout and order modifiable freely | Keep | Free for everything except the few fields a record cannot exist without (its title field). |
| Saved as a template with modifications | Keep, as an **overlay**, not a copy | A copy freezes the page at the app version the user saved it on; new built-in fields would never appear. An overlay on the generated default keeps working across releases. |
| Applies to character and campaign pages | Widen to every record page | One mechanism for the character Overview, each record kind and the campaign Overview. The Sheet stays with the game system. |
| "Fields of your own" stay | Keep, but **declared in the layout**, not typed into each record | A field is defined once (name, type, options, where it sits); each record only holds its value. This removes the redundancy and lets the field be searched, listed, sorted and printed. |
| Not intrusive | Needs a rule | A field with no value can be set to *hide when empty* so a page shows only what it has. The heading *Your own fields* disappears: a field sits in the section where it belongs. |
| Total control | Keep, with a safety rule | Hiding never deletes data. Removing a field definition keeps its values aside until the user purges them. |

Risks to design around, not away: reordering must work from the keyboard (drag is an extra, never the only way);
a layout touches backup, bundles, search, the generated PDF and revisions, so each needs its own line below; and
migration of today's anonymous fields must lose nothing.

## 3. The model

**Surface.** A named page that shows the fields of one record: `character` (the Overview), one per record kind
(`inventory`, `abilities`, `journal`, `relations`, `progression`, `familiars`) and `campaign` with its three
kinds (`roster`, `sessions`, `handouts`). The party columns and initiative kinds stay as they are.

**Default layout.** Generated in code from the descriptors (`KINDS`, `CAMPAIGN_KINDS`) and the character form:
sections and fields in today's order. It is never stored, so it is always current.

**Layout.** User content, one file per layout:

```
{ "id": "lay_...", "name": "Plain inventory", "surface": "inventory", "base": "default",
  "ops": [ { "op": "hide",     "target": "field", "key": "weightMultiplier" },
           { "op": "add",      "target": "section", "id": "magic", "title": "Magic", "after": "main" },
           { "op": "add",      "target": "field", "field": { "id": "cf_rarity", "label": "Rarity", "type": "choice",
                                  "choices": ["Common", "Rare"], "hideWhenEmpty": true }, "section": "magic" },
           { "op": "move",     "target": "field", "key": "cf_rarity", "section": "magic", "index": 0 },
           { "op": "override", "target": "field", "key": "notes", "value": { "wide": true, "label": "Lore" } } ] }
```

Operations are `add`, `move`, `hide`, `show`, `override` and `remove` (own fields and sections only). Resolving is
pure and never throws: an operation that names something that no longer exists is dropped and reported, exactly as
for game systems. A built-in field the layout does not mention appears at the end of its default section, so a new
release's new field is visible until the user hides it.

**Fields of your own.** Types: text, long text, number, yes or no, choice, date, tags. Each has a stable id
(`cf_...`), a label, an optional hint and default, and `hideWhenEmpty`. Values live on the record as
`record.fields[id]`, validated by the same typed rules as built-in fields: a bad value is rejected with a reason,
never coerced. A rename changes the label only.

**Which layout a page uses.** One active layout per surface, chosen on the page and kept in settings; a character
or campaign can later pin another (open question 1). No layout means the default.

## 4. The editing experience

The page edits **in place**: an *Edit layout* button turns the page into the form it is shaping, so the user sees
the result as they work. In edit mode each section and field shows small controls:

- **Move up and down** (and drag as an extra) within a section, and *Move to section* in a menu;
- **Hide** or **Show**; a hidden field stays in a folded *Hidden fields* list at the end so it can be brought back;
- **Rename** a section or one of your own fields; **Width** (half or full) per field;
- **Add a field** to a section (type, name, choices) and **Add a section**;
- **Remove** an own field or section, with a confirmation that says its values are kept aside.

Every change saves at once and is one Undo step. The header offers *Reset to default*, *Duplicate layout*,
*Rename layout* and *Switch layout*. A palette command, *Edit this page's layout*, opens the mode. Outside edit
mode a page shows no trace of the feature except that button. No layout dialog, no separate editor page.

## 5. How it meets the rest of the app

- **Storage and backup.** A `layouts` store beside systems; backups and bundles carry the layouts the exported
  records need (as they carry user systems), and an import never overwrites a layout of the same id.
- **Search.** Values of own fields are indexed under the field's label.
- **List rows.** A field marked *show in the list* appears in the row summary.
- **Generated sheet.** Own fields print in the section where they sit; hidden ones do not print.
- **Revisions and integrity.** Values travel with the record; a value whose field definition is gone is an orphan
  the integrity check lists and can purge.
- **Bundles and sharing.** Secret handling is unchanged: a field can be marked *secret* and is left out of shared
  bundles unless the user ticks the existing option.

## 6. Migration

Today's `record.custom` entries are `{label, type, value}`. On first load after the change, for each surface the
distinct label and type pairs become own fields in an automatic section called *From earlier* of that surface's
default overlay; values move to `record.fields`; `record.custom` is removed. A revision or backup written before
the change is migrated as it is read. Nothing is lost, and the user can then move those fields where they belong.

## 7. Slices

| Slice | Deliverable |
|---|---|
| L-A | Pure core: layout schema and validation, default layouts from descriptors, the overlay resolver, the typed value rules, migration of `custom`, unit tests. |
| L-B | Pages render from the resolved layout (record forms and rows, the character Overview, the campaign Overview); the old editors go; values and migration live. |
| L-C | The in-place editor with keyboard moves, add, hide, rename, remove, undo, reset, and its accessibility states. |
| L-D | Storage, backup, bundles, search, the generated sheet and integrity wired in; multiple layouts and switching. |

Release 0.7.0 waits for L-A to L-C at least (the old editors must not ship beside the new idea).

## 8. Not in scope

Formulas or conditions in own fields, linking an own field to a sheet value, per-field permissions, and changing
the Sheet page's layout (that is the game system's, edited in the system editor).

## 9. Decided

1. One active layout per surface, library-wide (L-3). Pinning to a character or campaign is later.
2. No anonymous per-record fields; a one-off need is met by adding a field in place (L-2).
