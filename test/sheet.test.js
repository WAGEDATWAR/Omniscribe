import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { applyRest, createRow, createSheet, evaluateSheet, reconcileSheet, scopeOf } from "../src/sheet/evaluate.js";
import { resolveTemplate } from "../src/sheet/resolve.js";
import { fieldDefault, formatValue, normalizeSystemFile, validateTemplate, validateValue } from "../src/sheet/template.js";
import { BUILTIN_FILES, loadBuiltinSystems } from "../src/templates/index.js";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const generic = read("src/templates/generic.json");
const core = read("test/fixtures/systems/d20-core.json");
const custom = read("test/fixtures/systems/d20-custom.json");
const clone = (value) => structuredClone(value);
const lookupIn = (...files) => (id, version) => files.find((file) => file.id === id && file.version === version) ?? null;

function resolved(file, ...bases) {
  const result = resolveTemplate(file, lookupIn(...bases));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  return result.template;
}

const coreSystem = resolved(core);
const customSystem = resolved(custom, core);

function mutate(file, change) {
  const copy = clone(file);
  change(copy);
  return copy;
}

const messages = (result) => result.errors.map((entry) => `${entry.path}: ${entry.message}`);

function sample(system) {
  const sheet = createSheet(system);
  Object.assign(sheet.values, { level: 11, str: 16, dex: 17, con: 14, int: 12, armor_bonus: 4, rank: "bronze" });
  return sheet;
}

/* ---------- the system file ---------- */

test("normalizeSystemFile accepts a good file and fills empty parts", () => {
  const result = normalizeSystemFile({ format: "omniscribe-system", formatVersion: 1, id: "x", version: 1, name: "X" });

  assert.equal(result.ok, true);
  assert.deepEqual(result.template.fields, []);
  assert.deepEqual(result.template.tables, {});
  assert.equal(result.template.base, null);
});

test("normalizeSystemFile reports a bad envelope in plain terms", () => {
  const result = normalizeSystemFile({ format: "other", formatVersion: 9, id: "Bad Id", version: 0, name: "", base: { id: "x" }, overlay: [{}] });
  const paths = result.errors.map((entry) => entry.path);

  for (const path of ["format", "formatVersion", "id", "version", "name", "base"]) {
    assert.ok(paths.includes(path), `${path} should be reported`);
  }

  assert.equal(normalizeSystemFile(null).ok, false);
  assert.equal(normalizeSystemFile([]).ok, false);
  assert.ok(normalizeSystemFile({ format: "omniscribe-system", formatVersion: 1, id: "x", version: 1, name: "X", overlay: [{}] }).errors.some((entry) => entry.path === "overlay"));
});

test("unknown keys are kept in extensions and reported as warnings (A-5)", () => {
  const result = normalizeSystemFile({ format: "omniscribe-system", formatVersion: 1, id: "x", version: 1, name: "X", mystery: { a: 1 } });

  assert.equal(result.ok, true);
  assert.deepEqual(result.template.extensions.unknown, { mystery: { a: 1 } });
  assert.deepEqual(result.warnings.map((entry) => entry.path), ["mystery"]);
});

/* ---------- validation ---------- */

test("the built-in generic system and the fixtures are valid", () => {
  assert.equal(validateTemplate(resolved(generic)).ok, true);
  assert.equal(validateTemplate(coreSystem).ok, true);
  assert.equal(validateTemplate(customSystem).ok, true);
});

