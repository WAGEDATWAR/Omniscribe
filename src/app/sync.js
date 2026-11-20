import { peerSaveAction } from "../tabGuard.js";

/**
 * One writer tab (P-11). When another tab saves, a tab with nothing unsaved reloads quietly from
 * storage; a tab with unsaved edits pauses saving and asks, so nothing is overwritten silently.
 */
export function initSync(ctx) {
  const { store, storage, autosave, guard, toast, els } = ctx;
  const dialog = els.staleDialog;
  let asking = false;

  async function reloadFromStorage() {
    const loaded = await storage.load();
    store.replaceAll(loaded.characters, loaded.campaigns);
    ctx.bus.emit("data:reloaded");
  }

  dialog.addEventListener("cancel", (event) => event.preventDefault());

  dialog.addEventListener("close", async () => {
    asking = false;

    try {
      if (dialog.returnValue === "keep") {
        autosave.resume();
        await autosave.flush();
      } else {
        store.replaceAll(store.getState().characters);
        autosave.resume();
      }

      await reloadFromStorage();
      toast(dialog.returnValue === "keep" ? "Your changes were saved and merged." : "Loaded the other tab's changes.");
    } catch {
      toast("Could not reload from storage.", { tone: "error" });
    }
  });

  return {
    async handlePeerSaved() {
      if (asking) {
        return;
      }

      const action = peerSaveAction({ dirty: store.hasDirty(), status: autosave.status() });

      if (action === "reload") {
        try {
          await reloadFromStorage();
          toast("Updated with changes from another tab.");
        } catch {
          toast("Could not read changes from another tab.", { tone: "error" });
        }

        return;
      }

      asking = true;
      autosave.pause();
      dialog.showModal();
    }
  };
}
