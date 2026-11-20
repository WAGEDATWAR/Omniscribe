import { checkExpression } from "../dice/presets.js";
import { canContain } from "../inventory.js";
import { KINDS, KIND_IDS } from "../records/kinds.js";
import { listOf } from "../records/normalize.js";
import { mountRecordPage } from "../ui/records.js";
import { createKindUi } from "./recordKinds.js";

/**
 * One controller for every record page (C-11): it mounts a page per kind from its descriptor, validates what the
 * descriptor cannot, and writes only through the store. Adding a kind is a descriptor, a root and a hook entry.
 */
export function initRecords(ctx) {
  const { store, router, toast } = ctx;

  function currentId() {
    const route = router.current();
    return route.view === "character" ? route.id : null;
  }

  const kindUi = createKindUi({ ...ctx, currentId });
  const views = new Map();

  function check(kindId, fields, editingId, records) {
    const kind = KINDS[kindId];

    if (kind.fields.find((spec) => spec.required) && !String(fields[kind.title] ?? "").trim()) {
      return { ok: false, reason: `Give the ${kind.noun} a ${kind.fields.find((spec) => spec.key === kind.title).label.toLowerCase()}` };
    }

    if (!editingId && records.length >= kind.limit) {
      return { ok: false, reason: `A character can keep ${kind.limit} ${kind.nouns}` };
    }

    if (kindId === "inventory" && fields.containerId) {
      const verdict = canContain(records, fields.containerId, editingId ?? "");

      if (!verdict.ok) {
        return verdict;
      }
    }

    if (kindId === "abilities" && fields.expression.trim()) {
      const verdict = checkExpression(fields.expression);

      if (!verdict.ok) {
        return verdict;
      }
    }

    return { ok: true };
  }

  function prepare(kindId, fields) {
    const next = { ...fields };

    if (kindId === "relations") {
      if (next.targetType === "character" && next.targetId) {
        const target = store.getCharacter(next.targetId);
        next.targetName = next.targetName.trim() || target?.name || "Unnamed character";
      } else {
        next.targetId = null;
      }
    }

    if (kindId === "inventory" && !next.isContainer) {
      next.weightMultiplier = 1;
    }

    return next;
  }

  for (const kindId of KIND_IDS) {
    const kind = KINDS[kindId];
    const root = document.querySelector(`#character-${kindId}`);

    if (!root) {
      continue;
    }

    const handlers = {
      onSave(fields, editingId) {
        const id = currentId();
        const character = store.getCharacter(id);

        if (!character) {
          return { ok: false, reason: "That character is no longer here" };
        }

        const records = listOf(character, kindId);
        const verdict = check(kindId, fields, editingId, records);

        if (!verdict.ok) {
          return verdict;
        }

        const prepared = prepare(kindId, fields);

        if (editingId) {
          store.updateRecord(id, kindId, editingId, prepared);
        } else {
          store.addRecord(id, kindId, prepared);
        }

        toast(`Saved ${String(prepared[kind.title] ?? "").trim() || kind.noun}.`);
        return { ok: true };
      },
      onUpdate(recordId, patch, key) {
        store.updateRecord(currentId(), kindId, recordId, patch, { key });
      },
      onDelete(recordId) {
        const id = currentId();
        const removed = store.removeRecord(id, kindId, recordId);

        if (!removed) {
          return;
        }

        const name = String(removed.record[kind.title] ?? "").trim() || `that ${kind.noun}`;
        const moved = removed.moved ? ` Its ${removed.moved === 1 ? "contents were" : `${removed.moved} contents were`} moved out.` : "";
        toast(`Deleted ${name}.${moved}`, { action: { label: "Undo", run: () => store.restoreList(id, kindId, removed.before) } });
      },
      onMove(recordId, delta) {
        store.moveRecord(currentId(), kindId, recordId, delta);
      },
      onRefresh: () => render(kindId)
    };

    views.set(kindId, mountRecordPage(root, kind, kindUi[kindId] ?? {}, handlers));
  }

  function render(kindId) {
    const route = router.current();
    const character = route.view === "character" ? store.getCharacter(route.id) : null;

    if (character && route.sub === kindId) {
      views.get(kindId)?.render(character, listOf(character, kindId));
    }
  }

  function renderCurrent() {
    const sub = router.current().sub;

    if (views.has(sub)) {
      render(sub);
    }
  }

  router.onRoute(() => renderCurrent());
  store.subscribe(() => renderCurrent());
}
