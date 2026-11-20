# SHEET - game systems, the formula language, evaluation

> **Scope.** This document owns game systems (templates), derivation by base and overlay, the formula
> language, how a sheet is evaluated and how stored values are validated. Roll expressions are
> `docs/DICE.md`. The choices are `DECISIONS.md` G-1, G-5, G-16, A-8 and S-1 to S-16; where the design came
> from is `docs/reference/SHEET-REFERENCE.md`.

**Status:** designed (P2). The engine modules are built in order: the formula language, template
validation, derivation, evaluation, then the pages. `TODO.md` says which exist.

---

## 1. The model in one page

A **system** is a JSON file (`format: "omniscribe-system"`). It declares:

| Part | What it is |
|---|---|
| `fields` | Typed single values: numbers, text, flags, choices, lists and **derived** values with a formula |
| `pools` | A value with a maximum and a current amount: hit points, mana, charges. Rests change them |
| `collections` | Lists of typed rows with their own columns: powers, spells, attacks, skills |
| `tables` | Named number or text lookups: costs by tier, a bonus by level |
| `conditions`, `rests`, `rolls`, `sections` | Condition names, named rests, saved roll expressions, and layout hints |

A character stores only **authored** values (`sheet.values`, `sheet.pools`, `sheet.collections`,
`sheet.conditions`) and pins the system id and version (S-3). Everything derived is recomputed on every
change by a pure function and never stored (A-7). The engine knows no game; every game name, rank and
rule is the content of a system file (G-1, G-5).

## 2. The system file

```text
{
  "format": "omniscribe-system", "formatVersion": 1,
  "id": "my-system", "version": 1, "name": "My system", "system": "Label", "description": "",
  "base": null | { "id": "dnd35", "version": 1 },
  "overlay": [ Op ],                       // only when `base` is set
  "fields": [ Field ], "pools": [ Pool ], "collections": [ Collection ],
  "tables": { "name": { "key": value } },
  "conditions": [ "Name" ], "rests": [ { "id": "long", "label": "Long rest" } ],
  "rolls": [ { "key", "label", "expression", "group" } ],
  "sections": [ { "id", "title", "layout": "fields|table|text", "items": [ key ] } ]
}
```

- **Keys** are lower snake case, `^[a-z][a-z0-9_]{0,31}$`, unique across fields, pools and collections.
  A key is permanent (S-1): labels may change, keys never do. `id` is `^[a-z0-9][a-z0-9_.-]{0,63}$`.
- **Unknown keys** in an imported file are kept in `extensions` and reported as warnings (A-5).
- A file is at most 1 MB.

### Field

```text
{ "key", "label", "type", "default", "min", "max", "integer", "maxLength",
  "choices": [ { "value", "label" } ], "formula", "format", "marker", "hint",
  "subs": { "name": "formula" }, "subFormats": { "name": "signed" } }
```

| `type` | Stored value | Rules |
|---|---|---|
| `number` | a finite number | `default` 0; `min`, `max`; `integer` (default true) |
| `text`, `longtext` | a string | `maxLength` 200 and 20,000 |
| `flag` | true or false | `default` false |
| `choice` | one of `choices[].value` | ordered; `default` is one of them |
| `list` | an array of strings | at most 100 items |
| `derived` | nothing is stored | `formula` required; `format` is `number`, `signed`, `integer`, `percent` or `text` |

`subs` attach named derived values to any field, addressed as `@key.name`. A d20 ability field `str` with
`"subs": { "mod": "floor((@str - 10) / 2)" }` is read as `@str.mod`, which is exactly the reference the
dice use (G-16). `subFormats` chooses how a sub is shown (`signed` makes a modifier read `+3`). `marker` is a display-only string such as a dagger; neither has any effect on a value.

### Pool

```text
{ "key", "label", "max": "formula", "temp": false, "display": "number|boxes", "boxSize": 1,
  "rests": { "restId": "full" | "none" | { "add": "formula" } | { "set": "formula" } }, "hint" }
```

Stored as `{ current, temp }`, where `current: null` means full, so a new character starts at its maximum and
stays there until it is first changed. The pool offers `@key.max`, `@key.current` and `@key.temp` (0 when `temp` is
off). `current` is clamped to 0 up to `max` when evaluated, so lowering a maximum never leaves an
impossible value. `display: "boxes"` draws one box per `boxSize` points. A rest id that is not listed in
`rests` does nothing to that pool.

### Collection

