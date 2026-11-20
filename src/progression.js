/** Pure progression summaries. The log never edits the sheet by itself (C-8). */
export function xpTotal(entries) {
  return entries.filter((entry) => entry.kind === "xp" && entry.delta !== null).reduce((sum, entry) => sum + entry.delta, 0);
}

/** The most recently recorded level change, or null. Entries are stored oldest first. */
export function lastLevel(entries) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].kind === "level" && entries[index].delta !== null) {
      return entries[index].delta;
    }
  }

  return null;
}

export function newestFirst(entries) {
  return [...entries].sort((left, right) => (right.date || "").localeCompare(left.date || "") || right.at - left.at);
}
