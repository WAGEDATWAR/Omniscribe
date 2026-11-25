import { LAYOUT_LIMITS } from "../layouts/limits.js";
import { ownDefinitions, resolveLayout } from "../layouts/resolve.js";
import { SURFACE_IDS } from "../layouts/surfaces.js";
import { createId } from "../utils.js";

/**
 * The layouts of the library (L-1, L-3): one active layout per page, resolved on demand. The pages ask for
 * `resolved(surface)`; editing adds operations and saves the list. Nothing else holds layout state.
 */
export function createLayouts({ storage, bus }, initial = []) {
  let list = initial.filter((layout) => layout && typeof layout.id === "string");
  const cache = new Map();

  const activeOf = (surface) => list.find((layout) => layout.surface === surface) ?? null;

  async function persist() {
    cache.clear();

    if (!storage.degraded) {
      await storage.saveLayouts(list);
    }

    bus.emit("layouts:changed");
  }

  return {
    all: () => list,
    active: activeOf,
    resolved(surface) {
      const file = activeOf(surface);
      const key = `${surface}|${file?.id ?? ""}|${file?.ops.length ?? 0}|${file ? JSON.stringify(file.ops).length : 0}`;
      const hit = cache.get(surface);

      if (hit?.key === key) {
        return hit.value;
      }

      const value = resolveLayout(surface, file);
      cache.set(surface, { key, value });
      return value;
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
      await persist();
      return previous;
    }
  };
}
