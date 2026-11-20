import { displayName } from "../schema.js";
import { routeHref, viewForShortcut } from "../views.js";
import { icon } from "../ui/dom.js";

const STATE_LABELS = {
  saved: "Saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  error: "Save failed, retrying",
  paused: "Saving paused"
};

const PAGE_TITLES = { library: "Library", data: "Data", settings: "Settings", systems: "Game systems", system: "Game system" };

function isTextTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
    return true;
  }

  return target.tagName === "INPUT" && !["checkbox", "radio", "button", "submit"].includes(target.type);
}

/** Pages, the top bar, global shortcuts and the unload guard. */
export function initShell(ctx) {
  const { store, autosave, router, bus, els } = ctx;
  const pages = document.querySelectorAll(".page");

  els.undo.append(icon("undo"));
  els.redo.append(icon("redo"));
  els.paletteBtn.append(icon("command"));
  els.notice.hidden = !ctx.storage.degraded;

  function updateHistoryButtons() {
    els.undo.disabled = !store.canUndo();
    els.redo.disabled = !store.canRedo();
  }

  function updateTitle() {
    const route = router.current();
    const character = route.view === "character" ? store.getCharacter(route.id) : null;
    const name = character ? displayName(character) : PAGE_TITLES[route.view] ?? "Library";
    document.title = `${name} · Omniscribe`;
  }

  router.onRoute((route, { initial }) => {
    for (const page of pages) {
      page.hidden = page.id !== `page-${route.view}`;
    }

    updateTitle();

    if (!initial) {
      document.querySelector(`#${route.view}-title`)?.focus({ preventScroll: false });
      window.scrollTo(0, 0);
    }
  });

  store.subscribe(() => {
    updateHistoryButtons();
    updateTitle();
  });

  bus.on("save:status", (status) => {
    els.saveState.textContent = STATE_LABELS[status] ?? status;
    els.saveState.dataset.state = status;
  });

  els.undo.addEventListener("click", () => store.undo());
  els.redo.addEventListener("click", () => store.redo());
  els.paletteBtn.addEventListener("click", () => bus.emit("palette:open"));
  els.menuPalette.addEventListener("click", () => bus.emit("palette:open"));
  els.menuShortcuts.addEventListener("click", () => bus.emit("shortcuts:open"));

  const compact = () => window.matchMedia("(max-width: 899px)").matches;
  let open = true;

  function setSidebar(next, { remember = false } = {}) {
    open = next;
    els.sidebar.hidden = !next;
    els.scrim.hidden = !(next && compact());
    els.sidebarToggle.setAttribute("aria-expanded", String(next));
    els.sidebarToggle.setAttribute("aria-label", next ? "Hide navigation" : "Show navigation");
    els.sidebarToggle.title = next ? "Hide navigation" : "Show navigation";

    if (remember && !compact()) {
      ctx.prefs.update({ sidebar: next ? "open" : "closed" });
    }
  }

  function settleSidebar() {
    const preferred = ctx.prefs.get().sidebar;
    setSidebar(compact() ? false : preferred ? preferred === "open" : true);
  }

  els.sidebarToggle.append(icon("menu"));
  settleSidebar();
  window.matchMedia("(max-width: 899px)").addEventListener("change", settleSidebar);
  els.sidebarToggle.addEventListener("click", () => {
    setSidebar(!open, { remember: true });

    if (open && compact()) {
      els.sidebar.querySelector("a, button")?.focus();
    }
  });
  els.scrim.addEventListener("click", () => setSidebar(false));
  bus.on("sidebar:toggle", () => setSidebar(!open, { remember: true }));

  els.sidebar.addEventListener("click", (event) => {
    if (compact() && event.target.closest("a, button")) {
      setSidebar(false);
    }
  });

  els.sidebar.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && compact() && open) {
      setSidebar(false);
      els.sidebarToggle.focus();
    }
  });

  router.onRoute((route) => {
    const current = route.view === "character" ? "library" : route.view === "system" ? "systems" : route.view;

    for (const link of els.sidebar.querySelectorAll("[data-view]")) {
      if (link.dataset.view === current) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) {
      return;
    }

    const modifier = event.ctrlKey || event.metaKey;
    const typing = isTextTarget(event.target);
    const dialogOpen = Boolean(document.querySelector("dialog[open]"));

    if (event.altKey && !modifier) {
      const view = viewForShortcut(event.code.replace("Digit", ""));

      if (view) {
        event.preventDefault();
        router.navigate(routeHref(view));
      }

      return;
    }

    if (modifier && event.key.toLowerCase() === "k") {
      event.preventDefault();

      if (!dialogOpen) {
        bus.emit("palette:open");
      }

      return;
    }

    if (modifier && !typing && !dialogOpen && ["z", "y"].includes(event.key.toLowerCase())) {
      event.preventDefault();

      if (event.key.toLowerCase() === "y" || event.shiftKey) {
        store.redo();
      } else {
        store.undo();
      }

      return;
    }

    if (event.key === "?" && !typing && !dialogOpen && !modifier) {
      event.preventDefault();
      bus.emit("shortcuts:open");
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (autosave.status() !== "saved") {
      event.preventDefault();
    }
  });

  window.addEventListener("pagehide", () => {
    autosave.flush();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      autosave.flush();
    }
  });

  updateHistoryButtons();
}
