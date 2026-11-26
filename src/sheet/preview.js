import { createSheet, evaluateSheet } from "./evaluate.js";
import { layoutOf } from "./layout.js";
import { linkLabel } from "./links.js";
import { formatValue } from "./template.js";

/**
 * A new sheet of a system as plain data, for the import review (DEF-101): each section with the values a fresh sheet
 * would show, so a formula that goes wrong is visible before anything is imported. Pure; the dice of a computed
 * default are thrown with the random source passed in.
 */
function show(field, computed) {
  const value = computed.values[field.key];

  if (field.type === "track") {
    return (computed.tracks?.[field.key] ?? []).map((state, position) => `${field.boxes[position]} ${["[ ]", "[X]", "[/]"][state]}`).join(" ");
  }

  if (field.type === "flag") {
    return value ? "Yes" : "No";
  }

  if (field.type === "choice") {
    return field.choices?.find((choice) => choice.value === value)?.label ?? String(value ?? "");
  }

  if (field.type === "list") {
    return Array.isArray(value) ? value.join(", ") : "";
  }

  return value === undefined || value === null ? "" : formatValue(field, value);
}

export function sheetPreview(template, { rng = null } = {}) {
  const sheet = createSheet(template, { rng });
  const computed = evaluateSheet(template, sheet);

  return layoutOf(template).map((section) => {
    const base = { id: section.id, title: section.title, page: section.page ?? "", layout: section.layout };

    if (section.layout === "table") {
      const tables = section.items
        .map((key) => template.collections.find((entry) => entry.key === key))
        .filter(Boolean)
        .map((collection) => {
          const columns = collection.fields.filter((field) => field.type !== "roll");
          const rows = computed.collections[collection.key] ?? [];

          return {
            label: collection.label,
            columns: columns.map((field) => field.label ?? field.key),
            rows: rows.slice(0, 5).map((row) => columns.map((field) => (field.type === "uses" ? `${row.uses[field.key]?.left ?? ""}` : field.type === "link" ? linkLabel(template, computed, field, row.values[field.key]) : show(field, { values: row.values })))),
            more: Math.max(0, rows.length - 5)
          };
        });

      return { ...base, tables, pairs: [] };
    }

    const pairs = section.items
      .map((key) => {
        const field = template.fields.find((entry) => entry.key === key);
        const pool = template.pools.find((entry) => entry.key === key);

        if (field) {
          return [field.label ?? key, show(field, computed)];
        }

        const state = pool ? computed.pools[key] : null;
        return pool ? [pool.label ?? key, state ? `${state.current} / ${state.max}` : "-"] : null;
      })
      .filter(Boolean);

    return { ...base, tables: [], pairs };
  });
}
