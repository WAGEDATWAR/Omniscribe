/**
 * Append-only project migrations (P-2). `MIGRATIONS[k]` upgrades schema version `k + 1` to `k + 2`.
 * A released migration is never edited; a new one is appended and the version follows from the length.
 */
export const MIGRATIONS = Object.freeze([]);

export const SCHEMA_VERSION = 1 + MIGRATIONS.length;

export function isNewerVersion(version) {
  return Number.isInteger(version) && version > SCHEMA_VERSION;
}

export function migrateProject(project, { from, migrations = MIGRATIONS } = {}) {
  const target = 1 + migrations.length;
  const declared = from ?? project?.version;
  const start = Number.isInteger(declared) && declared >= 1 ? declared : 1;
  let current = project;

  for (let version = start; version < target; version += 1) {
    current = migrations[version - 1](current);
  }

  return { ...current, version: target };
}
