# DICE - the dice grammar, rolls, presets, the log and the dice table

> **Scope.** This document owns dice expressions, how a roll resolves and what it records, roll presets,
> the roll log and the dice table page. Sheet values and the formula language are `docs/SHEET.md`; the choices
> are `DECISIONS.md` G-16, A-8, D-1 to D-15.

**Status:** P3 in progress. Built: the grammar, the roll engine, presets, the log and the dice table page. Still to build: a character's Rolls page and the Sheet roll buttons.

---

## 1. The one idea

> A roll is a formula that is allowed to roll dice, resolved against one character's values, and recorded with
> every die it threw.

A **dice expression** is the formula language of `docs/SHEET.md` 3 plus **dice terms**. `1d20 + @str.mod` is
a formula whose `@str.mod` reads the chosen character's evaluated sheet (G-16) and whose `1d20` throws a
die. Because it is the same language, a roll gets the same functions, `if`, references, limits and error
behaviour for free, and there is exactly one parser to trust (A-8).

Dice are an **opt-in mode** of that parser (D-9). A sheet formula can never roll: derived values stay pure,
cached and reproducible. Only the roll engine switches dice on.

## 2. Dice terms

```text
dice     := count? ( "d" | "D" ) sides modifier*
count    := integer | "(" expression ")"        // default 1
sides    := integer | "%" | "F" | "(" expression ")"
```

- A dice term has **no spaces inside it**: `4d6kh3` is one term, `4 d6` is an error. This keeps `d` from being
  confused with a name.
- `d%` is a 100-sided die. `dF` is a Fudge die with faces -1, 0 and +1.
- `count` and `sides` may be a parenthesised expression, so `(@level)d6` and `1d(@size)` work. Each must come
  out as a whole number inside the limits (section 8).
- A dice term binds tighter than `* / %` and `^`: `2d6 * 2` is `(2d6) * 2`, and `-2d6` negates the roll.
- A term's value is its **total**: the sum of the dice that count, or the number of successes in a pool.

### Modifiers

Modifiers follow the term directly and apply in the order they are written. A number after a modifier is
a whole number (a `(expression)` is also allowed).

| Modifier | Meaning |
|---|---|
| `kh N`, `kl N` | **Keep** the N highest or lowest dice; the rest are dropped. `4d6kh3` |
| `dh N`, `dl N` | **Drop** the N highest or lowest dice. `4d6dl1` |
| `!` , `!N`, `!>N`, `!>=N` | **Explode**: a die that rolls its maximum (or equals N, or is above N) is rolled again and added, repeatedly |
| `r N`, `r<N`, `r<=N`, `r>N`, `r>=N` | **Reroll** a die that matches, repeatedly until it does not |
| `ro N` and the same forms | **Reroll once**: reroll a matching die one time and keep the second result |
| `min N`, `max N` | Raise a die below N to N, or lower one above N to N |
| `cs>N`, `cs>=N`, `cs=N`, `cs<N`, `cs<=N` | **Count successes**: the total becomes the number of dice meeting the test (a *pool*) |
| `cf>N`, `cf>=N`, `cf=N`, `cf<N`, `cf<=N` | **Count failures**: each matching die subtracts one from the pool |
| `adv`, `dis` | On a d20: roll two and keep the higher or lower. Shorthand for `2d20kh1` and `2d20kl1` |

Examples: `d20`, `2d6+3`, `4d6kh3`, `d20adv + @str.mod`, `8d10cs>=8cf=1`, `3d6!`, `5d10r<3`, `(@level)d6`.

### Meaning of each modifier

- **Order.** `r`/`ro`/`min`/`max` act on each die as it is thrown, then `!` explodes, then `kh/kl/dh/dl` choose
  which dice count, then `cs`/`cf` turn the survivors into a pool. If you write them in another order the
  engine still applies this order; it does not guess.
- **Explode** adds a new die with the same sides for each triggering die, and a new die can trigger again.
  Exploded dice are marked as such in the result. A condition that every face meets (such as `!>=1`) is an
  error, because it could never stop.
- **Reroll** discards the matching die and throws a new one. A condition that every face meets is an error. A
  die that keeps matching is rerolled at most 100 times; going past that is an error (D-3), never a quiet stop.
- **Keep and drop** never exceed the number of dice: `2d6kh3` keeps both dice. Dropping more dice than exist
  leaves none and totals 0.
