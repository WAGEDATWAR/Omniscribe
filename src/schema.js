import { normalizePresets } from "./dice/presets.js";
import { LIMITS } from "./limits.js";
import { SCHEMA_VERSION } from "./migrations.js";
import { ID_PATTERN } from "./sheet/template.js";
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
  "documents",
  "pdf",
  "sheet",
  "rollPresets",
  "extensions",
  "createdAt",
  "updatedAt"
]);

export function createDocument(fields = {}, { now = Date.now(), bytes } = {}) {
  return normalizeDocument({ ...fields, id: createId("doc", bytes), addedAt: now }, { now });
}

export function normalizeDocument(raw, { now = Date.now() } = {}) {
  if (!isPlainObject(raw) || !isValidId(raw.blobId)) {
    return null;
  }

  return {
    id: isValidId(raw.id) ? raw.id : createId("doc"),
    blobId: raw.blobId,
    name: cleanText(raw.name, LIMITS.documentNameLength) || "Untitled",
    size: Math.max(0, finiteNumber(raw.size, 0)),
    kind: "pdf",
    addedAt: finiteNumber(raw.addedAt, now)
  };
}

function normalizeDocuments(value, now) {
  const seen = new Set();
  const documents = [];

  for (const item of Array.isArray(value) ? value : []) {
    const document = normalizeDocument(item, { now });

    if (document && !seen.has(document.id)) {
      seen.add(document.id);
      documents.push(document);

      if (documents.length >= LIMITS.documents) {
        break;
      }
    }
  }

  return documents;
}

export function normalizePdfChoice(raw, documents) {
  const uploadedId = documents.some((document) => document.id === raw?.uploadedId) ? raw.uploadedId : null;
  return { preference: uploadedId ? "uploaded" : "generated", uploadedId };
}

const SHEET_ROWS = 500;
const SHEET_COLLECTIONS = 40;
const SHEET_CONDITIONS = 50;

function plainCopy(value) {
  return isPlainObject(value) ? JSON.parse(JSON.stringify(value)) : {};
}

/**
 * A character's sheet holds only authored values and pins the system it follows (S-3). This checks the
 * shape and size only; `evaluateSheet` checks every value against its field and reports what is wrong.
 */
export function normalizeSheet(raw) {
  if (!isPlainObject(raw) || !isPlainObject(raw.template)) {
    return null;
  }

  const { id, version } = raw.template;

  if (typeof id !== "string" || !ID_PATTERN.test(id) || !Number.isInteger(version) || version < 1) {
    return null;
  }

  const collections = {};

  for (const [key, rows] of Object.entries(isPlainObject(raw.collections) ? raw.collections : {}).slice(0, SHEET_COLLECTIONS)) {
    collections[key] = Array.isArray(rows) ? rows.filter(isPlainObject).slice(0, SHEET_ROWS).map(plainCopy) : [];
  }

  const conditions = (Array.isArray(raw.conditions) ? raw.conditions : [])
    .filter((entry) => isPlainObject(entry) && typeof entry.name === "string" && entry.name)
    .slice(0, SHEET_CONDITIONS)
    .map((entry) => ({ name: entry.name.slice(0, 40), note: typeof entry.note === "string" ? entry.note.slice(0, 200) : "" }));

  return {
    template: { id, version },
    values: plainCopy(raw.values),
    pools: plainCopy(raw.pools),
    collections,
    conditions,
    orphans: plainCopy(raw.orphans)
  };
}

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
  const documents = normalizeDocuments(raw.documents, now);

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
    documents,
    pdf: normalizePdfChoice(raw.pdf, documents),
    sheet: normalizeSheet(raw.sheet),
    rollPresets: normalizePresets(raw.rollPresets),
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

export function initials(character) {
  const words = displayName(character).split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : [words[0] ?? "?"];
  return letters.map((word) => [...word][0].toUpperCase()).join("");
}

export function displayName(character) {
  return character.name.trim() || "Unnamed character";
}

export function sameCharacter(left, right) {
  return JSON.stringify({ ...left, updatedAt: 0 }) === JSON.stringify({ ...right, updatedAt: 0 });
}
