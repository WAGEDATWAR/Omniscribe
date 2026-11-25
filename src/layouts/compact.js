import { resolveLayout } from "./resolve.js";

/**
 * Rewrites a layout's operations as the shortest list that resolves to the same page (docs/LAYOUTS.md). Editing appends
 * operations and compacts, so a layout never grows past the page it describes and never keeps a dropped operation.
 */
const file = (surface, ops) => ({ surface, ops });

function find(resolved, key) {
  for (const section of resolved.sections) {
    const index = section.items.findIndex((item) => item.key === key);

    if (index >= 0) {
      return { section: section.id, index };
    }
  }

  return null;
}

export function compactOps(surface, ops) {
  const final = resolveLayout(surface, file(surface, ops));
  const base = resolveLayout(surface, null);
  const out = [];
  const state = () => resolveLayout(surface, file(surface, out));

  for (const section of final.sections.filter((entry) => entry.own)) {
    out.push({ op: "add", target: "section", id: section.id, title: section.title });
  }

  final.sections.forEach((section, index) => {
    if (state().sections[index]?.id !== section.id) {
      out.push({ op: "move", target: "section", id: section.id, index });
    }
  });

  for (const section of final.sections) {
    const original = base.sections.find((entry) => entry.id === section.id);

    if (original && original.title !== section.title) {
      out.push({ op: "override", target: "section", id: section.id, value: { title: section.title } });
    }
  }

  for (const section of final.sections) {
    for (const item of section.items.filter((entry) => entry.own)) {
      out.push({ op: "add", target: "field", field: item.def, section: section.id });
    }
  }

  for (const section of final.sections) {
    section.items.forEach((item, index) => {
      const at = find(state(), item.key);

      if (!at || at.section !== section.id || at.index !== index) {
        out.push({ op: "move", target: "field", key: item.key, section: section.id, index });
      }
    });
  }

  const defaults = new Map(base.sections.flatMap((section) => section.items).map((item) => [item.key, item]));

  for (const item of final.sections.flatMap((section) => section.items)) {
    if (item.hidden) {
      out.push({ op: "hide", target: "field", key: item.key });
    }

    const original = defaults.get(item.key);

    if (original) {
      const value = {};

      for (const key of ["label", "hint", "wide", "hideWhenEmpty"]) {
        if (item[key] !== original[key]) {
          value[key] = item[key];
        }
      }

      if (Object.keys(value).length) {
        out.push({ op: "override", target: "field", key: item.key, value });
      }
    }
  }

  return out;
}
