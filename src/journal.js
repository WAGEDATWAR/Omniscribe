/** Pure journal ordering and filtering. */
export function sortEntries(entries) {
  const order = new Map(entries.map((entry, index) => [entry.id, index]));
  return [...entries].sort((left, right) => (right.date || "").localeCompare(left.date || "") || order.get(right.id) - order.get(left.id));
}

export function filterEntries(entries, { query = "", kind = "", tag = "" } = {}) {
  const needle = query.trim().toLowerCase();

  return entries.filter(
    (entry) =>
      (!kind || entry.kind === kind) &&
      (!tag || entry.tags.some((item) => item.toLowerCase() === tag.toLowerCase())) &&
      (!needle || `${entry.title}\n${entry.text}`.toLowerCase().includes(needle))
  );
}

export function openGoalsFirst(entries) {
  return [...entries].sort((left, right) => Number(right.kind === "goal" && !right.done) - Number(left.kind === "goal" && !left.done));
}
