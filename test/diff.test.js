import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { diffSystems } from "../src/sheet/diff.js";
import { createSheet, reconcileSheet } from "../src/sheet/evaluate.js";
import { resolveTemplate } from "../src/sheet/resolve.js";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const core = read("test/fixtures/systems/d20-core.json");
const resolved = (file) => resolveTemplate(file).template;
const mutate = (file, change) => {
  const copy = structuredClone(file);
  change(copy);
  return copy;
};

test("identical systems have no differences", () => {
  const result = diffSystems(resolved(core), resolved(core));

  assert.equal(result.empty, true);
  assert.deepEqual(result.counts, { added: 0, removed: 0, changed: 0 });
});

test("added, removed and changed fields, pools and rolls are listed with what changed", () => {
  const next = resolved(mutate(core, (file) => {
    file.version = 2;
    file.fields.push({ key: "luck", label: "Luck", type: "number" });
    file.fields = file.fields.filter((field) => field.key !== "touch_ac");
    file.sections[1].items = file.sections[1].items.filter((item) => item !== "touch_ac");
    file.fields.find((field) => field.key === "ac").formula = "10 + @dex.mod";
    file.fields.find((field) => field.key === "ac").label = "AC";
    file.pools[0].max = "@level * 10";
    file.rolls[0].expression = "1d20 + @str.mod + 1";
  }));
  const result = diffSystems(resolved(core), next);
  const find = (kind, key) => result.changes.find((entry) => entry.kind === kind && entry.key === key);

  assert.equal(find("field", "luck").change, "added");
  assert.equal(find("field", "touch_ac").change, "removed");
  assert.deepEqual(find("field", "ac").details, ["formula changed", "label changed"]);
  assert.deepEqual(find("pool", "hp").details, ["max changed"]);
  assert.deepEqual(find("roll", "str_check").details, ["expression changed"]);
  assert.deepEqual(result.counts, { added: 1, removed: 1, changed: 3 });
});

test("a collection reports its own changes and its columns separately", () => {
  const next = resolved(mutate(core, (file) => {
    const skills = file.collections[0];
    skills.sortBy = "ranks";
    skills.fields.push({ key: "notes", label: "Notes", type: "text" });
    skills.fields.find((field) => field.key === "misc").default = 2;
    skills.fields = skills.fields.filter((field) => field.key !== "ability");
    skills.fields.find((field) => field.key === "total").formula = "$.ranks + $.misc";
  }));
  const change = diffSystems(resolved(core), next).changes.find((entry) => entry.kind === "collection");

  assert.equal(change.change, "changed");
  assert.deepEqual(change.details, ["sortBy changed", 'column "Misc": default changed', 'column "Total": formula changed', 'column "Notes" added', 'column "Ability" removed']);
});

test("tables, conditions and rests are compared too", () => {
  const next = resolved(mutate(core, (file) => {
    file.tables.bab_table["20"] = 15;
    file.tables.extra = { 1: 1 };
    file.conditions = file.conditions.filter((name) => name !== "Poisoned").concat("Exhausted");
    file.rests.push({ id: "weekly", label: "Weekly" });
  }));
  const result = diffSystems(resolved(core), next);
  const kinds = result.changes.map((entry) => `${entry.change}:${entry.kind}:${entry.key}`).sort();

  assert.deepEqual(kinds, ["added:condition:Exhausted", "added:rest:weekly", "added:table:extra", "changed:table:bab_table", "removed:condition:Poisoned"]);
});

test("layout-only changes are ignored", () => {
  const next = resolved(mutate(core, (file) => { file.sections.reverse(); }));

  assert.equal(diffSystems(resolved(core), next).empty, true);
});

test("the values a move would set aside match what reconcile reports", () => {
  const next = resolved(mutate(core, (file) => {
    file.fields = file.fields.filter((field) => field.key !== "armor_bonus" && field.key !== "ac" && field.key !== "touch_ac");
    file.sections = [];
    file.rolls = [];
  }));
  const sheet = { ...createSheet(resolved(core)), template: { id: "test-d20", version: 1 } };
  sheet.values.armor_bonus = 4;
  const moved = reconcileSheet(next, sheet).moved;

  assert.ok(moved.includes("values.armor_bonus"));
  assert.equal(diffSystems(resolved(core), next).changes.some((entry) => entry.key === "armor_bonus" && entry.change === "removed"), true);
});
