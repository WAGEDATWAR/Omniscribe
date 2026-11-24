import { findOrphanBlobs, repairLibrary } from "../integrity.js";
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

  let lastCheck = null;

  async function runCheck() {
    const state = store.getState();
    const [blobs, revisions] = await Promise.all([storage.listBlobs(), storage.listRevisions()]);
    const result = repairLibrary(state.characters, state.campaigns, new Set(blobs.map((blob) => blob.id)));
    const orphans = findOrphanBlobs(state.characters, blobs, { graceMs: 0, campaigns: state.campaigns, revisions });
    lastCheck = { result, orphans };
    return { findings: result.findings, orphans: orphans.length };
  }

  view = mountDataPage(document.querySelector("#page-data"), {
    ...backup,
    async onCheck() {
      try {
        view.showCheck(await runCheck());
      } catch {
        toast("Could not check the library.", { tone: "error" });
      }
    },
    async onRepair() {
      try {
        const fresh = await runCheck();
        const { result, orphans } = lastCheck;

        for (const id of result.touchedCharacters) {
          await ctx.revisions.snapshot(id, "Before repair");
        }

        if (result.findings.length) {
          store.applyRepair(result.characters, result.campaigns);
          await ctx.autosave.flush();
        }

        if (orphans.length) {
          await storage.deleteBlobs(orphans.map((blob) => blob.id));
        }

        toast(fresh.findings.length || orphans.length ? `Repaired ${fresh.findings.length} problem${fresh.findings.length === 1 ? "" : "s"}${orphans.length ? ` and removed ${orphans.length} unused file${orphans.length === 1 ? "" : "s"}` : ""}.` : "Nothing needed repair.");
        view.showCheck(await runCheck());
      } catch {
        toast("The repair failed; nothing was half-applied that you can see.", { tone: "error" });
      }

      refresh();
    },
    onBringBack(revisionId) {
      const character = ctx.revisions.bringBack(revisionId);
      toast(character ? "Brought back. Undo removes it again." : "Could not bring it back.", { tone: character ? "info" : "error" });
      refresh();
    },
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
    const unused = findOrphanBlobs(store.getState().characters, stored, { graceMs: 0, campaigns: store.getState().campaigns, revisions: ctx.revisions.all() });

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
    view.showDeleted(ctx.revisions.deleted());
    view.showPrevious(safety ? { at: new Date(safety.at).toLocaleString(), size: formatBytes(safety.size ?? 0) } : null);
  }

  const importInput = document.querySelector("#import-input");

  ctx.bus.on("import:choose", () => importInput.click());
  importInput.addEventListener("change", () => {
    const file = importInput.files?.[0];
    importInput.value = "";

    if (file) {
      router.navigate("#/data");
      backup.onRestoreFile(file);
    }
  });

  router.onRoute((route) => {
    if (route.view === "data") {
      refresh();
    }
  });
}
