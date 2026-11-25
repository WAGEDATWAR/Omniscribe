import assert from "node:assert/strict";
import { test } from "node:test";
import { SCHEMA_VERSION } from "../src/migrations.js";
import { StorageError, checkPersistence, createStorage, estimateUsage, requestPersistence } from "../src/storage.js";
import { createMemoryBackend } from "../src/storage/memory.js";

function makeStorage() {
  return createStorage(createMemoryBackend(), { now: () => 5000 });
}

test("an empty database loads as empty and unmigrated", async () => {
  const loaded = await makeStorage().load();

  assert.deepEqual(loaded, { characters: [], campaigns: [], layouts: [], migrated: false, empty: true });
});

test("saved characters load back, normalized", async () => {
  const storage = makeStorage();

  await storage.save({ upserts: [{ id: "char_a", name: "Mira" }, { id: "char_b", name: "Bram" }] });
  const loaded = await storage.load();

  assert.equal(loaded.empty, false);
  assert.deepEqual(loaded.characters.map((character) => character.name).sort(), ["Bram", "Mira"]);
  assert.equal(loaded.characters[0].status, "active");
  assert.equal(await storage.meta("schemaVersion"), SCHEMA_VERSION);
  assert.equal(await storage.meta("savedAt"), 5000);
});

test("a save writes and deletes only the records it names (P-10)", async () => {
  const storage = makeStorage();

  await storage.save({ upserts: [{ id: "char_a", name: "A" }, { id: "char_b", name: "B" }] });
  await storage.save({ upserts: [{ id: "char_a", name: "A2" }], deletedIds: ["char_b"] });

  const loaded = await storage.load();

  assert.deepEqual(loaded.characters.map((character) => [character.id, character.name]), [["char_a", "A2"]]);
});

test("data from a newer schema is refused instead of overwritten", async () => {
  const backend = createMemoryBackend();
  await backend.apply([{ store: "meta", put: [["schemaVersion", SCHEMA_VERSION + 1]] }]);

  await assert.rejects(createStorage(backend).load(), (error) => error instanceof StorageError && error.code === "newer");
});

test("concurrent saves are serialized and the last one wins", async () => {
  const order = [];
  const backend = createMemoryBackend();
  const apply = backend.apply.bind(backend);

  backend.apply = async (operations) => {
    order.push(operations[0].put?.[0]?.[1]?.name);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return apply(operations);
  };

  const storage = createStorage(backend);

  await Promise.all([
    storage.save({ upserts: [{ id: "char_a", name: "first" }] }),
    storage.save({ upserts: [{ id: "char_a", name: "second" }] }),
    storage.save({ upserts: [{ id: "char_a", name: "third" }] })
  ]);

  assert.deepEqual(order, ["first", "second", "third"]);
  assert.equal((await storage.load()).characters[0].name, "third");
});

test("a failed save rejects and a later save still works", async () => {
  const backend = createMemoryBackend();
  const apply = backend.apply.bind(backend);
  let fail = true;

  backend.apply = async (operations) => {
    if (fail) {
      throw new Error("disk full");
    }

    return apply(operations);
  };

  const storage = createStorage(backend);

  await assert.rejects(storage.save({ upserts: [{ id: "char_a", name: "A" }] }), /disk full/);

  fail = false;
  await storage.save({ upserts: [{ id: "char_a", name: "A" }] });

  assert.equal((await storage.load()).characters.length, 1);
});

test("blobs round trip with their type and size and report usage", async () => {
  const storage = makeStorage();
  const bytes = new Uint8Array([37, 80, 68, 70, 45]);

  const meta = await storage.putBlob({ type: "application/pdf", data: new Blob([bytes], { type: "application/pdf" }) });
  const stored = await storage.getBlob(meta.id);

  assert.match(meta.id, /^blob_/);
  assert.equal(meta.size, 5);
  assert.equal(stored.type, "application/pdf");
  assert.deepEqual(new Uint8Array(await stored.data.arrayBuffer()), bytes);
  assert.deepEqual(await storage.blobUsage(), { count: 1, bytes: 5 });

  await storage.deleteBlob(meta.id);

  assert.equal(await storage.getBlob(meta.id), null);
  assert.deepEqual(await storage.blobUsage(), { count: 0, bytes: 0 });
});

test("putBlob rejects non binary data and bad ids", async () => {
  const storage = makeStorage();

  await assert.rejects(storage.putBlob({ data: "text" }), StorageError);
  await assert.rejects(storage.putBlob({ id: "bad id!", data: new Blob(["x"]) }), StorageError);
});

test("clear empties every store", async () => {
  const storage = makeStorage();

  await storage.save({ upserts: [{ id: "char_a", name: "A" }] });
  await storage.putBlob({ data: new Blob(["x"]) });
  await storage.clear();

  assert.equal((await storage.load()).empty, true);
  assert.deepEqual(await storage.blobUsage(), { count: 0, bytes: 0 });
});

test("requestPersistence handles missing, granted and denied storage managers", async () => {
  assert.deepEqual(await requestPersistence({}), { supported: false, persisted: false });
  assert.deepEqual(
    await requestPersistence({ storage: { persisted: async () => false, persist: async () => true } }),
    { supported: true, persisted: true }
  );
  assert.deepEqual(
    await requestPersistence({ storage: { persisted: async () => false, persist: async () => false } }),
    { supported: true, persisted: false }
  );
  assert.deepEqual(
    await requestPersistence({ storage: { persisted: async () => true, persist: async () => { throw new Error("no"); } } }),
    { supported: true, persisted: true }
  );
  assert.deepEqual(
    await requestPersistence({ storage: { persist: async () => { throw new Error("no"); } } }),
    { supported: true, persisted: false }
  );
});

test("estimateUsage tolerates a missing API", async () => {
  assert.deepEqual(await estimateUsage({}), { usage: null, quota: null });
  assert.deepEqual(await estimateUsage({ storage: { estimate: async () => ({ usage: 10, quota: 100 }) } }), { usage: 10, quota: 100 });
});

test("checkPersistence reports without asking", async () => {
  assert.deepEqual(await checkPersistence({}), { supported: false, persisted: false });
  assert.deepEqual(await checkPersistence({ storage: { persisted: async () => true } }), { supported: true, persisted: true });
  assert.deepEqual(await checkPersistence({ storage: { persisted: async () => { throw new Error("no"); } } }), { supported: true, persisted: false });
});

test("anonymous custom entries migrate to declared fields and the declarations are stored", async () => {
  const storage = makeStorage();

  await storage.backend.apply([
    { store: "characters", put: [["char_a", { id: "char_a", name: "A", inventory: { items: [{ id: "item_a", name: "Sword", custom: [{ label: "Rarity", type: "text", value: "Rare" }] }], wallets: {} } }]] },
    { store: "meta", put: [["schemaVersion", 6]] }
  ]);
  const loaded = await storage.load();
  const sword = loaded.characters[0].inventory.items[0];
  const [layout] = loaded.layouts;

  assert.equal(loaded.migrated, true);
  assert.equal(layout.surface, "inventory");
  assert.equal(Object.values(sword.fields)[0], "Rare");
  assert.equal("custom" in sword, false);
  assert.deepEqual(await storage.getLayouts(), loaded.layouts);

  const again = await storage.load();
  assert.equal(again.layouts.length, 1);
  assert.equal(again.layouts[0].ops.length, layout.ops.length);
});
