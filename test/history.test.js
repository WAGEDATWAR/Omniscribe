import assert from "node:assert/strict";
import { test } from "node:test";
import { createHistory } from "../src/history.js";

test("undo and redo walk the recorded snapshots", () => {
  const history = createHistory();

  history.record("a");
  history.record("b");

  assert.equal(history.undo("c"), "b");
  assert.equal(history.undo("b"), "a");
  assert.equal(history.undo("a"), null);
  assert.equal(history.redo("a"), "b");
  assert.equal(history.redo("b"), "c");
  assert.equal(history.redo("c"), null);
});

test("recording a new step clears the redo stack", () => {
  const history = createHistory();

  history.record("a");
  history.undo("b");
  assert.equal(history.canRedo(), true);

  history.record("a");
  assert.equal(history.canRedo(), false);
});

test("changes with the same key inside the window coalesce into one step", () => {
  const history = createHistory({ coalesceMs: 500 });

  assert.equal(history.record("a", { key: "name", at: 0 }), true);
  assert.equal(history.record("b", { key: "name", at: 200 }), false);
  assert.equal(history.record("c", { key: "name", at: 600 }), false);
  assert.equal(history.undo("d"), "a");
  assert.equal(history.canUndo(), false);
});

test("a different key or a gap past the window starts a new step", () => {
  const history = createHistory({ coalesceMs: 500 });

  history.record("a", { key: "name", at: 0 });

  assert.equal(history.record("b", { key: "player", at: 100 }), true);
  assert.equal(history.record("c", { key: "player", at: 900 }), true);
});

test("the history is bounded", () => {
  const history = createHistory({ limit: 3 });

  for (const value of ["a", "b", "c", "d", "e"]) {
    history.record(value);
  }

  assert.equal(history.undo("f"), "e");
  assert.equal(history.undo("e"), "d");
  assert.equal(history.undo("d"), "c");
  assert.equal(history.undo("c"), null);
});

test("clear empties both stacks", () => {
  const history = createHistory();

  history.record("a");
  history.undo("b");
  history.clear();

  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), false);
});
