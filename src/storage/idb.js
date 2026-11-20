export const DATABASE_NAME = "omniscribe";
export const DATABASE_VERSION = 1;
export const STORES = Object.freeze(["meta", "characters", "campaigns", "templates", "rolls", "blobs", "revisions"]);

export function isIndexedDbAvailable() {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

export function openDatabase(name = DATABASE_NAME, version = DATABASE_VERSION) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);

    request.onupgradeneeded = () => {
      const database = request.result;

      for (const store of STORES) {
        if (!database.objectStoreNames.contains(store)) {
          database.createObjectStore(store);
        }
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };

    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed."));
    request.onblocked = () => reject(new Error("IndexedDB open was blocked by another tab."));
  });
}

/**
 * The backend contract used by `storage.js`: `get`, `getAll`, `keys`, `apply` and `clear`. `apply` takes
 * `[{ store, put: [[key, value]], delete: [key] }]` and commits every operation in one transaction.
 */
export function createIndexedDbBackend(database) {
  function transact(stores, mode, work) {
    return new Promise((resolve, reject) => {
      let result;

      try {
        const transaction = database.transaction(stores, mode);
        result = work(transaction);
        transaction.oncomplete = () => resolve(result?.value);
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
        transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
      } catch (error) {
        reject(error);
      }
    });
  }

  function read(store, method, ...args) {
    return transact([store], "readonly", (transaction) => {
      const holder = {};
      const request = transaction.objectStore(store)[method](...args);
      request.onsuccess = () => {
        holder.value = request.result;
      };
      return holder;
    });
  }

  return {
    name: "indexeddb",
    async get(store, key) {
      const value = await read(store, "get", key);
      return value === undefined ? null : value;
    },
    async getAll(store) {
      return (await read(store, "getAll")) ?? [];
    },
    async keys(store) {
      return (await read(store, "getAllKeys")) ?? [];
    },
    apply(operations) {
      const stores = [...new Set(operations.map((operation) => operation.store))];

      if (!stores.length) {
        return Promise.resolve();
      }

      return transact(stores, "readwrite", (transaction) => {
        for (const operation of operations) {
          const objectStore = transaction.objectStore(operation.store);

          for (const key of operation.delete ?? []) {
            objectStore.delete(key);
          }

          for (const [key, value] of operation.put ?? []) {
            objectStore.put(value, key);
          }
        }

        return {};
      });
    },
    clear() {
      return transact([...STORES], "readwrite", (transaction) => {
        for (const store of STORES) {
          transaction.objectStore(store).clear();
        }

        return {};
      });
    },
    close() {
      database.close();
    }
  };
}
