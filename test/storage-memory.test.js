import assert from "node:assert/strict";
import { test } from "node:test";
import { STORES } from "../src/storage/idb.js";
import { createMemoryBackend } from "../src/storage/memory.js";

test("the memory backend has every store the IndexedDB schema declares", async () => {
  const backend = createMemoryBackend();

  for (const store of STORES) {
    assert.deepEqual(await backend.getAll(store), []);
  }

  await assert.rejects(backend.getAll("nope"), /Unknown store/);
});

test("stored values are copies, so later mutation cannot change them", async () => {
  const backend = createMemoryBackend();
  const value = { id: "a", nested: { n: 1 } };

  await backend.apply([{ store: "characters", put: [["a", value]] }]);
  value.nested.n = 2;
  const first = await backend.get("characters", "a");
  first.nested.n = 3;

  assert.equal((await backend.get("characters", "a")).nested.n, 1);
});

test("a batch with an unknown store changes nothing", async () => {
  const backend = createMemoryBackend();

  await assert.rejects(backend.apply([
    { store: "characters", put: [["a", { id: "a" }]] },
    { store: "nope", put: [["b", 1]] }
  ]));

  assert.deepEqual(await backend.keys("characters"), []);
});
