import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normalizeCharacter, normalizeSheet } from "../src/schema.js";
import { createRow, evaluateSheet } from "../src/sheet/evaluate.js";
import { resolveTemplate } from "../src/sheet/resolve.js";
import { createStore } from "../src/store.js";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const generic = resolveTemplate(read("src/templates/generic.json")).template;
const core = resolveTemplate(read("test/fixtures/systems/d20-core.json")).template;
const GENERIC = { id: "generic", version: 1 };

function started() {
  const store = createStore({ now: () => 1000 });
  const character = store.addCharacter({ name: "Mira" });
  store.startSheet(character.id, GENERIC, generic);
  return { store, id: character.id };
}

const sheetOf = (store, id) => store.getCharacter(id).sheet;

test("a character has no sheet until one is started, and starting pins the system and creates defaults", () => {
  const store = createStore();
  const character = store.addCharacter({ name: "A" });

  assert.equal(character.sheet, null);

  store.startSheet(character.id, GENERIC, generic);
  const sheet = sheetOf(store, character.id);

  assert.deepEqual(sheet.template, GENERIC);
  assert.equal(sheet.values.level, 1);
  assert.deepEqual(sheet.pools.health, { current: null, temp: 0 });
  assert.deepEqual(sheet.collections.abilities, []);
  assert.equal(store.startSheet("char_none", GENERIC, generic), null);
});

test("sheet values are set per key and rapid edits to one value coalesce into one undo step", () => {
  const { store, id } = started();

  store.setSheetValue(id, "might", 12);
  store.setSheetValue(id, "might", 14);
  store.setSheetValue(id, "agility", 16);

  assert.equal(sheetOf(store, id).values.might, 14);
  assert.equal(sheetOf(store, id).values.agility, 16);

  store.undo();
  assert.equal(sheetOf(store, id).values.agility, 10);
  assert.equal(sheetOf(store, id).values.might, 14);
  store.undo();
  assert.equal(sheetOf(store, id).values.might, 10);
});

test("pools keep their other fields when one is set", () => {
  const { store, id } = started();

  store.setPool(id, "health", { current: 7 });
  store.setPool(id, "health", { temp: 3 });

  assert.deepEqual(sheetOf(store, id).pools.health, { current: 7, temp: 3 });
  store.setPool(id, "health", { current: null });
  assert.deepEqual(sheetOf(store, id).pools.health, { current: null, temp: 3 });
});

test("rows can be added, edited, removed and restored in place", () => {
  const { store, id } = started();
  const first = createRow(generic, "abilities", { id: "row_a", name: "Blink" });
  const second = createRow(generic, "abilities", { id: "row_b", name: "Heal" });

  store.addRow(id, "abilities", first);
  store.addRow(id, "abilities", second);
  store.setRowValue(id, "abilities", "row_a", "cost", 5);

  assert.deepEqual(sheetOf(store, id).collections.abilities.map((row) => [row.id, row.cost]), [["row_a", 5], ["row_b", 0]]);

  const removed = store.removeRow(id, "abilities", "row_a");

  assert.equal(removed.index, 0);
  assert.equal(sheetOf(store, id).collections.abilities.length, 1);
  assert.equal(store.removeRow(id, "abilities", "row_none"), null);

  store.restoreRow(id, "abilities", removed);
  assert.deepEqual(sheetOf(store, id).collections.abilities.map((row) => row.id), ["row_a", "row_b"]);
  assert.equal(store.restoreRow(id, "abilities", removed), null);
});

test("a collection will not take more than its row limit", () => {
  const { store, id } = started();

  for (let index = 0; index < 500; index += 1) {
    store.addRow(id, "abilities", { id: `row_${index}`, name: `A${index}` });
  }

  assert.equal(store.addRow(id, "abilities", { id: "row_over" }), null);
  assert.equal(sheetOf(store, id).collections.abilities.length, 500);
});

test("conditions toggle on and off", () => {
  const { store, id } = started();

  store.toggleCondition(id, "Prone");
  assert.deepEqual(sheetOf(store, id).conditions, [{ name: "Prone", note: "" }]);
  store.toggleCondition(id, "Prone");
  assert.deepEqual(sheetOf(store, id).conditions, []);
});