test("validation catches structural mistakes with a path", () => {
  const cases = [
    ["a repeated key", (file) => file.pools.push({ key: "level", label: "Level", max: "1" }), /"level" is used more than once/],
    ["a bad key", (file) => { file.fields[0].key = "Bad Key"; }, /key must be lowercase/],
    ["an unknown type", (file) => { file.fields[0].type = "money"; }, /type must be one of/],
    ["a default out of range", (file) => { file.fields[0].default = 99; }, /outside min and max/],
    ["min above max", (file) => { file.fields[0].min = 50; }, /min is above max/],
    ["a bad choice default", (file) => { file.fields.find((f) => f.key === "rank").default = "gold"; }, /one of the choices/],
    ["a repeated choice", (file) => { file.fields.find((f) => f.key === "rank").choices.push({ value: "iron", label: "Again" }); }, /repeated/],
    ["no choices", (file) => { file.fields.find((f) => f.key === "rank").choices = []; }, /choices must be a list/],
    ["a derived field without a formula", (file) => { delete file.fields.find((f) => f.key === "ac").formula; }, /needs a formula/],
    ["a bad display format", (file) => { file.fields.find((f) => f.key === "ac").format = "roman"; }, /format must be one of/],
    ["a pool without a max", (file) => { delete file.pools[0].max; }, /needs a max formula/],
    ["a bad box size", (file) => { file.pools[0].boxSize = 0; }, /boxSize/],
    ["a pool rest that does not exist", (file) => { file.pools[0].rests = { weekly: "full" }; }, /no rest named "weekly"/],
    ["a rest rule with both verbs", (file) => { file.pools[0].rests = { long: { add: "1", set: "2" } }; }, /not both/],
    ["a collection with no fields", (file) => { file.collections[0].fields = []; }, /needs 1 to 40 fields/],
    ["a repeated item key", (file) => { file.collections[0].fields.push({ key: "name", label: "Again", type: "text" }); }, /more than once in this collection/],
    ["a bad groupBy", (file) => { file.collections[0].groupBy = "nope"; }, /groupBy must name a field/],
    ["a bad column", (file) => { file.collections[0].columns = ["nope"]; }, /columns must name fields/],
    ["a uses field with no max", (file) => { file.collections[0].fields.push({ key: "u", label: "U", type: "uses" }); }, /max must be a whole number or a formula/],
    ["a uses reset on an unknown rest", (file) => { file.collections[0].fields.push({ key: "u", label: "U", type: "uses", max: 1, resetOn: "monthly" }); }, /no rest named "monthly"/],
    ["subs on an item field", (file) => { file.collections[0].fields[0].subs = { a: "1" }; }, /subs are not available/],
    ["a repeated rest", (file) => { file.rests.push({ id: "long", label: "Again" }); }, /repeated/],
    ["a repeated condition", (file) => { file.conditions.push("Blinded"); }, /repeated/],
    ["a table with a bad value", (file) => { file.tables.bab_table["1"] = { nested: true }; }, /numbers or short text/],
    ["a bad table name", (file) => { file.tables["Bad Name"] = {}; }, /table name must be lowercase/],
    ["a section item that does not exist", (file) => { file.sections[0].items.push("ghost"); }, /"ghost" is not a field or pool/],
    ["a table section naming a field", (file) => { file.sections[2].items = ["str"]; }, /not a collection/],
    ["a roll with an unknown reference", (file) => { file.rolls[0].expression = "1d20 + @nope.mod"; }, /@nope\.mod, which is not a single value/],
    ["a repeated roll", (file) => { file.rolls.push({ ...file.rolls[0] }); }, /repeated/],
    ["a roll naming a collection", (file) => { file.rolls[0].expression = "@skills"; }, /not a single value/],
    ["a bad sub name", (file) => { file.fields[1].subs = { "Bad Name": "1" }; }, /sub name/]
  ];

  for (const [name, change, pattern] of cases) {
    const result = validateTemplate(mutate(core, change));
    assert.equal(result.ok, false, `${name} should be invalid`);
    assert.match(messages(result).join("\n"), pattern, name);
  }
});

test("validation checks formulas with the path of the field that holds them", () => {
  const bad = validateTemplate(mutate(core, (file) => { file.fields.find((f) => f.key === "ac").formula = "10 +"; }));
  assert.ok(messages(bad).some((line) => line.startsWith("fields.ac.formula:")));

  const unknown = validateTemplate(mutate(core, (file) => { file.fields.find((f) => f.key === "ac").formula = "@ghost + 1"; }));
  assert.ok(messages(unknown).some((line) => line === "fields.ac.formula: Unknown reference @ghost"));

  const sub = validateTemplate(mutate(core, (file) => { file.fields[1].subs.mod = "floor("; }));
  assert.ok(messages(sub).some((line) => line.startsWith("fields.str.subs.mod:")));

  const pool = validateTemplate(mutate(core, (file) => { file.pools[0].max = "@missing"; }));
  assert.ok(messages(pool).some((line) => line.startsWith("pools.hp.max:")));

  const item = validateTemplate(mutate(core, (file) => { file.collections[0].fields[4].formula = "$.nothing"; }));
  assert.ok(messages(item).some((line) => line.includes("collections.skills.fields.total.formula") && line.includes('no field named "nothing"')));

  const rest = validateTemplate(mutate(core, (file) => { file.pools[0].rests = { long: { add: "@ghost" } }; }));
  assert.ok(messages(rest).some((line) => line.startsWith("pools.hp.rests.long.add:")));
});

test("a row field cannot be read outside its collection and sheet formulas cannot use $", () => {
  const result = validateTemplate(mutate(core, (file) => { file.fields.find((f) => f.key === "ac").formula = "$.ranks"; }));
  assert.match(messages(result).join("\n"), /\$ can only be used inside/);

  const column = validateTemplate(mutate(core, (file) => { file.fields.find((f) => f.key === "ac").formula = "@skills.ranks + 1"; }));
  assert.match(messages(column).join("\n"), /is a collection/);
});

test("a loop between values is reported with every name on it", () => {
  const two = validateTemplate(mutate(core, (file) => {
    file.fields.push({ key: "a", label: "A", type: "derived", formula: "@b + 1" }, { key: "b", label: "B", type: "derived", formula: "@a + 1" });
  }));

  assert.equal(two.ok, false);
  assert.match(messages(two).join("\n"), /loop: @[ab] -> @[ab] -> @[ab]/);

  const self = validateTemplate(mutate(core, (file) => { file.fields.push({ key: "x", label: "X", type: "derived", formula: "@x + 1" }); }));
  assert.match(messages(self).join("\n"), /loop: @x -> @x/);

  const subLoop = validateTemplate(mutate(core, (file) => { file.fields[1].subs.mod = "@str.mod + 1"; }));
  assert.match(messages(subLoop).join("\n"), /loop: @str\.mod -> @str\.mod/);
});

