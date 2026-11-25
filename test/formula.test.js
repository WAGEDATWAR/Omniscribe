import assert from "node:assert/strict";
import { test } from "node:test";
import { FORMULA_LIMITS, FUNCTIONS, checkFormula, evaluateFormula, formatNumber, parseFormula } from "../src/sheet/formula.js";

function makeContext({ scalars = {}, collections = {}, lists = {}, choices = {}, tables = {}, item = null } = {}) {
  return {
    scalar: (path) => scalars[path.join(".")],
    collection(path) {
      const rows = collections[path[0]];

      if (!rows) {
        return null;
      }

      return { rows: rows.map((row) => ({ get: (field) => row[field] })), field: path[1] ?? null };
    },
    list: (path) => lists[path.join(".")] ?? null,
    choiceIndex: (path) => choices[path.join(".")] ?? null,
    table: (name) => tables[name] ?? null,
    item: item ? { get: (field) => item[field] } : null
  };
}

function run(source, options, budget) {
  const parsed = parseFormula(source);
  assert.equal(parsed.ok, true, `parse failed for ${source}: ${parsed.error?.message}`);
  return evaluateFormula(parsed, makeContext(options), budget);
}

const value = (source, options) => {
  const result = run(source, options);
  assert.equal(result.ok, true, `${source}: ${result.error?.message}`);
  return result.value;
};

const failure = (source, options) => {
  const parsed = parseFormula(source);

  if (!parsed.ok) {
    return parsed.error.message;
  }

  const result = evaluateFormula(parsed, makeContext(options));
  assert.equal(result.ok, false, `${source} should have failed but gave ${result.value}`);
  return result.error.message;
};

test("arithmetic follows precedence, parentheses and right associative powers", () => {
  assert.equal(value("1 + 2 * 3"), 7);
  assert.equal(value("(1 + 2) * 3"), 9);
  assert.equal(value("10 - 4 - 3"), 3);
  assert.equal(value("100 / 10 / 5"), 2);
  assert.equal(value("7 % 4"), 3);
  assert.equal(value("2 ^ 3 ^ 2"), 512);
  assert.equal(value("-2 ^ 2"), -4);
  assert.equal(value("2 ^ -1"), 0.5);
  assert.equal(value("--3"), 3);
  assert.equal(value("1.5 * 4"), 6);
});

test("the common d20 modifier reads naturally", () => {
  assert.equal(value("floor((@str - 10) / 2)", { scalars: { str: 16 } }), 3);
  assert.equal(value("floor((@str - 10) / 2)", { scalars: { str: 9 } }), -1);
});

test("comparisons and logic need matching types and short circuit", () => {
  assert.equal(value("3 > 2 && 2 >= 2"), true);
  assert.equal(value("1 == 2 || 2 != 3"), true);
  assert.equal(value('"a" < "b"'), true);
  assert.equal(value("!(1 < 0)"), true);
  assert.equal(value("false && (1 / 0 > 0)"), false);
  assert.equal(value("true || (1 / 0 > 0)"), true);
  assert.match(failure("1 == true"), /Cannot compare a number with true or false/);
  assert.match(failure('"a" < 1'), /Cannot order/);
  assert.match(failure("1 && true"), /needs true or false/);
  assert.match(failure("1 < 2 < 3"), /cannot be chained/);
});

test("nothing is coerced", () => {
  assert.match(failure('"3" + 1'), /needs a number but got text/);
  assert.match(failure("true + 1"), /needs a number/);
  assert.match(failure("-true"), /needs a number/);
  assert.match(failure("!1"), /needs true or false/);
});

test("if only evaluates the chosen branch", () => {
  assert.equal(value("if(true, 1, 1 / 0)"), 1);
  assert.equal(value("if(1 > 2, 1 / 0, 7)"), 7);
  assert.match(failure("if(1, 2, 3)"), /needs true or false/);
});

