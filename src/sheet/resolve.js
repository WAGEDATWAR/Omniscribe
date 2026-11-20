import { TEMPLATE_LIMITS, normalizeSystemFile, validateTemplate } from "./template.js";

/**
 * Derivation by base and overlay (S-9, S-10, docs/SHEET.md 4). Pure; never throws for a bad system.
 * `lookup(id, version)` returns a system file or null.
 */
const OP_VERBS = new Set(["add", "override", "remove"]);
const LIST_TARGETS = { field: "fields", pool: "pools", collection: "collections", roll: "rolls" };
const ID_TARGETS = { rest: "rests", section: "sections" };
const TARGETS = new Set([...Object.keys(LIST_TARGETS), ...Object.keys(ID_TARGETS), "item", "table", "condition", "meta"]);
const META_KEYS = new Set(["name", "system", "description"]);
const OWN_PARTS = ["fields", "pools", "collections", "rests", "rolls", "sections", "conditions"];

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function dropNulls(entry) {
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== null));
}

function applyOperation(flat, operation, path, errors) {
  const fail = (message) => errors.push({ path, message });

  if (!isObject(operation) || !OP_VERBS.has(operation.op) || !TARGETS.has(operation.target)) {
    fail("an operation needs op (add, override or remove) and a known target");
    return;
  }

  const { op, target } = operation;

  if (target === "meta") {
    if (op !== "override" || !isObject(operation.value)) {
      fail("meta can only be overridden, with an object value");
      return;
    }

    for (const [key, value] of Object.entries(operation.value)) {
      if (!META_KEYS.has(key) || typeof value !== "string") {
        fail(`meta can only set name, system and description as text, not "${key}"`);
        return;
      }

      flat[key] = value;
    }

    return;
  }

  if (target === "condition") {
    const name = operation.value;

    if (typeof name !== "string" || !name || op === "override") {
      fail("a condition operation needs the condition name as its value and cannot override");
      return;
    }

    const position = flat.conditions.indexOf(name);

    if (op === "add") {
      if (position >= 0) {
        fail(`the condition "${name}" already exists`);
      } else {
        flat.conditions.push(name);
      }
    } else if (position < 0) {
      fail(`there is no condition "${name}" to remove`);
    } else {
      flat.conditions.splice(position, 1);
    }

    return;
  }

  if (target === "table") {
    const name = operation.key;

    if (typeof name !== "string") {
      fail("a table operation needs the table name as its key");
      return;
    }

    const exists = Object.hasOwn(flat.tables, name);

    if (op === "add") {
      if (exists) {
        fail(`the table "${name}" already exists`);
      } else if (!isObject(operation.value)) {
        fail("a new table needs an object value");
      } else {
        flat.tables[name] = { ...operation.value };
      }
    } else if (!exists) {
      fail(`there is no table "${name}"`);
    } else if (op === "remove") {
      delete flat.tables[name];
    } else if (!isObject(operation.value)) {
      fail("overriding a table needs an object of entries to merge");
    } else {
      flat.tables[name] = dropNulls({ ...flat.tables[name], ...operation.value });
    }

    return;
  }

  let list;
  let identity = "key";
  let label = target;

  if (target === "item") {
    const collection = flat.collections.find((entry) => entry.key === operation.parent);

    if (!collection) {
      fail(`there is no collection "${operation.parent}" for this item`);
      return;
    }

    list = collection.fields;
    label = `field "${operation.key}" of ${operation.parent}`;
  } else if (target in LIST_TARGETS) {
    list = flat[LIST_TARGETS[target]];
  } else {
    list = flat[ID_TARGETS[target]];
    identity = "id";
  }

  const key = operation.key;

  if (typeof key !== "string" || !key) {
    fail(`a ${target} operation needs a key`);
    return;
  }

  const position = list.findIndex((entry) => entry?.[identity] === key);

  if (op === "add") {
    if (position >= 0) {
      fail(`the ${label} "${key}" already exists`);
    } else if (!isObject(operation.value) || (operation.value[identity] !== undefined && operation.value[identity] !== key)) {
      fail(`adding a ${target} needs an object value whose ${identity} is "${key}"`);
    } else {
      list.push({ ...structuredClone(operation.value), [identity]: key });
    }

    return;
  }

  if (position < 0) {
    fail(`there is no ${label} "${key}" to ${op}`);
    return;
  }

  if (op === "remove") {
    list.splice(position, 1);
    return;
  }

  if (!isObject(operation.value) || (operation.value[identity] !== undefined && operation.value[identity] !== key)) {
    fail(`overriding a ${target} needs an object value and cannot change its ${identity}`);
    return;
  }

  list[position] = dropNulls({ ...list[position], ...structuredClone(operation.value), [identity]: key });
}

function resolveChain(file, lookup, chain, errors) {
  const normalized = normalizeSystemFile(file);

  for (const problem of normalized.errors) {
    errors.push(problem);
  }

  if (!normalized.template) {
    return null;
  }

  const system = normalized.template;

  if (!system.base) {
    return { flat: structuredClone(system), provenance: [] };
  }

  if (chain.length >= TEMPLATE_LIMITS.baseChain) {
    errors.push({ path: "base", message: `A system can derive through at most ${TEMPLATE_LIMITS.baseChain} bases` });
    return null;
  }

  if (chain.includes(system.base.id) || system.base.id === system.id) {
    errors.push({ path: "base", message: `The base "${system.base.id}" leads back to this system, which would loop` });
    return null;
  }

  for (const part of OWN_PARTS) {
    if (system[part].length) {
      errors.push({ path: part, message: `A derived system describes its changes in overlay; remove "${part}" and use operations instead` });
    }
  }

  if (Object.keys(system.tables).length) {
    errors.push({ path: "tables", message: 'A derived system describes its changes in overlay; remove "tables" and use operations instead' });
  }

  const baseFile = lookup(system.base.id, system.base.version);

  if (!baseFile) {
    errors.push({ path: "base", message: `The base system "${system.base.id}" version ${system.base.version} is not available` });
    return null;
  }

  const inner = resolveChain(baseFile, lookup, [...chain, system.id], errors);

  if (!inner) {
    return null;
  }

  const flat = inner.flat;

  flat.id = system.id;
  flat.version = system.version;

  for (const key of ["name", "system", "description"]) {
    flat[key] = system[key] || flat[key];
  }

  system.overlay.forEach((operation, position) => applyOperation(flat, operation, `overlay.${position}`, errors));

  flat.extensions = { ...flat.extensions, ...system.extensions };
  return { flat, provenance: [...inner.provenance, { id: system.base.id, version: system.base.version }] };
}

/**
 * Flattens a system file. Returns `{ ok, template, provenance, errors, warnings }`. `template` is a flat
 * system with no base or overlay, ready for `analyzeTemplate` and `evaluateSheet`; it is `null` when the
 * system cannot be resolved.
 */
export function resolveTemplate(file, lookup = () => null) {
  const errors = [];
  const chain = resolveChain(file, lookup, [], errors);

  if (!chain || errors.length) {
    return { ok: false, template: null, provenance: chain?.provenance ?? [], errors, warnings: [] };
  }

  const flat = chain.flat;
  flat.base = null;
  flat.overlay = [];

  const validation = validateTemplate(flat);

  if (!validation.ok) {
    return { ok: false, template: null, provenance: chain.provenance, errors: validation.errors, warnings: validation.warnings };
  }

  return { ok: true, template: flat, provenance: chain.provenance, errors: [], warnings: validation.warnings };
}
