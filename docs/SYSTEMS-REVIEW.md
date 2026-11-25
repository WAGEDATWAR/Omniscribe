# SYSTEMS-REVIEW - what eight community systems taught the format

> **Scope.** A review of six real game system files (Risus, Monsterhearts, Vampire: The Masquerade, Cyberpunk RED,
> Pathfinder 2e, Essence System) and a 32-point report from the people who built them (and two more, Nightlife
> and Champions, whose files were not supplied). It records what was found, what was built, and what moved on, so the
> format's owner (`docs/SHEET.md`) stays the single specification. Decisions are `DECISIONS.md` S-18 to S-22.

## 1. What happened when the files met the app

Run through the app's own import (`registry.add`), three of the six files **failed to import** and the other three
imported with a sheet that evaluates cleanly:

| File | Result | Cause |
|---|---|---|
| Cyberpunk RED | refused | row formulas used `.stat`; the language wrote a row's own field as `$.stat` |
| Pathfinder 2e | refused | `"max": 3` for a pool; the format wanted the formula `"3"` |
| Vampire: The Masquerade | refused | `"max": 7` and `{ "add": 1 }` with numbers |
| Risus, Monsterhearts, Essence System | imported | none |

None of these were mistakes in the files: they were guesses that the format never told anyone were wrong. The
builders worked from one example file (report point 23), which is the root of most of the report.

## 2. Disposition of the report

*Exists* means the report asked for something the app already does and had no way to learn that. The fix is the new
Reference page, the import review and error hints, not new code.

| # | Suggestion | Disposition |
|---|---|---|
| 1 | Filtered aggregation | **Exists** for `sum`, `avg`, `count` (`sum(@col, $.essence == "Power")`). **Built:** `min` and `max` now take the test too. |
| 2 | Named-row lookup | **Exists** as `sum(@abilities.dots, $.name == "Brawl")`. Documented as the way to read one row. |
| 3 | Document `min()` and the function list | **Built.** `min`, `max`, `clamp`, `round`, `ceil`, `floor`, `abs` all exist. The Reference page lists every function, generated from the code and checked by a test. |
| 4 | Numeric table keys | **Exists.** JSON keys are text; a number key is matched as its text (`lookup("t", 13)` finds `"13"`). Documented. |
| 5 | Dice counts from values | **Exists.** `(@dice)d6`, `1d(@size)` and per-row `($.dice)d6` work. Documented with examples. |
| 6 | `join` and a format helper | **Built:** `join(list or column, separator, test)`. |
| 7 | String functions | **Built:** `contains`, `startsWith`, `endsWith`, `length`, `trim`, `lower`, `upper`. |
| 8 | `switch` | **Built:** `switch(value, case, result, ..., default)`. |
| 9 | True sub-collections | **Moved to P8** (DEF-095): it changes the sheet model and every table, PDF and rest. Mitigated by the filtered aggregation in 1 and by `groupBy`. |
| 10 | Links between rows of different collections | **Moved to P8** (DEF-096), with 9. Row formulas that name another row's stat by choice (Cyberpunk) keep working. |
| 11 | Optional seeded rows | **Built.** Starting a sheet asks whether to include the system's suggested rows. |
| 12 | Per-row uses that a rest refills | **Exists** (`uses` item field with `resetOn`). Documented. |
| 13 | Pool maximums from collection sums | **Exists** (`"max": "@emp * 10 - sum(@cyberware.humanity_loss)"`). Documented as an example. |
| 14 | A track type | **Moved to P8** (DEF-097): a new field type through the evaluator, the sheet, the PDF and the editor. |
| 15 | Per-character overrides of a system | **Moved to P8** (DEF-098). Today a character can follow a house version derived from a system, which is the supported route. |
| 16 | Computed field defaults | **Moved to P8** (DEF-099). |
| 17 | Roll modes | **Exists:** keep highest and lowest, exploding, reroll, count successes and failures. Roll-under is `@skill - d%`, whose total is the margin. Documented. |
| 18 | Rolls on rows | **Exists:** a `roll` field on a collection row gets a button, and its default can read its own row (`1d10 + $.total`). Documented. |
| 19 | Target and margin | **Documented** as `@skill - d%` (the total is the margin) and `if(d% <= @skill, 1, 0)`. A roll that shows a target and a verdict itself is DEF-100. |
| 20 | Exploding and reroll | **Exists.** Documented. |
| 21 | Import validation report | **Built.** Choosing a file opens a review that lists every error with its place, every warning and the values that fail on a new sheet, and imports nothing until confirmed. Errors now say what to use instead (`and` -> `&&`, `=` -> `==`) and suggest the function you probably meant. |
| 22 | Rendered preview before importing | **Partly built:** the review shows an outline of the sheet and a summary of how a new sheet evaluates. A drawn preview is DEF-101. |
| 23 | Published format documentation | **Built.** The Reference page (Alt+6) and `docs/SHEET.md`. |
| 24 | System and characters in one bundle | **Exists.** A character or campaign bundle carries the user-made systems it needs (X-6). |
| 25 | Version diffing | **Exists.** Updating a system shows what changed and where values go (S-17). |
| 26 | A community template library | **Out of scope:** the app has no server (G-2). A static, hand-curated index of importable files is DEF-102. |
| 27 | Dark theme | **Exists** (the default); a light theme too. |
| 28 | Larger touch targets, one-handed layout | **Moves into the UI evaluation** (P7-E), which measures targets on every page at phone width. |
| 29 | Markdown in long text | **Moved to P8** (DEF-103): a small safe renderer for display with plain text kept for editing. |
| 30 | Search across characters and systems | **Characters, campaigns and everything in them exist** (X-10). Searching system files is DEF-104. |
| 31 | Undo for pools and field edits | **Exists** (the Undo button and Ctrl+Z cover every edit, with pool changes merged). |
| 32 | Say offline-first plainly | **Built** on the Reference page and in the app's description. |

## 3. What the review changed beyond the report

- **Tabs from sheet sections (S-21).** A section may name a `page`; the character then has a tab of that name beside
  the Sheet showing those sections. The Essence System's essences, abilities and familiars are the intended use. The
  Game system editor sets it in the Sections tab, so a house version can arrange its own tabs.
- **Leniency where the file's meaning is plain (S-18).** A number where a formula is expected (a pool maximum, a
  rest's `add` or `set`) is read as that number and the import review says so. `.name` means `$.name`.
- **Honest errors (S-19).** Every formula error that can be mistaken for something else now says what to write.

## 4. Open

DEF-095 to DEF-104 hold what moved. Nightlife and Champions were not supplied; the first thing to do with them is run
them through the import review.
