import { isSortMode } from "./projects.js";

export const PREFS_KEY = "omniscribe:prefs";
export const THEMES = Object.freeze(["dark", "light"]);

export const DEFAULT_PREFS = Object.freeze({ theme: "dark", sort: "recent" });

export function normalizePrefs(raw) {
  return {
    theme: THEMES.includes(raw?.theme) ? raw.theme : DEFAULT_PREFS.theme,
    sort: isSortMode(raw?.sort) ? raw.sort : DEFAULT_PREFS.sort
  };
}

/** `area` is anything with getItem and setItem (localStorage); every call is guarded because it can throw. */
export function loadPrefs(area) {
  try {
    return normalizePrefs(JSON.parse(area.getItem(PREFS_KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(area, prefs) {
  try {
    area.setItem(PREFS_KEY, JSON.stringify(normalizePrefs(prefs)));
    return true;
  } catch {
    return false;
  }
}
