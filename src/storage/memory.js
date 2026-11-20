import { STORES } from "./idb.js";

function copy(value) {
  return typeof Blob !== "undefined" && value instanceof Blob ? value : structuredClone(value);
}

/**
 * An in-memory backend with the same contract as the IndexedDB one. Tests use it, and the app falls
 * back to it (with a visible warning) when IndexedDB is unavailable.
 */
export function createMemoryBackend() {
  const stores = new Map(STORES.map((name) => [name, new Map()]));

  function table(name) {
    const found = stores.get(name);

    if (!found) {
      throw new Error(`Unknown store: ${name}`);
    }

    return found;
  }

  function cloneRecord(value) {
    if (value && typeof value === "object" && !(typeof Blob !== "undefined" && value instanceof Blob)) {
      const output = Array.isArray(value) ? [] : {};

      for (const [key, inner] of Object.entries(value)) {
        output[key] = typeof Blob !== "undefined" && inner instanceof Blob ? inner : copy(inner);
      }

      return output;
    }

    return copy(value);
  }

  return {
    name: "memory",
    async get(store, key) {
      const value = table(store).get(key);
      return value === undefined ? null : cloneRecord(value);
    },
    async getAll(store) {
      return [...table(store).values()].map(cloneRecord);
    },
    async keys(store) {
      return [...table(store).keys()];
    },
    async apply(operations) {
      for (const operation of operations) {
        table(operation.store);
      }

      for (const operation of operations) {
        const target = table(operation.store);

        for (const key of operation.delete ?? []) {
          target.delete(key);
        }

        for (const [key, value] of operation.put ?? []) {
          target.set(key, cloneRecord(value));
        }
      }
    },
    async clear() {
      for (const target of stores.values()) {
        target.clear();
      }
    },
    close() {}
  };
}