test("a rest is one undoable step that refills pools and resets uses", () => {
  const { store, id } = started();
  store.addRow(id, "abilities", createRow(generic, "abilities", { id: "row_a", name: "Blink", use: { used: 1 } }));
  store.setPool(id, "health", { current: 3 });

  store.applyRest(id, "long", generic);

  assert.equal(sheetOf(store, id).pools.health.current, null);
  assert.deepEqual(sheetOf(store, id).collections.abilities[0].use, { used: 0 });

  store.undo();

  assert.equal(sheetOf(store, id).pools.health.current, 3);
  assert.deepEqual(sheetOf(store, id).collections.abilities[0].use, { used: 1 });
});

test("changing system keeps values that do not exist in the new one as orphans, and can be undone", () => {
  const { store, id } = started();
  store.setSheetValue(id, "might", 16);
  store.setSheetValue(id, "concept", "Courier");

  const result = store.changeSystem(id, { id: "test-d20", version: 1 }, core);
  const sheet = sheetOf(store, id);

  assert.deepEqual(sheet.template, { id: "test-d20", version: 1 });
  assert.equal(sheet.orphans["values.might"], 16);
  assert.equal(sheet.orphans["values.concept"], "Courier");
  assert.ok(result.moved.includes("values.might"));
  assert.equal("might" in sheet.values, false);

  store.undo();
  assert.deepEqual(sheetOf(store, id).template, GENERIC);
  assert.equal(sheetOf(store, id).values.might, 16);
  assert.equal(store.changeSystem("char_none", GENERIC, generic), null);
});

test("sheet actions do nothing for a character without a sheet", () => {
  const store = createStore();
  const character = store.addCharacter({ name: "A" });

  assert.equal(store.setSheetValue(character.id, "x", 1), null);
  assert.equal(store.setPool(character.id, "x", {}), null);
  assert.equal(store.addRow(character.id, "x", { id: "row_a" }), null);
  assert.equal(store.toggleCondition(character.id, "x"), null);
  assert.equal(store.changeSystem(character.id, GENERIC, generic), null);
});

test("duplicating a character copies its sheet independently", () => {
  const { store, id } = started();
  store.setSheetValue(id, "might", 18);
  store.addRow(id, "abilities", createRow(generic, "abilities", { id: "row_a", name: "Blink" }));

  const copy = store.duplicateCharacter(id);
  store.setSheetValue(copy.id, "might", 8);
  store.setRowValue(copy.id, "abilities", "row_a", "name", "Changed");

  assert.equal(sheetOf(store, id).values.might, 18);
  assert.equal(sheetOf(store, id).collections.abilities[0].name, "Blink");
  assert.equal(sheetOf(store, copy.id).values.might, 8);
});

test("the sheet is normalized by shape and the engine judges the values", () => {
  assert.equal(normalizeSheet(null), null);
  assert.equal(normalizeSheet({}), null);
  assert.equal(normalizeSheet({ template: { id: "Bad Id", version: 1 } }), null);
  assert.equal(normalizeSheet({ template: { id: "generic", version: 0 } }), null);

  const sheet = normalizeSheet({
    template: { id: "generic", version: 1, extra: true },
    values: { might: "lots", fn: () => 1, undef: undefined },
    collections: { abilities: [{ id: "row_a" }, null, "junk"], bad: "nope" },
    conditions: [{ name: "Prone", note: 5 }, { name: "" }, null],
    pools: "nope"
  });

  assert.deepEqual(sheet.template, { id: "generic", version: 1 });
  assert.deepEqual(sheet.values, { might: "lots" });
  assert.deepEqual(sheet.collections, { abilities: [{ id: "row_a" }], bad: [] });
  assert.deepEqual(sheet.conditions, [{ name: "Prone", note: "" }]);
  assert.deepEqual(sheet.pools, {});

  const computed = evaluateSheet(generic, sheet);
  assert.ok(computed.errors.some((entry) => entry.path === "values.might"));
  assert.equal(computed.values.might, 10);
});

test("a character round trips its sheet through normalization unchanged", () => {
  const { store, id } = started();
  store.setSheetValue(id, "might", 15);
  store.addRow(id, "attacks", createRow(generic, "attacks", { id: "row_s", name: "Sword", damage: "1d8 + @might.mod" }));

  const once = store.getCharacter(id);
  const twice = normalizeCharacter(once);

  assert.deepEqual(twice, once);
});