test("a loop through a collection column is found", () => {
  const rowLoop = validateTemplate(mutate(core, (file) => {
    file.collections[0].fields.push({ key: "p", label: "P", type: "derived", formula: "$.q" }, { key: "q", label: "Q", type: "derived", formula: "$.p" });
  }));
  assert.match(messages(rowLoop).join("\n"), /loop: @skills\.[pq] -> @skills\.[pq]/);

  const crossLoop = validateTemplate(mutate(core, (file) => {
    file.fields.push({ key: "total_all", label: "Total", type: "derived", formula: "sum(@skills.total)" });
    file.collections[0].fields.find((f) => f.key === "total").formula = "@total_all + 1";
  }));
  assert.match(messages(crossLoop).join("\n"), /loop: .*@total_all.*@skills\.total|loop: .*@skills\.total.*@total_all/);
});

test("a formula on a field that is not derived is only a warning", () => {
  const result = validateTemplate(mutate(core, (file) => { file.fields[0].formula = "1"; }));

  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((entry) => entry.path === "fields.level.formula"));
});

test("the number of fields is limited", () => {
  const many = mutate(core, (file) => {
    for (let index = 0; index < 400; index += 1) {
      file.fields.push({ key: `filler_${index}`, label: "F", type: "number" });
    }
  });

  assert.match(messages(validateTemplate(many)).join("\n"), /fields is limited to 400/);
  assert.equal(validateTemplate(null).ok, false);
  assert.equal(validateTemplate({ fields: "x" }).ok, false);
});

/* ---------- values ---------- */

test("validateValue never coerces and explains itself", () => {
  const number = { type: "number", label: "Strength", min: 1, max: 20 };

  assert.deepEqual(validateValue(number, 12), { ok: true, value: 12 });
  assert.match(validateValue(number, "12").reason, /must be a number/);
  assert.match(validateValue(number, 1.5).reason, /whole number/);
  assert.match(validateValue(number, 0).reason, /below 1/);
  assert.match(validateValue(number, 21).reason, /above 20/);
  assert.equal(validateValue({ ...number, integer: false }, 1.5).ok, true);
  assert.equal(validateValue(number, NaN).ok, false);
  assert.equal(validateValue({ type: "text", label: "T" }, 5).ok, false);
  assert.equal(validateValue({ type: "text", label: "T" }, "x".repeat(201)).ok, false);
  assert.equal(validateValue({ type: "longtext", label: "T" }, "x".repeat(201)).ok, true);
  assert.equal(validateValue({ type: "flag", label: "F" }, "yes").ok, false);
  assert.equal(validateValue({ type: "flag", label: "F" }, true).ok, true);
  assert.equal(validateValue({ type: "choice", label: "C", choices: [{ value: "a", label: "A" }] }, "b").ok, false);
  assert.equal(validateValue({ type: "list", label: "L" }, ["a", "b"]).ok, true);
  assert.equal(validateValue({ type: "list", label: "L" }, [1]).ok, false);
  assert.equal(validateValue({ type: "uses", label: "U" }, { used: 2 }).ok, true);
  assert.equal(validateValue({ type: "uses", label: "U" }, { used: -1 }).ok, false);
  assert.match(validateValue({ type: "derived", label: "D" }, 1).reason, /computed/);
});

test("fieldDefault and formatValue", () => {
  assert.equal(fieldDefault({ type: "number" }), 0);
  assert.equal(fieldDefault({ type: "number", min: 5 }), 5);
  assert.equal(fieldDefault({ type: "number", default: 7 }), 7);
  assert.equal(fieldDefault({ type: "choice", choices: [{ value: "a" }, { value: "b" }] }), "a");
  assert.deepEqual(fieldDefault({ type: "list", default: ["x"] }), ["x"]);
  assert.deepEqual(fieldDefault({ type: "uses" }), { used: 0 });
  assert.equal(fieldDefault({ type: "derived" }), null);
  assert.equal(formatValue({ type: "derived", format: "signed" }, 3), "+3");
  assert.equal(formatValue({ type: "derived", format: "signed" }, -2), "-2");
  assert.equal(formatValue({ type: "derived", format: "percent" }, 0.125), "12.5%");
  assert.equal(formatValue({ type: "derived", format: "integer" }, 3.9), "3");
  assert.equal(formatValue({ type: "derived" }, 0.1 + 0.2), "0.3");
  assert.equal(formatValue({ type: "derived" }, "text"), "text");
  assert.equal(formatValue({ type: "number" }, null), "");
});

/* ---------- derivation ---------- */

test("resolving a system with no base returns it flat and valid", () => {
  const result = resolveTemplate(core);

  assert.equal(result.ok, true);
  assert.equal(result.template.base, null);
  assert.deepEqual(result.template.overlay, []);
  assert.deepEqual(result.provenance, []);
});