- **Pools** (`cs`, `cf`): total = successes - failures. A pool whose result is 0 or below because of failures
  is flagged `botch` when it has successes = 0 and failures > 0. A pool can combine with `!` and with keep/drop.
- **`adv`/`dis`** applies to a single `d20` term. A roll option can add advantage or disadvantage to the first
  `d20` term that does not already carry one (D-11); a second `adv` on the same term is an error.

## 3. The rest of the expression

Everything else is the formula language, unchanged:

- numbers, `+ - * / % ^`, comparisons and `&& || !` (booleans only), `( )`
- functions `abs ceil floor round min max clamp if lookup step signed text concat number` and so on; the
  aggregates `sum count avg` over collection columns work too
- references `@key`, `@key.sub`, `@pool.max`, `@pool.current` read the character's scope; inside a collection
  row's own `roll` field, `$.field` reads that row (`$.bonus`)
- `if` evaluates only the chosen branch, so `if(@level > 4, 3d6, 2d6)` rolls only the dice it uses

A dice expression must evaluate to a **number**. A comparison on its own is an error here; use `if`.

## 4. Resolving a roll

`rollExpression(source, { scope, item, rng, options })` does this, in order:

1. **Parse** with dice enabled. Syntax and static errors are returned before anything is thrown.
2. **Static checks**: every `@reference` exists in the supplied scope; every dice count and sides expression is
   constant-foldable or readable from the scope (so a missing value fails the roll before dice are thrown).
3. **Evaluate** left to right under the formula step budget plus the dice budget (section 8). Each dice term
   is thrown **once**, when first reached; a term inside an `if` branch that is not taken is never thrown.
4. **Record** the result (section 5).

A failed roll returns `{ ok: false, error }` and throws no dice. A roll is **never** retried silently.

### The random source (D-2, D-10)

The engine takes an `rng` with one method, `int(max)`, returning a whole number from 1 to `max` inclusive
with **uniform** probability. Production wraps `crypto.getRandomValues` and uses rejection sampling so there is
no modulo bias. Tests use a seeded generator and a scripted one that returns a fixed list of values, so every
modifier has an exact, repeatable fixture.

## 5. What a roll records

```text
Roll {
  id,                         // roll_ prefix, never reused
  at,                         // time
  characterId | null,         // whose values were read
  campaignId | null,          // P5
  label,                      // "Longsword attack", or the expression when none
  expression,                 // as written
  resolved,                   // with every @reference replaced by its value: "1d20 + 3"
  total,                      // a number
  mode,                       // "total" or "pool"
  terms: [ Term ],            // every dice term, in order thrown
  inputs: [ { ref, value } ], // every reference that was read
  flags: { critical, fumble, botch },
  groupId | null,             // rolls fired together by a macro
  secret: false               // P5 (DEF-013)
}

Term {
  text,                       // "4d6kh3"
  count, sides,               // after any (expression) was evaluated
  dice: [ { value, kept, exploded, rerolled, success, failure } ],
  subtotal                    // what the term contributed
}
```

- Every die has its `value` and what happened to it, so the log, the explanation text and a future 3D scene
  (DEF-012) all play the **same** result. The scene never decides one (D-6).
- **Flags.** `critical` and `fumble` are set from the first `d20` term: a natural maximum, or a natural 1,
  or the preset's own range (section 6). `botch` is the pool rule in section 2.

### The explanation (D-4)

`explain(roll)` is pure and returns the same sentence everywhere (log, result card, screen readers):

```text
1d20 [14] + @str.mod (3) = 17
4d6kh3 [6, 5, 3, ~2~] = 14
8d10cs>=8cf=1 [9, 8, 8, 5, 3, 1, 1, 10] = 2 (4 successes - 2 failures)
```

Dropped dice are struck (`~2~`), exploded dice are marked `!`, rerolled dice show `r`. A total with no
breakdown is a bug (D-4).

## 6. Roll presets

A preset is a saved expression with a name.

```text
RollPreset { id, label, expression, group, critMin, steps | null }
```

- **System presets** come from the system file's `rolls` (`docs/SHEET.md` 2): the ability checks, saves and
  so on. They are read-only and shown on the Sheet page and the dice table.
- **Character presets** live on the character (`character.rollPresets`, schema migration 4): "Longsword
  attack", "Sneak attack". You add, edit, reorder and delete them on a character's **Rolls** page.