test("number functions", () => {
  assert.equal(value("abs(-4)"), 4);
  assert.equal(value("ceil(1.2)"), 2);
  assert.equal(value("floor(-1.2)"), -2);
  assert.equal(value("round(2.5)"), 3);
  assert.equal(value("round(3.14159, 2)"), 3.14);
  assert.equal(value("min(4, 2, 9)"), 2);
  assert.equal(value("max(4, 2, 9)"), 9);
  assert.equal(value("min(5)"), 5);
  assert.equal(value("clamp(15, 0, 10)"), 10);
  assert.equal(value("clamp(-3, 0, 10)"), 0);
  assert.match(failure("clamp(1, 5, 2)"), /low above its high/);
  assert.match(failure("round(1, 1.5)"), /whole number from 0 to 10/);
});

test("text functions", () => {
  assert.equal(value("signed(3)"), "+3");
  assert.equal(value("signed(0)"), "+0");
  assert.equal(value("signed(-2)"), "-2");
  assert.equal(value("text(4)"), "4");
  assert.equal(value("text(true)"), "true");
  assert.equal(value('concat("DC ", 14 + 2, "!")'), "DC 16!");
  assert.equal(value('number("12.5")'), 12.5);
  assert.match(failure('number("abc")'), /looks like a number/);
  assert.equal(formatNumber(0.1 + 0.2), "0.3");
});

test("references resolve through the context and a missing one is an error", () => {
  assert.equal(value("@str.mod + @level", { scalars: { "str.mod": 3, level: 5 } }), 8);
  assert.match(failure("@nothing", {}), /@nothing has no value/);
  assert.equal(value("$.cost * 2", { item: { cost: 5 } }), 10);
  assert.match(failure("$.cost", {}), /not available here/);
  assert.match(failure("$.cost", { item: { other: 1 } }), /\$\.cost has no value/);
});

test("aggregates work over a collection column with an optional test", () => {
  const collections = {
    powers: [
      { cost: 10, awake: true, group: "a" },
      { cost: 20, awake: false, group: "a" },
      { cost: 30, awake: true, group: "b" }
    ]
  };

  assert.equal(value("sum(@powers.cost)", { collections }), 60);
  assert.equal(value("sum(@powers.cost, $.awake)", { collections }), 40);
  assert.equal(value('count(@powers, $.group == "a")', { collections }), 2);
  assert.equal(value("count(@powers)", { collections }), 3);
  assert.equal(value("avg(@powers.cost)", { collections }), 20);
  assert.equal(value("min(@powers.cost)", { collections }), 10);
  assert.equal(value("max(@powers.cost, )".replace(", ", ""), { collections }), 30);
  assert.equal(value("sum(@powers.cost, $.cost > 100)", { collections }), 0);
  assert.equal(value("avg(@powers.cost, $.cost > 100)", { collections }), 0);
  assert.equal(value("sum(@powers.cost) + @bonus", { collections, scalars: { bonus: 1 } }), 61);
});

test("an aggregate over a column of the wrong type is an error", () => {
  assert.match(failure("sum(@powers.name)", { collections: { powers: [{ name: "x" }] } }), /Every name in powers needs a number/);
  assert.match(failure("@powers", { collections: { powers: [] } }), /is a collection/);
});

test("tables: lookup is exact and step takes the greatest key not above", () => {
  const tables = { cost: { 0: 0, 1: 1, 2: 10, 3: 50 }, level: { 1: 2, 5: 3, 10: 4 }, label: { low: "L", high: "H" } };

  assert.equal(value('lookup("cost", 3)', { tables }), 50);
  assert.equal(value('lookup("label", "high")', { tables }), "H");
  assert.equal(value('lookup("cost", 9, -1)', { tables }), -1);
  assert.match(failure('lookup("cost", 9)', { tables }), /No entry for 9 in table "cost"/);
  assert.equal(value('step("level", 7)', { tables }), 3);
  assert.equal(value('step("level", 10)', { tables }), 4);
  assert.equal(value('step("level", 0, 0)', { tables }), 0);
  assert.match(failure('step("level", 0)', { tables }), /No entry for 0/);
  assert.match(failure('lookup("nope", 1)', { tables }), /no table named "nope"/);
});

