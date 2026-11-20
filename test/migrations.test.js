import assert from "node:assert/strict";
import { test } from "node:test";
import { MIGRATIONS, SCHEMA_VERSION, isNewerVersion, migrateProject } from "../src/migrations.js";

test("the schema version follows the migration list", () => {
  assert.equal(SCHEMA_VERSION, 1 + MIGRATIONS.length);
});

test("migrateProject applies each step in order and stamps the target version", () => {
  const calls = [];
  const migrations = [
    (project) => {
      calls.push("2");
      return { ...project, step: [...(project.step ?? []), "to2"] };
    },
    (project) => {
      calls.push("3");
      return { ...project, step: [...(project.step ?? []), "to3"] };
    }
  ];

  const migrated = migrateProject({ version: 1, characters: [] }, { migrations });

  assert.deepEqual(calls, ["2", "3"]);
  assert.deepEqual(migrated.step, ["to2", "to3"]);
  assert.equal(migrated.version, 3);
});

test("migrateProject starts from the stored version and skips applied steps", () => {
  const calls = [];
  const migrations = [() => { calls.push("2"); return {}; }, () => { calls.push("3"); return {}; }];

  migrateProject({ version: 2 }, { migrations });

  assert.deepEqual(calls, ["3"]);
});

test("migrateProject treats a missing or bad version as 1", () => {
  const calls = [];
  const migrations = [(project) => { calls.push("2"); return project; }];

  migrateProject({}, { migrations });
  migrateProject({ version: "x" }, { migrations });

  assert.deepEqual(calls, ["2", "2"]);
});

test("isNewerVersion only flags integers above the current schema", () => {
  assert.equal(isNewerVersion(SCHEMA_VERSION + 1), true);
  assert.equal(isNewerVersion(SCHEMA_VERSION), false);
  assert.equal(isNewerVersion(null), false);
  assert.equal(isNewerVersion("9"), false);
});
