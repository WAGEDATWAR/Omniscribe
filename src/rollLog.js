import { LIMITS } from "./limits.js";
import { isPlainObject, isValidId } from "./utils.js";

/**
 * The roll log: a bounded, persistent list in the `rolls` store (D-5). Rolls are not undoable one by one;
 * clearing the log can be undone for the session. It never touches characters.
 */
export function createRollLog(storage, { limit = LIMITS.rollLog } = {}) {
  let entries = [];
  let cleared = null;
  const listeners = new Set();

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const valid = (roll) => isPlainObject(roll) && isValidId(roll.id) && typeof roll.total === "number" && Array.isArray(roll.terms);

  return {
    async load() {
      const stored = storage.degraded ? [] : await storage.listRolls().catch(() => []);
      entries = stored.filter(valid).sort((a, b) => b.at - a.at).slice(0, limit);
      notify();
      return entries.length;
    },

    list({ characterId = null, search = "" } = {}) {
      const needle = search.trim().toLowerCase();

      return entries.filter((roll) => {
        if (characterId && roll.characterId !== characterId) {
          return false;
        }

        return !needle || roll.label.toLowerCase().includes(needle) || roll.expression.toLowerCase().includes(needle);
      });
    },

    get(id) {
      return entries.find((roll) => roll.id === id) ?? null;
    },

    async add(roll) {
      entries = [roll, ...entries];
      const dropped = entries.slice(limit);
      entries = entries.slice(0, limit);
      notify();

      if (!storage.degraded) {
        await storage.saveRolls({ put: [roll], remove: dropped.map((entry) => entry.id) });
      }
    },

    async clear({ characterId = null } = {}) {
      const removed = entries.filter((roll) => !characterId || roll.characterId === characterId);
      entries = entries.filter((roll) => !removed.includes(roll));
      cleared = removed;
      notify();

      if (!storage.degraded) {
        await storage.saveRolls({ put: [], remove: removed.map((entry) => entry.id) });
      }

      return removed.length;
    },

    async undoClear() {
      if (!cleared?.length) {
        return 0;
      }

      const restored = cleared;
      cleared = null;
      entries = [...entries, ...restored].sort((a, b) => b.at - a.at).slice(0, limit);
      notify();

      if (!storage.degraded) {
        await storage.saveRolls({ put: restored, remove: [] });
      }

      return restored.length;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}
