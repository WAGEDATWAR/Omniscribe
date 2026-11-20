import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITS } from "../src/limits.js";
import { createStore } from "../src/store.js";

function makeStore() {
  let clock = 1000;
  const store = createStore({ now: () => clock });
  return { store, tick: (ms) => { clock += ms; } };
}

test("addCharacter appends a record, marks it dirty and notifies", () => {
  const { store } = makeStore();
  const events = [];
  store.subscribe((event) => events.push(event.type));

  const character = store.addCharacter({ name: "Mira" });

  assert.equal(store.getState().characters.length, 1);
  assert.equal(store.getCharacter(character.id).name, "Mira");
  assert.equal(store.hasDirty(), true);
  assert.deepEqual(events, ["change"]);
});

test("takeDirty returns the current records and deletions, then clears", () => {
  const { store } = makeStore();
  const first = store.addCharacter({ name: "A" });
  const second = store.addCharacter({ name: "B" });
  store.takeDirty();

  store.updateCharacter(first.id, { name: "A2" });
  store.deleteCharacter(second.id);

  const batch = store.takeDirty();

  assert.deepEqual(batch.upserts.map((character) => character.name), ["A2"]);
  assert.deepEqual(batch.deletedIds, [second.id]);
  assert.equal(store.hasDirty(), false);
});

test("only the edited record becomes dirty (P-10)", () => {
  const { store } = makeStore();
  const first = store.addCharacter({ name: "A" });
  store.addCharacter({ name: "B" });
  store.takeDirty();

  store.updateCharacter(first.id, { notes: "hello" });

  assert.deepEqual(store.takeDirty().upserts.map((character) => character.id), [first.id]);
});

test("an update that changes nothing is not a change, a step or a dirty mark", () => {
  const { store } = makeStore();
  const character = store.addCharacter({ name: "A" });
  store.takeDirty();
  const events = [];
  store.subscribe((event) => events.push(event.type));

  const result = store.updateCharacter(character.id, { name: "A" });

  assert.equal(result.id, character.id);
  assert.deepEqual(events, []);
  assert.equal(store.hasDirty(), false);
});

test("id and createdAt cannot be changed by a patch", () => {
  const { store } = makeStore();
  const character = store.addCharacter({ name: "A" });

  const updated = store.updateCharacter(character.id, { id: "char_other", createdAt: 5, name: "B" });

  assert.equal(updated.id, character.id);
  assert.equal(updated.createdAt, character.createdAt);
  assert.equal(updated.name, "B");
});

test("updates are normalized", () => {
  const { store } = makeStore();
  const character = store.addCharacter({ name: "A" });

  const updated = store.updateCharacter(character.id, { status: "nonsense", tags: ["x", "X"] });

  assert.equal(updated.status, "active");
  assert.deepEqual(updated.tags, ["x"]);
});

test("undo and redo restore characters and keep dirty tracking correct", () => {
  const { store } = makeStore();
  const character = store.addCharacter({ name: "A" });
  store.takeDirty();

  store.deleteCharacter(character.id);
  assert.deepEqual(store.takeDirty().deletedIds, [character.id]);

  assert.equal(store.undo(), true);
  assert.equal(store.getCharacter(character.id).name, "A");
  const restored = store.takeDirty();
  assert.deepEqual(restored.upserts.map((item) => item.id), [character.id]);
  assert.deepEqual(restored.deletedIds, []);

  assert.equal(store.redo(), true);
  assert.equal(store.getCharacter(character.id), null);
  assert.deepEqual(store.takeDirty().deletedIds, [character.id]);
});

test("rapid edits to one field coalesce into one undo step", () => {
  const { store } = makeStore();
  const character = store.addCharacter({ name: "A" });

  store.updateCharacter(character.id, { name: "Ab" }, { key: "name" });
  store.updateCharacter(character.id, { name: "Abc" }, { key: "name" });

  store.undo();
  assert.equal(store.getCharacter(character.id).name, "A");
});

test("undo with nothing to undo does nothing", () => {
  const { store } = makeStore();

  assert.equal(store.undo(), false);
  assert.equal(store.redo(), false);
});

test("duplicateCharacter makes an independent copy with a new id", () => {
  const { store } = makeStore();
  const source = store.addCharacter({ name: "Mira", tags: ["rogue"], notes: "n" });

  const copy = store.duplicateCharacter(source.id);

  assert.notEqual(copy.id, source.id);
  assert.equal(copy.name, "Mira (copy)");
  assert.deepEqual(copy.tags, ["rogue"]);

  store.updateCharacter(copy.id, { tags: ["changed"] });
  assert.deepEqual(store.getCharacter(source.id).tags, ["rogue"]);
});

test("duplicate and delete of a missing id return null", () => {
  const { store } = makeStore();

  assert.equal(store.duplicateCharacter("char_none"), null);
  assert.equal(store.deleteCharacter("char_none"), null);
  assert.equal(store.updateCharacter("char_none", { name: "x" }), null);
});

test("the character count is capped", () => {
  const characters = Array.from({ length: LIMITS.characters }, (_, index) => ({ id: `char_${index}` }));
  const store = createStore({ characters });

  assert.equal(store.addCharacter({ name: "overflow" }), null);
  assert.equal(store.duplicateCharacter("char_0"), null);
});

test("restoreDirty puts a failed batch back without resurrecting deleted records", () => {
  const { store } = makeStore();
  const first = store.addCharacter({ name: "A" });
  const second = store.addCharacter({ name: "B" });
  const batch = store.takeDirty();

  store.deleteCharacter(second.id);
  store.takeDirty();
  store.restoreDirty(batch);

  const next = store.takeDirty();

  assert.deepEqual(next.upserts.map((character) => character.id), [first.id]);
  assert.deepEqual(next.deletedIds, []);
});

test("replaceAll resets dirty state and history", () => {
  const { store } = makeStore();
  store.addCharacter({ name: "A" });

  store.replaceAll([{ id: "char_loaded", name: "Loaded" }]);

  assert.equal(store.hasDirty(), false);
  assert.equal(store.canUndo(), false);
  assert.equal(store.getState().characters.length, 1);
});

test("search and sort are session state that never marks anything dirty", () => {
  const { store } = makeStore();
  const events = [];
  store.subscribe((event) => events.push(event.type));

  store.setSearch("elf");
  store.setSort("name");

  assert.deepEqual(store.getUi(), { search: "elf", sort: "name" });
  assert.deepEqual(events, ["ui", "ui"]);
  assert.equal(store.hasDirty(), false);
});

test("markAllDirty queues every record", () => {
  const store = createStore({ characters: [{ id: "char_a" }, { id: "char_b" }] });

  store.markAllDirty();

  assert.deepEqual(store.takeDirty().upserts.map((character) => character.id), ["char_a", "char_b"]);
});

test("restoreCharacter puts a deleted record back as one tracked step", () => {
  const { store } = makeStore();
  const character = store.addCharacter({ name: "A" });
  store.takeDirty();
  store.deleteCharacter(character.id);
  store.takeDirty();

  const restored = store.restoreCharacter(character);

  assert.equal(restored.id, character.id);
  assert.equal(store.getCharacter(character.id).name, "A");
  assert.deepEqual(store.takeDirty().upserts.map((item) => item.id), [character.id]);
  assert.equal(store.restoreCharacter(character), null);
  assert.equal(store.restoreCharacter(null), null);
});
