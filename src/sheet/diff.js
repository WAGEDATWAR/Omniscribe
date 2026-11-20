/**
 * What changed between two resolved versions of a system (S-10, DEF-003). Pure. Layout (sections) is
 * ignored; what a person cares about is values, rules and lists.
 */
const PARTS = [
  ["field", "fields", "key"],
  ["pool", "pools", "key"],
  ["collection", "collections", "key"],
  ["roll", "rolls", "key"],
  ["rest", "rests", "id"]
];

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function changedProps(before, after, ignore = []) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => !ignore.includes(key) && !same(before[key], after[key]))
    .sort();
}

function byKey(list, id) {
  return new Map(list.map((entry) => [entry[id], entry]));
}

function itemChanges(before, after) {
  const left = byKey(before.fields, "key");
  const right = byKey(after.fields, "key");
  const details = [];

  for (const [key, field] of right) {
    if (!left.has(key)) {
      details.push(`column "${field.label ?? key}" added`);
    } else {
      const props = changedProps(left.get(key), field);

      if (props.length) {
        details.push(`column "${field.label ?? key}": ${props.join(", ")} changed`);
      }
    }
  }

  for (const [key, field] of left) {
    if (!right.has(key)) {
      details.push(`column "${field.label ?? key}" removed`);
    }
  }

  return details;
}

/** Returns `{ changes, counts, empty }`; each change is `{ change, kind, key, label, details }`. */
export function diffSystems(before, after) {
  const changes = [];

  for (const [kind, part, id] of PARTS) {
    const left = byKey(before[part] ?? [], id);
    const right = byKey(after[part] ?? [], id);

    for (const [key, entry] of right) {
      if (!left.has(key)) {
        changes.push({ change: "added", kind, key, label: entry.label ?? key, details: [] });
        continue;
      }

      const previous = left.get(key);
      const details = kind === "collection"
        ? [...changedProps(previous, entry, ["fields"]).map((prop) => `${prop} changed`), ...itemChanges(previous, entry)]
        : changedProps(previous, entry).map((prop) => `${prop} changed`);

      if (details.length) {
        changes.push({ change: "changed", kind, key, label: entry.label ?? key, details });
      }
    }

    for (const [key, entry] of left) {
      if (!right.has(key)) {
        changes.push({ change: "removed", kind, key, label: entry.label ?? key, details: [] });
      }
    }
  }

  const tablesBefore = before.tables ?? {};
  const tablesAfter = after.tables ?? {};

  for (const name of Object.keys(tablesAfter)) {
    if (!(name in tablesBefore)) {
      changes.push({ change: "added", kind: "table", key: name, label: name, details: [] });
    } else if (!same(tablesBefore[name], tablesAfter[name])) {
      changes.push({ change: "changed", kind: "table", key: name, label: name, details: ["entries changed"] });
    }
  }

  for (const name of Object.keys(tablesBefore)) {
    if (!(name in tablesAfter)) {
      changes.push({ change: "removed", kind: "table", key: name, label: name, details: [] });
    }
  }

  for (const name of after.conditions ?? []) {
    if (!(before.conditions ?? []).includes(name)) {
      changes.push({ change: "added", kind: "condition", key: name, label: name, details: [] });
    }
  }

  for (const name of before.conditions ?? []) {
    if (!(after.conditions ?? []).includes(name)) {
      changes.push({ change: "removed", kind: "condition", key: name, label: name, details: [] });
    }
  }

  const counts = { added: 0, removed: 0, changed: 0 };

  for (const entry of changes) {
    counts[entry.change] += 1;
  }

  return { changes, counts, empty: changes.length === 0 };
}
