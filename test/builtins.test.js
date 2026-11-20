import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { applyRest, createRow, createSheet, evaluateSheet } from "../src/sheet/evaluate.js";
import { resolveTemplate } from "../src/sheet/resolve.js";
import { validateTemplate } from "../src/sheet/template.js";
import { createRegistry } from "../src/systems.js";
import { BUILTIN_FILES } from "../src/templates/index.js";

const read = (name) => JSON.parse(readFileSync(new URL(`../src/templates/${name}.json`, import.meta.url), "utf8"));
const files = Object.fromEntries(BUILTIN_FILES.map((name) => [name, read(name)]));
const registry = createRegistry({ builtins: Object.values(files) });
const dnd35 = registry.resolve({ id: "dnd35", version: 1 }).template;
const dnd5e = registry.resolve({ id: "dnd5e", version: 1 }).template;

const rowByName = (computed, collection, name) => computed.collections[collection].find((row) => row.values.name === name);

function build35() {
  const sheet = createSheet(dnd35);
  Object.assign(sheet.values, { str: 16, dex: 12, con: 14, wis: 8, armor_bonus: 5, hp_max: 40 });
  sheet.collections.classes = [{ ...sheet.collections.classes[0], name: "Fighter", level: 5, bab_rate: "good", fort: "good" }];
  return sheet;
}

test("every built-in system validates and evaluates a new sheet without errors", () => {
  for (const [name, file] of Object.entries(files)) {
    const result = resolveTemplate(file);

    assert.equal(result.ok, true, `${name}: ${JSON.stringify(result.errors)}`);
    assert.equal(validateTemplate(result.template).ok, true);
    assert.deepEqual(evaluateSheet(result.template, createSheet(result.template)).errors, [], name);
    assert.equal(registry.isBuiltin(file.id), true);
  }
});

test("the built-ins carry structure and formulas, with no rules text beyond a short description", () => {
  for (const file of Object.values(files)) {
    assert.ok(file.description.length < 400);

    for (const field of file.fields) {
      assert.ok((field.hint ?? "").length <= 300);
    }
  }

  assert.match(files.dnd35.description, /no rules text/);
  assert.match(files.dnd5e.description, /no rules text/);
});

test("a new 3.5e sheet starts with a skill list and one class", () => {
  const sheet = createSheet(dnd35);
  const computed = evaluateSheet(dnd35, sheet);

  assert.equal(sheet.collections.skills.length, 42);
  assert.equal(sheet.collections.classes.length, 1);
  assert.equal(computed.values.level, 1);
  assert.equal(computed.values.bab, 0);
  assert.equal(computed.values.ac, 10);
  assert.equal(computed.values["hp.max"], 1);
});

test("3.5e derives attack, armour class, saves and skills from the classes and abilities", () => {
  const computed = evaluateSheet(dnd35, build35());

  assert.deepEqual(computed.errors, []);
  assert.equal(computed.values.level, 5);
  assert.equal(computed.values.bab, 5);
  assert.equal(computed.values.attack_line, "+5");
  assert.equal(computed.values.melee_attack, 8);
  assert.equal(computed.values.ranged_attack, 6);
  assert.equal(computed.values.grapple, 8);
  assert.equal(computed.values.ac, 16);
  assert.equal(computed.values.touch_ac, 11);
  assert.equal(computed.values.flat_footed_ac, 15);
  assert.equal(computed.values.initiative, 1);
  assert.equal(computed.values.fort, 6);
  assert.equal(computed.values.ref, 2);
  assert.equal(computed.values.will, 0);
  assert.equal(computed.values["str.mod"], 3);
  assert.equal(computed.values["wis.mod"], -1);
});

test("3.5e multiclassing sums base attack and base saves and shows iterative attacks", () => {
  const sheet = build35();
  sheet.collections.classes.push(createRow(dnd35, "classes", { name: "Wizard", level: 3, bab_rate: "poor", fort: "poor", ref: "poor", will: "good" }));

  let computed = evaluateSheet(dnd35, sheet);

  assert.equal(computed.values.level, 8);
  assert.equal(computed.values.bab, 6);
  assert.equal(computed.values.attack_line, "+6 / +1");
  assert.equal(computed.values.will, 3);

  sheet.collections.classes[0].level = 12;
  computed = evaluateSheet(dnd35, sheet);
  assert.equal(computed.values.bab, 13);
  assert.equal(computed.values.attack_line, "+13 / +8 / +3");

  sheet.collections.classes[0].level = 20;
  assert.equal(evaluateSheet(dnd35, sheet).values.attack_line, "+21 / +16 / +11 / +6");
});

test("3.5e size changes the attack, armour class and grapple numbers", () => {
  const sheet = build35();
  sheet.values.size = "large";
  const computed = evaluateSheet(dnd35, sheet);

  assert.equal(computed.values.size_mod, -1);
  assert.equal(computed.values.melee_attack, 7);
  assert.equal(computed.values.grapple, 12);
  assert.equal(computed.values.ac, 15);
});

test("3.5e skills add ranks, the ability modifier, misc and the class skill bonus", () => {
  const sheet = build35();
  const set = (name, patch) => Object.assign(sheet.collections.skills.find((row) => row.name === name), patch);

  set("Climb", { ranks: 4, class_skill: true });
  set("Hide", { ranks: 2 });
  set("Swim", { class_skill: true });
  set("Jump", { ranks: 1.5, misc: 2 });

  const computed = evaluateSheet(dnd35, sheet);

  assert.equal(rowByName(computed, "skills", "Climb").derived.total, 10);
  assert.equal(rowByName(computed, "skills", "Hide").derived.total, 3);
  assert.equal(rowByName(computed, "skills", "Swim").derived.total, 3);
  assert.equal(rowByName(computed, "skills", "Jump").derived.total, 6.5);
  assert.deepEqual(computed.errors, []);
});

