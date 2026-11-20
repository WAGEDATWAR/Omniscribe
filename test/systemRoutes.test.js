import assert from "node:assert/strict";
import { test } from "node:test";
import { slugify } from "../src/app/systems.js";
import { VIEWS, parseRoute, routeHref, viewForShortcut } from "../src/views.js";

test("the game systems hub and editor routes parse and round trip", () => {
  assert.deepEqual(parseRoute("#/systems"), { view: "systems", id: null, sub: null });
  assert.deepEqual(parseRoute("#/systems/house-rules"), { view: "system", id: "house-rules", sub: null });
  assert.deepEqual(parseRoute("#/systems/my.system_2"), { view: "system", id: "my.system_2", sub: null });
  assert.equal(parseRoute("#/systems/Bad Id").view, "library");
  assert.equal(parseRoute("#/systems/a/b").view, "library");
  assert.equal(routeHref("system", "house-rules"), "#/systems/house-rules");
  assert.equal(routeHref("systems"), "#/systems");
  assert.equal(viewForShortcut("4"), "systems");
  assert.ok(VIEWS.some((view) => view.id === "systems" && view.shortcut === "Alt+4"));
  assert.ok(VIEWS.some((view) => view.id === "dice" && view.shortcut === "Alt+5"));
});

test("slugify makes a valid id from a name", () => {
  assert.equal(slugify("House Rules"), "house-rules");
  assert.equal(slugify("  My  Game!! v2 "), "my-game-v2");
  assert.equal(slugify("---"), "");
  assert.equal(slugify("é"), "");
  assert.equal(slugify("a".repeat(100)).length, 64);
});