test("has and index read lists and choices", () => {
  assert.equal(value('has(@tags, "fire")', { lists: { tags: ["fire", "ice"] } }), true);
  assert.equal(value('has(@tags, "earth")', { lists: { tags: ["fire"] } }), false);
  assert.equal(value("index(@rank)", { choices: { rank: 2 } }), 2);
  assert.equal(value("index(@rank) >= 1", { choices: { rank: 2 } }), true);
  assert.match(failure("index(@rank)", {}), /not a choice with a value/);
});

test("runtime errors name the problem", () => {
  assert.match(failure("1 / 0"), /Division by zero/);
  assert.match(failure("5 % 0"), /Division by zero/);
  assert.match(failure("2 ^ 101"), /exponent is limited to 100/);
  assert.match(failure("10 ^ 400"), /exponent is limited|not a finite/);
  assert.match(failure("9 ^ 99 * 9 ^ 99 * 9 ^ 99 * 9 ^ 99 * 9 ^ 99 * 9 ^ 99 * 9 ^ 99 * 9 ^ 99"), /not a finite number/);
});

test("parse errors are reported with a position and never thrown", () => {
  for (const [source, pattern] of [
    ["", /empty/],
    ["1 +", /ends too soon/],
    ["(1 + 2", /Expected "\)"/],
    ["1 2", /Unexpected "2"/],
    ["foo", /Unknown word "foo"/],
    ["@", /needs a name after @/],
    ["$", /\$ must be followed by/],
    ["$cost", /\$ must be followed by/],
    ['"open', /missing its closing quote/],
    ["1abc", /cannot run into a word/],
    ["1 # 2", /Unexpected character "#"/],
    ["sum(", /ends too soon/]
  ]) {
    const parsed = parseFormula(source);

    assert.equal(parsed.ok, false, source);
    assert.match(parsed.error.message, pattern, source);
  }

  assert.equal(parseFormula("1 + ").error.index !== undefined, true);
  assert.equal(parseFormula(null).ok, false);
  assert.equal(parseFormula(42).ok, false);
});

test("string escapes", () => {
  assert.equal(value('"say \\"hi\\""'), 'say "hi"');
  assert.equal(value('"a\\\\b"'), "a\\b");
});

test("the formula limits are enforced", () => {
  assert.match(parseFormula("1".repeat(FORMULA_LIMITS.chars + 1)).error.message, /limited to 500 characters/);
  assert.equal(parseFormula("1".repeat(FORMULA_LIMITS.chars)).ok, true);

  const manyTerms = Array.from({ length: 230 }, () => "1").join("+");
  assert.match(parseFormula(manyTerms).error.message, /too large/);

  const deep = `${"(".repeat(FORMULA_LIMITS.depth + 5)}1${")".repeat(FORMULA_LIMITS.depth + 5)}`;
  assert.match(parseFormula(deep).error.message, /nested too deeply/);
  assert.equal(parseFormula(`${"(".repeat(FORMULA_LIMITS.depth - 1)}1${")".repeat(FORMULA_LIMITS.depth - 1)}`).ok, true);

  assert.match(parseFormula(`${"!".repeat(FORMULA_LIMITS.depth + 5)}true`).error.message, /nested too deeply/);
  assert.match(parseFormula(`"${"x".repeat(FORMULA_LIMITS.string + 1)}"`).error.message, /limited to 200 characters/);
});

test("the step budget stops an expensive aggregate", () => {
  const rows = Array.from({ length: 500 }, (_, index) => ({ cost: index, ok: true }));
  const parsed = parseFormula("sum(@powers.cost, $.ok && $.cost >= 0 && $.cost < 1000)");
  const context = makeContext({ collections: { powers: rows } });
  const cheap = evaluateFormula(parsed, context, { steps: 100 });

  assert.equal(cheap.ok, false);
  assert.match(cheap.error.message, /too expensive/);
  assert.equal(evaluateFormula(parsed, context).ok, true);
});

test("a very long chain of additions does not blow the stack", () => {
  const source = Array.from({ length: 150 }, () => "1").join("+");
  assert.equal(value(source), 150);
});

