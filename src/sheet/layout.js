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

/** The tab id of a page title: `p-` and its words as lowercase letters, digits and underscores. */
export function pageId(title) {
  const slug = String(title ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);

  return slug && /^[a-z]/.test(slug) ? `p-${slug}` : slug ? `p-x${slug}` : "";
}

export const isPageRoute = (sub) => typeof sub === "string" && /^p-[a-z][a-z0-9_]{0,31}$/.test(sub);

/**
 * The tabs a system adds to a character beside the Sheet: a section with a `page` title is shown on that tab instead
 * of the Sheet, in the order the titles first appear. Returns `[{ id, title, sections: [sectionId] }]`.
 */
export function pagesOf(template) {
  const pages = new Map();

  for (const section of layoutOf(template)) {
    const id = section.page ? pageId(section.page) : "";

    if (id) {
      pages.set(id, { id, title: String(section.page).trim(), sections: [...(pages.get(id)?.sections ?? []), section.id] });
    }
  }

  return [...pages.values()];
}