test("a derived system is the base plus its overlay, and the inputs are not changed", () => {
  const before = JSON.stringify([core, custom]);
  const result = resolveTemplate(custom, lookupIn(core));

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(JSON.stringify([core, custom]), before);
  assert.deepEqual(result.provenance, [{ id: "test-d20", version: 1 }]);

  const system = result.template;

  assert.equal(system.id, "test-d20-custom");
  assert.equal(system.name, "Test d20 custom");
  assert.equal(system.description, "A derived test system.");
  assert.ok(system.fields.some((field) => field.key === "tier"));
  assert.equal(system.fields.some((field) => field.key === "touch_ac"), false);
  assert.equal(system.fields.find((field) => field.key === "ac").formula, "10 + @dex.mod + @armor_bonus + @shield");
  assert.equal(system.fields.find((field) => field.key === "ac").label, "Armor class");
  assert.ok(system.pools.some((pool) => pool.key === "mana"));
  assert.ok(system.collections.some((collection) => collection.key === "powers"));
  assert.deepEqual(Object.keys(system.tables).sort(), ["bab_table", "tier_cost"]);
  assert.ok(system.conditions.includes("Exhausted"));
  assert.equal(system.conditions.includes("Poisoned"), false);
  assert.equal(system.collections.find((c) => c.key === "skills").fields.find((f) => f.key === "misc").default, 1);
  assert.ok(system.collections.find((c) => c.key === "skills").fields.some((f) => f.key === "notes"));
  assert.deepEqual(system.sections.find((section) => section.id === "defense").items, ["ac", "initiative", "hp", "mana"]);
});

test("derivation can chain through several bases", () => {
  const middle = { format: "omniscribe-system", formatVersion: 1, id: "mid", version: 1, name: "Mid", base: { id: "test-d20", version: 1 }, overlay: [{ op: "add", target: "field", key: "extra", value: { label: "Extra", type: "number" } }] };
  const top = { format: "omniscribe-system", formatVersion: 1, id: "top", version: 1, name: "Top", base: { id: "mid", version: 1 }, overlay: [{ op: "add", target: "field", key: "more", value: { label: "More", type: "derived", formula: "@extra * 2" } }] };
  const result = resolveTemplate(top, lookupIn(core, middle));

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.provenance, [{ id: "test-d20", version: 1 }, { id: "mid", version: 1 }]);
  assert.ok(result.template.fields.some((field) => field.key === "more"));
});

test("resolution reports a missing or mismatched base instead of throwing", () => {
  assert.match(messages(resolveTemplate(custom, lookupIn())).join("\n"), /"test-d20" version 1 is not available/);
  assert.match(messages(resolveTemplate(mutate(custom, (file) => { file.base.version = 2; }), lookupIn(core))).join("\n"), /version 2 is not available/);
});

test("a base loop and an over-long chain are refused", () => {
  const make = (id, base) => ({ format: "omniscribe-system", formatVersion: 1, id, version: 1, name: id, base: { id: base, version: 1 }, overlay: [] });
  const a = make("a", "b");
  const b = make("b", "a");

  assert.match(messages(resolveTemplate(a, lookupIn(a, b))).join("\n"), /would loop/);
  assert.match(messages(resolveTemplate(make("s", "s"), lookupIn())).join("\n"), /would loop/);

  const chain = Array.from({ length: 8 }, (_, index) => make(`c${index}`, `c${index + 1}`));
  chain.push({ ...clone(core), id: "c8" });

  assert.match(messages(resolveTemplate(chain[0], lookupIn(...chain))).join("\n"), /at most 5 bases/);
});

test("a derived system may not carry its own parts", () => {
  const result = resolveTemplate(mutate(custom, (file) => { file.fields = [{ key: "z", label: "Z", type: "number" }]; file.tables = { t: {} }; }), lookupIn(core));
  const text = messages(result).join("\n");

  assert.equal(result.ok, false);
  assert.match(text, /remove "fields"/);
  assert.match(text, /remove "tables"/);
});

test("overlay operations explain what went wrong", () => {
  const withOps = (...ops) => resolveTemplate(mutate(custom, (file) => { file.overlay = ops; }), lookupIn(core));
  const text = (result) => messages(result).join("\n");

  assert.match(text(withOps({ op: "add", target: "field", key: "str", value: { label: "S", type: "number" } })), /overlay\.0: the field "str" already exists/);
  assert.match(text(withOps({ op: "override", target: "field", key: "ghost", value: {} })), /no field "ghost" to override/);
  assert.match(text(withOps({ op: "remove", target: "pool", key: "ghost" })), /no pool "ghost" to remove/);
  assert.match(text(withOps({ op: "add", target: "item", parent: "nope", key: "x", value: {} })), /no collection "nope"/);
  assert.match(text(withOps({ op: "remove", target: "item", parent: "skills", key: "ghost" })), /no field "ghost" of skills/);
  assert.match(text(withOps({ op: "add", target: "table", key: "bab_table", value: {} })), /table "bab_table" already exists/);
  assert.match(text(withOps({ op: "override", target: "table", key: "ghost", value: {} })), /no table "ghost"/);
  assert.match(text(withOps({ op: "add", target: "condition", value: "Blinded" })), /already exists/);
  assert.match(text(withOps({ op: "remove", target: "condition", value: "Ghost" })), /no condition "Ghost"/);
  assert.match(text(withOps({ op: "override", target: "condition", value: "Blinded" })), /cannot override/);
  assert.match(text(withOps({ op: "add", target: "meta", value: {} })), /meta can only be overridden/);
  assert.match(text(withOps({ op: "override", target: "meta", value: { id: "x" } })), /not "id"/);
  assert.match(text(withOps({ op: "explode", target: "field" })), /needs op/);
  assert.match(text(withOps({ op: "add", target: "bogus" })), /needs op/);
  assert.match(text(withOps({ op: "add", target: "field", value: { label: "x" } })), /needs a key/);
  assert.match(text(withOps({ op: "add", target: "field", key: "n1", value: { key: "other", label: "x", type: "number" } })), /whose key is "n1"/);
  assert.match(text(withOps({ op: "override", target: "field", key: "str", value: { key: "dex" } })), /cannot change its key/);
});

