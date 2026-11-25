/**
 * The published reference for the game system format and the formula language (docs/SHEET.md is the specification;
 * this is the same facts as data, shown on the Reference page and checked by a test so it cannot drift from the code:
 * every function has an entry and every example parses).
 */
export const FUNCTION_DOCS = Object.freeze([
  { name: "abs", signature: "abs(n)", summary: "Absolute value.", example: "abs(@str.mod)" },
  { name: "avg", signature: "avg(@collection.column [, test])", summary: "Average of a number column, optionally of the rows where the test is true.", example: "avg(@skills.level)" },
  { name: "ceil", signature: "ceil(n)", summary: "Rounds up to a whole number.", example: "ceil(@level / 2)" },
  { name: "clamp", signature: "clamp(n, low, high)", summary: "Keeps n between low and high.", example: "clamp(@hp.current, 0, @hp_max)" },
  { name: "concat", signature: "concat(a, b, ...)", summary: "Joins values into text. Numbers are written without trailing zeros.", example: 'concat(@race, " ", @class)' },
  { name: "contains", signature: "contains(text, part)", summary: "True when the text includes the part.", example: 'contains(@title, "Lord")' },
  { name: "count", signature: "count(@collection [, test])", summary: "Number of rows, or of rows where the test is true.", example: "count(@spells, $.prepared)" },
  { name: "endsWith", signature: "endsWith(text, part)", summary: "True when the text ends with the part.", example: 'endsWith(@name, "son")' },
  { name: "floor", signature: "floor(n)", summary: "Rounds down to a whole number.", example: "floor((@str - 10) / 2)" },
  { name: "has", signature: 'has(@listField, "x")', summary: "True when a list field holds the text.", example: 'has(@languages, "Elvish")' },
  { name: "if", signature: "if(test, then, else)", summary: "The chosen branch; the other is not evaluated.", example: "if(@level >= 5, 2, 1)" },
  { name: "index", signature: "index(@choiceField)", summary: "The 0-based position of the current choice in its list.", example: "index(@rank)" },
  { name: "join", signature: "join(@listField or @collection.column [, separator [, test]])", summary: "Text made of the entries, skipping empty ones. The separator defaults to a comma and a space.", example: 'join(@gear.name, " / ")' },
  { name: "length", signature: "length(text)", summary: "Number of characters.", example: "length(@name)" },
  { name: "lookup", signature: 'lookup("table", key [, fallback])', summary: 'The table entry for the key. A number key matches the table key written as text, so 13 finds "13".', example: 'lookup("blood_by_generation", @generation)' },
  { name: "lower", signature: "lower(text)", summary: "Lower case.", example: "lower(@skin)" },
  { name: "max", signature: "max(a, b, ...) or max(@collection.column [, test])", summary: "The largest of the values, or of a column, optionally of the rows where the test is true.", example: 'max(@abilities.level, $.essence == "Power")' },
  { name: "min", signature: "min(a, b, ...) or min(@collection.column [, test])", summary: "The smallest of the values, or of a column, optionally of the rows where the test is true.", example: 'min(@abilities.level, $.essence == "Power")' },
  { name: "number", signature: "number(text)", summary: "Reads text that looks like a number.", example: 'number("12")' },
  { name: "round", signature: "round(n [, digits])", summary: "Rounds to a whole number or to 0 to 10 decimals.", example: "round(@weight / 3, 1)" },
  { name: "signed", signature: "signed(n)", summary: 'Text with a sign: "+3", "+0", "-1".', example: "signed(@dex.mod)" },
  { name: "startsWith", signature: "startsWith(text, part)", summary: "True when the text starts with the part.", example: 'startsWith(@class, "Wiz")' },
  { name: "step", signature: 'step("table", n [, fallback])', summary: "The entry for the greatest numeric table key not above n (a ladder).", example: 'step("proficiency", @level)' },
  { name: "sum", signature: "sum(@collection.column [, test])", summary: "Total of a number column, optionally of the rows where the test is true. This is how you read one named row: sum(@abilities.dots, $.name == \"Brawl\").", example: 'sum(@abilities.dots, $.name == "Brawl")' },
  { name: "switch", signature: "switch(value, case1, result1, case2, result2, ..., default)", summary: "The result of the first case equal to the value, else the default. A readable alternative to nested if().", example: 'switch(@rank, "untrained", 0, "trained", @level + 2, 0)' },
  { name: "text", signature: "text(x)", summary: "A number or value as text.", example: "text(@level)" },
  { name: "trim", signature: "trim(text)", summary: "Removes spaces at both ends.", example: "trim(@name)" },
  { name: "upper", signature: "upper(text)", summary: "Upper case.", example: "upper(@skin)" }
]);

export const REFERENCES = Object.freeze([
  { code: "@str", meaning: "A field's value." },
  { code: "@str.mod", meaning: "A sub-value of a field (a field may define subs such as mod)." },
  { code: "@hp.current  @hp.max  @hp.temp", meaning: "A pool's current, maximum and temporary values." },
  { code: "@skills.total", meaning: "A column of a collection. It may only be used inside sum, avg, min, max, count or join." },
  { code: "$.level  or  .level", meaning: "A field of the current row. Only inside a collection's own formulas and inside the test of sum, count and the others." },
  { code: '"text"  12  3.5  true  false', meaning: "Literals. Text uses double quotes." },
  { code: "+ - * / % ^", meaning: "Arithmetic on numbers. Nothing is converted: \"3\" + 1 is an error." },
  { code: "== != < <= > >=", meaning: "Comparison. == and != need two values of the same type." },
  { code: "&&  ||  !", meaning: "And, or, not (not the words and, or). They take true or false." }
]);

