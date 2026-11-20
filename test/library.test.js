import assert from "node:assert/strict";
import { test } from "node:test";
import { filterCommands } from "../src/commands.js";
import { DEFAULT_PREFS, PREFS_KEY, loadPrefs, normalizePrefs, savePrefs } from "../src/settings.js";
import { buildLibrary, filterItems, isSortMode, sortItems, toLibraryItem } from "../src/projects.js";
import { createCharacter } from "../src/schema.js";
import { DEFAULT_VIEW, isEditorView, isHubView, parseRoute, routeHref, viewForShortcut } from "../src/views.js";
import { formatBytes, isValidId, normalizeTags, plural } from "../src/utils.js";

const mira = createCharacter({ name: "Mira Vale", player: "Sam", systemId: "Generic", tags: ["Rogue"], summary: "A courier." }, { now: 100 });
const bram = createCharacter({ name: "Bram", status: "dead", summary: "x".repeat(300) }, { now: 200 });

test("parseRoute reads hub and character routes and falls back to the library", () => {
  assert.deepEqual(parseRoute("#/library"), { view: "library", id: null });
  assert.deepEqual(parseRoute("#/data"), { view: "data", id: null });
  assert.deepEqual(parseRoute("#/settings?x=1"), { view: "settings", id: null });
  assert.deepEqual(parseRoute("#/character/char_ab12"), { view: "character", id: "char_ab12" });
  assert.deepEqual(parseRoute("#/character/bad id"), { view: DEFAULT_VIEW, id: null });
  assert.deepEqual(parseRoute("#/character/char_a/extra"), { view: DEFAULT_VIEW, id: null });
  assert.deepEqual(parseRoute("#/nowhere"), { view: DEFAULT_VIEW, id: null });
  assert.deepEqual(parseRoute(""), { view: DEFAULT_VIEW, id: null });
  assert.deepEqual(parseRoute(undefined), { view: DEFAULT_VIEW, id: null });
});

test("routeHref and parseRoute round trip", () => {
  assert.equal(routeHref("character", "char_a"), "#/character/char_a");
  assert.equal(routeHref("data"), "#/data");
  assert.equal(routeHref("character"), "#/library");
  assert.deepEqual(parseRoute(routeHref("character", "char_a")), { view: "character", id: "char_a" });
});

test("view helpers", () => {
  assert.equal(isHubView("library"), true);
  assert.equal(isHubView("character"), false);
  assert.equal(isEditorView("character"), true);
  assert.equal(viewForShortcut("2"), "data");
  assert.equal(viewForShortcut("9"), null);
});

test("toLibraryItem builds the tile model", () => {
  const item = toLibraryItem(mira);

  assert.equal(item.name, "Mira Vale");
  assert.equal(item.subtitle, "Sam · Generic");
  assert.equal(item.statusLabel, "Active");
  assert.equal(item.href, `#/character/${mira.id}`);
  assert.equal(toLibraryItem(bram).excerpt.length, 140);
  assert.equal(toLibraryItem({ ...bram, name: "" }).name, "Unnamed character");
});

test("filterItems requires every word and searches tags and summaries", () => {
  const items = [mira, bram].map(toLibraryItem);

  assert.equal(filterItems(items, { query: "" }).length, 2);
  assert.deepEqual(filterItems(items, { query: "rogue sam" }).map((item) => item.name), ["Mira Vale"]);
  assert.deepEqual(filterItems(items, { query: "courier" }).map((item) => item.name), ["Mira Vale"]);
  assert.equal(filterItems(items, { query: "nobody" }).length, 0);
});

test("sortItems and buildLibrary", () => {
  const items = [mira, bram].map(toLibraryItem);

  assert.deepEqual(sortItems(items, "name").map((item) => item.name), ["Bram", "Mira Vale"]);
  assert.deepEqual(sortItems(items, "recent").map((item) => item.name), ["Bram", "Mira Vale"]);
  assert.deepEqual(sortItems(items, "created").map((item) => item.name), ["Bram", "Mira Vale"]);

  const library = buildLibrary([mira, bram], { query: "mira", sort: "name" });

  assert.equal(library.total, 2);
  assert.equal(library.items.length, 1);
  assert.equal(isSortMode("name"), true);
  assert.equal(isSortMode("bogus"), false);
});

test("filterCommands ranks prefix matches first and requires every word", () => {
  const commands = [
    { id: "a", title: "Open Library" },
    { id: "b", title: "Go to Settings", keywords: "preferences theme" },
    { id: "c", title: "New character" }
  ];

  assert.deepEqual(filterCommands(commands, "").map((command) => command.id), ["a", "b", "c"]);
  assert.deepEqual(filterCommands(commands, "new").map((command) => command.id), ["c"]);
  assert.deepEqual(filterCommands(commands, "theme").map((command) => command.id), ["b"]);
  assert.deepEqual(filterCommands(commands, "o lib").map((command) => command.id), ["a"]);
  assert.deepEqual(filterCommands(commands, "zzz"), []);
});

test("preferences normalize, load and save safely", () => {
  assert.deepEqual(normalizePrefs({ theme: "neon", sort: "nope" }), DEFAULT_PREFS);
  assert.deepEqual(normalizePrefs({ theme: "light", sort: "name" }), { theme: "light", sort: "name" });

  const area = { data: {}, getItem(key) { return this.data[key] ?? null; }, setItem(key, value) { this.data[key] = value; } };

  assert.deepEqual(loadPrefs(area), DEFAULT_PREFS);
  assert.equal(savePrefs(area, { theme: "light", sort: "name" }), true);
  assert.ok(area.data[PREFS_KEY]);
  assert.deepEqual(loadPrefs(area), { theme: "light", sort: "name" });
  assert.deepEqual(loadPrefs({ getItem() { throw new Error("blocked"); } }), DEFAULT_PREFS);
  assert.equal(savePrefs({ setItem() { throw new Error("blocked"); } }, DEFAULT_PREFS), false);
});

test("utility helpers", () => {
  assert.equal(isValidId("char_ab-12"), true);
  assert.equal(isValidId("bad id"), false);
  assert.equal(isValidId(""), false);
  assert.equal(isValidId(7), false);
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(25 * 1024 * 1024), "25 MB");
  assert.equal(formatBytes(-1), "unknown");
  assert.equal(plural(1, "character"), "1 character");
  assert.equal(plural(2, "character"), "2 characters");
  assert.deepEqual(normalizeTags(["A", "a", " b  c "], { max: 5, maxLength: 3 }), ["A", "b c"]);
  assert.deepEqual(normalizeTags("nope", { max: 5, maxLength: 3 }), []);
});
