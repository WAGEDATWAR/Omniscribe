/**
 * Pure initiative order and turns (K-5, K-6). Entries are stored in the order they were added; the turn order is
 * derived: value descending, then tiebreak descending, then the order added. `turn` indexes that derived order.
 */
export function orderEntries(entries) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => right.entry.value - left.entry.value || right.entry.tiebreak - left.entry.tiebreak || left.index - right.index)
    .map(({ entry }) => entry);
}

export function currentEntry(initiative) {
  if (!initiative) {
    return null;
  }

  return orderEntries(initiative.entries)[initiative.turn] ?? null;
}

/** Marks the current entry as having taken its turn and moves on; after the last entry a new round begins. */
export function nextTurn(initiative) {
  const ordered = orderEntries(initiative.entries);

  if (!ordered.length) {
    return initiative;
  }

  const current = ordered[initiative.turn];

  if (initiative.turn + 1 >= ordered.length) {
    return { round: initiative.round + 1, turn: 0, entries: initiative.entries.map((entry) => ({ ...entry, done: false })) };
  }

  return { ...initiative, turn: initiative.turn + 1, entries: initiative.entries.map((entry) => (entry.id === current.id ? { ...entry, done: true } : entry)) };
}

/** Steps back one turn, reopening that entry; before the first turn it returns to the last turn of the previous round. */
export function previousTurn(initiative) {
  const ordered = orderEntries(initiative.entries);

  if (!ordered.length) {
    return initiative;
  }

  if (initiative.turn > 0) {
    const target = ordered[initiative.turn - 1];
    return { ...initiative, turn: initiative.turn - 1, entries: initiative.entries.map((entry) => (entry.id === target.id ? { ...entry, done: false } : entry)) };
  }

  if (initiative.round <= 1) {
    return initiative;
  }

  const last = ordered[ordered.length - 1];
  return { round: initiative.round - 1, turn: ordered.length - 1, entries: initiative.entries.map((entry) => ({ ...entry, done: entry.id !== last.id })) };
}

/** Whether any turn has been taken yet; before that the top of the order is always the current turn. */
export function hasStarted(initiative) {
  return initiative.round > 1 || initiative.turn > 0 || initiative.entries.some((entry) => entry.done);
}

/** Moves `turn` so it still points at the entry with `id` after the order changed, once the fight has begun. */
export function keepTurnOn(initiative, id) {
  if (!hasStarted(initiative)) {
    return { ...initiative, turn: 0 };
  }

  const index = orderEntries(initiative.entries).findIndex((entry) => entry.id === id);
  return index < 0 ? initiative : { ...initiative, turn: index };
}

/** Swaps the tiebreak of an entry with its neighbour among entries that tie on value, so Up and Down reorder a tie. */
export function moveWithinTie(entries, id, delta) {
  const ordered = orderEntries(entries);
  const index = ordered.findIndex((entry) => entry.id === id);
  const neighbour = ordered[index + delta];

  if (index < 0 || !neighbour || neighbour.value !== ordered[index].value) {
    return entries;
  }

  const mine = ordered[index];
  const target = delta < 0 ? neighbour.tiebreak + 1 : neighbour.tiebreak - 1;
  const bump = (entry) => (entry.id === id ? { ...entry, tiebreak: Math.max(-1000, Math.min(1000, target)) } : entry);
  const result = entries.map(bump);
  return orderEntries(result).findIndex((entry) => entry.id === mine.id) === index + delta ? result : entries;
}
