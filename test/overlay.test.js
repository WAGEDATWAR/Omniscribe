import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { makeOverlay } from "../src/sheet/overlay.js";
import { resolveTemplate } from "../src/sheet/resolve.js";

const read = (name) => JSON.parse(readFileSync(new URL(`../src/templates/${name}.json`, import.meta.url), "utf8"));
const dnd35 = read("dnd35");
const base = resolveTemplate(dnd35).template;
const lookup = (id, version) => (id === dnd35.id && version === dnd35.version ? dnd35 : null);

function edit(change) {
  const copy = structuredClone(base);
  change(copy);
  return copy;
}

function roundTrip(edited) {
  const overlay = makeOverlay(base, edited);
  const file = { format: "omniscribe-system", formatVersion: 1, id: "house", version: 1, name: edited.name, base: { id: "dnd35", version: 1 }, overlay };
  const result = resolveTemplate(file, lookup);

  assert.equal(result.ok, true, JSON.stringify(result.errors));

  const canonical = (template) => JSON.stringify({
    fields: [...template.fields].sort((a, b) => a.key.localeCompare(b.key)),
    pools: [...template.pools].sort((a, b) => a.key.localeCompare(b.key)),
    collections: [...template.collections].sort((a, b) => a.key.localeCompare(b.key)).map((c) => ({ ...c, fields: [...c.fields].sort((a, b) => a.key.localeCompare(b.key)) })),
    tables: Object.fromEntries(Object.entries(template.tables).sort()),
    conditions: [...template.conditions].sort(),
    rests: template.rests,
    rolls: [...template.rolls].sort((a, b) => a.key.localeCompare(b.key)),
    sections: [...template.sections].sort((a, b) => a.id.localeCompare(b.id))
  });

  assert.equal(canonical(result.template), canonical(edited));
  return overlay;
}

test("an unedited system produces no operations", () => {
  assert.deepEqual(makeOverlay(base, structuredClone(base)), []);
});

test("added, changed and removed fields round trip through the overlay", () => {
  const overlay = roundTrip(edit((flat) => {
    flat.fields.push({ key: "luck", label: "Luck", type: "number", default: 2 });
    flat.fields.find((field) => field.key === "ac").formula = "10 + @dex.mod + @armor_bonus + 1";
    flat.fields.find((field) => field.key === "ac").hint = "House rule";
    flat.fields = flat.fields.filter((field) => field.key !== "deity");
    flat.sections.find((section) => section.id === "identity").items = ["race", "alignment", "size", "xp", "level", "luck"];
  }));

  assert.ok(overlay.some((op) => op.op === "add" && op.target === "field" && op.key === "luck"));
  assert.ok(overlay.some((op) => op.op === "remove" && op.target === "field" && op.key === "deity"));
  assert.deepEqual(overlay.find((op) => op.op === "override" && op.key === "ac").value, { formula: "10 + @dex.mod + @armor_bonus + 1", hint: "House rule" });
});

test("a cleared property becomes a null in the override and is really cleared", () => {
  const overlay = roundTrip(edit((flat) => {
    delete flat.fields.find((field) => field.key === "xp").min;
  }));

  assert.deepEqual(overlay.find((op) => op.key === "xp").value, { min: null });
});

test("pools, tables, conditions, rolls and rests round trip", () => {
  roundTrip(edit((flat) => {
    flat.pools.push({ key: "mana", label: "Mana", max: "@int * 10", display: "boxes", boxSize: 10, rests: { long: "full" } });
    flat.pools.find((pool) => pool.key === "hp").rests = { long: "full" };
    flat.tables.size_mod.huge = -3;
    delete flat.tables.size_mod.fine;
    flat.tables.extra = { 1: 1 };
    flat.tables.unused = { 1: 1 };
    delete flat.tables.unused;
    flat.conditions = flat.conditions.filter((name) => name !== "Dazed").concat("Weakened");
    flat.rolls.push({ key: "luck_roll", label: "Luck", expression: "1d20 + @int.mod", group: "Checks" });
    flat.rolls = flat.rolls.filter((roll) => roll.key !== "grapple_roll");
    flat.rests.push({ id: "weekly", label: "Weekly" });
  }));
});

test("collection changes split into the collection itself and its columns", () => {
  const overlay = roundTrip(edit((flat) => {
    const skills = flat.collections.find((collection) => collection.key === "skills");
    skills.maxItems = 120;
    skills.fields.push({ key: "notes", label: "Notes", type: "text" });
    skills.fields.find((field) => field.key === "misc").label = "Bonus";
    skills.fields = skills.fields.filter((field) => field.key !== "class_skill");
    skills.fields.find((field) => field.key === "total").formula = "$.ranks + $.ability_mod + $.misc";
    skills.columns = ["name", "ability", "ranks", "misc", "total"];
    flat.collections.push({ key: "pets", label: "Pets", fields: [{ key: "name", label: "Name", type: "text" }] });
  }));

  assert.ok(overlay.some((op) => op.target === "item" && op.op === "add" && op.key === "notes"));
  assert.ok(overlay.some((op) => op.target === "item" && op.op === "remove" && op.key === "class_skill"));
  assert.ok(overlay.some((op) => op.target === "collection" && op.op === "add" && op.key === "pets"));
  assert.deepEqual(overlay.find((op) => op.target === "collection" && op.op === "override").value.maxItems, 120);
});

test("sections can be added and changed", () => {
  roundTrip(edit((flat) => {
    flat.sections.push({ id: "extras", title: "Extras", layout: "fields", items: ["race"] });
    flat.sections.find((section) => section.id === "money").title = "Coins";
  }));
});
