import assert from "node:assert/strict";
import { test } from "node:test";
import { createBus } from "../src/app/bus.js";

test("handlers receive payloads and can unsubscribe", () => {
  const bus = createBus();
  const seen = [];
  const off = bus.on("ping", (value) => seen.push(value));

  bus.emit("ping", 1);
  off();
  bus.emit("ping", 2);

  assert.deepEqual(seen, [1]);
});

test("emitting an event nobody listens to is harmless", () => {
  assert.doesNotThrow(() => createBus().emit("nothing"));
});

test("a handler that unsubscribes while emitting does not break the others", () => {
  const bus = createBus();
  const seen = [];
  const off = bus.on("x", () => {
    seen.push("a");
    off();
  });

  bus.on("x", () => seen.push("b"));
  bus.emit("x");
  bus.emit("x");

  assert.deepEqual(seen, ["a", "b", "b"]);
});
