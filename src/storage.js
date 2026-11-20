import { SCHEMA_VERSION, isNewerVersion, migrateProject } from "./migrations.js";
import { normalizeProject } from "./schema.js";
import { createIndexedDbBackend, isIndexedDbAvailable, openDatabase } from "./storage/idb.js";
import { createMemoryBackend } from "./storage/memory.js";
import { createId, isValidId } from "./utils.js";

export class StorageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}

/**
 * Records and blobs over a backend. Writes are serialized (P-1), saved per record (P-10) and atomic
 * across stores. A blob is `{ id, type, size, addedAt, data }`; records reference blobs by id.
 */
export function createStorage(backend, { now = Date.now, degraded = false } = {}) {
  let queue = Promise.resolve();

  function enqueue(work) {
    const run = queue.then(work, work);
    queue = run.catch(() => {});
    return run;
  }

  return {
    backend,
    degraded,
    name: backend.name,

    async load() {
      const stored = await backend.get("meta", "schemaVersion");

      if (isNewerVersion(stored)) {
        throw new StorageError("newer", `Stored data is from a newer version of Omniscribe (schema ${stored}).`);
      }

      const records = await backend.getAll("characters");
      const project = normalizeProject(
        migrateProject({ version: stored ?? SCHEMA_VERSION, characters: records }),
        { now: now() }
      );

      return {
        characters: project.characters,
        migrated: stored !== null && stored < SCHEMA_VERSION,
        empty: stored === null && records.length === 0
      };
    },

    save({ upserts = [], deletedIds = [] }) {
      return enqueue(async () => {
        const savedAt = now();

        await backend.apply([
          {
            store: "characters",
            delete: deletedIds,
            put: upserts.map((character) => [character.id, character])
          },
          {
            store: "meta",
            put: [["schemaVersion", SCHEMA_VERSION], ["savedAt", savedAt]]
          }
        ]);

        return savedAt;
      });
    },

    putBlob({ id = createId("blob"), type = "application/octet-stream", data }) {
      if (typeof Blob === "undefined" || !(data instanceof Blob)) {
        return Promise.reject(new StorageError("blob", "A blob needs binary data."));
      }

      if (!isValidId(id)) {
        return Promise.reject(new StorageError("blob", "A blob id is not valid."));
      }

      const record = { id, type, size: data.size, addedAt: now(), data };

      return enqueue(async () => {
        await backend.apply([{ store: "blobs", put: [[id, record]] }]);
        return { id, type, size: record.size, addedAt: record.addedAt };
      });
    },

    async listSystems() {
      return (await backend.getAll("templates")).map((record) => record.file);
    },

    putSystem(file) {
      return enqueue(() => backend.apply([{ store: "templates", put: [[`${file.id}@${file.version}`, { key: `${file.id}@${file.version}`, file, addedAt: now() }]] }]));
    },

    deleteSystem(id, version) {
      return enqueue(() => backend.apply([{ store: "templates", delete: [`${id}@${version}`] }]));
    },

    listRolls: () => backend.getAll("rolls"),

    saveRolls({ put = [], remove = [] }) {
      return enqueue(() => backend.apply([{ store: "rolls", delete: remove, put: put.map((roll) => [roll.id, roll]) }]));
    },

    getBlob: (id) => backend.get("blobs", id),

    async listBlobs() {
      const blobs = await backend.getAll("blobs");
      return blobs.map(({ id, type, size, addedAt }) => ({ id, type, size, addedAt }));
    },

    deleteBlobs(ids) {
      return enqueue(() => backend.apply([{ store: "blobs", delete: ids }]));
    },

    deleteBlob(id) {
      return enqueue(() => backend.apply([{ store: "blobs", delete: [id] }]));
    },

    async blobUsage() {
      const blobs = await backend.getAll("blobs");
      return { count: blobs.length, bytes: blobs.reduce((total, blob) => total + (blob.size ?? 0), 0) };
    },

    async meta(key) {
      return backend.get("meta", key);
    },

    clear() {
      return enqueue(() => backend.clear());
    },

    close() {
      backend.close?.();
    }
  };
}

/** Opens IndexedDB, or an in-memory store flagged `degraded` so the UI can warn that nothing persists. */
export async function openStorage() {
  if (isIndexedDbAvailable()) {
    try {
      return createStorage(createIndexedDbBackend(await openDatabase()));
    } catch {
      return createStorage(createMemoryBackend(), { degraded: true });
    }
  }

  return createStorage(createMemoryBackend(), { degraded: true });
}

/** Asks the browser to keep our data under storage pressure (P-12). Safe where the API is missing. */
export async function requestPersistence(nav = globalThis.navigator) {
  const storageManager = nav?.storage;

  if (!storageManager?.persist) {
    return { supported: false, persisted: false };
  }

  try {
    const already = (await storageManager.persisted?.()) ?? false;
    const persisted = already || (await storageManager.persist());
    return { supported: true, persisted: Boolean(persisted) };
  } catch {
    return { supported: true, persisted: false };
  }
}

export async function checkPersistence(nav = globalThis.navigator) {
  const storageManager = nav?.storage;

  if (!storageManager?.persisted) {
    return { supported: false, persisted: false };
  }

  try {
    return { supported: true, persisted: Boolean(await storageManager.persisted()) };
  } catch {
    return { supported: true, persisted: false };
  }
}

export async function estimateUsage(nav = globalThis.navigator) {
  try {
    const estimate = await nav?.storage?.estimate?.();
    return { usage: estimate?.usage ?? null, quota: estimate?.quota ?? null };
  } catch {
    return { usage: null, quota: null };
  }
}