test("overlay operations merge, replace and remove as documented", () => {
  const result = resolveTemplate(mutate(custom, (file) => {
    file.overlay = [
      { op: "override", target: "table", key: "bab_table", value: { "20": 15 } },
      { op: "override", target: "field", key: "str", value: { subs: { mod: "floor((@str - 10) / 2) + 1" } } },
      { op: "remove", target: "roll", key: "str_check" },
      { op: "add", target: "rest", key: "weekly", value: { label: "Weekly" } },
      { op: "override", target: "pool", key: "hp", value: { rests: { long: "full", weekly: "full" } } }
    ];
  }), lookupIn(core));

  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.deepEqual(result.template.tables.bab_table, { "1": 0, "2": 1, "4": 3, "8": 6, "12": 9, "20": 15 });
  assert.deepEqual(result.template.fields.find((f) => f.key === "str").subs, { mod: "floor((@str - 10) / 2) + 1" });
  assert.equal(result.template.fields.find((f) => f.key === "str").label, "Strength");
  assert.equal(result.template.rolls.length, 0);
  assert.ok(result.template.rests.some((rest) => rest.id === "weekly"));
});

test("an overlay that leaves something dangling fails validation after it is applied", () => {
  const result = resolveTemplate(mutate(custom, (file) => { file.overlay = [{ op: "remove", target: "field", key: "touch_ac" }]; }), lookupIn(core));

  assert.equal(result.ok, false);
  assert.match(messages(result).join("\n"), /"touch_ac" is not a field or pool/);
});

test("the built-in systems load through the registry", async () => {
  const { resolved: map, lookup } = await loadBuiltinSystems(async (name) => read(`src/templates/${name}.json`));

  assert.deepEqual(BUILTIN_FILES, ["generic"]);
  assert.equal(map.get("generic").ok, true);
  assert.equal(lookup("generic", 1).id, "generic");
  assert.equal(lookup("generic", 9), null);
});

/* ---------- evaluation ---------- */

test("a new sheet holds defaults and no derived values", () => {
  const sheet = createSheet(coreSystem);

  assert.equal(sheet.values.str, 10);
  assert.equal(sheet.values.rank, "iron");
  assert.deepEqual(sheet.values.tags, []);
  assert.equal("ac" in sheet.values, false);
  assert.deepEqual(sheet.pools.hp, { current: null, temp: 0 });
  assert.deepEqual(sheet.collections.skills, []);
});

test("a d20 style core evaluates to the hand-computed numbers", () => {
  const sheet = sample(coreSystem);
  sheet.collections.skills = [
    createRow(coreSystem, "skills", { id: "row_climb", name: "Climb", ranks: 4, misc: 2, ability: "str" }),
    createRow(coreSystem, "skills", { id: "row_magic", name: "Magic", ranks: 6, misc: 0, ability: "int" }),
    createRow(coreSystem, "skills", { id: "row_sneak", name: "Sneak", ranks: 1, misc: 1, ability: "dex" })
  ];

  const computed = evaluateSheet(coreSystem, sheet);

  assert.deepEqual(computed.errors, []);
  assert.equal(computed.values["str.mod"], 3);
  assert.equal(computed.values["con.mod"], 2);
  assert.equal(computed.values.bab, 6);
  assert.equal(computed.values.attack_line, "+6 / +1");
  assert.equal(computed.values.ac, 17);
  assert.equal(computed.values.touch_ac, 13);
  assert.equal(computed.values.initiative, 3);
  assert.equal(computed.values.rank_bonus, 2);
  assert.equal(computed.values["hp.max"], 110);
  assert.equal(computed.values["hp.current"], 110);
  assert.equal(computed.values.skill_ranks, 11);
  assert.deepEqual(computed.collections.skills.map((row) => row.derived.total), [9, 7, 5]);
  assert.deepEqual(computed.pools.hp, { max: 110, current: 110, temp: 0 });
});

test("the iterative attack line changes with level", () => {
  const sheet = sample(coreSystem);

  sheet.values.level = 1;
  assert.equal(evaluateSheet(coreSystem, sheet).values.attack_line, "+0");
  sheet.values.level = 4;
  assert.equal(evaluateSheet(coreSystem, sheet).values.attack_line, "+3");
  sheet.values.level = 12;
  assert.equal(evaluateSheet(coreSystem, sheet).values.attack_line, "+9 / +4");
});

