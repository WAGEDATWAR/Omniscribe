import assert from "node:assert/strict";
import test from "node:test";
import { migrateCustom, mergeOps } from "../src/layouts/migrate.js";
import { itemsOf, orphanedFieldIds, ownDefinitions, resolveLayout, validateLayoutFile } from "../src/layouts/resolve.js";
import { SURFACE_IDS, defaultSections } from "../src/layouts/surfaces.js";
import { isEmptyValue, normalizeStoredValues, validateFieldDef, validateOwnValue } from "../src/layouts/values.js";

const rarity = { id: "cf_rarity", label: "Rarity", type: "choice", choices: ["Common", "Rare"], hideWhenEmpty: true };
const layout = (surface, ops) => ({ id: "lay_test", name: "Test", surface, base: "default", ops });
const keys = (resolved, sectionId) => resolved.sections.find((section) => section.id === sectionId).items.map((item) => item.key);

test("every surface has a default and its title field is required", () => {
  for (const id of SURFACE_IDS) {
    const sections = defaultSections(id);
    assert.ok(sections.length >= 1, id);
    assert.ok(sections.flatMap((section) => section.fields).some((field) => field.required), `${id} has a required field`);
  }

  assert.deepEqual(defaultSections("nothing"), []);
});

test("with no layout the resolved page is the default", () => {
  const resolved = resolveLayout("inventory", null);
  assert.deepEqual(keys(resolved, "main").slice(0, 3), ["name", "quantity", "weight"]);
  assert.ok(!keys(resolved, "main").includes("containerId"));
  assert.deepEqual(resolved.problems, []);
});

test("operations add a section and a field, move, hide and rename", () => {
  const resolved = resolveLayout(
    "inventory",
    layout("inventory", [
      { op: "add", target: "section", id: "magic", title: "Magic", after: "main" },
      { op: "add", target: "field", field: rarity, section: "magic" },
      { op: "move", target: "field", key: "notes", section: "magic", index: 0 },
      { op: "hide", target: "field", key: "weightMultiplier" },
      { op: "override", target: "field", key: "notes", value: { label: "Lore", wide: true } },
      { op: "override", target: "section", id: "magic", value: { title: "Arcane" } }
    ])
  );

  assert.deepEqual(resolved.problems, []);
  assert.deepEqual(resolved.sections.map((section) => section.id), ["main", "magic"]);
  assert.deepEqual(keys(resolved, "magic"), ["notes", "cf_rarity"]);
  assert.equal(resolved.sections[1].title, "Arcane");
  assert.equal(itemsOf(resolved).find((item) => item.key === "notes").label, "Lore");
  assert.equal(itemsOf(resolved).find((item) => item.key === "weightMultiplier").hidden, true);
  assert.equal(itemsOf(resolved, { hidden: false }).some((item) => item.key === "weightMultiplier"), false);
  assert.deepEqual([...ownDefinitions(resolved).keys()], ["cf_rarity"]);
});

