import { campaignListOf } from "../campaigns.js";
import { checkExpression } from "../dice/presets.js";
import { canContain } from "../inventory.js";
import { KIND_IDS, kindOf } from "../records/kinds.js";
import { listOf } from "../records/normalize.js";
import { mountRecordPage } from "../ui/records.js";
import { createCampaignKindUi } from "./campaignKinds.js";
import { createKindUi } from "./recordKinds.js";

/**
 * One controller for every record page (C-11, K-3): it mounts a page per kind from its descriptor, validates what
 * the descriptor cannot, and writes only through the store. An adapter says whose records they are (a character's
 * or a campaign's) and which store methods write them, so adding a kind is a descriptor, a root and a hook entry.
 */
function mountKinds(ctx, adapter, kindIds, kindUi) {
  const { toast } = ctx;
  const views = new Map();

  function check(kindId, fields, editingId, records) {
    const kind = kindOf(kindId);

    if (kind.fields.find((spec) => spec.required) && !String(fields[kind.title] ?? "").trim()) {
      return { ok: false, reason: `Give the ${kind.noun} a ${kind.fields.find((spec) => spec.key === kind.title).label.toLowerCase()}` };
    }

    if (!editingId && records.length >= kind.limit) {
      return { ok: false, reason: `A ${adapter.noun} can keep ${kind.limit} ${kind.nouns}` };
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

    return adapter.check?.(kindId, fields, editingId, records) ?? { ok: true };
  }

  function prepare(kindId, fields) {
    const next = { ...fields };

    if (kindId === "relations") {
      if (next.targetType === "character" && next.targetId) {
        const target = ctx.store.getCharacter(next.targetId);
        next.targetName = next.targetName.trim() || target?.name || "Unnamed character";
      } else {
        next.targetId = null;
      }
    }

    if (kindId === "inventory" && !next.isContainer) {
      next.weightMultiplier = 1;
    }

    return adapter.prepare?.(kindId, next) ?? next;
  }

  for (const kindId of kindIds) {
    const kind = kindOf(kindId);
    const root = document.querySelector(`#${adapter.rootPrefix}-${kindId}`);

    if (!root) {
      continue;
    }

    const handlers = {
      onSave(fields, editingId) {
        const id = adapter.currentId();
        const owner = adapter.get(id);

        if (!owner) {
          return { ok: false, reason: `That ${adapter.noun} is no longer here` };
        }

        const records = adapter.list(owner, kindId);
        const verdict = check(kindId, fields, editingId, records);

        if (!verdict.ok) {
          return verdict;
        }

        const prepared = prepare(kindId, fields);

        if (editingId) {
          adapter.update(id, kindId, editingId, prepared);
        } else {
          adapter.add(id, kindId, prepared);
        }

        toast(`Saved ${String(prepared[kind.title] ?? "").trim() || kind.noun}.`);
        return { ok: true };
      },
      onUpdate(recordId, patch, key) {
        adapter.update(adapter.currentId(), kindId, recordId, patch, { key });
      },
      onDelete(recordId) {
        const id = adapter.currentId();
        const removed = adapter.remove(id, kindId, recordId);

        if (!removed) {
          return;
        }

        const name = (kindUi[kindId]?.title ? kindUi[kindId].title(removed.record, adapter.get(id)) : String(removed.record[kind.title] ?? "").trim()) || `that ${kind.noun}`;
        const moved = removed.moved ? ` Its ${removed.moved === 1 ? "contents were" : `${removed.moved} contents were`} moved out.` : "";
        toast(`Deleted ${name}.${moved}`, { action: { label: "Undo", run: () => adapter.restore(id, kindId, removed.before) } });
        kindUi[kindId]?.afterRemove?.(removed.record);
      },
      onMove(recordId, delta) {
        adapter.move(adapter.currentId(), kindId, recordId, delta);
      },
      onRefresh: () => render(kindId),
      layout: () => ctx.layouts.resolved(kindId)
    };

    views.set(kindId, mountRecordPage(root, kind, { ...(kindUi[kindId] ?? {}), layoutEditor: ctx.layoutEditor }, handlers));
  }

  function render(kindId) {
    const route = ctx.router.current();
    const owner = route.view === adapter.view ? adapter.get(route.id) : null;

    if (owner && route.sub === (adapter.subs?.[kindId] ?? kindId)) {
      views.get(kindId)?.render(owner, adapter.list(owner, kindId));
    }
  }

  function renderCurrent() {
    const sub = ctx.router.current().sub;

    for (const kindId of views.keys()) {
      if ((adapter.subs?.[kindId] ?? kindId) === sub) {
        render(kindId);
      }
    }
  }

  ctx.router.onRoute(() => renderCurrent());
  ctx.bus.on("records:refresh", () => renderCurrent());
  ctx.bus.on("layouts:changed", () => renderCurrent());
  ctx.bus.on("layout:editing", () => renderCurrent());
  ctx.store.subscribe(() => renderCurrent());
  return views;
}

export function initRecords(ctx) {
  const { store, router } = ctx;
  const characterId = () => {
    const route = router.current();
    return route.view === "character" ? route.id : null;
  };
  const campaignId = () => {
    const route = router.current();
    return route.view === "campaign" ? route.id : null;
  };

  mountKinds(
    ctx,
    {
      view: "character",
      noun: "character",
      rootPrefix: "character",
      currentId: characterId,
      get: store.getCharacter,
      list: listOf,
      add: store.addRecord,
      update: store.updateRecord,
      remove: store.removeRecord,
      restore: store.restoreList,
      move: store.moveRecord
    },
    KIND_IDS,
    createKindUi({ ...ctx, currentId: characterId })
  );

  const campaignAdapter = {
    view: "campaign",
    noun: "campaign",
    rootPrefix: "campaign",
    subs: { partyColumns: "party" },
    currentId: campaignId,
    get: store.getCampaign,
    list: campaignListOf,
    add: store.addCampaignRecord,
    update: store.updateCampaignRecord,
    remove: store.removeCampaignRecord,
    restore: store.restoreCampaignList,
    move: store.moveCampaignRecord
  };

  const campaignUi = createCampaignKindUi({ ...ctx, currentId: campaignId, adapter: campaignAdapter });
  campaignAdapter.check = campaignUi.check;
  campaignAdapter.prepare = campaignUi.prepare;
  mountKinds(ctx, campaignAdapter, ["roster", "sessions", "handouts", "partyColumns"], campaignUi.kinds);
}
