import { createHistory } from "./history.js";
import { LIMITS } from "./limits.js";
import { campaignListOf, campaignListPatch, campaignName, createCampaign, normalizeCampaign, relinkCharacter, sameCampaign, withoutCharacter } from "./campaigns.js";
import { withoutContainer } from "./inventory.js";
import { kindOf } from "./records/kinds.js";
import { createRecord, listOf, listPatch } from "./records/normalize.js";
import { RECORD_HOOKS, createCharacter, createDocument, normalizeCharacter, sameCharacter } from "./schema.js";
import { applyRest as applySheetRest, createSheet, reconcileSheet } from "./sheet/evaluate.js";
import { TEMPLATE_LIMITS } from "./sheet/template.js";

const IMMUTABLE_FIELDS = ["id", "createdAt"];

/**
 * The one writer (A-3). Characters are immutable values, so a history step is a reference to the
 * previous array and dirty tracking is a reference comparison by id (P-10). The store never touches
 * the DOM or storage.
 */
export function createStore({ characters = [], campaigns = [], now = Date.now, history = createHistory(), sort = "recent" } = {}) {
  let state = { characters, campaigns };
  let ui = { search: "", sort, selectedDocumentId: null };
  const listeners = new Set();
  const dirty = new Set();
  const removed = new Set();
  const campaignDirty = new Set();
  const campaignRemoved = new Set();

  function emit(type) {
    for (const listener of [...listeners]) {
      listener({ type });
    }
  }

  function markDiff(previous, next, dirtySet, removedSet) {
    const before = new Map(previous.map((record) => [record.id, record]));
    const after = new Map(next.map((record) => [record.id, record]));

    for (const [id, record] of after) {
      if (before.get(id) !== record) {
        dirtySet.add(id);
        removedSet.delete(id);
      }
    }

    for (const id of before.keys()) {
      if (!after.has(id)) {
        removedSet.add(id);
        dirtySet.delete(id);
      }
    }
  }

  function commitAll(nextCharacters, nextCampaigns, { key = null, track = true } = {}) {
    if (nextCharacters === state.characters && nextCampaigns === state.campaigns) {
      return false;
    }

    if (track) {
      history.record({ characters: state.characters, campaigns: state.campaigns }, { key, at: now() });
    }

    markDiff(state.characters, nextCharacters, dirty, removed);
    markDiff(state.campaigns, nextCampaigns, campaignDirty, campaignRemoved);
    state = { ...state, characters: nextCharacters, campaigns: nextCampaigns };
    emit("change");
    return true;
  }

  function commit(next, options) {
    return commitAll(next, state.campaigns, options);
  }

  function find(id) {
    return state.characters.find((character) => character.id === id) ?? null;
  }

  function findCampaign(id) {
    return state.campaigns.find((campaign) => campaign.id === id) ?? null;
  }

  function updateCampaign(id, patch, { key = null } = {}) {
    const current = findCampaign(id);

    if (!current) {
      return null;
    }

    const next = normalizeCampaign({ ...current, ...patch, id: current.id, createdAt: current.createdAt, updatedAt: now() }, { now: now() });

    if (sameCampaign(current, next)) {
      return current;
    }

    commitAll(state.characters, state.campaigns.map((campaign) => (campaign.id === id ? next : campaign)), { key });
    return next;
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
    getCampaign: findCampaign,
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

      commitAll(
        state.characters.filter((character) => character.id !== id),
        state.campaigns.map((campaign) => withoutCharacter(campaign, id))
      );
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
      const current = find(characterId);

      if (!current?.sheet) {
        return null;
      }

      const abilities = current.abilities.map((ability) => (ability.uses.resetOn === restId && ability.uses.used ? { ...ability, uses: { ...ability.uses, used: 0 } } : ability));
      return update(characterId, { sheet: applySheetRest(template, current.sheet, restId), abilities });
    },
    addRecord(characterId, kindId, fields = {}) {
      const current = find(characterId);
      const kind = kindOf(kindId);

      if (!current || !kind || listOf(current, kindId).length >= kind.limit) {
        return null;
      }

      const record = createRecord(kindId, fields, { now: now(), hooks: RECORD_HOOKS });
      update(characterId, listPatch(current, kindId, [...listOf(current, kindId), record]));
      return record;
    },
    updateRecord(characterId, kindId, recordId, patch, { key = null } = {}) {
      const current = find(characterId);
      const list = current ? listOf(current, kindId) : [];

      if (!list.some((record) => record.id === recordId)) {
        return null;
      }

      update(characterId, listPatch(current, kindId, list.map((record) => (record.id === recordId ? { ...record, ...patch } : record))), {
        key: key ? `${characterId}:${kindId}:${recordId}:${key}` : null
      });

      return listOf(find(characterId), kindId).find((record) => record.id === recordId) ?? null;
    },
    removeRecord(characterId, kindId, recordId) {
      const current = find(characterId);
      const before = current ? listOf(current, kindId) : [];
      const index = before.findIndex((record) => record.id === recordId);

      if (index < 0) {
        return null;
      }

      const record = before[index];
      let after = before.filter((entry) => entry.id !== recordId);
      let moved = 0;

      if (kindId === "inventory") {
        ({ items: after, moved } = withoutContainer(before, recordId));
      }

      update(characterId, listPatch(current, kindId, after));
      return { record, index, before, moved };
    },
    promoteFamiliar(characterId, familiarId) {
      const current = find(characterId);
      const familiar = current?.familiars.find((entry) => entry.id === familiarId);

      if (!familiar || state.characters.length >= LIMITS.characters) {
        return null;
      }

      const made = createCharacter({ name: familiar.name, summary: familiar.kind, notes: familiar.notes, portraitBlobId: familiar.portraitBlobId, sheet: familiar.sheet }, { now: now() });
      const linked = normalizeCharacter(
        { ...current, familiars: current.familiars.map((entry) => (entry.id === familiarId ? { ...entry, linkedCharacterId: made.id } : entry)), updatedAt: now() },
        { now: now() }
      );

      commit([...state.characters.map((character) => (character.id === characterId ? linked : character)), made]);
      return made;
    },
    addCampaign(fields = {}) {
      if (state.campaigns.length >= LIMITS.campaigns) {
        return null;
      }

      const campaign = createCampaign(fields, { now: now() });
      commitAll(state.characters, [...state.campaigns, campaign]);
      return campaign;
    },
    updateCampaign,
    duplicateCampaign(id) {
      const source = findCampaign(id);

      if (!source || state.campaigns.length >= LIMITS.campaigns) {
        return null;
      }

      const copy = createCampaign({ ...structuredClone(source), name: `${campaignName(source)} (copy)`, initiative: null }, { now: now() });
      commitAll(state.characters, [...state.campaigns, copy]);
      return copy;
    },
    deleteCampaign(id) {
      const current = findCampaign(id);

      if (!current) {
        return null;
      }

      commitAll(state.characters, state.campaigns.filter((campaign) => campaign.id !== id));
      return current;
    },
    restoreCampaign(campaign) {
      if (!campaign || findCampaign(campaign.id) || state.campaigns.length >= LIMITS.campaigns) {
        return null;
      }

      commitAll(state.characters, [...state.campaigns, campaign]);
      return campaign;
    },
    addCampaignRecord(campaignId, kindId, fields = {}) {
      const current = findCampaign(campaignId);
      const kind = kindOf(kindId);

      if (!current || !kind || campaignListOf(current, kindId).length >= kind.limit) {
        return null;
      }

      const record = createRecord(kindId, fields, { now: now(), hooks: RECORD_HOOKS });
      updateCampaign(campaignId, campaignListPatch(current, kindId, [...campaignListOf(current, kindId), record]));
      return record;
    },
    updateCampaignRecord(campaignId, kindId, recordId, patch, { key = null } = {}) {
      const current = findCampaign(campaignId);
      const list = current ? campaignListOf(current, kindId) : [];

      if (!list.some((record) => record.id === recordId)) {
        return null;
      }

      updateCampaign(campaignId, campaignListPatch(current, kindId, list.map((record) => (record.id === recordId ? { ...record, ...patch } : record))), {
        key: key ? `${campaignId}:${kindId}:${recordId}:${key}` : null
      });

      return campaignListOf(findCampaign(campaignId), kindId).find((record) => record.id === recordId) ?? null;
    },
    removeCampaignRecord(campaignId, kindId, recordId) {
      const current = findCampaign(campaignId);
      const before = current ? campaignListOf(current, kindId) : [];
      const index = before.findIndex((record) => record.id === recordId);

      if (index < 0) {
        return null;
      }

      updateCampaign(campaignId, campaignListPatch(current, kindId, before.filter((record) => record.id !== recordId)));
      return { record: before[index], index, before };
    },
    restoreCampaignList(campaignId, kindId, list) {
      const current = findCampaign(campaignId);
      return current ? updateCampaign(campaignId, campaignListPatch(current, kindId, list)) : null;
    },
    moveCampaignRecord(campaignId, kindId, recordId, delta) {
      const current = findCampaign(campaignId);
      const list = current ? [...campaignListOf(current, kindId)] : [];
      const from = list.findIndex((record) => record.id === recordId);
      const to = from + delta;

      if (from < 0 || to < 0 || to >= list.length) {
        return null;
      }

      [list[from], list[to]] = [list[to], list[from]];
      return updateCampaign(campaignId, campaignListPatch(current, kindId, list));
    },
    restoreList(characterId, kindId, list) {
      const current = find(characterId);
      return current ? update(characterId, listPatch(current, kindId, list)) : null;
    },
    moveRecord(characterId, kindId, recordId, delta) {
      const current = find(characterId);
      const list = current ? [...listOf(current, kindId)] : [];
      const from = list.findIndex((record) => record.id === recordId);
      const to = from + delta;

      if (from < 0 || to < 0 || to >= list.length) {
        return null;
      }

      [list[from], list[to]] = [list[to], list[from]];
      return update(characterId, listPatch(current, kindId, list));
    },
    setWallet(characterId, currency, amount, { key = null } = {}) {
      const current = find(characterId);
      return current
        ? update(characterId, { inventory: { ...current.inventory, wallets: { ...current.inventory.wallets, [currency]: amount } } }, { key: key ? `${characterId}:wallet:${currency}` : null })
        : null;
    },
    removeWallet(characterId, currency) {
      const current = find(characterId);

      if (!current || !(currency in current.inventory.wallets)) {
        return null;
      }

      const { [currency]: _gone, ...rest } = current.inventory.wallets;
      return update(characterId, { inventory: { ...current.inventory, wallets: rest } });
    },
    restoreCharacter(character, { campaigns: before = [] } = {}) {
      if (!character || find(character.id) || state.characters.length >= LIMITS.characters) {
        return null;
      }

      const relinked = state.campaigns.map((campaign) => {
        const old = before.find((entry) => entry.id === campaign.id);
        return old ? relinkCharacter(campaign, old, character.id) : campaign;
      });

      commitAll([...state.characters, character], relinked);
      return character;
    },
    undo() {
      const previous = history.undo({ characters: state.characters, campaigns: state.campaigns });

      if (!previous) {
        return false;
      }

      commitAll(previous.characters, previous.campaigns, { track: false });
      emit("history");
      return true;
    },
    redo() {
      const next = history.redo({ characters: state.characters, campaigns: state.campaigns });

      if (!next) {
        return false;
      }

      commitAll(next.characters, next.campaigns, { track: false });
      emit("history");
      return true;
    },
    canUndo: () => history.canUndo(),
    canRedo: () => history.canRedo(),
    addMany(characters = [], campaigns = []) {
      return commitAll([...state.characters, ...characters], [...state.campaigns, ...campaigns]);
    },
    replaceAll(characters, campaigns = state.campaigns) {
      state = { ...state, characters, campaigns };
      dirty.clear();
      removed.clear();
      campaignDirty.clear();
      campaignRemoved.clear();
      history.clear();
      emit("change");
    },
    markAllDirty() {
      for (const character of state.characters) {
        dirty.add(character.id);
      }

      for (const campaign of state.campaigns) {
        campaignDirty.add(campaign.id);
      }

      emit("change");
    },
    hasDirty: () => dirty.size > 0 || removed.size > 0 || campaignDirty.size > 0 || campaignRemoved.size > 0,
    takeDirty() {
      const upserts = [...dirty].map(find).filter(Boolean);
      const deletedIds = [...removed];
      const campaignUpserts = [...campaignDirty].map(findCampaign).filter(Boolean);
      const campaignDeletedIds = [...campaignRemoved];

      dirty.clear();
      removed.clear();
      campaignDirty.clear();
      campaignRemoved.clear();
      return { upserts, deletedIds, campaignUpserts, campaignDeletedIds };
    },
    restoreDirty({ upserts, deletedIds, campaignUpserts = [], campaignDeletedIds = [] }) {
      for (const campaign of campaignUpserts) {
        if (findCampaign(campaign.id)) {
          campaignDirty.add(campaign.id);
        }
      }

      for (const id of campaignDeletedIds) {
        if (!findCampaign(id)) {
          campaignRemoved.add(id);
        }
      }

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
