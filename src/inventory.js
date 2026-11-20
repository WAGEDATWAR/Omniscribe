/**
 * Pure inventory maths (C-2): containers, carried weight and wallets. No DOM, no storage.
 * An item is `{ id, quantity, weight, isContainer, weightMultiplier, containerId, ... }`.
 */

function byId(items) {
  return new Map(items.map((item) => [item.id, item]));
}

/** Whether `item` can sit inside `container`: a container, not itself, and not one of its own descendants. */
export function canContain(items, containerId, itemId) {
  const lookup = byId(items);
  const container = lookup.get(containerId);

  if (!container || !container.isContainer) {
    return { ok: false, reason: "That item is not a container" };
  }

  if (containerId === itemId) {
    return { ok: false, reason: "An item cannot be inside itself" };
  }

  const seen = new Set();

  for (let current = container; current; current = lookup.get(current.containerId)) {
    if (current.id === itemId) {
      return { ok: false, reason: "A container cannot be placed inside something it holds" };
    }

    if (seen.has(current.id)) {
      break;
    }

    seen.add(current.id);
  }

  return { ok: true };
}

/** Makes every `containerId` legal: it must name a container that exists and form no loop. Used on stored data. */
export function repairContainers(items) {
  const lookup = byId(items);

  const legal = items.map((item) => {
    const parent = item.containerId ? lookup.get(item.containerId) : null;
    return parent && parent.isContainer && parent.id !== item.id ? item : { ...item, containerId: null };
  });

  const fixed = byId(legal);

  return legal.map((original) => {
    const item = fixed.get(original.id);
    const seen = new Set([item.id]);

    for (let parent = fixed.get(item.containerId); parent; parent = fixed.get(parent.containerId)) {
      if (seen.has(parent.id)) {
        const freed = { ...item, containerId: null };
        fixed.set(item.id, freed);
        return freed;
      }

      seen.add(parent.id);
    }

    return item;
  });
}

/** Moves the contents of a removed container out to carried (G-8) and returns the new list and how many moved. */
export function withoutContainer(items, id) {
  const removed = items.find((item) => item.id === id);

  if (!removed) {
    return { items, moved: 0 };
  }

  let moved = 0;

  const next = items
    .filter((item) => item.id !== id)
    .map((item) => {
      if (item.containerId === id) {
        moved += 1;
        return { ...item, containerId: removed.containerId ?? null };
      }

      return item;
    });

  return { items: next, moved };
}

/** Weight of one item row including everything inside it, scaled by container multipliers. */
export function itemWeight(items, id, seen = new Set()) {
  const item = items.find((entry) => entry.id === id);

  if (!item || seen.has(id)) {
    return 0;
  }

  seen.add(id);
  let inside = 0;

  for (const child of items) {
    if (child.containerId === id) {
      inside += itemWeight(items, child.id, seen);
    }
  }

  return item.quantity * (item.weight + inside * (item.isContainer ? item.weightMultiplier : 1));
}

/** Everything the character carries: the sum over items not inside any container. */
export function carriedWeight(items) {
  const known = new Set(items.map((item) => item.id));
  const total = items
    .filter((item) => !item.containerId || !known.has(item.containerId))
    .reduce((sum, item) => sum + itemWeight(items, item.id), 0);

  return Math.round(total * 1000) / 1000;
}

export function totalValue(items) {
  return items.reduce((sum, item) => sum + item.quantity * item.value, 0);
}

export function attunedCount(items) {
  return items.filter((item) => item.attuned).length;
}

/** `+25`, `-3` or `40` applied to a wallet amount. Returns `{ ok, value }` or `{ ok: false, reason }`; never below zero. */
export function applyDelta(current, text) {
  const source = String(text ?? "").trim();

  if (!/^[+-]?\d{1,15}$/.test(source)) {
    return { ok: false, reason: "Type a whole number, such as +25 or -3" };
  }

  const relative = /^[+-]/.test(source);
  const next = relative ? current + Number(source) : Number(source);

  if (next < 0) {
    return { ok: false, reason: "A wallet cannot go below zero" };
  }

  return { ok: true, value: Math.min(next, 1e12) };
}