```text
{ "key", "label", "fields": [ ItemField ], "groupBy": "fieldKey", "sortBy": "fieldKey",
  "columns": [ "fieldKey" ], "maxItems": 200, "hint" }
```

An **item field** is a Field (without `subs`) plus two types: `uses` (stored as `{ used }`, with a `max`
formula and `resetOn`, a rest id) and `roll` (a roll expression string, `docs/DICE.md`). Item formulas read
their own row with `$.field` and the sheet with `@key`. A row is stored as `{ id: "row_...", field: value }`.
`@powers.cost` is the column of that name across all rows, and is only meaningful inside an aggregate
function.

### Tables

`"tables": { "tier_cost": { "0": 0, "1": 1, "2": 10, "3": 50 } }`. Keys are strings that read as numbers
for `step`; values are numbers or strings.

## 3. The formula language (A-8)

A formula is a small total language: no loops, no assignment, no user functions, no `eval`. It has its own
tokenizer, parser and evaluator in `src/sheet/formula.js`.

**Values** are numbers (finite only), strings and booleans. A list or a collection column appears only as
the argument of a function that takes one.

**Grammar** (lowest to highest precedence):

```text
or      := and ( "||" and )*
and     := compare ( "&&" compare )*
compare := add ( ( "==" | "!=" | "<" | "<=" | ">" | ">=" ) add )?
add     := mul ( ( "+" | "-" ) mul )*
mul     := unary ( ( "*" | "/" | "%" ) unary )*
unary   := ( "-" | "!" ) unary | power
power   := primary ( "^" unary )?
primary := number | "string" | true | false | reference | item | call | "(" or ")"
reference := "@" name ( "." name )*          item := "$" ( "." name )?
call      := name "(" [ or ( "," or )* ] ")"
```

- `+ - * / % ^` take numbers; `&& || !` take booleans; `< <= > >=` take two numbers or two strings;
  `==` and `!=` take two values of the same type. Nothing is coerced (S-2): `"3" + 1` is an error.
- Division or modulo by zero, a non-finite result and an exponent above 100 are errors.
- Strings use double quotes with `\"` and `\\`. Numbers are decimal with an optional fraction.

**Functions**

| Function | Result |
|---|---|
| `abs(n)` `ceil(n)` `floor(n)` `round(n [, digits])` | number |
| `min(a, b, ...)` `max(a, b, ...)` `clamp(n, lo, hi)` | number |
| `if(test, then, else)` | the chosen branch; the other is not evaluated |
| `sum(col [, test])` `avg(col [, test])` `min(col)` `max(col)` | number over a column; `test` is a boolean using `$` |
| `count(col [, test])` | number of rows (or of true tests) |
| `lookup(table, key [, fallback])` | the entry for `key`; the table name is a string literal |
| `step(table, n [, fallback])` | the entry for the greatest numeric key not above `n` |
| `index(@choiceField)` | the 0-based position of the current choice |
| `has(@listField, "x")` | true if the list holds `"x"` |
| `signed(n)` | `"+3"`, `"+0"`, `"-1"` |
| `text(x)` `concat(a, b, ...)` `number(s)` | conversions |

**Static checks** (done by validation, before any evaluation): the function exists and has the right number
of arguments; every `@reference` names a field, a sub, a pool value or a collection column; `$` is used only
inside an item formula or an aggregate test, and only names a field of that collection; a table name exists.

**Budgets** keep a hostile or careless formula from hanging the app (DEF-070): at most 500 characters, 400
syntax nodes, nesting depth 40, and 20,000 evaluation steps per formula, where each syntax node costs one
step and an aggregate costs its rows times its test. Going over a budget is an error, never a clamp.

**Errors are values, not exceptions.** A formula that fails gives its field an error message and a `null`
value; fields that read it get "depends on `x`, which has an error". One bad formula never stops the rest of
the sheet from evaluating.

## 4. Derivation by base and overlay (S-9, S-10)

A system with `"base": { id, version }` stores no copy of the base, only an `overlay` of operations:

```text
Op := { "op": "add" | "override" | "remove",
        "target": "field" | "pool" | "collection" | "item" | "table" | "roll" | "condition" | "rest" | "section" | "meta",
        "key": "...", "parent": "collectionKey",   // parent only for target "item"
        "value": ... }
```

