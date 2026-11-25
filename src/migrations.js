import { migrateCustom, mergeOps } from "./layouts/migrate.js";
import { KIND_IDS } from "./records/kinds.js";

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

/**
 * Moves anonymous `custom` entries to declared fields (L-6): values go to `record.fields`, and the declarations
 * come back as `project.layouts`, one layout of operations per page that had any.
 */
export function addLayoutFields(project) {
  const ops = {};
  const note = (surface, result) => {
    if (result.ops.length) {
      ops[surface] = mergeOps(ops[surface] ?? [], result.ops);
    }

    return result.records;
  };

  const characters = (project.characters ?? []).map((character) => {
    if (!character || typeof character !== "object") {
      return character;
    }

    const next = { ...character };

    for (const kind of KIND_IDS) {
      if (kind === "inventory") {
        if (Array.isArray(character.inventory?.items)) {
          next.inventory = { ...character.inventory, items: note(kind, migrateCustom(kind, character.inventory.items)) };
        }
      } else if (Array.isArray(character[kind])) {
        next[kind] = note(kind, migrateCustom(kind, character[kind]));
      }
    }

    return next;
  });

  const campaigns = (project.campaigns ?? []).map((campaign) => {
    if (!campaign || typeof campaign !== "object") {
      return campaign;
    }

    const [self] = note("campaign", migrateCustom("campaign", [campaign]));
    const next = { ...self };

    for (const kind of ["roster", "sessions", "handouts"]) {
      if (Array.isArray(campaign[kind])) {
        next[kind] = note(kind, migrateCustom(kind, campaign[kind]));
      }
    }

    return next;
  });

  const layouts = Object.entries(ops).map(([surface, list]) => ({ id: `lay_${surface}`, name: "My layout", surface, base: "default", ops: list }));
  return { ...project, characters, campaigns, layouts: [...(Array.isArray(project.layouts) ? project.layouts : []), ...layouts] };
}

export const MIGRATIONS = Object.freeze([addDocuments, addSheet, addRollPresets, addRecordLists, addCampaigns, addLayoutFields]);

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
