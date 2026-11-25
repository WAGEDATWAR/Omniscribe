/**
 * The order a sheet is shown in: the system's own sections, then any field or pool they leave out under "Other",
 * then any collection they leave out as its own table. Pure; the Sheet page and the generated PDF share it.
 */
export function layoutOf(template) {
  const used = new Set();
  const sections = template.sections.map((definition) => {
    definition.items.forEach((item) => used.add(item));
    return definition;
  });
  const extraItems = [
    ...template.fields.filter((field) => !used.has(field.key)).map((field) => field.key),
    ...template.pools.filter((pool) => !used.has(pool.key)).map((pool) => pool.key)
  ];
  const extraTables = template.collections.filter((collection) => !used.has(collection.key));
  const output = [...sections];

  if (extraItems.length) {
    output.push({ id: "other", title: "Other", layout: "fields", items: extraItems });
  }

  for (const collection of extraTables) {
    output.push({ id: `table_${collection.key}`, title: collection.label, layout: "table", items: [collection.key] });
  }

  return output;
}
