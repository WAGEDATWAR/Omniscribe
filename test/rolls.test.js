import assert from "node:assert/strict";
import { test } from "node:test";
import { PRESET_LIMITS, buildPreset, checkExpression, normalizePresets, stepsOf } from "../src/dice/presets.js";
import { scriptedRng } from "../src/dice/rng.js";
import { rollExpression } from "../src/dice/roll.js";
import { LIMITS } from "../src/limits.js";
import { createRollLog } from "../src/rollLog.js";
import { normalizeCharacter } from "../src/schema.js";
import { createStorage } from "../src/storage.js";
import { createMemoryBackend } from "../src/storage/memory.js";

function fakeRoll(id, at, extra = {}) {
  return { id, at, characterId: null, label: id, expression: "d20", total: 1, terms: [], ...extra };
}

test("an expression is checked without rolling", () => {
  assert.equal(checkExpression("1d20 + @str.mod").ok, true);
  assert.equal(checkExpression("").ok, false);
  assert.equal(checkExpression("4d6x").ok, false);
  assert.match(checkExpression("   ").reason, /Write a dice expression/);
});

test("a preset needs a name and a valid expression; a macro checks every step", () => {
  assert.equal(buildPreset({ label: "Attack", expression: "d20 + @str.mod" }).ok, true);
  assert.equal(buildPreset({ label: "", expression: "d20" }).ok, false);
  assert.equal(buildPreset({ label: "Bad", expression: "d20 +" }).ok, false);
  const macro = buildPreset({ label: "Strike", steps: [{ label: "Hit", expression: "d20" }, { label: "Damage", expression: "2d6" }] });
  assert.equal(macro.ok, true);
  assert.deepEqual(stepsOf(macro.preset).map((step) => step.label), ["Hit", "Damage"]);
  const broken = buildPreset({ label: "Strike", steps: [{ label: "Hit", expression: "d20" }, { label: "Damage", expression: "2d6x" }] });
  assert.match(broken.reason, /^Step 2/);
  assert.deepEqual(stepsOf({ label: "A", expression: "d6", steps: null }), [{ label: "A", expression: "d6" }]);
});

test("stored presets are cleaned, deduplicated and bounded", () => {
  const raw = [{ id: "p_1", label: "A", expression: "d6" }, { id: "p_1", label: "dup", expression: "d6" }, { id: "bad id!", expression: "d6" }, null, { id: "p_2" }];
  assert.deepEqual(normalizePresets(raw).map((preset) => preset.id), ["p_1"]);
  const many = Array.from({ length: 300 }, (_, index) => ({ id: `p_${index}`, label: "x", expression: "d6" }));
  assert.equal(normalizePresets(many).length, PRESET_LIMITS.perCharacter);
  assert.deepEqual(normalizePresets("nope"), []);
});

test("a character keeps its presets through normalization", () => {
  const character = normalizeCharacter({ id: "char_a", name: "A", rollPresets: [{ id: "p_1", label: "A", expression: "d6", critMin: 19 }] });
  assert.equal(character.rollPresets[0].critMin, 19);
  assert.deepEqual(normalizeCharacter({ id: "char_b", name: "B" }).rollPresets, []);
});

test("a preset's critMin sets the critical flag", () => {
  const preset = buildPreset({ label: "Keen", expression: "d20", critMin: 19 }).preset;
  const result = rollExpression(preset.expression, { rng: scriptedRng([19]), options: { critMin: preset.critMin } });
  assert.equal(result.roll.flags.critical, true);
});

test("the log is newest first, bounded, persistent and filterable", async () => {
  const storage = createStorage(createMemoryBackend());
  const log = createRollLog(storage, { limit: 3 });
  await log.load();

  for (let index = 1; index <= 5; index += 1) {
    await log.add(fakeRoll(`roll_${index}`, index, { characterId: index % 2 ? "char_a" : "char_b", label: index === 4 ? "Longsword" : "Other" }));
  }

  assert.deepEqual(log.list().map((roll) => roll.id), ["roll_5", "roll_4", "roll_3"]);
  assert.deepEqual(log.list({ characterId: "char_a" }).map((roll) => roll.id), ["roll_5", "roll_3"]);
  assert.deepEqual(log.list({ search: "sword" }).map((roll) => roll.id), ["roll_4"]);
  assert.equal((await storage.listRolls()).length, 3);

  const reloaded = createRollLog(storage, { limit: 3 });
  await reloaded.load();
  assert.deepEqual(reloaded.list().map((roll) => roll.id), ["roll_5", "roll_4", "roll_3"]);
  assert.equal(LIMITS.rollLog, 500);
});

test("clearing the log can be undone, and can be limited to one character", async () => {
  const storage = createStorage(createMemoryBackend());
  const log = createRollLog(storage);
  await log.load();
  await log.add(fakeRoll("roll_1", 1, { characterId: "char_a" }));
  await log.add(fakeRoll("roll_2", 2, { characterId: "char_b" }));

  assert.equal(await log.clear({ characterId: "char_a" }), 1);
  assert.deepEqual(log.list().map((roll) => roll.id), ["roll_2"]);
  assert.equal(await log.undoClear(), 1);
  assert.equal(log.list().length, 2);
  assert.equal(await log.undoClear(), 0);

  await log.clear();
  assert.equal(log.list().length, 0);
  assert.equal((await storage.listRolls()).length, 0);
});

test("a degraded store keeps the log in memory only", async () => {
  const storage = createStorage(createMemoryBackend(), { degraded: true });
  const log = createRollLog(storage);
  await log.add(fakeRoll("roll_1", 1));
  assert.equal(log.list().length, 1);
  assert.equal((await storage.listRolls()).length, 0);
});

test("stored junk in the log is ignored on load", async () => {
  const storage = createStorage(createMemoryBackend());
  await storage.saveRolls({ put: [fakeRoll("roll_1", 1), { id: "roll_2" }], remove: [] });
  const log = createRollLog(storage);
  assert.equal(await log.load(), 1);
});
