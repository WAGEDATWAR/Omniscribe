import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPdf, textWidth, toWinAnsi } from "../src/pdf/generate.js";
import { sheetDocument } from "../src/pdf/sheetModel.js";
import { createRecord } from "../src/records/normalize.js";
import { createCharacter } from "../src/schema.js";
import { createSheet, evaluateSheet } from "../src/sheet/evaluate.js";
import { createRegistry } from "../src/systems.js";
import { BUILTIN_FILES } from "../src/templates/index.js";

const read = (name) => JSON.parse(readFileSync(new URL(`../src/templates/${name}.json`, import.meta.url), "utf8"));
const registry = createRegistry({ builtins: BUILTIN_FILES.map(read) });
const text = (bytes) => Buffer.from(bytes).toString("latin1");

test("text outside WinAnsi becomes ? and is counted", () => {
  assert.deepEqual(toWinAnsi("Café – ok"), { text: "Caf\xE9 \x96 ok", replaced: 0 });
  assert.deepEqual(toWinAnsi("dragon 龍"), { text: "dragon ?", replaced: 1 });
  assert.ok(textWidth("WWW", "F1", 10) > textWidth("iii", "F1", 10));
});

test("the writer produces a PDF whose xref offsets point at their objects", () => {
  const { bytes, pages } = buildPdf({ title: "Mira (the) Bold", blocks: [{ type: "title", text: "Mira", sub: "Sam" }, { type: "text", text: "Hello (world) \\ done" }] });
  const source = text(bytes);

  assert.ok(source.startsWith("%PDF-1.4"));
  assert.ok(source.trimEnd().endsWith("%%EOF"));
  assert.equal(pages, 1);
  assert.match(source, /\/Count 1/);
  assert.ok(source.includes("Hello \\(world\\) \\\\ done"));

  const start = Number(source.match(/startxref\n(\d+)/)[1]);
  assert.ok(source.slice(start).startsWith("xref"));

  const entries = [...source.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
  entries.forEach((offset, index) => assert.ok(source.slice(offset).startsWith(`${index + 1} 0 obj`), `object ${index + 1}`));
});

test("a long table pages and repeats its header", () => {
  const rows = Array.from({ length: 120 }, (_, index) => [`Item ${index}`, String(index), "A note that is long enough to wrap onto a second line when the column is narrow, really"]);
  const { bytes, pages } = buildPdf({ title: "Long", footer: "Long", blocks: [{ type: "table", columns: [{ label: "Item" }, { label: "Qty", align: "right" }, { label: "Notes" }], rows }] });
  const source = text(bytes);

  assert.ok(pages > 2);
  assert.equal([...source.matchAll(/\(Item\) Tj/g)].length, pages);
  assert.match(source, new RegExp(`Page ${pages} of ${pages}`));
});

test("a character with no sheet still has a generated sheet; secrets are left out by default", () => {
  const character = createCharacter({ name: "Mira Vale", player: "Sam", tags: ["scout"] });
  character.inventory = { ...character.inventory, items: [createRecord("inventory", { name: "Lantern", quantity: 2, weight: 1.5 })] };
  character.journal = [createRecord("journal", { title: "Plain note", text: "BODY-VISIBLE", kind: "note" }), createRecord("journal", { title: "Hidden plot", text: "BODY-SECRET", kind: "secret" })];

  const plain = text(buildPdf(sheetDocument(character)).bytes);
  assert.ok(plain.includes("Mira Vale") && plain.includes("Lantern") && plain.includes("Plain note"));
  assert.ok(!plain.includes("BODY-VISIBLE") && !plain.includes("Hidden plot") && !plain.includes("BODY-SECRET"));

  const full = text(buildPdf(sheetDocument(character, { includeJournal: true })).bytes);
  assert.ok(full.includes("BODY-VISIBLE") && full.includes("BODY-SECRET"));
});

test("a sheet follows the system's sections in order", () => {
  const { template } = registry.resolve({ id: "dnd5e", version: 1 });
  const sheet = createSheet(template);
  const computed = evaluateSheet(template, sheet);
  const character = { ...createCharacter({ name: "Brann" }), sheet: { template: { id: "dnd5e", version: 1 }, ...sheet } };
  const model = sheetDocument(character, { template, computed, systemName: template.name });
  const headings = model.blocks.filter((block) => block.type === "heading").map((block) => block.text);

  assert.deepEqual(headings.slice(0, template.sections.length).filter(Boolean), template.sections.map((section) => section.title).filter((title) => headings.includes(title)));
  assert.ok(buildPdf(model).pages >= 1);
});

test("fields of your own print where the layout puts them, and secret ones only on request", async () => {
  const { resolveLayout } = await import("../src/layouts/resolve.js");
  const character = createCharacter({ name: "Mira" });
  character.fields = { cf_pronoun: "she/her", cf_secret1: "TOP-SECRET" };
  character.inventory = { ...character.inventory, items: [{ ...createRecord("inventory", { name: "Lantern" }), fields: { cf_rarity: "Rare" } }] };

  const layouts = {
    character: resolveLayout("character", { surface: "character", ops: [
      { op: "add", target: "field", field: { id: "cf_pronoun", label: "Pronouns", type: "text" }, section: "identity" },
      { op: "add", target: "field", field: { id: "cf_secret1", label: "Dark past", type: "text", secret: true }, section: "identity" }
    ] }),
    inventory: resolveLayout("inventory", { surface: "inventory", ops: [{ op: "add", target: "field", field: { id: "cf_rarity", label: "Rarity", type: "text" }, section: "main" }] })
  };

  const plain = text(buildPdf(sheetDocument(character, { layouts })).bytes);
  assert.ok(plain.includes("Pronouns") && plain.includes("she/her") && plain.includes("Rarity") && plain.includes("Rare"));
  assert.ok(!plain.includes("TOP-SECRET") && !plain.includes("Dark past"));

  const full = text(buildPdf(sheetDocument(character, { layouts, includeJournal: true })).bytes);
  assert.ok(full.includes("TOP-SECRET"));
});
