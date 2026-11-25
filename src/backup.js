import { mergeLayouts } from "./layouts/migrate.js";
import { validateLayoutFile } from "./layouts/resolve.js";
import { isShared } from "./campaigns.js";
import { referencedBlobIds } from "./integrity.js";
import { LIMITS } from "./limits.js";
import { SCHEMA_VERSION, isNewerVersion, migrateProject } from "./migrations.js";
import { KIND_IDS } from "./records/kinds.js";
import { normalizeProject } from "./schema.js";
import { ZipError, openZip, writeZip } from "./zip.js";

export const BACKUP_FORMAT = "omniscribe-backup";
export const BACKUP_FORMAT_VERSION = 1;

const encoder = new TextEncoder();

export async function sha256Hex(bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

/**
 * Builds a backup or bundle zip (X-3). `blobs` is `[{ id, type, size, addedAt, bytes }]`; only the blobs given are
 * written, so a bundle passes the ones its records reference. Returns `{ bytes, manifest }`.
 */
export async function buildArchive({ kind = "backup", characters, campaigns = [], systems = [], layouts = [], blobs = [], appVersion = "", now = Date.now() }) {
  const files = [];
  const entries = [];

  for (const blob of blobs) {
    files.push({ id: blob.id, type: blob.type, size: blob.bytes.length, hash: await sha256Hex(blob.bytes), addedAt: blob.addedAt ?? now });
    entries.push({ path: `files/${blob.id}`, data: blob.bytes });
  }

  const manifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    kind,
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    createdAt: now,
    counts: { characters: characters.length, campaigns: campaigns.length, systems: systems.length, layouts: layouts.length, blobs: blobs.length }
  };

  const text = (value) => encoder.encode(JSON.stringify(value));
  const bytes = await writeZip([
    { path: "manifest.json", data: text(manifest) },
    { path: "project.json", data: text({ characters, campaigns, systems, layouts }) },
    { path: "files.json", data: text(files) },
    ...entries
  ], { now: new Date(now) });

  return { bytes, manifest };
}

function fail(message) {
  throw new ZipError(message);
}

function parseJson(text, name) {
  try {
    return JSON.parse(text);
  } catch {
    return fail(`${name} is not valid JSON.`);
  }
}

/**
 * Reads and reviews an archive without writing anything. Records are migrated and normalized (a newer schema is
 * refused). Files are listed with their metadata; `readFile(id)` returns verified bytes or null, and `problems`
 * names every file that is listed but missing or does not match its hash.
 */
export async function readArchive(bytes, { now = Date.now(), caps } = {}) {
  const zip = openZip(bytes, caps);

  if (!zip.has("manifest.json") || !zip.has("project.json")) {
    fail("This zip is not an Omniscribe backup.");
  }

  const manifest = parseJson(await zip.readText("manifest.json"), "manifest.json");

  if (manifest?.format !== BACKUP_FORMAT || !Number.isInteger(manifest.formatVersion)) {
    fail("This zip is not an Omniscribe backup.");
  }

  if (manifest.formatVersion > BACKUP_FORMAT_VERSION) {
    fail("This backup was made by a newer version of Omniscribe.");
  }

  if (!Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion < 1 || isNewerVersion(manifest.schemaVersion)) {
    fail("This backup holds data from a newer version of Omniscribe.");
  }

  const raw = parseJson(await zip.readText("project.json"), "project.json");
  const listed = zip.has("files.json") ? parseJson(await zip.readText("files.json"), "files.json") : [];

  if (!Array.isArray(raw?.characters) || !Array.isArray(listed)) {
    fail("The backup's records are damaged.");
  }

  if (raw.characters.length > LIMITS.characters || (raw.campaigns?.length ?? 0) > LIMITS.campaigns) {
    fail("The backup holds more records than this app allows.");
  }

  const migrated = migrateProject({ version: manifest.schemaVersion, characters: raw.characters, campaigns: Array.isArray(raw.campaigns) ? raw.campaigns : [] });
  const project = normalizeProject(migrated, { now });
  const storedLayouts = (Array.isArray(raw.layouts) ? raw.layouts : []).map((layout) => validateLayoutFile(layout)).filter((checked) => checked.ok).map((checked) => checked.file);
  const layouts = mergeLayouts(storedLayouts, migrated.layouts ?? []);
  const files = new Map();
  const problems = [];

  for (const meta of listed) {
    if (typeof meta?.id !== "string" || !zip.has(`files/${meta.id}`)) {
      problems.push(`The file ${String(meta?.id)} is listed but missing.`);
      continue;
    }

    files.set(meta.id, { id: meta.id, type: typeof meta.type === "string" ? meta.type : "application/octet-stream", size: meta.size, hash: meta.hash, addedAt: meta.addedAt });
  }

  return {
    manifest,
    characters: project.characters,
    campaigns: project.campaigns,
    layouts,
    systems: Array.isArray(raw.systems) ? raw.systems.filter((file) => file && typeof file.id === "string") : [],
    files,
    problems,
    async readFile(id) {
      const meta = files.get(id);

      if (!meta) {
        return null;
      }

      try {
        const data = await zip.readEntry(`files/${id}`);
        return data.length === meta.size && (await sha256Hex(data)) === meta.hash ? data : null;
      } catch {
        return null;
      }
    }
  };
}

/** Checks every listed file once and returns the ids that cannot be trusted, for the review step. */
export async function verifyFiles(archive) {
  const bad = [];

  for (const id of archive.files.keys()) {
    if (!(await archive.readFile(id))) {
      bad.push(id);
    }
  }

  return bad;
}

function remapStrings(value, map) {
  if (typeof value === "string") {
    return map.has(value) ? map.get(value) : value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => remapStrings(entry, map));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, remapStrings(entry, map)]));
  }

  return value;
}

