import assert from "node:assert/strict";
import test from "node:test";
import { applyDelta, canContain, carriedWeight, repairContainers, withoutContainer } from "../src/inventory.js";
import { migrateProject } from "../src/migrations.js";
import { KINDS, KIND_IDS } from "../src/records/kinds.js";
import { createRecord, isCalendarDay, listOf, normalizeCustom, normalizeInventory, normalizeList, normalizeRecord } from "../src/records/normalize.js";
import { normalizeCharacter } from "../src/schema.js";
import { createStore } from "../src/store.js";

const bytes = (count) => Uint8Array.from({ length: count }, (_, index) => index + 1);
const item = (fields) => normalizeRecord("inventory", { id: "item_x", name: "X", ...fields });

test("every kind normalizes hostile input without throwing", () => {
  const hostile = [null, 5, "x", [], { id: 7, name: { a: 1 }, quantity: "9", tags: "a", custom: 4, extensions: 3 }, { name: "ok", sheet: { bad: 1 } }];

  for (const kind of KIND_IDS) {
    const list = normalizeList(kind, hostile);
    assert.ok(Array.isArray(list));
    assert.ok(list.length <= 2);
    assert.deepEqual(normalizeList(kind, list), list);
  }
});

test("values are typed and bounded, and unknown keys survive", () => {
  const record = normalizeRecord("inventory", { id: "item_a", name: "Rope", quantity: -5, weight: Infinity, isContainer: "yes", mystery: { n: 1 } });
  assert.equal(record.quantity, 0);
  assert.equal(record.weight, 0);
  assert.equal(record.isContainer, false);
  assert.deepEqual(record.extensions.unknown, { mystery: { n: 1 } });
  assert.equal(normalizeRecord("relations", { targetName: "A", attitude: 99 }).attitude, 5);
  assert.equal(normalizeRecord("journal", { title: "t", kind: "bogus" }).kind, "note");
  assert.equal(normalizeRecord("journal", { title: "t", date: "2026-02-30" }).date, "");
  assert.equal(isCalendarDay("2026-02-28"), true);
});

test("custom fields are typed, labelled and capped", () => {
  const fields = normalizeCustom([{ label: " Rarity ", type: "text", value: "rare" }, { label: "", value: 1 }, { label: "N", type: "number", value: "x" }, { label: "B", type: "checkbox", value: true }, 5]);
  assert.deepEqual(fields, [{ label: "Rarity", type: "text", value: "rare" }, { label: "N", type: "number", value: 0 }, { label: "B", type: "checkbox", value: true }]);
  assert.equal(normalizeCustom(Array.from({ length: 80 }, (_, i) => ({ label: `L${i}`, value: "v" }))).length, 30);
});

test("lists keep their ids unique and respect the limit", () => {
  const list = normalizeList("familiars", Array.from({ length: 80 }, (_, i) => ({ id: `fam_${i % 60}`, name: String(i) })));
  assert.equal(list.length, 50);
  assert.equal(new Set(list.map((record) => record.id)).size, 50);
});

test("containers reject cycles and repair stored ones", () => {
  const bag = item({ id: "item_bag", isContainer: true });
  const pouch = item({ id: "item_pouch", isContainer: true, containerId: "item_bag" });
  const coin = item({ id: "item_coin" });
  assert.equal(canContain([bag, pouch, coin], "item_pouch", "item_bag").ok, false);
  assert.equal(canContain([bag, pouch, coin], "item_bag", "item_bag").ok, false);
  assert.equal(canContain([bag, pouch, coin], "item_coin", "item_bag").ok, false);
  assert.equal(canContain([bag, pouch, coin], "item_pouch", "item_coin").ok, true);

  const loop = repairContainers([{ ...bag, containerId: "item_pouch" }, { ...pouch, containerId: "item_bag" }, { ...coin, containerId: "item_missing" }]);
  assert.equal(loop[2].containerId, null);
  assert.equal(loop.filter((entry) => entry.containerId).length, 1);
});

