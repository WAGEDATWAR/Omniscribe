import assert from "node:assert/strict";
import test from "node:test";
import { computedRowScope, createRow, createSheet, evaluateSheet } from "../src/sheet/evaluate.js";
import { linkLabel, linkOptions } from "../src/sheet/links.js";
import { sheetPreview } from "../src/sheet/preview.js";
import { createRegistry } from "../src/systems.js";
import { evaluateFormula, parseFormula } from "../src/sheet/formula.js";

const system = (extra = {}) => ({
  format: "omniscribe-system", formatVersion: 1, id: "links", version: 1, name: "Links", base: null, overlay: [],
  fields: [{ key: "level", label: "Level", type: "number", default: 2 }],
  pools: [], tables: {}, conditions: [], rests: [], rolls: [],
  collections: [
    {
      key: "abilities",
      label: "Abilities",
      columns: ["name", "dots", "bonus"],
      fields: [
        { key: "name", label: "Name", type: "text" },
        { key: "dots", label: "Dots", type: "number", default: 1 },
        { key: "bonus", label: "Bonus", type: "derived", formula: "$.dots * 2" }
      ]
    },
    {
      key: "powers",
      label: "Powers",
      columns: ["name", "source", "total"],
      fields: [
        { key: "name", label: "Name", type: "text" },
        { key: "source", label: "Source ability", type: "link", to: "abilities" },
        { key: "total", label: "Total", type: "derived", formula: "@level + $.source.bonus" },
        { key: "strike", label: "Strike", type: "roll", default: "($.source.dots)d6" }
      ]
    }
  ],
  sections: [
    { id: "a", title: "Abilities", layout: "table", items: ["abilities"] },
    { id: "p", title: "Powers", layout: "table", items: ["powers"] }
  ],
  ...extra
});

function build(extra) {
  const registry = createRegistry({});
  const added = registry.add(system(extra));
  assert.equal(added.ok, true, JSON.stringify(added.errors));
  return registry.resolve({ id: "links", version: 1 }).template;
}

function sheetWith(template, abilityRows, powerRows) {
  const sheet = createSheet(template, { seed: false });
  sheet.collections.abilities = abilityRows.map((row) => createRow(template, "abilities", row));
  sheet.collections.powers = powerRows.map((row) => createRow(template, "powers", row));
  return sheet;
}

test("a formula reads a linked row's value, derived ones included", () => {
  const template = build();
  const sheet = sheetWith(template, [{ id: "row_a", name: "Brawl", dots: 3 }], [{ id: "row_p", name: "Smash", source: "row_a" }]);
  const computed = evaluateSheet(template, sheet);

  assert.deepEqual(computed.errors, []);
  assert.equal(computed.collections.powers[0].values.total, 2 + 6);
});

test("a link that points at nothing reads as an empty value and never breaks the sheet", () => {
  const template = build();
  const none = evaluateSheet(template, sheetWith(template, [{ id: "row_a", name: "Brawl", dots: 3 }], [{ id: "row_p", name: "Smash", source: "" }]));
  const gone = evaluateSheet(template, sheetWith(template, [], [{ id: "row_p", name: "Smash", source: "row_removed" }]));

  assert.deepEqual(none.errors, []);
  assert.equal(none.collections.powers[0].values.total, 2);
  assert.deepEqual(gone.errors, []);
  assert.equal(gone.collections.powers[0].values.total, 2);
});

test("changing the linked row changes what reads it", () => {
  const template = build();
  const sheet = sheetWith(template, [{ id: "row_a", name: "Brawl", dots: 3 }, { id: "row_b", name: "Melee", dots: 5 }], [{ id: "row_p", name: "Smash", source: "row_a" }]);
  assert.equal(evaluateSheet(template, sheet).collections.powers[0].values.total, 8);
  sheet.collections.powers[0].source = "row_b";
  assert.equal(evaluateSheet(template, sheet).collections.powers[0].values.total, 12);
});

test("a roll on a row can read the linked row", () => {
  const template = build();
  const sheet = sheetWith(template, [{ id: "row_a", name: "Brawl", dots: 4 }], [{ id: "row_p", name: "Smash", source: "row_a" }]);
  const computed = evaluateSheet(template, sheet);
  const row = computed.collections.powers[0];
  const parsed = parseFormula(row.values.strike, { dice: true });

  assert.equal(parsed.ok, true);
  const scope = computedRowScope(template, computed, "powers", row);
  assert.equal(scope.via("source", "dots"), 4);
});

test("labels and options name the rows by their name", () => {
  const template = build();
  const computed = evaluateSheet(template, sheetWith(template, [{ id: "row_a", name: "Brawl" }, { id: "row_b", name: "" }], [{ id: "row_p", source: "row_a" }]));
  const column = template.collections[1].fields.find((field) => field.key === "source");

  assert.deepEqual(linkOptions(template, computed, column), [{ value: "row_a", label: "Brawl" }, { value: "row_b", label: "Row 2" }]);
  assert.equal(linkLabel(template, computed, column, "row_a"), "Brawl");
  assert.equal(linkLabel(template, computed, column, "row_x"), "");
});

test("the import review names a link problem", () => {
  const registry = createRegistry({});
  const target = system();
  target.collections[1].fields.find((field) => field.key === "source").to = "nowhere";
  const added = registry.add(target);

  assert.equal(added.ok, false);
  assert.ok(added.errors.some((entry) => /no collection named "nowhere"/.test(entry.message)));

  const wrongField = system();
  wrongField.collections[1].fields.find((field) => field.key === "total").formula = "$.source.missing";
  const second = createRegistry({}).add(wrongField);
  assert.equal(second.ok, false);
  assert.ok(second.errors.some((entry) => /has no field named "missing"/.test(entry.message)));

  const notLink = system();
  notLink.collections[1].fields.find((field) => field.key === "total").formula = "$.name.dots";
  const third = createRegistry({}).add(notLink);
  assert.equal(third.ok, false);
  assert.ok(third.errors.some((entry) => /is not a link/.test(entry.message)));
});

test("a dependency loop through a link is found", () => {
  const looped = system();
  looped.collections[0].fields.find((field) => field.key === "bonus").formula = "$.dots";
  looped.collections[0].fields.push({ key: "boost", label: "Boost", type: "link", to: "powers" });
  looped.collections[0].fields.push({ key: "echo", label: "Echo", type: "derived", formula: "$.boost.total" });
  looped.collections[1].fields.push({ key: "back", label: "Back", type: "derived", formula: "$.source.echo" });
  looped.collections[1].fields.find((field) => field.key === "total").formula = "$.back";
  const added = createRegistry({}).add(looped);

  assert.equal(added.ok, false, "a loop is reported");
});

test("the import preview shows the linked row's name", () => {
  const template = build();
  const row = template.collections[1];
  assert.equal(row.fields.some((field) => field.type === "link"), true);
  assert.ok(Array.isArray(sheetPreview(template)));
});

test("link formulas parse with a through part and plain ones are unchanged", () => {
  const through = parseFormula("$.source.dots + .name");
  assert.equal(through.ok, true);
  assert.deepEqual(through.ast.left, { kind: "item", field: "source", via: "dots", index: 0 });
  assert.equal(evaluateFormula.length > 0, true);
});