function freshId(prefix, taken, create) {
  let id = create(prefix);

  while (taken.has(id)) {
    id = create(prefix);
  }

  taken.add(id);
  return id;
}

/**
 * Plans an Add-mode import (X-4, X-5). Nothing the user has is overwritten: a character or campaign whose id exists
 * gets a new id and "(imported)" in its name, every link inside the import follows the new id, and a file whose bytes
 * already exist (`existingBlobs`: hash to id) is reused. `badFiles` are left out and their references are cleared.
 */
export function planAdd(archive, { characterIds = new Set(), campaignIds = new Set(), blobIds = new Set(), existingBlobs = new Map(), badFiles = new Set(), createId }) {
  const map = new Map();
  const taken = new Set([...characterIds, ...campaignIds, ...blobIds]);
  const renamed = [];
  const reused = [];
  const addedBlobs = [];

  for (const meta of archive.files.values()) {
    if (badFiles.has(meta.id)) {
      continue;
    }

    const duplicate = existingBlobs.get(meta.hash);

    if (duplicate) {
      map.set(meta.id, duplicate);
      reused.push(meta.id);
    } else if (blobIds.has(meta.id)) {
      map.set(meta.id, freshId("blob", taken, createId));
      addedBlobs.push(meta.id);
    } else {
      addedBlobs.push(meta.id);
    }
  }

  for (const character of archive.characters) {
    if (characterIds.has(character.id)) {
      map.set(character.id, freshId("char", taken, createId));
      renamed.push(character.id);
    }
  }

  for (const campaign of archive.campaigns) {
    if (campaignIds.has(campaign.id)) {
      map.set(campaign.id, freshId("camp", taken, createId));
      renamed.push(campaign.id);
    }
  }

  const clearBad = (record) => {
    const kept = Array.isArray(record.documents) ? { ...record, documents: record.documents.filter((entry) => !badFiles.has(entry.blobId)) } : record;
    return JSON.parse(JSON.stringify(kept), (key, value) => (typeof value === "string" && badFiles.has(value) ? null : value));
  };

  const mark = (record) => (map.has(record.id) && renamed.includes(record.id) ? { ...record, name: `${record.name ?? ""} (imported)`.trim() } : record);
  const characters = archive.characters.map((record) => remapStrings(mark(clearBad(record)), map));
  const campaigns = archive.campaigns.map((record) => remapStrings(mark(clearBad(record)), map));
  const documentsDropped = archive.characters.reduce((total, record) => total + (record.documents ?? []).filter((entry) => badFiles.has(entry.blobId)).length, 0);

  return {
    characters,
    campaigns,
    systems: archive.systems,
    layouts: archive.layouts,
    blobs: addedBlobs.map((id) => ({ from: id, to: map.get(id) ?? id, meta: archive.files.get(id) })),
    reused,
    renamed,
    documentsDropped
  };
}

/** The layouts whose pages have a value of a field of your own in the exported records. */
export function neededLayouts(layouts, characters, campaigns) {
  const used = new Set();
  const note = (surface, records) => {
    if (records.some((record) => Object.keys(record?.fields ?? {}).length)) {
      used.add(surface);
    }
  };

  for (const character of characters) {
    note("character", [character]);

    for (const kind of KIND_IDS) {
      note(kind, (kind === "inventory" ? character.inventory?.items : character[kind]) ?? []);
    }
  }

  for (const campaign of campaigns) {
    note("campaign", [campaign]);

    for (const kind of ["roster", "sessions", "handouts"]) {
      note(kind, campaign[kind] ?? []);
    }
  }

  return layouts.filter((layout) => used.has(layout.surface));
}

/**
 * The user-made systems a set of characters needs: each character's pinned system and its base chain, taken from the
 * custom files (built-ins ship with the app, so a bundle never carries them).
 */
export function neededSystems(characters, customFiles) {
  const byKey = new Map(customFiles.map((file) => [`${file.id}@${file.version}`, file]));
  const out = new Map();

  function take(ref, depth = 0) {
    const key = ref ? `${ref.id}@${ref.version}` : null;
    const file = key ? byKey.get(key) : null;

    if (!file || out.has(key) || depth > 10) {
      return;
    }

    out.set(key, file);
    take(file.base, depth + 1);
  }

  for (const character of characters) {
    take(character.sheet?.template);
  }

  return [...out.values()];
}

function withoutSecrets(character) {
  return { ...character, journal: (character.journal ?? []).filter(isShared) };
}

/**
 * What a bundle holds (X-6, X-8): one character, or a campaign with the characters on its roster. A shared bundle
 * (`secrets: false`) drops secret session notes and secret journal entries; handouts are for players and stay.
 */
export function bundleContents({ kind, character = null, campaign = null, characters = [], customSystems = [], layouts = [], secrets = false }) {
  const chosen = kind === "campaign" ? campaign.roster.map((row) => characters.find((entry) => entry.id === row.characterId)).filter(Boolean) : [character];
  const unique = [...new Map(chosen.map((entry) => [entry.id, entry])).values()];
  const outCharacters = secrets ? unique : unique.map(withoutSecrets);
  const outCampaigns = kind === "campaign" ? [secrets ? campaign : { ...campaign, sessions: campaign.sessions.map((session) => ({ ...session, secretNotes: "" })) }] : [];

  return {
    characters: outCharacters,
    campaigns: outCampaigns,
    systems: neededSystems(outCharacters, customSystems),
    layouts: neededLayouts(layouts, outCharacters, outCampaigns),
    blobIds: [...referencedBlobIds(outCharacters, outCampaigns)]
  };
}