test("3.5e spells get as many casts as are prepared, and a night of rest restores them and heals by level", () => {
  const sheet = build35();
  sheet.collections.spells = [createRow(dnd35, "spells", { id: "row_s", name: "Light", level: 0, prepared: 3, cast: { used: 2 } })];
  sheet.pools.hp = { current: 10, temp: 0 };

  const before = evaluateSheet(dnd35, sheet);
  assert.deepEqual(before.collections.spells[0].uses.cast, { used: 2, max: 3, left: 1 });

  const rested = evaluateSheet(dnd35, applyRest(dnd35, sheet, "long"));
  assert.deepEqual(rested.collections.spells[0].uses.cast, { used: 0, max: 3, left: 3 });
  assert.equal(rested.pools.hp.current, 15);
});

test("a house version derived from 3.5e adds its own pool and keeps the numbers", () => {
  const house = {
    format: "omniscribe-system",
    formatVersion: 1,
    id: "house",
    version: 1,
    name: "House",
    base: { id: "dnd35", version: 1 },
    overlay: [
      { op: "add", target: "field", key: "tier", value: { label: "Tier", type: "number", default: 2 } },
      { op: "add", target: "pool", key: "mana", value: { label: "Mana", max: "@int * 10 + @tier", display: "boxes", boxSize: 10, rests: { long: "full" } } },
      { op: "override", target: "field", key: "ac", value: { formula: "10 + @armor_bonus + @dex.mod + @size_mod + 1" } }
    ]
  };
  const custom = createRegistry({ builtins: [files.dnd35], custom: [house] });
  const resolved = custom.resolve({ id: "house", version: 1 });

  assert.equal(resolved.ok, true, JSON.stringify(resolved.errors));

  const sheet = build35();
  sheet.values.int = 14;
  const computed = evaluateSheet(resolved.template, sheet);

  assert.equal(computed.pools.mana.max, 142);
  assert.equal(computed.values.ac, 17);
  assert.equal(computed.values.melee_attack, 8);
});

test("a new 5e sheet starts with the eighteen skills and one class", () => {
  const sheet = createSheet(dnd5e);
  const computed = evaluateSheet(dnd5e, sheet);

  assert.equal(sheet.collections.skills.length, 18);
  assert.equal(computed.values.proficiency, 2);
  assert.equal(computed.values.level, 1);
  assert.equal(computed.values.passive_perception, 10);
});

function build5() {
  const sheet = createSheet(dnd5e);
  Object.assign(sheet.values, { str: 16, dex: 14, wis: 16, save_prof_str: true, spell_ability: "wis", slots_1: 4, hp_max: 38 });
  sheet.collections.classes[0].level = 5;
  const set = (name, patch) => Object.assign(sheet.collections.skills.find((row) => row.name === name), patch);

  set("Athletics", { prof: "proficient" });
  set("Stealth", { prof: "expertise" });
  set("Perception", { prof: "proficient" });
  return sheet;
}

test("5e proficiency, saves, skills with expertise, passive Perception and spellcasting numbers", () => {
  const computed = evaluateSheet(dnd5e, build5());

  assert.deepEqual(computed.errors, []);
  assert.equal(computed.values.proficiency, 3);
  assert.equal(computed.values.save_str, 6);
  assert.equal(computed.values.save_dex, 2);
  assert.equal(computed.values.initiative, 2);
  assert.equal(rowByName(computed, "skills", "Athletics").derived.total, 6);
  assert.equal(rowByName(computed, "skills", "Stealth").derived.total, 8);
  assert.equal(rowByName(computed, "skills", "Perception").derived.total, 6);
  assert.equal(rowByName(computed, "skills", "Arcana").derived.total, 0);
  assert.equal(computed.values.passive_perception, 16);
  assert.equal(computed.values.spell_save_dc, 14);
  assert.equal(computed.values.spell_attack, 6);
});

test("5e proficiency grows with level and spellcasting is zero without an ability", () => {
  const sheet = build5();

  for (const [level, bonus] of [[1, 2], [4, 2], [5, 3], [9, 4], [13, 5], [17, 6], [20, 6]]) {
    sheet.collections.classes[0].level = level;
    assert.equal(evaluateSheet(dnd5e, sheet).values.proficiency, bonus, `level ${level}`);
  }

  sheet.values.spell_ability = "none";
  const computed = evaluateSheet(dnd5e, sheet);

  assert.equal(computed.values.spell_save_dc, 0);
  assert.equal(computed.values.spell_attack, 0);
});

test("5e pools: slots as boxes, hit dice regained by half on a long rest, and short rests leave hit points alone", () => {
  const sheet = build5();
  sheet.pools.spell_1 = { current: 1, temp: 0 };
  sheet.pools.hit_dice = { current: 0, temp: 0 };
  sheet.pools.hp = { current: 5, temp: 0 };

  const computed = evaluateSheet(dnd5e, sheet);
  assert.equal(computed.pools.spell_1.max, 4);
  assert.equal(computed.pools.hit_dice.max, 5);

  const short = evaluateSheet(dnd5e, applyRest(dnd5e, sheet, "short"));
  assert.equal(short.pools.hp.current, 5);
  assert.equal(short.pools.spell_1.current, 1);

  const long = evaluateSheet(dnd5e, applyRest(dnd5e, sheet, "long"));
  assert.equal(long.pools.hp.current, 38);
  assert.equal(long.pools.spell_1.current, 4);
  assert.equal(long.pools.hit_dice.current, 2);
});