test("a derived system evaluates its added pool, collection, table and overridden formula", () => {
  const sheet = sample(customSystem);
  sheet.values.shield = 2;
  sheet.values.tier = 3;
  sheet.pools.mana = { current: 100, temp: 0 };
  sheet.collections.powers = [
    createRow(customSystem, "powers", { id: "row_a", name: "A", group: "racial", cost: 10, awake: true, limit: { used: 1 } }),
    createRow(customSystem, "powers", { id: "row_b", name: "B", group: "special", cost: 20, awake: false }),
    createRow(customSystem, "powers", { id: "row_c", name: "C", group: "special", cost: 30, awake: true })
  ];

  const computed = evaluateSheet(customSystem, sheet);

  assert.deepEqual(computed.errors, []);
  assert.equal(computed.values.ac, 19);
  assert.equal("touch_ac" in computed.values, false);
  assert.equal(computed.values.spell_dc, 17);
  assert.equal(computed.values.tier_cost, 50);
  assert.equal(computed.values.awakened, 2);
  assert.equal(computed.values.power_cost, 60);
  assert.deepEqual(computed.pools.mana, { max: 120, current: 100, temp: 0 });
  assert.deepEqual(computed.collections.powers.map((row) => row.derived.double_cost), [20, 40, 60]);
  assert.deepEqual(computed.collections.powers[0].uses.limit, { used: 1, max: 2, left: 1 });
  assert.deepEqual(computed.collections.powers[1].uses.limit, { used: 0, max: 2, left: 2 });
});

test("the generic system evaluates from defaults", () => {
  const system = resolved(generic);
  const computed = evaluateSheet(system, createSheet(system));

  assert.deepEqual(computed.errors, []);
  assert.equal(computed.values.defense, 10);
  assert.equal(computed.values["might.mod"], 0);
  assert.equal(computed.values["health.max"], 14);
  assert.equal(computed.values["energy.max"], 11);
});

test("a pool is full until damaged, clamps to its maximum and carries temporary points", () => {
  const sheet = sample(coreSystem);

  assert.equal(evaluateSheet(coreSystem, sheet).values["hp.current"], 110);

  sheet.pools.hp = { current: 40, temp: 6 };
  assert.deepEqual(evaluateSheet(coreSystem, sheet).pools.hp, { max: 110, current: 40, temp: 6 });

  sheet.pools.hp = { current: 500, temp: 0 };
  assert.equal(evaluateSheet(coreSystem, sheet).pools.hp.current, 110);

  sheet.pools.hp = { current: 90, temp: 0 };
  sheet.values.level = 5;
  assert.deepEqual(evaluateSheet(coreSystem, sheet).pools.hp, { max: 50, current: 50, temp: 0 });

  const noTemp = sample(customSystem);
  noTemp.pools.mana = { current: 5, temp: 9 };
  assert.equal(evaluateSheet(customSystem, noTemp).pools.mana.temp, 0);
});

test("bad stored values fall back to defaults and are reported, never thrown", () => {
  const sheet = sample(coreSystem);
  sheet.values.str = "strong";
  sheet.values.dex = 99;
  sheet.collections.skills = [{ id: "row_x", name: "X", ranks: "many", misc: 1, ability: "dex" }, null, "junk"];
  sheet.pools.hp = { current: -5, temp: "x" };

  const computed = evaluateSheet(coreSystem, sheet);
  const paths = computed.errors.map((entry) => entry.path);

  assert.ok(paths.includes("values.str"));
  assert.ok(paths.includes("values.dex"));
  assert.ok(paths.includes("collections.skills.row_x.ranks"));
  assert.equal(computed.values.str, 10);
  assert.equal(computed.collections.skills.length, 3);
  assert.equal(computed.pools.hp.current, computed.pools.hp.max);
});

test("a deep dependency chain and a full collection evaluate quickly", () => {
  const system = resolved(mutate(core, (file) => {
    file.fields.push({ key: "a0", label: "A0", type: "number", default: 1 });

    for (let index = 1; index < 300; index += 1) {
      file.fields.push({ key: `a${index}`, label: `A${index}`, type: "derived", formula: `@a${index - 1} + 1` });
    }

    file.collections[0].maxItems = 500;
    file.collections[0].fields.push({ key: "deep", label: "Deep", type: "derived", formula: "$.ranks + @a299" });
    file.fields.push({ key: "deep_sum", label: "Deep sum", type: "derived", formula: "sum(@skills.deep)" });
  }));
  const sheet = createSheet(system);
  sheet.collections.skills = Array.from({ length: 500 }, (_, index) => createRow(system, "skills", { id: `row_${index}`, ranks: index % 5 }));

  const started = Date.now();
  const computed = evaluateSheet(system, sheet);
  const elapsed = Date.now() - started;

  assert.deepEqual(computed.errors, []);
  assert.equal(computed.values.a299, 300);
  assert.equal(computed.values.deep_sum, 500 * 300 + 100 * (0 + 1 + 2 + 3 + 4));
  assert.ok(elapsed < 1500, `took ${elapsed} ms`);
});

