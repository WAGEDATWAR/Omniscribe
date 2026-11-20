function addDocuments(project) {
  const characters = (project.characters ?? []).map((character) => (
    character && typeof character === "object"
      ? { documents: [], pdf: { preference: "generated", uploadedId: null }, ...character }
      : character
  ));

  return { ...project, characters };
}

/**
 * Append-only project migrations (P-2). `MIGRATIONS[k]` upgrades schema version `k + 1` to `k + 2`.
 * A released migration is never edited; a new one is appended and the version follows from the length.
 */
function addSheet(project) {
  const characters = (project.characters ?? []).map((character) => (
    character && typeof character === "object" ? { sheet: null, ...character } : character
  ));

  return { ...project, characters };
}

function addRollPresets(project) {
  const characters = (project.characters ?? []).map((character) => (
    character && typeof character === "object" ? { rollPresets: [], ...character } : character
  ));

  return { ...project, characters };
}

function addRecordLists(project) {
  const lists = { inventory: { items: [], wallets: {} }, abilities: [], journal: [], relations: [], progression: [], familiars: [] };
  const characters = (project.characters ?? []).map((character) => (
    character && typeof character === "object" ? { ...structuredClone(lists), ...character } : character
  ));

  return { ...project, characters };
}

function addCampaigns(project) {
  return { ...project, campaigns: Array.isArray(project.campaigns) ? project.campaigns : [] };
}

export const MIGRATIONS = Object.freeze([addDocuments, addSheet, addRollPresets, addRecordLists, addCampaigns]);

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
