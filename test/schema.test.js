import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITS } from "../src/limits.js";
import { createCharacter, displayName, normalizeCharacter, normalizeProject, sameCharacter } from "../src/schema.js";
import { SCHEMA_VERSION } from "../src/migrations.js";

test("createCharacter makes a normalized record with a prefixed id", () => {
  const character = createCharacter({}, { now: 1000 });

  assert.match(character.id, /^char_[0-9a-f]{16}$/);
  assert.equal(character.name, "New character");
  assert.equal(character.status, "active");
  assert.deepEqual(character.tags, []);
  assert.equal(character.createdAt, 1000);
  assert.equal(character.updatedAt, 1000);
  assert.equal(character.portraitBlobId, null);
});

test("createCharacter ignores a caller supplied id and never reuses one", () => {
  const first = createCharacter({ id: "char_fixed" });
  const second = createCharacter({ id: "char_fixed" });

  assert.notEqual(first.id, "char_fixed");
  assert.notEqual(first.id, second.id);
});

test("normalizeCharacter rejects non objects and repairs bad fields", () => {
  assert.equal(normalizeCharacter(null), null);
  assert.equal(normalizeCharacter([]), null);

  const character = normalizeCharacter({
    id: "bad id!",
    name: 42,
    status: "zombie",
    tags: ["Elf", "elf", "  ", "Rogue"],
    portraitBlobId: "not valid!",
    createdAt: "yesterday"
  }, { now: 500 });

  assert.match(character.id, /^char_/);
  assert.equal(character.name, "");
  assert.equal(character.status, "active");
  assert.deepEqual(character.tags, ["Elf", "Rogue"]);
  assert.equal(character.portraitBlobId, null);
  assert.equal(character.createdAt, 500);
});

test("normalizeCharacter enforces length limits", () => {
  const character = normalizeCharacter({
    id: "char_a",
    name: "x".repeat(LIMITS.nameLength + 50),
    notes: "y".repeat(LIMITS.notesLength + 50),
    tags: Array.from({ length: LIMITS.tags + 10 }, (_, index) => `tag${index}`)
  });

  assert.equal(character.name.length, LIMITS.nameLength);
  assert.equal(character.notes.length, LIMITS.notesLength);
  assert.equal(character.tags.length, LIMITS.tags);
});

test("unknown fields are preserved in extensions and survive a second pass (A-5)", () => {
  const once = normalizeCharacter({ id: "char_a", name: "A", futureThing: { deep: true } });
  const twice = normalizeCharacter(once);

  assert.deepEqual(once.extensions.unknown, { futureThing: { deep: true } });
  assert.deepEqual(twice, once);
});

test("normalizeProject drops duplicates and non objects and stamps the schema version", () => {
  const project = normalizeProject({
    characters: [{ id: "char_a", name: "First" }, { id: "char_a", name: "Second" }, null, "x", { id: "char_b" }]
  });

  assert.equal(project.version, SCHEMA_VERSION);
  assert.deepEqual(project.characters.map((character) => character.id), ["char_a", "char_b"]);
  assert.equal(project.characters[0].name, "First");
  assert.deepEqual(normalizeProject(undefined).characters, []);
});

test("displayName and sameCharacter", () => {
  assert.equal(displayName({ name: "   " }), "Unnamed character");
  assert.equal(displayName({ name: " Mira " }), " Mira ".trim());

  const base = createCharacter({ name: "A" }, { now: 1 });

  assert.equal(sameCharacter(base, { ...base, updatedAt: 99 }), true);
  assert.equal(sameCharacter(base, { ...base, name: "B" }), false);
});
