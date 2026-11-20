/**
 * Turns an edited, fully resolved system into overlay operations against its base (S-9), so a visual editor
 * can work on the resolved system and still save a derivation. Pure. Reordering existing entries is not
 * expressed (added entries are appended); an override clears a property or a table entry with `null`.
 */
const LISTS = [
  ["field", "fields", "key"],
  ["pool", "pools", "key"],
  ["collection", "collections", "key"],
  ["roll", "rolls", "key"],
  ["rest", "rests", "id"],
  ["section", "sections", "id"]
];

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const byKey = (list, id) => new Map(list.map((entry) => [entry[id], entry]));

function propChanges(before, after, ignore = []) {
  const value = {};

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (ignore.includes(key) || key === "key" || key === "id" || same(before[key], after[key])) {
      continue;
    }

    value[key] = key in after ? after[key] : null;
  }

  return value;
}

function itemOperations(collectionKey, before, after) {
  const operations = [];
  const left = byKey(before.fields, "key");
  const right = byKey(after.fields, "key");

  for (const [key] of left) {
    if (!right.has(key)) {
      operations.push({ op: "remove", target: "item", parent: collectionKey, key });
    }
  }

  for (const [key, field] of right) {
    if (!left.has(key)) {
      operations.push({ op: "add", target: "item", parent: collectionKey, key, value: structuredClone(field) });
    } else {
      const value = propChanges(left.get(key), field);

      if (Object.keys(value).length) {
        operations.push({ op: "override", target: "item", parent: collectionKey, key, value });
      }
    }
  }

  return operations;
}

export function makeOverlay(base, edited) {
  const operations = [];

  for (const [target, part, id] of LISTS) {
    const left = byKey(base[part] ?? [], id);
    const right = byKey(edited[part] ?? [], id);

    for (const [key] of left) {
      if (!right.has(key)) {
        operations.push({ op: "remove", target, key });
      }
    }

    for (const [key, entry] of right) {
      if (!left.has(key)) {
        operations.push({ op: "add", target, key, value: structuredClone(entry) });
        continue;
      }

      const previous = left.get(key);
      const value = propChanges(previous, entry, target === "collection" ? ["fields"] : []);

      if (Object.keys(value).length) {
        operations.push({ op: "override", target, key, value: structuredClone(value) });
      }

      if (target === "collection") {
        operations.push(...itemOperations(key, previous, entry));
      }
    }
  }

  const tablesBefore = base.tables ?? {};
  const tablesAfter = edited.tables ?? {};

  for (const name of Object.keys(tablesBefore)) {
    if (!(name in tablesAfter)) {
      operations.push({ op: "remove", target: "table", key: name });
    }
  }

  for (const [name, table] of Object.entries(tablesAfter)) {
    if (!(name in tablesBefore)) {
      operations.push({ op: "add", target: "table", key: name, value: structuredClone(table) });
    } else if (!same(tablesBefore[name], table)) {
      const value = propChanges(tablesBefore[name], table);

      if (Object.keys(value).length) {
        operations.push({ op: "override", target: "table", key: name, value });
      }
    }
  }

  const conditionsBefore = base.conditions ?? [];
  const conditionsAfter = edited.conditions ?? [];

  for (const name of conditionsBefore) {
    if (!conditionsAfter.includes(name)) {
      operations.push({ op: "remove", target: "condition", value: name });
    }
  }

  for (const name of conditionsAfter) {
    if (!conditionsBefore.includes(name)) {
      operations.push({ op: "add", target: "condition", value: name });
    }
  }

  return operations;
}
