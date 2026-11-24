import { describeChange, expiredRevisions, deletedCharacters, makeRevision, planRevisions, sessionDue, signatureOf } from "../revisions.js";
import { normalizeCharacter } from "../schema.js";
import { createId } from "../utils.js";

const stamp = (value) => new Date(value).toLocaleString();

/**
 * Revisions of one character at a time (P-6, P-7, X-7). It keeps the last saved state of every character as a
 * baseline and, when a new editing session begins, stores that baseline before the save overwrites it.
 */
export function createRevisions(ctx) {
  const { store, storage, bus } = ctx;
  const baseline = new Map();
  const lastAt = new Map();
  let list = [];

  function changed() {
    bus.emit("revisions:changed");
  }

  async function keep(character, label = "") {
    const revision = makeRevision(character, { id: createId("rev"), at: Date.now(), label });
    const plan = planRevisions(list, revision);

    if (!plan.add && !plan.remove.length) {
      return false;
    }

    await storage.saveRevisions({ put: plan.add ? [plan.add] : [], remove: plan.remove });
    list = [...list.filter((entry) => !plan.remove.includes(entry.id)), ...(plan.add ? [plan.add] : [])];
    changed();
    return Boolean(plan.add);
  }

  return {
    async init() {
      if (storage.degraded) {
        return;
      }

      try {
        list = await storage.listRevisions();
        const gone = expiredRevisions(list, store.getState().characters.map((entry) => entry.id), Date.now());

        if (gone.length) {
          await storage.saveRevisions({ remove: gone });
          list = list.filter((entry) => !gone.includes(entry.id));
        }
      } catch {
        list = [];
      }

      for (const character of store.getState().characters) {
        baseline.set(character.id, character);
      }
    },
    /** Called with each autosave batch before it is written; never blocks the save. */
    async beforeSave(batch) {
      try {
        const now = Date.now();

        for (const character of batch.upserts ?? []) {
          const before = baseline.get(character.id);

          if (before && sessionDue(lastAt.get(character.id), now) && signatureOf(before) !== signatureOf(character)) {
            await keep(before);
            lastAt.set(character.id, now);
          }

          if (!before) {
            lastAt.set(character.id, now);
          }

          baseline.set(character.id, character);
        }

        for (const id of batch.deletedIds ?? []) {
          const before = baseline.get(id);

          if (before) {
            await keep(before, "Before it was deleted");
            baseline.delete(id);
          }
        }
      } catch {
        // A failed snapshot must never stop a save.
      }
    },
    async snapshot(id, label) {
      const character = store.getCharacter(id);
      return character ? keep(character, label) : false;
    },
    async restore(id, revisionId) {
      const revision = list.find((entry) => entry.id === revisionId);
      const current = store.getCharacter(id);

      if (!revision || !current || revision.characterId !== id) {
        return false;
      }

      await keep(current, `Before restoring ${stamp(revision.at)}`);
      return Boolean(store.restoreCharacterState(id, revision.data));
    },
    describeWhen: (revisionId) => stamp(list.find((entry) => entry.id === revisionId)?.at ?? Date.now()),
    rowsFor(id) {
      const current = store.getCharacter(id);

      return list
        .filter((entry) => entry.characterId === id)
        .sort((a, b) => b.at - a.at)
        .map((entry) => ({ id: entry.id, when: stamp(entry.at), label: entry.label, change: describeChange(entry.data, current) }));
    },
    all: () => list,
    deleted() {
      return deletedCharacters(list, store.getState().characters.map((entry) => entry.id)).map((entry) => ({ id: entry.id, name: entry.data?.name?.trim() || "Unnamed character", when: stamp(entry.at) }));
    },
    bringBack(revisionId) {
      const revision = list.find((entry) => entry.id === revisionId);

      if (!revision) {
        return null;
      }

      return store.restoreCharacter(normalizeCharacter({ ...revision.data, updatedAt: Date.now() }, { now: Date.now() }));
    }
  };
}
