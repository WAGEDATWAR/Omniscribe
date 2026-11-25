import { createActions } from "./app/actions.js";
import { createLayoutEditorController } from "./app/layoutEditor.js";
import { createLayouts } from "./app/layouts.js";
import { createBus } from "./app/bus.js";
import { createBlobUrls } from "./app/blobs.js";
import { createBundles } from "./app/bundles.js";
import { createRevisions } from "./app/revisions.js";
import { initCampaign } from "./app/campaign.js";
import { initCharacter } from "./app/character.js";
import { createRolling } from "./app/rolling.js";
import { initData } from "./app/data.js";
import { initDice } from "./app/dice.js";
import { initDocuments } from "./app/documents.js";
import { collectUnusedFiles } from "./app/maintenance.js";
import { initLibrary } from "./app/library.js";
import { initPalette } from "./app/palette.js";
import { initInitiative } from "./app/initiative.js";
import { initParty } from "./app/party.js";
import { initRecords } from "./app/records.js";
import { initRolls } from "./app/rolls.js";
import { initSheet } from "./app/sheet.js";
import { createRouter } from "./app/router.js";
import { initSettings } from "./app/settings.js";
import { mountReferencePage } from "./ui/reference.js";
import { initShell } from "./app/shell.js";
import { initShortcuts } from "./app/shortcuts.js";
import { initSync } from "./app/sync.js";
import { initSystems } from "./app/systems.js";
import { applyTheme } from "./app/theme.js";
import { createAutosave } from "./autosave.js";
import { loadPrefs, savePrefs } from "./settings.js";
import { estimateUsage, openStorage, requestPersistence } from "./storage.js";
import { fitsInQuota } from "./quota.js";
import { formatBytes } from "./utils.js";
import { createStore } from "./store.js";
import { createRegistry } from "./systems.js";
import { createTabGuard } from "./tabGuard.js";
import { BUILTIN_FILES } from "./templates/index.js";
import { createConfirm, createToaster } from "./ui/feedback.js";

const query = (selector) => document.querySelector(selector);

function preferenceArea() {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => { throw new Error("Storage is blocked."); } };
  }
}

function showFatal(message) {
  query("#fatal-message").textContent = message;
  query("#fatal").hidden = false;
  query("#main").hidden = true;
}

async function loadBuiltins() {
  try {
    return await Promise.all(BUILTIN_FILES.map((name) => fetch(new URL(`./templates/${name}.json`, import.meta.url)).then((response) => {
      if (!response.ok) {
        throw new Error(`Could not load ${name}`);
      }

      return response.json();
    })));
  } catch {
    return [];
  }
}

async function boot() {
  const area = preferenceArea();
  let current = loadPrefs(area);

  applyTheme(current.theme);

  let storage;
  let loaded;

  try {
    storage = await openStorage();
    loaded = await storage.load();
  } catch (error) {
    showFatal(
      error?.code === "newer"
        ? `${error.message} Update Omniscribe to open it; nothing was changed.`
        : "Omniscribe could not read its stored data. Nothing was changed."
    );
    return;
  }

  const systems = createRegistry({
    builtins: await loadBuiltins(),
    custom: storage.degraded ? [] : await storage.listSystems().catch(() => [])
  });
  const bus = createBus();
  const router = createRouter();
  const toast = createToaster(query("#toasts"));
  const confirm = createConfirm({
    dialog: query("#confirm-dialog"),
    title: query("#confirm-title"),
    message: query("#confirm-message"),
    ok: query("#confirm-ok"),
    cancel: query("#confirm-cancel")
  });
  const store = createStore({ characters: loaded.characters, campaigns: loaded.campaigns, sort: current.sort });
  let sync = null;

  const guard = createTabGuard({
    channelFactory: typeof BroadcastChannel === "function" ? (name) => new BroadcastChannel(name) : null,
    onPeerSaved: () => sync?.handlePeerSaved()
  });

  const revisions = createRevisions({ store, storage, bus, getLayouts: () => ctx.layouts });
  await revisions.init();

  const autosave = createAutosave({
    store,
    save: async (batch) => {
      await revisions.beforeSave(batch);
      guard.notifySaved(await storage.save(batch));
    },
    onStatus: (status) => bus.emit("save:status", status)
  });

  const ctx = {
    store,
    storage,
    blobUrls: createBlobUrls(storage),
    systems,
    revisions,
    room: async (size) => {
      const { usage, quota } = await estimateUsage();
      return fitsInQuota(usage, quota, size)
        ? { ok: true }
        : { ok: false, message: `Storage is nearly full (${formatBytes(usage)} of ${formatBytes(quota)}). Make a backup, then remove large files on the Data page.` };
    },
    autosave,
    guard,
    router,
    bus,
    toast,
    confirm,
    version: document.querySelector('meta[name="app-version"]')?.content ?? "unknown",
    prefs: {
      get: () => current,
      update(patch) {
        current = { ...current, ...patch };
        savePrefs(area, current);
      }
    },
    els: {
      undo: query("#undo-btn"),
      redo: query("#redo-btn"),
      paletteBtn: query("#palette-btn"),
      saveState: query("#save-state"),
      notice: query("#storage-notice"),
      sidebar: query("#sidebar"),
      sidebarToggle: query("#sidebar-toggle"),
      scrim: query("#sidebar-scrim"),
      menuPalette: query("#menu-palette"),
      menuShortcuts: query("#menu-shortcuts"),
      paletteDialog: query("#palette-dialog"),
      shortcutsDialog: query("#shortcuts-dialog"),
      staleDialog: query("#stale-dialog")
    }
  };

  ctx.layouts = createLayouts(ctx, loaded.layouts, (await storage.meta("layoutActive")) ?? {});
  ctx.layoutEditor = createLayoutEditorController(ctx);
  ctx.actions = createActions(ctx);
  ctx.bundles = createBundles(ctx);
  ctx.rolling = createRolling(ctx);
  await ctx.rolling.log.load();
  sync = initSync(ctx);

  initShell(ctx);
  initLibrary(ctx);
  initCharacter(ctx);
  initCampaign(ctx);
  initSheet(ctx);
  initRolls(ctx);
  initParty(ctx);
  initInitiative(ctx);
  initRecords(ctx);
  initSystems(ctx);
  initDice(ctx);
  initDocuments(ctx);
  initData(ctx);
  initSettings(ctx);
  mountReferencePage(document.querySelector("#page-reference"));
  initShortcuts(ctx);
  initPalette(ctx);

  autosave.start();

  if (loaded.migrated) {
    store.markAllDirty();
  }

  if (!storage.degraded) {
    collectUnusedFiles({ storage, characters: loaded.characters, campaigns: loaded.campaigns }).catch(() => {});
  }

  guard.announce();
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) {
      guard.close();
    }
  });
  router.start();
  requestPersistence();
}

if ("serviceWorker" in navigator && globalThis.location?.protocol?.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

boot();