- **Row rolls.** A `roll` field in a collection row (an attack's damage) gets a roll button on the Sheet page
  and reads its own row through `$`.
- **`critMin`** (optional, default the die's maximum): a natural result at or above it sets `critical`, so a
  19-20 weapon is a preset, not a special case.
- **Macros (DEF-011).** `steps` is an ordered list of `{ label, expression }`. Firing it records each step as
  its own roll, in order, sharing a `groupId`, so "attack, then damage" is one click and still honest.

A preset's expression is validated when it is saved, with the same errors as a typed roll.

## 7. The roll log (D-5)

- Every roll is appended to a **bounded, persistent log**: 500 entries by default, oldest dropped first. It
  lives in the `rolls` store, one record per roll, saved with the rest of the data (P-10).
- The log is shown per character when one is chosen, with an option to show every character's rolls, and can be searched by label or expression, and one entry can be **rolled
  again** with the same expression and character (a new roll, never a replay).
- **Clear log** asks first and is undoable for the session.
- The log is not part of a character export unless asked; it is not secret by default (secret rolls are
  DEF-013, P5).

## 8. Limits (D-3)

Over a limit is an error with a plain message, never a clamp.

| Limit | Value |
|---|---|
| Dice in one term | 1,000 |
| Sides on a die | 1,000,000 |
| Dice in one roll, counting explosions and rerolls | 5,000 |
| Rerolls of one die | 100 |
| Explosions in one term | 1,000 |
| Expression length, nodes, nesting, steps | the formula limits (500, 400, 40, 20,000) |
| Log entries | 500 |
| Presets per character | 100 |

## 9. The dice table page (`#/dice`)

A hub page in the sidebar (`Alt+5`) with:

- **The roller**: an expression field with live validation and a preview of the resolved expression, quick dice
  buttons (d4, d6, d8, d10, d12, d20, d%), an **Advantage / Disadvantage** control, and **Roll** (also `Enter`).
- **Roll as**: a character picker. With one chosen, `@references` read that character's current values and the
  presets below appear; with none chosen only literals work and a missing reference explains itself.
- **Presets**: the character's, then the system's, grouped, each a button. The page never invents a value.
- **The result**: a card with the total, the explanation and its flags, announced politely to screen readers.
- **The log**: newest first, with filter, search, roll again and clear.

A character's **Rolls** page (`#/character/<id>/rolls`) manages that character's presets and shows its recent
rolls. The Sheet page gains roll buttons for system presets and row rolls (the table-speed rule, U-9: a roll is
one action from the sheet). There is no animation in P3; the optional 3D scene is later (DEF-012).

## 10. Accessibility

Rolling is a button and `Enter`; results appear in a polite live region as the explanation sentence; nothing
depends on motion, colour or a pointer; every control has a visible label that its accessible name contains.

## 11. Files and tests

| Path | Job |
|---|---|
| `src/sheet/formula.js` | gains an opt-in dice mode (the dice node, modifiers, the static checks); sheet evaluation never enables it |
| `src/dice/rng.js` | the injected random source: crypto with rejection sampling, seeded, scripted |
| `src/dice/roll.js` | `rollExpression`: dice terms, every modifier, flags, limits, the result record |
| `src/dice/explain.js` | the explanation sentence |
| `src/dice/presets.js` | preset validation, system and character presets, macros |
| `src/app/dice.js`, `src/ui/dice.js` | the dice table page |
| `src/app/rolls.js`, `src/ui/rolls.js` | a character's Rolls page and the sheet roll buttons |

Tests (D-1): every modifier has an **exact** fixture on a scripted source; every distribution is checked on a
seeded source (uniform d6 by chi-square, the exact 2d6 spread, `4d6kh3` mean about 12.24, d20 advantage mean
about 13.83, `8d10cs>=8` mean 2.4); the limits and the impossible `!`/`r` conditions are errors; a hostile-input
fuzz test feeds random dice text and must never throw; references resolve from a real evaluated sheet; and
browser scenarios roll from the page, a preset and a sheet button, then reload to prove the log persists.

## 12. Not in P3

Secret rolls (DEF-013, P5), the 3D scene (DEF-012), random tables (DEF-014, D-7), custom-face dice such as
`d[1,2,2,3]` (DEF-082), and a log export and statistics view (DEF-083).
