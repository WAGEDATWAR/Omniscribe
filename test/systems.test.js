import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createStorage } from "../src/storage.js";
import { createMemoryBackend } from "../src/storage/memory.js";
import { createRegistry } from "../src/systems.js";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const generic = read("src/templates/generic.json");
const core = read("test/fixtures/systems/d20-core.json");
const custom = read("test/fixtures/systems/d20-custom.json");

test("built-ins and custom systems resolve through one registry", () => {
  const registry = createRegistry({ builtins: [generic], custom: [core, custom] });

  assert.deepEqual(registry.rejected, []);
  assert.equal(registry.resolve({ id: "generic", version: 1 }).ok, true);
  assert.equal(registry.resolve({ id: "test-d20-custom", version: 1 }).ok, true);
  assert.equal(registry.isBuiltin("generic"), true);
  assert.equal(registry.isBuiltin("test-d20"), false);
  assert.equal(registry.lookup("generic", 1).id, "generic");
  assert.equal(registry.lookup("generic", 2), null);
});

test("a custom system whose base is missing is rejected with the reason, not thrown", () => {
  const registry = createRegistry({ builtins: [generic], custom: [custom] });

  assert.equal(registry.rejected.length, 1);
  assert.match(registry.rejected[0].errors[0].message, /"test-d20" version 1 is not available/);
  assert.equal(registry.has("test-d20-custom", 1), false);
});

test("adding enforces unique versions and protects built-in ids", () => {
  const registry = createRegistry({ builtins: [generic], custom: [core] });

  const again = registry.add(core);
  assert.equal(again.ok, false);
  assert.match(again.errors[0].message, /already exists; save changes as a new version/);

  const clash = registry.add({ ...core, id: "generic", version: 5 });
  assert.equal(clash.ok, false);
  assert.match(clash.errors[0].message, /built-in system/);

  const newer = registry.add({ ...core, version: 2, name: "Test d20 v2" });
  assert.equal(newer.ok, true);
  assert.deepEqual(registry.versions("test-d20"), [1, 2]);
  assert.equal(registry.latest("test-d20"), 2);
});

test("an invalid system is refused and leaves nothing behind", () => {
  const registry = createRegistry({ builtins: [generic] });
  const bad = registry.add({ ...core, fields: [...core.fields, { key: "x", label: "X", type: "derived", formula: "@x + 1" }] });

  assert.equal(bad.ok, false);
  assert.match(bad.errors.map((entry) => entry.message).join("\n"), /loop/);
  assert.equal(registry.has("test-d20", 1), false);
  assert.equal(registry.add({ nope: true }).ok, false);
});

test("resolve explains an unavailable system and a missing choice", () => {
  const registry = createRegistry({ builtins: [generic] });

  assert.match(registry.resolve({ id: "gone", version: 3 }).errors[0].message, /"gone" version 3 is not available/);
  assert.equal(registry.resolve(null).ok, false);
});

test("list shows the latest version of each system, built-ins first", () => {
  const registry = createRegistry({ builtins: [generic], custom: [core, { ...core, version: 2 }, custom] });
  const list = registry.list();

  assert.deepEqual(list.map((row) => [row.id, row.version, row.builtin]), [["generic", 1, true], ["test-d20", 2, false], ["test-d20-custom", 1, false]]);
  assert.deepEqual(list[1].versions, [1, 2]);
  assert.equal(list[2].base.id, "test-d20");
  assert.ok(list.every((row) => row.ok));
});

test("a custom system can be removed unless it is a base or built in", () => {
  const registry = createRegistry({ builtins: [generic], custom: [core, custom] });

  assert.equal(registry.remove("generic", 1), false);
  assert.equal(registry.remove("test-d20", 1), false);
  assert.equal(registry.remove("test-d20-custom", 1), true);
  assert.equal(registry.remove("test-d20", 1), true);
  assert.equal(registry.has("test-d20", 1), false);
  assert.equal(registry.remove("test-d20", 1), false);
});

test("systems persist per version in storage", async () => {
  const storage = createStorage(createMemoryBackend(), { now: () => 9 });

  await storage.putSystem(core);
  await storage.putSystem({ ...core, version: 2 });

  assert.deepEqual((await storage.listSystems()).map((file) => file.version).sort(), [1, 2]);

  await storage.deleteSystem("test-d20", 1);

  assert.deepEqual((await storage.listSystems()).map((file) => file.version), [2]);

  const registry = createRegistry({ builtins: [generic], custom: await storage.listSystems() });
  assert.equal(registry.has("test-d20", 2), true);
});