test("a failing formula is an error value and the rest of the sheet still evaluates", () => {
  const broken = resolved(mutate(core, (file) => {
    file.fields.push({ key: "bad", label: "Bad", type: "derived", formula: "1 / (@level - 1)" });
    file.fields.push({ key: "after", label: "After", type: "derived", formula: "@bad + 1" });
    file.fields.push({ key: "twice", label: "Twice", type: "derived", formula: "@after + 1" });
  }));
  const computed = evaluateSheet(broken, createSheet(broken));
  const byPath = Object.fromEntries(computed.errors.map((entry) => [entry.path, entry.message]));

  assert.equal(byPath["@bad"], "Division by zero");
  assert.equal(byPath["@after"], "Depends on @bad, which has an error");
  assert.equal(byPath["@twice"], "Depends on @after, which has an error");
  assert.equal("bad" in computed.values, false);
  assert.equal(computed.values.ac, 10);
  assert.equal(computed.values["hp.max"], 8);
});

test("values on a loop are errors and independent values still compute", () => {
  const system = { ...clone(coreSystem) };
  system.fields.push({ key: "p", label: "P", type: "derived", formula: "@q + 1" }, { key: "q", label: "Q", type: "derived", formula: "@p + 1" }, { key: "ok", label: "Ok", type: "derived", formula: "5" });

  const computed = evaluateSheet(system, createSheet(system));
  const byPath = Object.fromEntries(computed.errors.map((entry) => [entry.path, entry.message]));

  assert.match(byPath["@p"], /Part of a loop/);
  assert.match(byPath["@q"], /Part of a loop/);
  assert.equal(computed.values.ok, 5);
});

test("a row error fails its column and anything that reads the column", () => {
  const system = resolved(mutate(core, (file) => {
    file.collections[0].fields.find((f) => f.key === "total").formula = "1 / $.ranks";
    file.fields.push({ key: "all_totals", label: "All", type: "derived", formula: "sum(@skills.total)" });
  }));
  const sheet = createSheet(system);
  sheet.collections.skills = [createRow(system, "skills", { id: "row_a", ranks: 2 }), createRow(system, "skills", { id: "row_b", ranks: 0 })];

  const computed = evaluateSheet(system, sheet);
  const byPath = Object.fromEntries(computed.errors.map((entry) => [entry.path, entry.message]));

  assert.equal(byPath["collections.skills.row_b.total"], "Division by zero");
  assert.equal(byPath["@all_totals"], "Depends on @skills.total, which has an error");
  assert.equal(computed.collections.skills[0].derived.total, 0.5);
  assert.equal(computed.values.skill_ranks, 2);
});

test("rows are capped, given safe ids and kept distinct", () => {
  const sheet = createSheet(coreSystem);
  sheet.collections.skills = Array.from({ length: 250 }, (_, index) => ({ id: index === 1 ? "row_0" : `row_${index}`, name: `S${index}` }));

  const rows = evaluateSheet(coreSystem, sheet).collections.skills;

  assert.equal(rows.length, 200);
  assert.equal(new Set(rows.map((row) => row.id)).size, 200);

  sheet.collections.skills = [{ name: "No id" }, { id: "bad id!", name: "Bad id" }];
  assert.deepEqual(evaluateSheet(coreSystem, sheet).collections.skills.map((row) => row.id), ["row_0", "row_1"]);
});

test("a list field, a choice index and a conditional read the sheet", () => {
  const system = resolved(mutate(core, (file) => {
    file.fields.push({ key: "is_fire", label: "Fire", type: "derived", formula: "has(@tags, \"fire\")" });
    file.fields.push({ key: "at_least_bronze", label: "Bronze", type: "derived", formula: "index(@rank) >= 1" });
  }));
  const sheet = createSheet(system);
  sheet.values.tags = ["fire", "ice"];
  sheet.values.rank = "silver";

  const computed = evaluateSheet(system, sheet);

  assert.equal(computed.values.is_fire, true);
  assert.equal(computed.values.at_least_bronze, true);
  assert.equal(computed.values.rank_bonus, 4);
});

test("evaluation is cached for the same system and sheet and recomputed when the sheet changes", () => {
  const sheet = sample(coreSystem);
  const first = evaluateSheet(coreSystem, sheet);

  assert.equal(evaluateSheet(coreSystem, clone(sheet)), first);

  sheet.values.str = 18;
  const second = evaluateSheet(coreSystem, sheet);

  assert.notEqual(second, first);
  assert.equal(second.values["str.mod"], 4);
  assert.equal(scopeOf(second)["str.mod"], 4);
  assert.equal(scopeOf(second)["hp.max"], 110);
});

test("conditions are normalized", () => {
  const sheet = createSheet(coreSystem);
  sheet.conditions = [{ name: "Blinded", note: "until dawn" }, { name: "" }, null, { name: "Dazed" }];

  assert.deepEqual(evaluateSheet(coreSystem, sheet).conditions, [{ name: "Blinded", note: "until dawn" }, { name: "Dazed", note: "" }]);
});