`add` appends (the key must be new). `override` shallow-merges `value` onto the existing entry (arrays and
`subs` are replaced whole). `remove` deletes it. For `condition` the `value` is the name; for `table`,
`override` merges keys into the table; for `meta` an override sets `name`, `system` and `description`.
The derived file's own `id`, `version`, `name`, `system` and `description` replace the base's first, then the
operations apply in order, so a `meta` override wins over the file's own description. A derived file carries no
`fields`, `pools`, `collections`, `rests`, `rolls`, `sections`, `conditions` or `tables` of its own; those are an
error, because the overlay is the one place a derivation says what it changes.

`resolveTemplate(template, lookup)` is pure. It resolves the base chain first (at most 5 deep), applies the
overlay, and returns a flat system with a `provenance` list. It **reports** (never throws) a missing base, a
base cycle, an operation on a key that does not exist, an `add` of a key that already exists, and a result
that fails validation. Everything downstream (evaluation, rolls, the pages, the generated PDF) sees only the
flat result. Built-in systems are read-only; "Derive" creates an overlay (S-9).

## 5. Validation

`validateTemplate(template)` returns `{ ok, errors, warnings }`, each `{ path, message }`. It checks: the
format and version; every key, id and size limit; every field type and its rules; that every formula parses
and passes the static checks; that every `@reference`, table, rest id, section item, `groupBy`, `sortBy` and
`columns` entry exists; roll expressions' `@references`; and that the dependency graph has **no cycle**. A
cycle error names the keys on it.

## 6. Evaluation

`evaluateSheet(template, sheet)` is pure and returns:

```text
{ values:      { "str": 16, "str.mod": 3, "hp.max": 12, "hp.current": 9, ... },   // flat; the dice read this
  pools:       { hp: { max, current, temp } },
  collections: { powers: [ { id, values: { ... }, derived: { ... }, uses: { ... } } ] },
  errors:      [ { path, message } ] }
```

1. Authored values are checked and defaulted; derived values are not stored.
2. Dependencies are read from each formula's syntax tree. Nodes are fields, subs, pool maxima and collection
   columns. A node that is part of a cycle gets the cycle error.
3. Nodes evaluate in dependency order under the budgets above.
4. The result is cached by a signature of the template and the sheet (A-7).

`validateValue(field, raw)` returns `{ ok, value }` or `{ ok: false, reason }`. It never coerces: a number
field refuses text, a choice refuses a value that is not listed, and the reason is shown to the person.

`createSheet(template)` builds a new sheet from defaults, with every pool full.

`reconcileSheet(template, sheet)` runs when a character moves to a newer system version (DEF-003). A stored
value whose field is gone moves to `sheet.orphans` and is shown, never deleted (S-4); an orphan whose field
returns is restored.

`applyRest(template, sheet, restId)` applies each pool's rule for that rest and resets every `uses` field
whose `resetOn` is that rest. It is one undoable step (DEF-005).

## 7. Limits

| Limit | Value |
|---|---|
| System file | 1 MB |
| Fields, pools, collections | 400, 40, 40 |
| Item fields per collection | 40 |
| Rows per collection | 500 (default 200) |
| Table entries, tables | 400 per table, 60 tables |
| Conditions, rests | 100, 8 |
| Formula | 500 characters, 400 nodes, depth 40, 20,000 steps |
| Base chain | 5 |

## 8. Files

| Path | Job |
|---|---|
| `src/sheet/formula.js` | tokenizer, parser, static checks, evaluator, budgets |
| `src/sheet/template.js` | the format constants, `validateTemplate`, `validateValue`, defaults |
| `src/sheet/resolve.js` | `resolveTemplate` |
| `src/sheet/evaluate.js` | `createSheet`, `evaluateSheet`, `reconcileSheet`, `applyRest` |
| `src/templates/*.json` | built-in systems: `generic` first, then 3.5e and 5e |
| `src/templates/index.js` | loads and resolves the built-ins; the file reader is injected |

The engine modules import only each other and `utils.js`, never a character record, the DOM or storage (A-1).
The tests use two fixtures with neutral names, `test/fixtures/systems/d20-core.json` and a derived
`d20-custom.json`, that exercise every feature the reference sheets showed (`docs/reference/SHEET-REFERENCE.md`).

## 9. Status

**Built and tested:** the formula language, template validation with cycle detection, derivation by base and
overlay, evaluation, `reconcileSheet`, `applyRest`, and the generic system.

**Not built yet:** a character's `sheet` record and its migration, the Sheet page, the Game systems page and
editor (DEF-001), the 5e and 3.5e systems (DEF-006, DEF-007), the newer-version diff (DEF-003) and the dice
grammar that checks roll expressions (P3). Reading a flat PDF into a sheet is DEF-077.
