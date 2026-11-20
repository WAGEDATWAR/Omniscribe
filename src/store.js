import { createHistory } from "./history.js";
import { LIMITS } from "./limits.js";
import { createCharacter, createDocument, normalizeCharacter, sameCharacter } from "./schema.js";
import { applyRest as applySheetRest, createSheet, reconcileSheet } from "./sheet/evaluate.js";
import { TEMPLATE_LIMITS } from "./sheet/template.js";

const IMMUTABLE_FIELDS = ["id", "createdAt"];

/**
 * The one writer (A-3). Characters are immutable values, so a history step is a reference to the
 * previous array and dirty tracking is a reference comparison by id (P-10). The store never touches
 * the DOM or storage.
 */
export function createStore({ characters = [], now = Date.now, history = createHistory(), sort = "recent" } = {}) {
  let state = { characters };
  let ui = { search: "", sort, selectedDocumentId: null };
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

  function update(id, patch, { key = null } = {}) {
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
  }

  function updateSheet(id, recipe, key = null) {
    const current = find(id);
    return current?.sheet ? update(id, { sheet: recipe(current.sheet) }, { key }) : null;
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
    updateCharacter: update,
    duplicateCharacter(id) {
      const source = find(id);

      if (!source || state.characters.length >= LIMITS.characters) {
        return null;
      }

      const idMap = new Map();
      const documents = source.documents.map((document) => {
        const copied = createDocument(document, { now: now() });
        idMap.set(document.id, copied.id);
        return { ...copied, addedAt: document.addedAt };
      });

      const copy = createCharacter(
        {
          ...structuredClone(source),
          name: `${source.name || "Unnamed character"} (copy)`,
          documents,
          pdf: { uploadedId: idMap.get(source.pdf.uploadedId) ?? null }
        },
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
    addDocument(characterId, { blobId, name, size }) {
      const current = find(characterId);

      if (!current || current.documents.length >= LIMITS.documents) {
        return null;
      }

      const document = createDocument({ blobId, name, size }, { now: now() });
      update(characterId, { documents: [...current.documents, document] });
      return document;
    },
    renameDocument(characterId, documentId, name) {
      const current = find(characterId);

      if (!current?.documents.some((document) => document.id === documentId)) {
        return null;
      }

      return update(
        characterId,
        { documents: current.documents.map((document) => (document.id === documentId ? { ...document, name } : document)) },
        { key: `${characterId}:doc:${documentId}` }
      );
    },
    removeDocument(characterId, documentId) {
      const current = find(characterId);
      const index = current?.documents.findIndex((document) => document.id === documentId) ?? -1;

      if (index < 0) {
        return null;
      }

      const removedDocument = current.documents[index];
      const wasSheet = current.pdf.uploadedId === documentId;

      update(characterId, { documents: current.documents.filter((document) => document.id !== documentId) });
      return { document: removedDocument, index, wasSheet };
    },
    restoreDocument(characterId, { document, index, wasSheet }) {
      const current = find(characterId);

      if (!current || current.documents.some((item) => item.id === document.id) || current.documents.length >= LIMITS.documents) {
        return null;
      }

      const documents = [...current.documents];
      documents.splice(Math.min(index, documents.length), 0, document);

      return update(characterId, { documents, ...(wasSheet ? { pdf: { uploadedId: document.id } } : {}) });
    },
    setSheetDocument(characterId, documentId) {
      return update(characterId, { pdf: { uploadedId: documentId } });
    },
    setPortrait(characterId, blobId) {
      return update(characterId, { portraitBlobId: blobId });
    },
    selectDocument(documentId) {
      ui = { ...ui, selectedDocumentId: documentId };
      emit("ui");
    },
    startSheet(characterId, ref, template) {
      return find(characterId) ? update(characterId, { sheet: { template: { id: ref.id, version: ref.version }, ...createSheet(template) } }) : null;
    },
    changeSystem(characterId, ref, template) {
      const current = find(characterId);

      if (!current?.sheet) {
        return null;
      }

      const { sheet, moved, restored } = reconcileSheet(template, current.sheet);
      const next = update(characterId, { sheet: { ...sheet, template: { id: ref.id, version: ref.version } } });
      return next ? { character: next, moved, restored } : null;
    },
    setSheetValue(characterId, key, value) {
      return updateSheet(characterId, (sheet) => ({ ...sheet, values: { ...sheet.values, [key]: value } }), `${characterId}:v:${key}`);
    },
    setPool(characterId, poolKey, patch) {
      return updateSheet(
        characterId,
        (sheet) => ({ ...sheet, pools: { ...sheet.pools, [poolKey]: { current: null, temp: 0, ...(sheet.pools[poolKey] ?? {}), ...patch } } }),
        `${characterId}:p:${poolKey}`
      );
    },
    addRow(characterId, collectionKey, row) {
      const rows = find(characterId)?.sheet?.collections[collectionKey] ?? [];

      if (rows.length >= TEMPLATE_LIMITS.rows) {
        return null;
      }

      return updateSheet(characterId, (sheet) => ({ ...sheet, collections: { ...sheet.collections, [collectionKey]: [...rows, row] } })) ? row : null;
    },
    setRowValue(characterId, collectionKey, rowId, field, value) {
      return updateSheet(
        characterId,
        (sheet) => ({
          ...sheet,
          collections: {
            ...sheet.collections,
            [collectionKey]: (sheet.collections[collectionKey] ?? []).map((row) => (row.id === rowId ? { ...row, [field]: value } : row))
          }
        }),
        `${characterId}:r:${collectionKey}:${rowId}:${field}`
      );
    },
    removeRow(characterId, collectionKey, rowId) {
      const rows = find(characterId)?.sheet?.collections[collectionKey] ?? [];
      const index = rows.findIndex((row) => row.id === rowId);

      if (index < 0) {
        return null;
      }

      updateSheet(characterId, (sheet) => ({ ...sheet, collections: { ...sheet.collections, [collectionKey]: rows.filter((row) => row.id !== rowId) } }));
      return { row: rows[index], index };
    },
    restoreRow(characterId, collectionKey, { row, index }) {
      const rows = find(characterId)?.sheet?.collections[collectionKey];

      if (!rows || rows.some((item) => item.id === row.id) || rows.length >= TEMPLATE_LIMITS.rows) {
        return null;
      }

      const next = [...rows];
      next.splice(Math.min(index, next.length), 0, row);
      return updateSheet(characterId, (sheet) => ({ ...sheet, collections: { ...sheet.collections, [collectionKey]: next } })) ? row : null;
    },
    toggleCondition(characterId, name) {
      return updateSheet(characterId, (sheet) => ({
        ...sheet,
        conditions: sheet.conditions.some((entry) => entry.name === name)
          ? sheet.conditions.filter((entry) => entry.name !== name)
          : [...sheet.conditions, { name, note: "" }]
      }));
    },
    applyRest(characterId, restId, template) {
      return updateSheet(characterId, (sheet) => applySheetRest(template, sheet, restId));
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
