import { LIMITS } from "./limits.js";
import { SCHEMA_VERSION } from "./migrations.js";
import { cleanText, createId, finiteNumber, isPlainObject, isValidId, normalizeTags } from "./utils.js";

export const CHARACTER_STATUSES = Object.freeze(["active", "retired", "dead", "npc"]);

export const STATUS_LABELS = Object.freeze({
  active: "Active",
  retired: "Retired",
  dead: "Dead",
  npc: "NPC"
});

const CHARACTER_FIELDS = new Set([
  "id",
  "name",
  "player",
  "systemId",
  "status",
  "summary",
  "tags",
  "notes",
  "portraitBlobId",
  "extensions",
  "createdAt",
  "updatedAt"
]);

export function createCharacter(fields = {}, { now = Date.now(), bytes } = {}) {
  return normalizeCharacter(
    { name: "New character", ...fields, id: createId("char", bytes), createdAt: now, updatedAt: now },
    { now }
  );
}

export function normalizeCharacter(raw, { now = Date.now() } = {}) {
  if (!isPlainObject(raw)) {
    return null;
  }

  const extensions = isPlainObject(raw.extensions) ? { ...raw.extensions } : {};
  const unknown = {};

  for (const key of Object.keys(raw)) {
    if (!CHARACTER_FIELDS.has(key)) {
      unknown[key] = raw[key];
    }
  }

  if (Object.keys(unknown).length) {
    extensions.unknown = { ...(isPlainObject(extensions.unknown) ? extensions.unknown : {}), ...unknown };
  }

  const createdAt = finiteNumber(raw.createdAt, now);

  return {
    id: isValidId(raw.id) ? raw.id : createId("char"),
    name: cleanText(raw.name, LIMITS.nameLength),
    player: cleanText(raw.player, LIMITS.playerLength),
    systemId: cleanText(raw.systemId, LIMITS.systemLength),
    status: CHARACTER_STATUSES.includes(raw.status) ? raw.status : "active",
    summary: cleanText(raw.summary, LIMITS.summaryLength),
    tags: normalizeTags(raw.tags, { max: LIMITS.tags, maxLength: LIMITS.tagLength }),
    notes: cleanText(raw.notes, LIMITS.notesLength),
    portraitBlobId: isValidId(raw.portraitBlobId) ? raw.portraitBlobId : null,
    extensions,
    createdAt,
    updatedAt: finiteNumber(raw.updatedAt, createdAt)
  };
}

export function normalizeProject(raw, { now = Date.now() } = {}) {
  const source = Array.isArray(raw?.characters) ? raw.characters : [];
  const seen = new Set();
  const characters = [];

  for (const item of source) {
    const character = normalizeCharacter(item, { now });

    if (!character || seen.has(character.id)) {
      continue;
    }

    seen.add(character.id);
    characters.push(character);

    if (characters.length >= LIMITS.characters) {
      break;
    }
  }

  return { version: SCHEMA_VERSION, characters };
}

export function displayName(character) {
  return character.name.trim() || "Unnamed character";
}

export function sameCharacter(left, right) {
  return JSON.stringify({ ...left, updatedAt: 0 }) === JSON.stringify({ ...right, updatedAt: 0 });
}