export const DICE_MODIFIERS = Object.freeze([
  { code: "4d6kh3  4d6kl1", meaning: "Keep the highest or lowest N dice." },
  { code: "4d6dl1  4d6dh1", meaning: "Drop the lowest or highest N dice." },
  { code: "3d6!  3d6!>=5", meaning: "Explode: a die that rolls its maximum (or meets the test) is rolled again and added." },
  { code: "5d10r<3  5d10ro<3", meaning: "Reroll dice that match, repeatedly or once." },
  { code: "8d10cs>=8", meaning: "Count successes: the total is the number of dice that meet the test (dice pools)." },
  { code: "8d10cs>=8cf=1", meaning: "Also count failures: each matching die subtracts one." },
  { code: "d20adv  d20dis", meaning: "Roll two d20 and keep the higher or lower." },
  { code: "(@pool)d10  (@level)d6", meaning: "The number of dice, or the sides, may come from a value." },
  { code: "d%  dF", meaning: "A percentile die, a Fudge die (-1, 0, +1)." }
]);

export const FIELD_TYPES = Object.freeze([
  { type: "number", props: "default, min, max, integer, subs, subFormats", meaning: "A whole or decimal number that is checked against min and max." },
  { type: "text", props: "default, maxLength", meaning: "One line of text." },
  { type: "longtext", props: "default", meaning: "Several lines of text." },
  { type: "flag", props: "default", meaning: "On or off." },
  { type: "choice", props: "choices: [{ value, label }], default", meaning: "One of a list. The value is what formulas read; the label is what is shown." },
  { type: "list", props: "default", meaning: "A list of short text entries." },
  { type: "derived", props: "formula, format (number, signed, integer, percent, text)", meaning: "Computed from other values; never stored." },
  { type: "uses", props: "max (a formula), resetOn (a rest id)", meaning: "Collection rows only: a counter of uses that a named rest refills." },
  { type: "roll", props: "default (a dice expression)", meaning: "Collection rows only: a dice expression kept on the row, such as a weapon's damage." }
]);

export const EXAMPLES = Object.freeze([
  { title: "A named row in a pool", why: "Vampire: Dexterity plus the Brawl ability, without typing the dice by hand.", code: '(@dexterity + sum(@abilities.dots, $.name == "Brawl"))d10cs>=6' },
  { title: "The lowest ability in a group", why: "Essence System: an attribute is the lowest ability of its essence.", code: 'min(@abilities.level, $.essence == "Power")' },
  { title: "A ladder of proficiency", why: "Pathfinder: untrained 0, then level plus 2, 4, 6, 8.", code: 'switch(@perception_rank, "untrained", 0, "trained", @level + 2, "expert", @level + 4, "master", @level + 6, "legendary", @level + 8, 0)' },
  { title: "A pool maximum from rows", why: "Cyberpunk: humanity falls with every cyberware row installed.", code: "@emp * 10 - sum(@cyberware.humanity_loss)" },
  { title: "A row linked to a stat", why: "A skill's total is its level plus the stat it names.", code: 'if(.stat == "int", @int, if(.stat == "ref", @ref, 0)) + .level' },
  { title: "Text from parts that may be empty", why: "A line built from several fields, skipping the empty ones.", code: 'join(@gear.name, ", ", $.equipped)' },
  { title: "A table keyed by a number", why: "Blood pool by generation; the choice value 13 finds the key \"13\".", code: 'lookup("blood_by_generation", @generation)' },
  { title: "Roll under, with the margin", why: "A percentile skill: the total is how far under the skill the roll was, so 0 or more is a success by that much and below 0 a failure.", code: "@skill - d%" },
  { title: "Roll under, pass or fail", why: "A roll can only produce a number, so choose one with if().", code: "if(d% <= @skill, 1, 0)" },
  { title: "Tap a row to roll it", why: "Give a collection a field of type roll whose default reads its own row; the row then shows a Roll button. $.total is this row's total.", code: "1d10 + $.total" },
  { title: "Dice counts from a row", why: "Risus: roll as many dice as a cliche is rated, read from the row.", code: "($.dice)d6" }
]);

export const SYSTEM_PARTS = Object.freeze([
  { key: "fields", shape: "list", meaning: "Single values on the sheet: numbers, text, choices, flags, lists and derived values." },
  { key: "pools", shape: "list", meaning: 'Values with a current and a maximum, such as hit points. { key, label, max: "formula", temp, display: "number" | "boxes", rests: { restId: "full" | "none" | { add: "formula" } | { set: "formula" } } }. A plain number may be written for max, add and set.' },
  { key: "collections", shape: "list", meaning: "Tables of rows: { key, label, columns, fields, defaultRows, maxItems, groupBy, sortBy }. Rows have their own fields, including derived columns and uses." },
  { key: "tables", shape: "object", meaning: "Lookup data for lookup() and step(): { name: { key: value } }. Keys are text; a number is matched as its text." },
  { key: "conditions", shape: "list of text", meaning: "Names a character can have switched on." },
  { key: "rests", shape: "list", meaning: "{ id, label }. A rest button applies each pool's rule for that id and refills every uses field that resets on it." },
  { key: "rolls", shape: "list", meaning: "Saved rolls: { key, label, expression, group }. The expression is a dice expression that may read the sheet." },
  { key: "sections", shape: "list", meaning: '{ id, title, layout: "fields" | "table" | "text", items: [keys], page }. A section with a page title is shown on a tab of that name instead of the Sheet.' },
  { key: "base, overlay", shape: "id and list", meaning: "Derive a system from another: add, override or remove parts instead of copying them." }
]);