test("carried weight counts nested contents and container multipliers", () => {
  const bag = item({ id: "item_bag", isContainer: true, weight: 2, weightMultiplier: 0.5 });
  const rope = item({ id: "item_rope", weight: 10, containerId: "item_bag" });
  const sword = item({ id: "item_sword", weight: 3, quantity: 2 });
  assert.equal(carriedWeight([bag, rope, sword]), 2 + 5 + 6);
  assert.equal(carriedWeight([]), 0);
});

test("removing a container moves its contents out", () => {
  const bag = item({ id: "item_bag", isContainer: true });
  const rope = item({ id: "item_rope", containerId: "item_bag" });
  const { items, moved } = withoutContainer([bag, rope], "item_bag");
  assert.equal(moved, 1);
  assert.deepEqual(items.map((entry) => [entry.id, entry.containerId]), [["item_rope", null]]);
});

test("wallet deltas are exact and never negative", () => {
  assert.deepEqual(applyDelta(10, "+5"), { ok: true, value: 15 });
  assert.deepEqual(applyDelta(10, "-3"), { ok: true, value: 7 });
  assert.deepEqual(applyDelta(10, "40"), { ok: true, value: 40 });
  assert.equal(applyDelta(2, "-3").ok, false);
  assert.equal(applyDelta(2, "1e5").ok, false);
  assert.equal(normalizeInventory({ items: [], wallets: { gp: 12.7, "bad key": 1, sp: -4 } }).wallets.gp, 12);
});

test("migration 5 adds empty lists and keeps what is there", () => {
  const migrated = migrateProject({ version: 4, characters: [{ id: "char_a", name: "A" }] });
  assert.deepEqual(migrated.characters[0].inventory, { items: [], wallets: {} });
  assert.deepEqual(migrated.characters[0].journal, []);
  assert.equal(normalizeCharacter(migrated.characters[0]).familiars.length, 0);
});

test("the store adds, edits, moves, removes and restores records with undo", () => {
  const store = createStore({ characters: [normalizeCharacter({ id: "char_a", name: "A" })] });
  const first = store.addRecord("char_a", "inventory", { name: "Bag", isContainer: true });
  const second = store.addRecord("char_a", "inventory", { name: "Rope", containerId: first.id });
  assert.equal(second.containerId, first.id);
  assert.equal(store.updateRecord("char_a", "inventory", second.id, { quantity: 3 }).quantity, 3);
  store.moveRecord("char_a", "inventory", second.id, -1);
  assert.equal(listOf(store.getCharacter("char_a"), "inventory")[0].id, second.id);

  const removed = store.removeRecord("char_a", "inventory", first.id);
  assert.equal(removed.moved, 1);
  assert.equal(listOf(store.getCharacter("char_a"), "inventory")[0].containerId, null);
  store.restoreList("char_a", "inventory", removed.before);
  assert.equal(listOf(store.getCharacter("char_a"), "inventory").length, 2);
  assert.equal(store.addRecord("char_a", "familiars", { name: "Owl" }).name, "Owl");
  assert.equal(store.addRecord("char_a", "nonsense", {}), null);
});

test("a duplicated character copies every list and the lists are independent", () => {
  const store = createStore({ characters: [normalizeCharacter({ id: "char_a", name: "A" })] });
  store.addRecord("char_a", "journal", { title: "Day one" });
  store.setWallet("char_a", "gp", 25);
  const copy = store.duplicateCharacter("char_a");
  assert.equal(copy.journal.length, 1);
  assert.equal(copy.inventory.wallets.gp, 25);
  store.addRecord("char_a", "journal", { title: "Day two" });
  assert.equal(store.getCharacter(copy.id).journal.length, 1);
});

test("a new record starts from each field's default", () => {
  const record = createRecord("journal", { title: "Hello" }, { now: Date.UTC(2026, 5, 1), bytes });
  assert.equal(record.date, "2026-06-01");
  assert.equal(record.kind, "note");
  assert.match(record.id, /^jrnl_/);
  assert.equal(createRecord("progression", {}, { now: 5000 }).at, 5000);
  assert.ok(KINDS.inventory.fields.some((field) => field.key === "containerId"));
});
