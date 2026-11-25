import { buildArchive, planAdd, readArchive, sha256Hex, verifyFiles } from "../backup.js";
import { mergeLayouts } from "../layouts/migrate.js";
import { referencedBlobIds } from "../integrity.js";
import { LIMITS } from "../limits.js";
import { createId, formatBytes, plural } from "../utils.js";
import { saveFile } from "./download.js";

const stamp = (value) => new Date(value).toLocaleString();

/** Backup and restore on the Data page (X-3, X-4). Returns the handlers the page needs. */
export function createBackupHandlers(ctx, getView, refresh) {
  const { store, storage, autosave, guard, toast, confirm } = ctx;
  let pending = null;

  async function snapshot() {
    await autosave.flush();
    const { characters, campaigns } = await storage.load();
    const wanted = referencedBlobIds(characters, campaigns);
    const blobs = [];

    for (const id of wanted) {
      const record = await storage.getBlob(id);

      if (record?.data) {
        blobs.push({ id, type: record.type, addedAt: record.addedAt, bytes: new Uint8Array(await record.data.arrayBuffer()) });
      }
    }

    return buildArchive({ characters, campaigns, systems: await storage.listSystems(), layouts: ctx.layouts.all(), blobs, appVersion: ctx.version });
  }

  async function review(bytes) {
    const archive = await readArchive(bytes);
    const bad = await verifyFiles(archive);
    const { counts } = archive.manifest;
    const problems = [...archive.problems, ...bad.map((id) => `The file ${id} is damaged and will be left out.`)];

    return {
      archive,
      bad: new Set(bad),
      info: {
        kind: archive.manifest.kind ?? "backup",
        replaceAllowed: (archive.manifest.kind ?? "backup") === "backup",
        created: Number.isFinite(archive.manifest.createdAt) ? stamp(archive.manifest.createdAt) : "Unknown",
        contents: [plural(archive.characters.length, "character"), plural(archive.campaigns.length, "campaign"), plural(archive.systems.length, "game system"), plural(counts?.blobs ?? archive.files.size, "file")].join(", "),
        schemaVersion: archive.manifest.schemaVersion,
        problems
      }
    };
  }

  async function chooseFile(file) {
    const view = getView();
    view.showMessage("");
    view.showReview(null);
    pending = null;

    if (file.size > LIMITS.zipInflatedBytes) {
      view.showMessage("That file is too large to be a backup.");
      return;
    }

    try {
      pending = await review(new Uint8Array(await file.arrayBuffer()));
      view.showReview(pending.info);
    } catch (error) {
      view.showMessage(error?.name === "ZipError" ? `Could not read this file. ${error.message}` : "Could not read this file.");
    }
  }

  async function loadBlobs(plan, archive) {
    const blobs = [];

    for (const entry of plan.blobs) {
      const bytes = await archive.readFile(entry.from);

      if (bytes) {
        blobs.push({ id: entry.to, type: entry.meta.type, addedAt: entry.meta.addedAt, data: new Blob([bytes], { type: entry.meta.type }) });
      }
    }

    return blobs;
  }

  async function replace(archive, bad) {
    const plan = planAdd(archive, { badFiles: bad, createId });
    const blobs = await loadBlobs(plan, archive);
    const safety = await snapshot();

    await storage.putSafetyBackup(new Blob([safety.bytes], { type: "application/zip" }));
    const savedAt = await storage.replaceLibrary({ characters: plan.characters, campaigns: plan.campaigns, systems: plan.systems, layouts: plan.layouts, blobs });
    store.replaceAll(plan.characters, plan.campaigns);
    guard.notifySaved(savedAt);
    toast("Restored. Reloading…");
    location.hash = "#/library";
    setTimeout(() => location.reload(), 600);
  }

  async function add(archive, bad) {
    const state = store.getState();

    if (state.characters.length + archive.characters.length > LIMITS.characters || state.campaigns.length + archive.campaigns.length > LIMITS.campaigns) {
      getView().showMessage("Adding this backup would go past the limit on characters or campaigns.");
      return false;
    }

    const stored = await storage.listBlobs();
    const existingBlobs = new Map();

    for (const meta of archive.files.values()) {
      for (const candidate of stored.filter((entry) => entry.size === meta.size && !existingBlobs.has(meta.hash))) {
        const record = await storage.getBlob(candidate.id);

        if (record?.data && (await sha256Hex(new Uint8Array(await record.data.arrayBuffer()))) === meta.hash) {
          existingBlobs.set(meta.hash, candidate.id);
        }
      }
    }

    const plan = planAdd(archive, {
      characterIds: new Set(state.characters.map((entry) => entry.id)),
      campaignIds: new Set(state.campaigns.map((entry) => entry.id)),
      blobIds: new Set(stored.map((entry) => entry.id)),
      existingBlobs,
      badFiles: bad,
      createId
    });
    const have = new Set((await storage.listSystems()).map((file) => `${file.id}@${file.version}`));
    const newSystems = plan.systems.filter((file) => !have.has(`${file.id}@${file.version}`));

    await storage.putBlobs(await loadBlobs(plan, archive));

    for (const file of newSystems) {
      await storage.putSystem(file);
    }

    store.addMany(plan.characters, plan.campaigns);
    await ctx.layouts.replaceAll(mergeLayouts(ctx.layouts.all(), plan.layouts));
    await autosave.flush();
    toast(`Added ${plural(plan.characters.length, "character")} and ${plural(plan.campaigns.length, "campaign")}. Undo removes them.`);

    if (newSystems.length) {
      toast("New game systems were added. Reloading…");
      setTimeout(() => location.reload(), 800);
    }

    return true;
  }

  async function go(mode) {
    if (!pending) {
      return;
    }

    const { archive, bad } = pending;
    const view = getView();

    if (mode === "replace" && !pending.info.replaceAllowed) {
      mode = "add";
    }

    view.showMessage("");

    try {
      if (mode === "replace") {
        const confirmed = await confirm({
          heading: "Replace everything?",
          body: `Your ${plural(store.getState().characters.length, "character")} and ${plural(store.getState().campaigns.length, "campaign")} here will be swapped for the backup. A safety copy is kept so you can go back.`,
          confirmLabel: "Replace",
          danger: true
        });

        if (!confirmed) {
          return;
        }

        await replace(archive, bad);
      } else if (!(await add(archive, bad))) {
        return;
      }

      pending = null;
      view.showReview(null);
    } catch {
      view.showMessage("The restore failed. Nothing was replaced; try again, or restore from another copy.");
    }

    refresh();
  }

  return {
    async onBackup() {
      try {
        const { bytes } = await snapshot();
        saveFile(new Blob([bytes], { type: "application/zip" }), `omniscribe-backup-${new Date().toISOString().slice(0, 10)}.zip`);
        await storage.setMeta("lastBackupAt", Date.now());
        toast(`Backup made (${formatBytes(bytes.length)}).`);
        refresh();
      } catch {
        toast("Could not make a backup.", { tone: "error" });
      }
    },
    onRestoreFile: chooseFile,
    onRestoreGo: go,
    onRestoreCancel() {
      pending = null;
      getView().showReview(null);
      getView().showMessage("");
    },
    async onRestorePrevious() {
      const saved = await storage.getSafetyBackup();

      if (!saved?.data) {
        return;
      }

      try {
        pending = await review(new Uint8Array(await saved.data.arrayBuffer()));
        await go("replace");
      } catch {
        getView().showMessage("Could not read the safety copy.");
      }
    }
  };
}
