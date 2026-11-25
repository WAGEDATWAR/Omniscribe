import { LAYOUT_LIMITS } from "../layouts/limits.js";
import { ownDefinitions, resolveLayout } from "../layouts/resolve.js";
import { SURFACE_IDS } from "../layouts/surfaces.js";
import { createId } from "../utils.js";

/**
 * The layouts of the library (L-1, L-3): one active layout per page, resolved on demand. The pages ask for
 * `resolved(surface)`; editing adds operations and saves the list. Nothing else holds layout state.
 */
export const DEFAULT_CHOICE = "default";

export function createLayouts({ storage, bus }, initial = [], initialActive = {}) {
  let list = initial.filter((layout) => layout && typeof layout.id === "string");
  let chosen = { ...initialActive };
  const cache = new Map();

  /** The layout a page uses: the one chosen, else the first of its page; "default" means no layout. */
  const activeOf = (surface) => {
    if (chosen[surface] === DEFAULT_CHOICE) {
      return null;
    }

    return list.find((layout) => layout.id === chosen[surface] && layout.surface === surface) ?? list.find((layout) => layout.surface === surface) ?? null;
  };

  async function persist() {
    cache.clear();

    if (!storage.degraded) {
      await storage.saveLayouts(list);
      await storage.setMeta("layoutActive", chosen);
    }

    bus.emit("layouts:changed");
  }

  return {
    all: () => list,
    forSurface: (surface) => list.filter((layout) => layout.surface === surface),
    choice: (surface) => activeOf(surface)?.id ?? DEFAULT_CHOICE,
    /** Switches a page to a layout by id, or to the default. */
    async choose(surface, id) {
      chosen = { ...chosen, [surface]: id === DEFAULT_CHOICE || list.some((layout) => layout.id === id && layout.surface === surface) ? id : DEFAULT_CHOICE };
      await persist();
    },
    /** Makes a new layout for a page, starting from the one in use or empty, and switches to it. */
    async create(surface, name, { copy = true } = {}) {
      const id = createId("lay");
      const from = copy ? activeOf(surface) : null;

      list = [...list, { id, name: name.trim().slice(0, LAYOUT_LIMITS.name) || "My layout", surface, base: "default", ops: from ? [...from.ops] : [] }];
      chosen = { ...chosen, [surface]: id };
      await persist();
      return id;
    },
    async rename(id, name) {
      const text = name.trim().slice(0, LAYOUT_LIMITS.name);

      if (text) {
        list = list.map((layout) => (layout.id === id ? { ...layout, name: text } : layout));
        await persist();
      }
    },
    /** Deletes a layout; its page falls back to another layout of that page or the default. */
    async remove(id) {
      const gone = list.find((layout) => layout.id === id);

      if (gone) {
        list = list.filter((layout) => layout.id !== id);
        chosen = { ...chosen, [gone.surface]: DEFAULT_CHOICE };
        await persist();
      }
    },
    active: activeOf,
    resolved(surface) {
      const file = activeOf(surface);
      const key = `${surface}|${file?.id ?? ""}|${file ? JSON.stringify(file.ops) : ""}`;
      const hit = cache.get(surface);

      if (hit?.key === key) {
        return hit.value;
      }

      const value = resolveLayout(surface, file);
      cache.set(surface, { key, value });
      return value;
    },
    /** Ids of every field of your own that some layout still declares. */
    knownIds() {
      return new Set(this.ownLabels().keys());
    },
    /** The label of every field of your own across the pages, by field id (search reads this). */
    ownLabels() {
      const labels = new Map();

      for (const surface of SURFACE_IDS) {
        for (const [id, def] of ownDefinitions(this.resolved(surface))) {
          labels.set(id, def.label);
        }
      }

      return labels;
    },
    /** Replaces the whole list (an import or a restore). */
    async replaceAll(next) {
      list = next;
      await persist();
    },
    /** Appends operations to the active layout of a page, making one when there is none. Returns the previous ops. */
    async setOps(surface, ops) {
      if (ops.length > LAYOUT_LIMITS.ops) {
        return null;
      }

      const file = activeOf(surface);
      const previous = file ? file.ops : [];

      list = file
        ? list.map((layout) => (layout === file ? { ...layout, ops } : layout))
        : [...list, { id: createId("lay"), name: "My layout", surface, base: "default", ops }];
      chosen = file ? chosen : { ...chosen, [surface]: list.at(-1).id };
      await persist();
      return previous;
    }
  };
}
