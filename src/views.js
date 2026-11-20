import { ID_PATTERN as SYSTEM_ID_PATTERN } from "./sheet/template.js";
import { isValidId } from "./utils.js";

/**
 * Pages and routes. The location hash is the only view state (U-5).
 *
 * Hub pages have no character bar. A character route opens one character and one of its pages (U-11).
 */
export const VIEWS = Object.freeze([
  { id: "library", label: "Library", shortcut: "Alt+1", key: "1", description: "Your characters." },
  { id: "data", label: "Data", shortcut: "Alt+2", key: "2", description: "Storage, backup and files." },
  { id: "settings", label: "Settings", shortcut: "Alt+3", key: "3", description: "Appearance, shortcuts and about." },
  { id: "systems", label: "Game systems", shortcut: "Alt+4", key: "4", description: "Create, derive, import and export game systems." },
  { id: "dice", label: "Dice", shortcut: "Alt+5", key: "5", description: "Roll dice with a character's values and keep the log." }
]);

export const DEFAULT_VIEW = "library";

export const CHARACTER_PAGES = Object.freeze([
  { id: "overview", label: "Overview" },
  { id: "sheet", label: "Sheet" },
  { id: "pdf", label: "PDF sheets" }
]);

const HUB_IDS = new Set(VIEWS.map((view) => view.id));
const SUB_IDS = new Set(CHARACTER_PAGES.map((page) => page.id));

export function isHubView(value) {
  return HUB_IDS.has(value);
}

export function isEditorView(value) {
  return value === "character";
}

export function viewForShortcut(key) {
  return VIEWS.find((view) => view.key === key)?.id ?? null;
}

/** `#/character/<id>/<page>` becomes `{ view, id, sub }`; anything unknown is the library. */
export function parseRoute(hash) {
  const parts = String(hash ?? "").replace(/^#\/?/, "").split("?")[0].split("/").filter(Boolean);
  const [head, id, sub] = parts;

  if (isHubView(head) && parts.length === 1) {
    return { view: head, id: null, sub: null };
  }

  if (head === "systems" && parts.length === 2 && SYSTEM_ID_PATTERN.test(id)) {
    return { view: "system", id, sub: null };
  }

  if (head === "character" && isValidId(id)) {
    if (parts.length === 2) {
      return { view: "character", id, sub: "overview" };
    }

    if (parts.length === 3 && SUB_IDS.has(sub)) {
      return { view: "character", id, sub };
    }
  }

  return { view: DEFAULT_VIEW, id: null, sub: null };
}

export function routeHref(view, id = null, sub = "overview") {
  if (view === "character" && id) {
    return sub && sub !== "overview" && SUB_IDS.has(sub) ? `#/character/${id}/${sub}` : `#/character/${id}`;
  }

  if (view === "system" && id) {
    return `#/systems/${id}`;
  }

  return `#/${isHubView(view) ? view : DEFAULT_VIEW}`;
}
