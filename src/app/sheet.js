import { createRow, evaluateSheet } from "../sheet/evaluate.js";
import { validateValue } from "../sheet/template.js";
import { diffSystems } from "../sheet/diff.js";
import { reconcileSheet } from "../sheet/evaluate.js";
import { mountSheetPage } from "../ui/sheet.js";
import { h, replace } from "../ui/dom.js";

/** The Sheet page of a character: start, edit values, pools, rows and conditions, rest, change system. */
export function initSheet(ctx) {
  const { store, router, toast, confirm, systems } = ctx;

  function currentId() {
    const route = router.current();
    return route.view === "character" && route.sub === "sheet" ? route.id : null;
  }

  function resolution() {
    const character = store.getCharacter(currentId());
    return character?.sheet ? systems.resolve(character.sheet.template) : null;
  }

  function checked(key, value, field) {
    const verdict = validateValue(field, value);

    if (verdict.ok) {
      store.setSheetValue(currentId(), key, verdict.value);
    }

    return verdict;
  }

  function restoreSheet(id, sheet) {
    store.updateCharacter(id, { sheet });
  }

  const view = mountSheetPage(document.querySelector("#character-sheet"), {
    onStart(ref) {
      const id = currentId();
      const resolved = ref ? systems.resolve(ref) : null;

      if (!resolved?.ok) {
        toast("That system cannot be used.", { tone: "error" });
        return;
      }

      store.startSheet(id, ref, resolved.template);

      if (!store.getCharacter(id)?.systemId) {
        store.updateCharacter(id, { systemId: resolved.template.name });
      }

      toast(`Started a ${resolved.template.name} sheet.`);
    },
    onReviewUpdate() {
      const character = store.getCharacter(currentId());
      const latest = character?.sheet ? systems.latest(character.sheet.template.id) : null;
      const before = character?.sheet ? systems.resolve(character.sheet.template) : null;
      const after = latest ? systems.resolve({ id: character.sheet.template.id, version: latest }) : null;

      if (!before?.ok || !after?.ok) {
        toast("That version cannot be compared.", { tone: "error" });
        return;
      }

      openDiff({ character, before: before.template, after: after.template, ref: { id: character.sheet.template.id, version: latest } });
    },
    onOpenChange() {
      const character = store.getCharacter(currentId());
      view.openChange({ systems: systems.list(), current: character?.sheet ? { id: character.sheet.template.id } : null });
    },
    onCancelChange: () => view.closeChange(),
    async onChangeSystem(ref) {
      const id = currentId();
      const character = store.getCharacter(id);
      const resolved = ref ? systems.resolve(ref) : null;

      if (!character?.sheet || !resolved?.ok) {
        toast("That system cannot be used.", { tone: "error" });
        return;
      }

      const sameSystem = character.sheet.template.id === ref.id && character.sheet.template.version === ref.version;

      if (!sameSystem && !await confirm({
        heading: `Change to ${resolved.template.name}?`,
        body: "Values that the new system does not have are kept aside, not deleted, and return if you switch back. You can undo this right after.",
        confirmLabel: "Change system"
      })) {
        return;
      }

      const before = character.sheet;
      const result = store.changeSystem(id, ref, resolved.template);
      view.closeChange();

      if (result) {
        const kept = result.moved.length;
        toast(`Now following ${resolved.template.name}${kept ? `; ${kept} value${kept === 1 ? "" : "s"} kept aside` : ""}.`, {
          action: { label: "Undo", run: () => restoreSheet(id, before) }
        });
      }
    },
    onValue(key, value) {
      const field = resolution()?.template?.fields.find((entry) => entry.key === key);
      return field ? checked(key, value, field) : { ok: false, reason: "That field is not part of this system" };
    },
    onPool(key, patch, max) {
      const id = currentId();
      const next = {};

      if ("current" in patch) {
        if (!Number.isInteger(patch.current) || patch.current < 0) {
          return;
        }

        next.current = patch.current >= max ? null : patch.current;
      }

      if ("temp" in patch) {
        if (!Number.isInteger(patch.temp) || patch.temp < 0) {
          return;
        }

        next.temp = patch.temp;
      }

      store.setPool(id, key, next);
    },
    onRowAdd(collectionKey) {
      const id = currentId();
      const template = resolution()?.template;

      if (!template) {
        return;
      }

      const row = store.addRow(id, collectionKey, createRow(template, collectionKey));

      if (!row) {
        toast("That list is full.", { tone: "error" });
        return;
      }

      queueMicrotask(() => view.focusRow(collectionKey, row.id));
    },
    onRowRemove(collectionKey, rowId) {
      const id = currentId();
      const removed = store.removeRow(id, collectionKey, rowId);

      if (removed) {
        toast("Row removed.", { action: { label: "Undo", run: () => store.restoreRow(id, collectionKey, removed) } });
      }
    },
    onRowValue(collectionKey, rowId, fieldKey, value) {
      const field = resolution()?.template?.collections.find((entry) => entry.key === collectionKey)?.fields.find((entry) => entry.key === fieldKey);

      if (!field) {
        return { ok: false, reason: "That field is not part of this system" };
      }

      const verdict = validateValue(field, value);

      if (verdict.ok) {
        store.setRowValue(currentId(), collectionKey, rowId, fieldKey, verdict.value);
      }

      return verdict;
    },
    onUses(collectionKey, rowId, fieldKey, delta) {
      const id = currentId();
      const row = store.getCharacter(id)?.sheet?.collections[collectionKey]?.find((entry) => entry.id === rowId);
      const used = Math.max((row?.[fieldKey]?.used ?? 0) + delta, 0);

      store.setRowValue(id, collectionKey, rowId, fieldKey, { used });
    },
    onCondition: (name) => store.toggleCondition(currentId(), name),
    onRest(restId) {
      const id = currentId();
      const template = resolution()?.template;
      const before = store.getCharacter(id)?.sheet;

      if (!template || !before) {
        return;
      }

      store.applyRest(id, restId, template);
      const label = template.rests.find((rest) => rest.id === restId)?.label ?? "Rest";
      toast(`${label} applied.`, { action: { label: "Undo", run: () => restoreSheet(id, before) } });
    }
  });

  const diffDialog = document.querySelector("#diff-dialog");
  const diffBody = document.querySelector("#diff-body");
  let pending = null;

  function openDiff(state) {
    const diff = diffSystems(state.before, state.after);
    const moved = reconcileSheet(state.after, state.character.sheet).moved;
    const word = { added: "Added", removed: "Removed", changed: "Changed" };

    pending = state;
    document.querySelector("#diff-title").textContent = `Move to ${state.after.name}, version ${state.ref.version}?`;
    replace(
      diffBody,
      h("p", { id: "diff-summary", text: diff.empty ? "Nothing that changes a value or a rule differs between these versions." : `${diff.counts.added} added, ${diff.counts.removed} removed, ${diff.counts.changed} changed.` }),
      diff.changes.length
        ? h("ul", { class: "problem-list", id: "diff-list" }, diff.changes.slice(0, 60).map((entry) => h("li", {}, h("strong", { text: `${word[entry.change]} ${entry.kind}` }), ` ${entry.label}`, entry.details.length ? h("span", { class: "muted", text: ` (${entry.details.join("; ")})` }) : null)))
        : null,
      moved.length
        ? h("p", { id: "diff-moved", text: `${moved.length} stored value${moved.length === 1 ? " has" : "s have"} no place in the new version and will be kept aside, not deleted: ${moved.slice(0, 8).join(", ")}${moved.length > 8 ? ", and more" : ""}.` })
        : h("p", { id: "diff-moved", class: "muted", text: "Every stored value still has a place." })
    );
    diffDialog.showModal();
    document.querySelector("#diff-cancel").focus();
  }

  document.querySelector("#diff-cancel").addEventListener("click", () => diffDialog.close("cancel"));
  document.querySelector("#diff-confirm").addEventListener("click", (event) => {
    event.preventDefault();

    if (!pending) {
      return;
    }

    const { character, after, ref } = pending;
    const before = character.sheet;
    const result = store.changeSystem(character.id, ref, after);

    diffDialog.close("confirm");
    pending = null;

    if (result) {
      toast(`Now following ${after.name}, version ${ref.version}.`, { action: { label: "Undo", run: () => restoreSheet(character.id, before) } });
    }
  });

  function show() {
    const id = currentId();

    if (!id) {
      return;
    }

    const character = store.getCharacter(id);

    if (!character) {
      return;
    }

    const resolved = character.sheet ? systems.resolve(character.sheet.template) : null;
    const computed = resolved?.ok ? evaluateSheet(resolved.template, character.sheet) : null;

    const latest = character.sheet ? systems.latest(character.sheet.template.id) : null;
    const update = latest && latest > character.sheet.template.version && systems.resolve({ id: character.sheet.template.id, version: latest }).ok ? { version: latest } : null;

    view.render({ character, systems: systems.list(), resolution: resolved ?? { ok: false, errors: [] }, computed, update });
  }

  router.onRoute(() => show());
  store.subscribe(() => show());
  ctx.bus.on("data:reloaded", () => show());
  ctx.bus.on("systems:changed", () => show());
}
