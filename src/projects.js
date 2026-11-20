import { STATUS_LABELS, displayName } from "./schema.js";
import { routeHref } from "./views.js";

export const SORT_MODES = Object.freeze([
  { id: "recent", label: "Recently edited" },
  { id: "name", label: "Name" },
  { id: "created", label: "Newest first" }
]);

export function isSortMode(value) {
  return SORT_MODES.some((mode) => mode.id === value);
}

const EXCERPT_LENGTH = 140;

export function toLibraryItem(character) {
  const subtitle = [character.player, character.systemId].map((part) => part.trim()).filter(Boolean).join(" · ");
  const summary = character.summary.trim();

  return {
    kind: "character",
    id: character.id,
    name: displayName(character),
    subtitle,
    status: character.status,
    statusLabel: STATUS_LABELS[character.status],
    tags: character.tags,
    excerpt: summary.length > EXCERPT_LENGTH ? `${summary.slice(0, EXCERPT_LENGTH - 1)}…` : summary,
    createdAt: character.createdAt,
    updatedAt: character.updatedAt,
    href: routeHref("character", character.id),
    haystack: [character.name, character.player, character.systemId, character.summary, ...character.tags]
      .join("\n")
      .toLowerCase()
  };
}

export function filterItems(items, { query = "" } = {}) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  if (!words.length) {
    return items;
  }

  return items.filter((item) => words.every((word) => item.haystack.includes(word)));
}

export function sortItems(items, mode = "recent") {
  const sorted = [...items];

  if (mode === "name") {
    return sorted.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
  }

  if (mode === "created") {
    return sorted.sort((left, right) => right.createdAt - left.createdAt);
  }

  return sorted.sort((left, right) => right.updatedAt - left.updatedAt);
}

export function buildLibrary(characters, { query = "", sort = "recent" } = {}) {
  const all = characters.map(toLibraryItem);
  return { total: all.length, items: sortItems(filterItems(all, { query }), sort) };
}
