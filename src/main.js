import { createActions } from "./app/actions.js";
import { createBus } from "./app/bus.js";
import { initCharacter } from "./app/character.js";
import { initData } from "./app/data.js";
import { initLibrary } from "./app/library.js";
import { initPalette } from "./app/palette.js";
import { createRouter } from "./app/router.js";
import { initSettings } from "./app/settings.js";
import { initShell } from "./app/shell.js";
import { initShortcuts } from "./app/shortcuts.js";
import { initSync } from "./app/sync.js";
import { applyTheme } from "./app/theme.js";
import { createAutosave } from "./autosave.js";
import { loadPrefs, savePrefs } from "./settings.js";
import { openStorage, requestPersistence } from "./storage.js";
import { createStore } from "./store.js";
import { createTabGuard } from "./tabGuard.js";
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
  const store = createStore({ characters: loaded.characters, sort: current.sort });
  let sync = null;

  const guard = createTabGuard({
    channelFactory: typeof BroadcastChannel === "function" ? (name) => new BroadcastChannel(name) : null,
    onPeerSaved: () => sync?.handlePeerSaved()
  });

  const autosave = createAutosave({
    store,
    save: async (batch) => {
      guard.notifySaved(await storage.save(batch));
    },
    onStatus: (status) => bus.emit("save:status", status)
  });

  const ctx = {
    store,
    storage,
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
      menu: query("#app-menu"),
      menuPalette: query("#menu-palette"),
      menuShortcuts: query("#menu-shortcuts"),
      paletteDialog: query("#palette-dialog"),
      shortcutsDialog: query("#shortcuts-dialog"),
      staleDialog: query("#stale-dialog")
    }
  };

  ctx.actions = createActions(ctx);
  sync = initSync(ctx);

  initShell(ctx);
  initLibrary(ctx);
  initCharacter(ctx);
  initData(ctx);
  initSettings(ctx);
  initShortcuts(ctx);
  initPalette(ctx);

  autosave.start();

  if (loaded.migrated) {
    store.markAllDirty();
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

boot();
