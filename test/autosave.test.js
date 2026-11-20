import assert from "node:assert/strict";
import { test } from "node:test";
import { createAutosave } from "../src/autosave.js";
import { createStore } from "../src/store.js";

function setup({ save } = {}) {
  const store = createStore();
  const saved = [];
  const statuses = [];
  const timers = new Map();
  let nextTimer = 1;

  const autosave = createAutosave({
    store,
    save: save ?? (async (batch) => { saved.push(batch); }),
    schedule: (fn) => {
      timers.set(nextTimer, fn);
      return nextTimer++;
    },
    cancel: (id) => timers.delete(id),
    onStatus: (status) => statuses.push(status)
  });

  autosave.start();

  return {
    store,
    autosave,
    saved,
    statuses,
    fire: () => {
      const pending = [...timers.values()];
      timers.clear();
      pending.forEach((fn) => fn());
    },
    pendingTimers: () => timers.size
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("a change arms one debounce timer and saving clears the dirty set", async () => {
  const { store, saved, statuses, fire, pendingTimers } = setup();

  store.addCharacter({ name: "A" });
  store.updateCharacter(store.getState().characters[0].id, { name: "B" });

  assert.equal(pendingTimers(), 1);
  assert.deepEqual(statuses, ["dirty"]);

  fire();
  await settle();

  assert.equal(saved.length, 1);
  assert.equal(saved[0].upserts[0].name, "B");
  assert.deepEqual(statuses, ["dirty", "saving", "saved"]);
  assert.equal(store.hasDirty(), false);
});

test("ui changes never save", async () => {
  const { store, saved, statuses } = setup();

  store.setSearch("x");
  await settle();

  assert.equal(saved.length, 0);
  assert.deepEqual(statuses, []);
});

test("a failed save restores the batch and retries", async () => {
  let attempts = 0;
  const { store, fire, statuses, autosave } = setup({
    save: async () => {
      attempts += 1;

      if (attempts === 1) {
        throw new Error("disk full");
      }
    }
  });

  store.addCharacter({ name: "A" });
  fire();
  await settle();

  assert.equal(autosave.status(), "error");
  assert.equal(store.hasDirty(), true);

  fire();
  await settle();

  assert.equal(attempts, 2);
  assert.equal(autosave.status(), "saved");
  assert.deepEqual(statuses, ["dirty", "saving", "error", "saving", "saved"]);
});

test("edits made while saving trigger another save", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const saved = [];
  const { store, fire, autosave } = setup({
    save: async (batch) => {
      saved.push(batch.upserts.map((character) => character.name));

      if (saved.length === 1) {
        await gate;
      }
    }
  });

  const character = store.addCharacter({ name: "A" });
  fire();
  await settle();

  store.updateCharacter(character.id, { name: "B" });
  release();
  await settle();
  fire();
  await settle();

  assert.deepEqual(saved, [["A"], ["B"]]);
  assert.equal(autosave.status(), "saved");
});

test("pause holds saving without losing changes and resume flushes them", async () => {
  const { store, saved, fire, autosave } = setup();

  autosave.pause();
  store.addCharacter({ name: "A" });
  fire();
  await settle();

  assert.equal(saved.length, 0);
  assert.equal(autosave.status(), "paused");
  assert.equal(store.hasDirty(), true);

  autosave.resume();
  fire();
  await settle();

  assert.equal(saved.length, 1);
  assert.equal(autosave.status(), "saved");
});

test("flush saves immediately", async () => {
  const { store, saved, autosave } = setup();

  store.addCharacter({ name: "A" });
  await autosave.flush();

  assert.equal(saved.length, 1);
  assert.equal(autosave.status(), "saved");
});