/* ---------- reconciling a changed system (S-4) ---------- */

test("values whose field is gone move to orphans and come back when the field returns", () => {
  const sheet = sample(coreSystem);
  sheet.collections.skills = [createRow(coreSystem, "skills", { id: "row_a", name: "A", ranks: 3 })];
  sheet.pools.hp = { current: 20, temp: 0 };

  const smaller = resolved(mutate(core, (file) => {
    file.fields = file.fields.filter((field) => field.key !== "int" && field.key !== "armor_bonus");
    file.fields = file.fields.filter((field) => !["ac", "touch_ac"].includes(field.key));
    file.sections = [];
    file.collections[0].fields = file.collections[0].fields.filter((field) => field.key !== "misc" && field.key !== "total" && field.key !== "ability");
    file.collections[0].sortBy = "name";
    file.fields = file.fields.filter((field) => field.key !== "skill_ranks");
    file.rolls = [];
    file.pools[0].max = "@level * 8";
  }));

  const reduced = reconcileSheet(smaller, sheet);

  assert.equal("int" in reduced.sheet.values, false);
  assert.equal(reduced.sheet.orphans["values.int"], 12);
  assert.equal(reduced.sheet.orphans["values.armor_bonus"], 4);
  assert.ok(reduced.moved.includes("values.int"));
  assert.ok(reduced.moved.some((path) => path.startsWith("rows.skills.row_a.")));
  assert.equal(reduced.sheet.values.str, 16);
  assert.equal(reduced.sheet.collections.skills[0].name, "A");

  const restored = reconcileSheet(coreSystem, reduced.sheet);

  assert.equal(restored.sheet.values.int, 12);
  assert.equal(restored.sheet.values.armor_bonus, 4);
  assert.equal(restored.sheet.collections.skills[0].ranks, 3);
  assert.deepEqual(restored.sheet.orphans, {});
  assert.ok(restored.restored.includes("values.int"));
});

test("a whole pool or collection that disappears is kept as an orphan", () => {
  const sheet = sample(customSystem);
  sheet.pools.mana = { current: 30, temp: 0 };
  sheet.collections.powers = [createRow(customSystem, "powers", { id: "row_p", name: "P" })];

  const back = reconcileSheet(coreSystem, sheet);

  assert.deepEqual(back.sheet.orphans["pools.mana"], { current: 30, temp: 0 });
  assert.equal(back.sheet.orphans["collections.powers"][0].name, "P");
  assert.equal("mana" in back.sheet.pools, false);

  const forward = reconcileSheet(customSystem, back.sheet);

  assert.equal(forward.sheet.pools.mana.current, 30);
  assert.equal(forward.sheet.collections.powers[0].name, "P");
  assert.deepEqual(forward.sheet.orphans, {});
});

test("an orphan that no longer fits its field stays an orphan", () => {
  const sheet = { values: {}, orphans: { "values.str": "not a number" } };

  assert.equal(reconcileSheet(coreSystem, sheet).sheet.orphans["values.str"], "not a number");
});

/* ---------- rests (DEF-005) ---------- */

test("a long rest refills pools and resets uses; a short rest adds and resets only its own", () => {
  const sheet = sample(customSystem);
  sheet.pools.hp = { current: 20, temp: 0 };
  sheet.pools.mana = { current: 30, temp: 0 };
  sheet.collections.powers = [createRow(customSystem, "powers", { id: "row_a", name: "A", limit: { used: 2 } })];

  const short = applyRest(customSystem, sheet, "short");
  const afterShort = evaluateSheet(customSystem, short);

  assert.equal(afterShort.pools.mana.current, 35);
  assert.equal(afterShort.pools.hp.current, 20);
  assert.deepEqual(afterShort.collections.powers[0].uses.limit, { used: 0, max: 2, left: 2 });

  const long = applyRest(customSystem, short, "long");
  const afterLong = evaluateSheet(customSystem, long);

  assert.equal(afterLong.pools.hp.current, afterLong.pools.hp.max);
  assert.equal(afterLong.pools.mana.current, afterLong.pools.mana.max);
  assert.equal(long.pools.hp.current, null);
});

test("a rest never takes a pool above its maximum or below zero, and the original sheet is untouched", () => {
  const sheet = sample(customSystem);
  sheet.pools.mana = { current: 118, temp: 0 };
  const before = JSON.stringify(sheet);

  assert.equal(evaluateSheet(customSystem, applyRest(customSystem, sheet, "short")).pools.mana.current, 120);
  assert.equal(JSON.stringify(sheet), before);

  const setSystem = resolved(mutate(core, (file) => { file.pools[0].rests = { short: { set: "-10" } }; }));
  const damaged = createSheet(setSystem);
  damaged.pools.hp = { current: 5, temp: 0 };

  assert.equal(evaluateSheet(setSystem, applyRest(setSystem, damaged, "short")).pools.hp.current, 0);
  assert.equal(applyRest(setSystem, damaged, "nonexistent").pools.hp.current, 5);
});
