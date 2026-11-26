import assert from "node:assert/strict";
import test from "node:test";
import { isPageRoute, pageId, pagesOf } from "../src/sheet/layout.js";
import { createRegistry } from "../src/systems.js";
import { parseRoute, routeHref } from "../src/views.js";

const system = (sections) => ({
  format: "omniscribe-system", formatVersion: 1, id: "tabs", version: 1, name: "Tabs", base: null, overlay: [],
  fields: [{ key: "a", label: "A", type: "text" }],
  pools: [], tables: {}, conditions: [], rests: [], rolls: [],
  collections: [{ key: "gear", label: "Gear", columns: ["name"], fields: [{ key: "name", label: "Name", type: "text" }] }, { key: "spells", label: "Spells", columns: ["name"], fields: [{ key: "name", label: "Name", type: "text" }] }],
  sections: sections
});

test("a page title becomes a tab address", () => {
  assert.equal(pageId("Essences"), "p-essences");
  assert.equal(pageId("Spells & Magic"), "p-spells_magic");
  assert.equal(pageId("Écoles"), "p-ecoles");
  assert.equal(pageId("123"), "p-x123");
  assert.equal(pageId("!!"), "");
  assert.equal(isPageRoute("p-essences"), true);
  assert.equal(isPageRoute("sheet"), false);
});

test("sections with a page title form tabs in order of first appearance", () => {
  const registry = createRegistry({});
  const added = registry.add(system([
    { id: "main", title: "Main", layout: "fields", items: ["a"] },
    { id: "gear", title: "Gear", layout: "table", items: ["gear"], page: "Equipment" },
    { id: "spells", title: "Spells", layout: "table", items: ["spells"], page: "Magic" },
    { id: "more", title: "More gear", layout: "fields", items: [], page: "Equipment" }
  ]));

  assert.equal(added.ok, true, JSON.stringify(added.errors));
  const { template } = registry.resolve({ id: "tabs", version: 1 });
  assert.deepEqual(pagesOf(template), [
    { id: "p-equipment", title: "Equipment", sections: ["gear", "more"] },
    { id: "p-magic", title: "Magic", sections: ["spells"] }
  ]);
});

test("a bad page name is refused with a reason", () => {
  const registry = createRegistry({});
  const section = (page, id = "gear") => ({ id, title: "Gear", layout: "table", items: ["gear"], page });

  assert.match(registry.add(system([section("Sheet")])).errors[0].message, /not "Sheet"/);
  assert.match(registry.add(system([section("!!")])).errors[0].message, /at least one letter/);
  assert.match(registry.add(system([section("Gear & Co", "s1"), section("gear co", "s2")])).errors[0].message, /same tab address/);
});

test("a tab is a character route", () => {
  assert.deepEqual(parseRoute("#/character/char_0123456789abcdef/p-equipment"), { view: "character", id: "char_0123456789abcdef", sub: "p-equipment" });
  assert.equal(routeHref("character", "char_0123456789abcdef", "p-equipment"), "#/character/char_0123456789abcdef/p-equipment");
  assert.equal(parseRoute("#/character/char_0123456789abcdef/p-").view, "library");
});

test("a preview shows a fresh sheet's values section by section (DEF-101)", async () => {
  const { sheetPreview } = await import("../src/sheet/preview.js");
  const { seededRng } = await import("../src/dice/rng.js");
  const registry = createRegistry({});
  const added = registry.add({
    format: "omniscribe-system", formatVersion: 1, id: "show", version: 1, name: "Show", base: null, overlay: [],
    fields: [
      { key: "level", label: "Level", type: "number", default: 2 },
      { key: "twice", label: "Twice", type: "derived", formula: "@level * 2", format: "signed" },
      { key: "harm", label: "Harm", type: "track", boxes: ["A", "B"] },
      { key: "rank", label: "Rank", type: "choice", choices: [{ value: "lo", label: "Low" }, { value: "hi", label: "High" }], default: "hi" }
    ],
    pools: [{ key: "hp", label: "HP", max: "@level * 5" }],
    collections: [{ key: "gear", label: "Gear", columns: ["name"], defaultRows: [{ name: "Rope" }], fields: [{ key: "name", label: "Name", type: "text" }] }],
    tables: {}, conditions: [], rests: [], rolls: [],
    sections: [{ id: "main", title: "Main", layout: "fields", items: ["level", "twice", "harm", "rank", "hp"] }, { id: "gear", title: "Gear", layout: "table", items: ["gear"], page: "Equipment" }]
  });
  assert.equal(added.ok, true, JSON.stringify(added.errors));

  const preview = sheetPreview(registry.resolve({ id: "show", version: 1 }).template, { rng: seededRng(1) });
  assert.deepEqual(preview[0].pairs, [["Level", "2"], ["Twice", "+4"], ["Harm", "A [ ] B [ ]"], ["Rank", "High"], ["HP", "10 / 10"]]);
  assert.equal(preview[1].page, "Equipment");
  assert.deepEqual(preview[1].tables[0], { label: "Gear", columns: ["Name"], rows: [["Rope"]], more: 0 });
});