test("parse reports the references and row fields a formula uses", () => {
  const parsed = parseFormula("@str.mod + sum(@powers.cost, $.awake) + @level");

  assert.deepEqual(parsed.refs, [["str", "mod"], ["powers", "cost"], ["level"]]);
  assert.deepEqual(parsed.itemFields, ["awake"]);
});

function envFor({ refs = {}, collections = {}, tables = [], item = null } = {}) {
  return {
    ref: (path) => refs[path.join(".")] ?? null,
    collectionFields: (key) => collections[key] ?? null,
    tables: new Set(tables),
    item
  };
}

const problems = (source, env) => checkFormula(parseFormula(source), env).map((entry) => entry.message);

test("static checks catch unknown names, functions and arity", () => {
  const env = envFor({ refs: { a: "value" } });

  assert.deepEqual(problems("@a + 1", env), []);
  assert.deepEqual(problems("@b", env), ["Unknown reference @b"]);
  assert.deepEqual(problems("nope(1)", env), ["Unknown function nope()"]);
  assert.match(problems("floor()", env)[0], /floor\(\) takes 1 argument/);
  assert.match(problems("round(1, 2, 3)", env)[0], /round\(\) takes 1 to 2 arguments/);
  assert.match(problems("max()", env)[0], /max\(\) takes at least 1 argument/);
});

test("static checks govern collections, rows and tables", () => {
  const env = envFor({
    refs: { "powers.cost": "column", powers: "collection", rank: "choice", tags: "list", a: "value" },
    collections: { powers: new Set(["cost", "awake"]) },
    tables: ["cost"]
  });

  assert.deepEqual(problems("sum(@powers.cost, $.awake)", env), []);
  assert.deepEqual(problems("count(@powers)", env), []);
  assert.deepEqual(problems("max(@powers.cost)", env), []);
  assert.match(problems("sum(@a)", env)[0], /needs a collection column/);
  assert.match(problems("sum(@powers)", env)[0], /needs a collection column/);
  assert.deepEqual(problems("max(@powers.cost, $.awake)", env), []);
  assert.match(problems("sum(@powers.cost, $.nope)", env)[0], /no field named "nope"/);
  assert.match(problems("$.cost", env)[0], /\$ can only be used inside/);
  assert.match(problems("@powers.cost + 1", env)[0], /is a collection/);
  assert.match(problems("@tags", env)[0], /is a list/);
  assert.deepEqual(problems('lookup("cost", 1)', env), []);
  assert.match(problems('lookup("nope", 1)', env)[0], /no table named "nope"/);
  assert.match(problems("lookup(@a, 1)", env)[0], /table name in quotes/);
  assert.deepEqual(problems("index(@rank)", env), []);
  assert.match(problems("index(@a)", env)[0], /needs a choice field/);
  assert.deepEqual(problems('has(@tags, "x")', env), []);
  assert.match(problems('has(@a, "x")', env)[0], /needs a list field/);
});

test("a row formula may use $ for its own fields only", () => {
  const env = envFor({ refs: { a: "value" }, item: new Set(["x", "y"]) });

  assert.deepEqual(problems("$.x + $.y + @a", env), []);
  assert.match(problems("$.z", env)[0], /no field named "z"/);
});

test("the function table has exactly the documented functions", () => {
  assert.deepEqual(
    Object.keys(FUNCTIONS).sort(),
    ["abs", "avg", "ceil", "clamp", "concat", "contains", "count", "endsWith", "floor", "has", "if", "index", "join", "length", "lookup", "lower", "max", "min", "number", "round", "signed", "startsWith", "step", "sum", "switch", "text", "trim", "upper"]
  );
});

