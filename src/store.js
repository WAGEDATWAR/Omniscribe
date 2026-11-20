import { createHistory } from "./history.js";
import { LIMITS } from "./limits.js";
import { createCharacter, normalizeCharacter, sameCharacter } from "./schema.js";

const IMMUTABLE_FIELDS = ["id", "createdAt"];

/**
 * The one writer (A-3). Characters are immutable values, so a history step is a reference to the
 * previous array and dirty tracking is a reference comparison by id (P-10). The store never touches
 * the DOM or storage.
 */
export function createStore({ characters = [], now = Date.now, history = createHistory(), sort = "recent" } = {}) {
  let state = { characters };
  let ui = { search: "", sort };
  const listeners = new Set();
  const dirty = new Set();
  const removed = new Set();

  function emit(type) {
    for (const listener of [...listeners]) {
      listener({ type });
    }
  }

  function markDiff(previous, next) {
    const before = new Map(previous.map((character) => [character.id, character]));
    const after = new Map(next.map((character) => [character.id, character]));

    for (const [id, character] of after) {
      if (before.get(id) !== character) {
        dirty.add(id);
        removed.delete(id);
      }
    }

    for (const id of before.keys()) {
      if (!after.has(id)) {
        removed.add(id);
        dirty.delete(id);
      }
    }
  }

  function commit(next, { key = null, track = true } = {}) {
    if (next === state.characters) {
      return false;
    }

    if (track) {
      history.record(state.characters, { key, at: now() });
    }

    markDiff(state.characters, next);
    state = { ...state, characters: next };
    emit("change");
    return true;
  }

  function find(id) {
    return state.characters.find((character) => character.id === id) ?? null;
  }

  return {
    getState: () => state,
    getUi: () => ui,
    getCharacter: find,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    addCharacter(fields = {}) {
      if (state.characters.length >= LIMITS.characters) {
        return null;
      }

      const character = createCharacter(fields, { now: now() });
      commit([...state.characters, character]);
      return character;
    },
    updateCharacter(id, patch, { key = null } = {}) {
      const current = find(id);

      if (!current) {
        return null;
      }

      const merged = { ...current, ...patch };

      for (const field of IMMUTABLE_FIELDS) {
        merged[field] = current[field];
      }

      const next = normalizeCharacter({ ...merged, updatedAt: now() }, { now: now() });

      if (sameCharacter(current, next)) {
        return current;
      }

      commit(state.characters.map((character) => (character.id === id ? next : character)), { key });
      return next;
    },
    duplicateCharacter(id) {
      const source = find(id);

      if (!source || state.characters.length >= LIMITS.characters) {
        return null;
      }

      const copy = createCharacter(
        { ...structuredClone(source), name: `${source.name || "Unnamed character"} (copy)` },
        { now: now() }
      );

      commit([...state.characters, copy]);
      return copy;
    },
    deleteCharacter(id) {
      const current = find(id);

      if (!current) {
        return null;
      }

      commit(state.characters.filter((character) => character.id !== id));
      return current;
    },
    restoreCharacter(character) {
      if (!character || find(character.id) || state.characters.length >= LIMITS.characters) {
        return null;
      }

      commit([...state.characters, character]);
      return character;
    },
    undo() {
      const previous = history.undo(state.characters);

      if (!previous) {
        return false;
      }

      commit(previous, { track: false });
      emit("history");
      return true;
    },
    redo() {
      const next = history.redo(state.characters);

      if (!next) {
        return false;
      }

      commit(next, { track: false });
      emit("history");
      return true;
    },
    canUndo: () => history.canUndo(),
    canRedo: () => history.canRedo(),
    replaceAll(characters) {
      state = { ...state, characters };
      dirty.clear();
      removed.clear();
      history.clear();
      emit("change");
    },
    markAllDirty() {
      for (const character of state.characters) {
        dirty.add(character.id);
      }

      emit("change");
    },
    hasDirty: () => dirty.size > 0 || removed.size > 0,
    takeDirty() {
      const upserts = [...dirty].map(find).filter(Boolean);
      const deletedIds = [...removed];

      dirty.clear();
      removed.clear();
      return { upserts, deletedIds };
    },
    restoreDirty({ upserts, deletedIds }) {
      for (const character of upserts) {
        if (find(character.id)) {
          dirty.add(character.id);
        }
      }

      for (const id of deletedIds) {
        if (!find(id)) {
          removed.add(id);
        }
      }
    },
    setSearch(search) {
      ui = { ...ui, search: String(search).slice(0, LIMITS.searchLength) };
      emit("ui");
    },
    setSort(mode) {
      ui = { ...ui, sort: mode };
      emit("ui");
    }
  };
}
