import { findOrphanBlobs } from "../integrity.js";
import { SCHEMA_VERSION } from "../migrations.js";
import { largestFiles, quotaLevel } from "../quota.js";
import { checkPersistence, estimateUsage, requestPersistence } from "../storage.js";
import { mountDataPage } from "../ui/data.js";
import { formatBytes, plural } from "../utils.js";
import { createBackupHandlers } from "./backup.js";
import { collectUnusedFiles } from "./maintenance.js";

export function initData(ctx) {
  const { store, storage, router, toast } = ctx;

  let view = null;
  const backup = createBackupHandlers(ctx, () => view, () => refresh());

  view = mountDataPage(document.querySelector("#page-data"), {
    ...backup,
    async onPersist() {
      const result = await requestPersistence();

      toast(
        result.persisted
          ? "Storage is now protected."
          : "The browser declined. It usually grants this once the app is installed or used often.",
        { tone: result.persisted ? "info" : "error" }
      );

      refresh();
    },
    async onCleanup() {
      try {
        const { characters, campaigns } = await storage.load();
        const removed = await collectUnusedFiles({ storage, characters, campaigns, graceMs: 0 });
        const bytes = removed.reduce((total, blob) => total + (blob.size ?? 0), 0);

        toast(removed.length ? `Removed ${plural(removed.length, "unused file")} (${formatBytes(bytes)}).` : "There were no unused files.");
      } catch {
        toast("Could not remove unused files.", { tone: "error" });
      }

      refresh();
    }
  });

  async function refresh() {
    const [persistence, usage, blobs, stored, lastBackupAt, savedAt, safety] = await Promise.all([
      checkPersistence(),
      estimateUsage(),
      storage.blobUsage(),
      storage.listBlobs(),
      storage.meta("lastBackupAt"),
      storage.meta("savedAt"),
      storage.getSafetyBackup()
    ]);
    const unused = findOrphanBlobs(store.getState().characters, stored, { graceMs: 0, campaigns: store.getState().campaigns });

    if (router.current().view !== "data") {
      return;
    }

    view.render({
      backend: storage.name,
      degraded: storage.degraded,
      persistence,
      usage,
      blobs,
      unused: { count: unused.length, bytes: unused.reduce((total, blob) => total + (blob.size ?? 0), 0) },
      characters: store.getState().characters.length,
      schemaVersion: SCHEMA_VERSION,
      quota: quotaLevel(usage.usage, usage.quota),
      largest: largestFiles(stored, store.getState().characters, store.getState().campaigns),
      lastBackup: lastBackupAt ? new Date(lastBackupAt).toLocaleString() : null,
      changedSince: Boolean(lastBackupAt && savedAt && savedAt > lastBackupAt)
    });
    view.showPrevious(safety ? { at: new Date(safety.at).toLocaleString(), size: formatBytes(safety.size ?? 0) } : null);
  }

  router.onRoute((route) => {
    if (route.view === "data") {
      refresh();
    }
  });
}