function seededRandom(seed) {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test("hostile input never throws and always finishes quickly", () => {
  const random = seededRandom(20260719);
  const vocabulary = ["(", ")", "@", ".", "$", "+", "-", "*", "/", "%", "^", "!", "&&", "||", "==", "<", ">=", ",", '"', "\\", "1", "2.5", "99", "abs", "sum", "if", "lookup", "count", "@a", "@a.b", "$.x", "true", "false", " ", "\n", "\u0000", "é", "😀", "9".repeat(30)];
  const context = makeContext({
    scalars: { a: 4, "a.b": 2 },
    collections: { a: [{ x: 1 }, { x: 2 }] },
    tables: { t: { 1: 1 } }
  });
  const started = Date.now();
  let parsedCount = 0;

  for (let round = 0; round < 4000; round += 1) {
    const length = 1 + Math.floor(random() * 40);
    let source = "";

    for (let position = 0; position < length; position += 1) {
      source += vocabulary[Math.floor(random() * vocabulary.length)];
    }

    const parsed = parseFormula(source);
    assert.equal(typeof parsed.ok, "boolean");

    if (parsed.ok) {
      parsedCount += 1;
      const result = evaluateFormula(parsed, context, { steps: 2000 });
      assert.equal(typeof result.ok, "boolean");
      checkFormula(parsed, envFor({ refs: { a: "value", "a.b": "value" }, item: new Set(["x"]) }));
    }
  }

  assert.ok(parsedCount > 20, `only ${parsedCount} random formulas parsed`);
  assert.ok(Date.now() - started < 5000, "the fuzz run took too long");
});

test("pathological formulas stay within budgets", () => {
  const started = Date.now();
  const pile = Array.from({ length: 150 }, () => "2^99").join("*");
  const wide = `max(${Array.from({ length: 120 }, (_, index) => index).join(",")})`;
  const nested = `${"if(true,".repeat(30)}1${",0)".repeat(30)}`;

  assert.equal(evaluateFormula(parseFormula(pile), makeContext()).ok, false);
  assert.equal(value(wide), 119);
  assert.equal(value(nested), 1);
  assert.ok(Date.now() - started < 2000);
});

test("switch picks the matching case or the default", () => {
  assert.equal(value('switch(@r, "a", 1, "b", 2, 0)', { scalars: { r: "b" } }), 2);
  assert.equal(value('switch(@r, "a", 1, "b", 2, 0)', { scalars: { r: "z" } }), 0);
  assert.match(failure("switch(@r, 1, 2)", { scalars: { r: 1 } }), /wrong number of arguments/);
});

test("text functions", () => {
  assert.equal(value('contains("Dragon Slayer", "Slay")'), true);
  assert.equal(value('startsWith("abc", "ab")'), true);
  assert.equal(value('endsWith("abc", "bc")'), true);
  assert.equal(value('length(trim("  hi "))'), 2);
  assert.equal(value('upper("a") + lower("B")'.replace(" + ", ", ").replace(/^(.*)$/, "concat($1)")), "Ab");
  assert.match(failure("length(3)"), /needs text/);
});

test("join builds text from a list or a column and skips empty parts", () => {
  const options = { lists: { tags: ["a", "b"] }, collections: { gear: [{ name: "Rope", w: 1 }, { name: "", w: 2 }, { name: "Lamp", w: 5 }] } };
  assert.equal(value('join(@tags, " / ")', options), "a / b");
  assert.equal(value("join(@gear.name)", options), "Rope, Lamp");
  assert.equal(value('join(@gear.name, "+", $.w > 1)', options), "Lamp");
});

test("min and max over a column take a test, like sum", () => {
  const options = { collections: { abilities: [{ essence: "Power", level: 4 }, { essence: "Power", level: 2 }, { essence: "Speed", level: 1 }] } };
  assert.equal(value('min(@abilities.level, $.essence == "Power")', options), 2);
  assert.equal(value('max(@abilities.level, $.essence == "Power")', options), 4);
  assert.equal(value('sum(@abilities.level, $.essence == "Speed")', options), 1);
});

test(".name means the same as $.name inside a row formula", () => {
  const options = { item: { stat: "int" }, scalars: { int: 6 } };
  assert.equal(value('if(.stat == "int", @int, 0)', options), 6);
  assert.equal(value('if($.stat == "int", @int, 0)', options), 6);
});

test("mistakes get a hint", () => {
  assert.match(failure("@a and @b"), /use && for and/);
  assert.match(failure("@a or @b"), /use \|\| for or/);
  assert.match(failure("@a = 1"), /compare with ==/);
  assert.match(failure("flor(1.5)", {}), /did you mean floor\(\)/);
});
