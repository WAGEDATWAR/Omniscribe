/**
 * Links between rows (DEF-096): a `link` field of a collection row stores the id of a row of another collection.
 * These helpers turn those ids into words for the sheet, the PDF and the import preview. Pure.
 */
export function rowLabel(collection, row, position = 0) {
  const keys = ["name", ...(collection?.fields ?? []).filter((field) => field.type === "text").map((field) => field.key)];

  for (const key of keys) {
    const value = row?.values?.[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return `Row ${position + 1}`;
}

export function linkOptions(template, computed, column) {
  const target = template.collections.find((entry) => entry.key === column.to);
  const rows = computed.collections?.[column.to] ?? [];
  return rows.map((row, position) => ({ value: row.id, label: rowLabel(target, row, position) }));
}

export function linkLabel(template, computed, column, id) {
  return linkOptions(template, computed, column).find((option) => option.value === id)?.label ?? "";
}