test("a bad operation is dropped and reported; the rest still apply", () => {
  const resolved = resolveLayout(
    "inventory",
    layout("inventory", [
      { op: "hide", target: "field", key: "name" },
      { op: "hide", target: "field", key: "ghost" },
      { op: "remove", target: "field", key: "notes" },
      { op: "add", target: "field", field: { ...rarity, id: "bad" }, section: "main" },
      { op: "add", target: "field", field: rarity, section: "nowhere" },
      { op: "override", target: "field", key: "notes", value: { type: "number" } },
      { op: "remove", target: "section", id: "main" },
      { op: "teleport", target: "field", key: "notes" },
      { op: "hide", target: "field", key: "notes" }
    ])
  );

  assert.equal(resolved.problems.length, 8);
  assert.deepEqual(resolved.problems.map((problem) => problem.index), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(itemsOf(resolved).find((item) => item.key === "notes").hidden, true);
  assert.equal(itemsOf(resolved).find((item) => item.key === "name").hidden, false);
});

test("removing an own section sends built-in fields to the section before it, and drops the own fields", () => {
  const resolved = resolveLayout(
    "inventory",
    layout("inventory", [
      { op: "add", target: "section", id: "extra", title: "Extra" },
      { op: "add", target: "field", field: rarity, section: "extra" },
      { op: "move", target: "field", key: "notes", section: "extra" },
      { op: "remove", target: "section", id: "extra" }
    ])
  );

  assert.deepEqual(resolved.problems, []);
  assert.deepEqual(resolved.sections.map((section) => section.id), ["main"]);
  assert.ok(keys(resolved, "main").includes("notes"));
  assert.ok(!keys(resolved, "main").includes("cf_rarity"));
});

test("a built-in field the layout never mentions stays where the default puts it", () => {
  const resolved = resolveLayout("journal", layout("journal", [{ op: "move", target: "field", key: "title", index: 3 }]));
  assert.equal(itemsOf(resolved).length, defaultSections("journal").flatMap((section) => section.fields).length);
});

test("a layout of another surface is ignored", () => {
  assert.deepEqual(resolveLayout("journal", layout("inventory", [{ op: "hide", target: "field", key: "notes" }])).problems, []);
  assert.equal(itemsOf(resolveLayout("journal", layout("inventory", [{ op: "hide", target: "field", key: "text" }]))).some((item) => item.hidden), false);
});

test("a layout file is checked for its outer shape", () => {
  assert.equal(validateLayoutFile(layout("inventory", [])).ok, true);
  assert.equal(validateLayoutFile({ ...layout("inventory", []), id: "x" }).ok, false);
  assert.equal(validateLayoutFile({ ...layout("inventory", []), surface: "sheet" }).ok, false);
  assert.equal(validateLayoutFile({ ...layout("inventory", []), ops: ["nope"] }).ok, false);
  assert.equal(validateLayoutFile({ ...layout("inventory", []), name: "  " }).ok, false);
});

test("fields of your own are validated and never coerced", () => {
  assert.equal(validateFieldDef({ id: "cf_a1b2", label: "Age", type: "number" }).ok, true);
  assert.equal(validateFieldDef({ id: "cf_a1b2", label: "Age", type: "money" }).ok, false);
  assert.equal(validateFieldDef({ id: "cf_a1b2", label: "Mood", type: "choice", choices: ["a", "a"] }).ok, false);

  const number = { id: "cf_n", label: "Age", type: "number" };
  assert.deepEqual(validateOwnValue(number, 12), { ok: true, value: 12 });
  assert.equal(validateOwnValue(number, "12").ok, false);
  assert.equal(validateOwnValue({ id: "cf_d", label: "Born", type: "date" }, "2026-02-30").ok, false);
  assert.equal(validateOwnValue({ id: "cf_d", label: "Born", type: "date" }, "2026-02-28").ok, true);
  assert.equal(validateOwnValue({ ...rarity }, "Epic").ok, false);
  assert.equal(validateOwnValue({ id: "cf_c", label: "Done", type: "checkbox" }, "yes").ok, false);
  assert.equal(isEmptyValue({ type: "checkbox" }, false), true);
  assert.equal(isEmptyValue({ type: "text" }, ""), true);
  assert.equal(isEmptyValue({ type: "number" }, 0), false);
});

test("stored values keep their shape and survive a removed definition", () => {
  const stored = normalizeStoredValues({ cf_okay: "a", cf_list: ["x"], nope: "b", cf_obj: { a: 1 }, cf_inf: Infinity });
  assert.deepEqual(stored, { cf_okay: "a", cf_list: ["x"] });

  const resolved = resolveLayout("inventory", null);
  assert.deepEqual(orphanedFieldIds(resolved, [{ fields: { cf_okay: "a" } }, {}]), ["cf_okay"]);
});

test("today's custom entries migrate into declared fields without loss", () => {
  const records = [
    { id: "item_1", custom: [{ label: "Rarity", type: "text", value: "Rare" }, { label: "Cursed", type: "checkbox", value: true }] },
    { id: "item_2", custom: [{ label: "rarity", type: "text", value: "Common" }, { label: "Age", type: "number", value: 4 }] },
    { id: "item_3", custom: [] }
  ];
  const { ops, records: next, changed } = migrateCustom("inventory", records);
  const resolved = resolveLayout("inventory", layout("inventory", ops));

  assert.equal(changed, true);
  assert.deepEqual(resolved.problems, []);
  assert.equal(ownDefinitions(resolved).size, 3);
  assert.deepEqual(keys(resolved, "earlier").length, 3);
  assert.ok(next.every((record) => !("custom" in record)));

  const idOfRarity = [...ownDefinitions(resolved).values()].find((def) => def.label === "Rarity").id;
  assert.equal(next[0].fields[idOfRarity], "Rare");
  assert.equal(next[1].fields[idOfRarity], "Common");
  assert.equal(Object.values(next[1].fields).includes(4), true);

  const again = migrateCustom("inventory", records);
  assert.deepEqual(again.ops, ops);
  assert.equal(mergeOps(ops, again.ops).length, ops.length);
  assert.equal(migrateCustom("inventory", next).changed, false);
});

test("compacting rewrites operations without changing the page", async () => {
  const { compactOps } = await import("../src/layouts/compact.js");
  const ops = [
    { op: "add", target: "section", id: "magic", title: "Magic", after: "main" },
    { op: "add", target: "field", field: rarity, section: "magic" },
    { op: "move", target: "field", key: "notes", section: "magic", index: 0 },
    { op: "move", target: "field", key: "notes", section: "main", index: 1 },
    { op: "move", target: "field", key: "weight", section: "magic" },
    { op: "hide", target: "field", key: "weightMultiplier" },
    { op: "show", target: "field", key: "weightMultiplier" },
    { op: "hide", target: "field", key: "value" },
    { op: "override", target: "field", key: "notes", value: { label: "Lore" } },
    { op: "override", target: "field", key: "notes", value: { label: "Lore", wide: false } },
    { op: "override", target: "section", id: "main", value: { title: "Basics" } },
    { op: "hide", target: "field", key: "ghost" },
    { op: "add", target: "section", id: "tmp", title: "Temp" },
    { op: "remove", target: "section", id: "tmp" },
    { op: "move", target: "section", id: "magic", index: 0 }
  ];
  const compact = compactOps("inventory", ops);
  const before = resolveLayout("inventory", layout("inventory", ops));
  const after = resolveLayout("inventory", layout("inventory", compact));

  assert.deepEqual(after.sections, before.sections);
  assert.deepEqual(after.problems, []);
  assert.ok(compact.length < ops.length + 4);
  assert.deepEqual(compactOps("inventory", compact), compact);
  assert.deepEqual(compactOps("inventory", []), []);
  assert.deepEqual(compactOps("journal", [{ op: "hide", target: "field", key: "done" }, { op: "show", target: "field", key: "done" }]), []);
});
