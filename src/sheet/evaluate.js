import { createId, isValidId } from "../utils.js";
import { evaluateFormula } from "./formula.js";
import { TEMPLATE_LIMITS, analyzeTemplate, fieldDefault, nodeLabel, validateValue } from "./template.js";

/**
 * Pure sheet evaluation (A-7, S-14, docs/SHEET.md 6). A character stores only authored values; this
 * recomputes everything derived, in dependency order, and returns errors as values.
 */
const MAX_CONDITIONS = 50;

export function createSheet(template) {
  const values = {};

  for (const field of template.fields) {
    if (field.type !== "derived") {
      values[field.key] = fieldDefault(field);
    }
  }

  return {
    values,
    pools: Object.fromEntries(template.pools.map((pool) => [pool.key, { current: null, temp: 0 }])),
    collections: Object.fromEntries(template.collections.map((collection) => [collection.key, []])),
    conditions: [],
    orphans: {}
  };
}

export function createRow(template, collectionKey, overrides = {}) {
  const collection = template.collections.find((entry) => entry.key === collectionKey);
  const row = { id: createId("row") };

  for (const field of collection?.fields ?? []) {
    if (field.type !== "derived") {
      row[field.key] = fieldDefault(field);
    }
  }

  return { ...row, ...overrides };
}

function rowLimit(collection) {
  return Math.min(collection.maxItems ?? TEMPLATE_LIMITS.defaultRows, TEMPLATE_LIMITS.rows);
}

function normalizeRows(collection, stored, errors) {
  const source = Array.isArray(stored) ? stored.slice(0, rowLimit(collection)) : [];
  const seen = new Set();

  return source.map((raw, position) => {
    const input = raw && typeof raw === "object" ? raw : {};
    let id = isValidId(input.id) ? input.id : `row_${position}`;

    if (seen.has(id)) {
      id = `${id}_${position}`;
    }

    seen.add(id);

    const row = { id, authored: {}, derived: {}, uses: {}, errors: {} };

    for (const field of collection.fields) {
      if (field.type === "derived") {
        continue;
      }

      const where = `collections.${collection.key}.${id}.${field.key}`;
      const result = input[field.key] === undefined ? { ok: true, value: fieldDefault(field) } : validateValue(field, input[field.key]);

      if (!result.ok) {
        errors.push({ path: where, message: result.reason });
      }

      const value = result.ok ? result.value : fieldDefault(field);

      if (field.type === "uses") {
        row.uses[field.key] = { used: value.used, max: typeof field.max === "number" ? field.max : null };
      } else {
        row.authored[field.key] = value;
      }
    }

    return row;
  });
}

function rowScope(row) {
  return { get: (field) => row.derived[field] ?? row.authored[field] };
}

function buildContext(template, analysis, values, rows) {
  return {
    scalar: (path) => values[path.join(".")],
    collection(path) {
      const list = rows[path[0]];
      return list ? { rows: list.map(rowScope), field: path[1] ?? null } : null;
    },
    list: (path) => (path.length === 1 && Array.isArray(values[path[0]]) ? values[path[0]] : null),
    choiceIndex(path) {
      const field = analysis.index.fields.get(path[0]);
      const position = field?.choices?.findIndex((choice) => choice.value === values[path[0]]) ?? -1;
      return position >= 0 ? position : null;
    },
    table: (name) => template.tables[name] ?? null,
    item: null
  };
}

function normalizeConditions(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((entry) => entry && typeof entry.name === "string" && entry.name)
    .slice(0, MAX_CONDITIONS)
    .map((entry) => ({ name: entry.name.slice(0, 40), note: typeof entry.note === "string" ? entry.note.slice(0, 200) : "" }));
}

function compute(template, sheet) {
  const analysis = analyzeTemplate(template);
  const errors = [];
  const values = {};
  const pools = {};
  const failed = new Set();
  const rows = {};

  for (const field of template.fields) {
    if (field.type === "derived") {
      continue;
    }

    const raw = sheet.values?.[field.key];
    const result = raw === undefined ? { ok: true, value: fieldDefault(field) } : validateValue(field, raw);

    if (!result.ok) {
      errors.push({ path: `values.${field.key}`, message: result.reason });
    }

    values[field.key] = result.ok ? result.value : fieldDefault(field);
  }

  for (const collection of template.collections) {
    rows[collection.key] = normalizeRows(collection, sheet.collections?.[collection.key], errors);
  }

  const poolInput = {};

  for (const pool of template.pools) {
    const stored = sheet.pools?.[pool.key];
    poolInput[pool.key] = {
      current: Number.isInteger(stored?.current) && stored.current >= 0 ? stored.current : null,
      temp: pool.temp && Number.isInteger(stored?.temp) && stored.temp >= 0 ? stored.temp : 0
    };
  }

  const context = buildContext(template, analysis, values, rows);

  function fail(id, message) {
    failed.add(id);
    errors.push({ path: nodeLabel(id), message });
  }

  for (const id of analysis.order) {
    const node = analysis.nodes.get(id);

    if (analysis.cyclic.has(id)) {
      const cycle = analysis.cycles.find((entry) => entry.includes(id)) ?? [id];
      fail(id, `Part of a loop: ${[...cycle, cycle[0]].map(nodeLabel).join(" -> ")}`);
      continue;
    }

    const brokenDependency = [...node.deps].find((dependency) => failed.has(dependency));

    if (brokenDependency) {
      fail(id, `Depends on ${nodeLabel(brokenDependency)}, which has an error`);
      continue;
    }

    if (node.kind === "field" || node.kind === "sub") {
      const result = evaluateFormula(node.parsed, context);

      if (result.ok) {
        values[node.kind === "field" ? node.field.key : `${node.field.key}.${node.name}`] = result.value;
      } else {
        fail(id, result.error.message);
      }
    } else if (node.kind === "poolMax") {
      const result = evaluateFormula(node.parsed, context);

      if (!result.ok) {
        fail(id, result.error.message);
      } else if (typeof result.value !== "number" || result.value < 0) {
        fail(id, "A pool's maximum must be a number that is not negative");
      } else {
        values[id.slice(2)] = result.value;
      }
    } else if (node.kind === "poolCurrent") {
      const max = values[`${node.pool.key}.max`];
      const stored = poolInput[node.pool.key].current;
      values[`${node.pool.key}.current`] = Math.min(Math.max(stored ?? max, 0), max);
    } else if (node.kind === "poolTemp") {
      values[`${node.pool.key}.temp`] = poolInput[node.pool.key].temp;
    } else if (node.kind === "column" || node.kind === "usesMax") {
      let broken = false;

      for (const row of rows[node.collection.key]) {
        const result = evaluateFormula(node.parsed, { ...context, item: rowScope(row) });
        const where = `collections.${node.collection.key}.${row.id}.${node.field.key}`;

        if (!result.ok) {
          broken = true;
          errors.push({ path: where, message: result.error.message });
          row.errors[node.field.key] = result.error.message;
        } else if (node.kind === "column") {
          row.derived[node.field.key] = result.value;
        } else if (!Number.isInteger(result.value) || result.value < 1) {
          broken = true;
          errors.push({ path: where, message: "The number of uses must be a whole number from 1" });
        } else {
          row.uses[node.field.key].max = result.value;
        }
      }

      if (broken) {
        failed.add(id);
      }
    }
  }

  for (const pool of template.pools) {
    const max = values[`${pool.key}.max`];

    if (max !== undefined) {
      pools[pool.key] = { max, current: values[`${pool.key}.current`], temp: values[`${pool.key}.temp`] ?? 0 };
    }
  }

  const collections = {};

  for (const collection of template.collections) {
    collections[collection.key] = rows[collection.key].map((row) => ({
      id: row.id,
      values: { ...row.authored, ...row.derived },
      derived: row.derived,
      uses: Object.fromEntries(Object.entries(row.uses).map(([key, use]) => [key, { used: use.used, max: use.max, left: use.max === null ? null : Math.max(use.max - use.used, 0) }])),
      errors: row.errors
    }));
  }

  return { values, pools, collections, conditions: normalizeConditions(sheet.conditions), errors, orphans: sheet.orphans ?? {} };
}

const memo = new WeakMap();

/** Evaluates a sheet against a resolved system. The result for the same system and sheet is cached. */
export function evaluateSheet(template, sheet) {
  const json = JSON.stringify(sheet ?? {});
  const cached = memo.get(template);

  if (cached && cached.json === json) {
    return cached.result;
  }

  const result = compute(template, sheet ?? {});
  memo.set(template, { json, result });
  return result;
}

/** A flat map of every readable value, such as `str`, `str.mod` and `hp.max`. This is what the dice read (G-16). */
export function scopeOf(computed) {
  return computed.values;
}

function inField(template, key) {
  return template.fields.find((field) => field.key === key && field.type !== "derived");
}

/**
 * Moves stored values whose field no longer exists into `orphans` and restores any orphan whose
 * field has returned (S-4). Nothing is deleted. Returns `{ sheet, moved, restored }`.
 */
export function reconcileSheet(template, sheet) {
  const values = { ...(sheet.values ?? {}) };
  const pools = { ...(sheet.pools ?? {}) };
  const collections = Object.fromEntries(Object.entries(sheet.collections ?? {}).map(([key, list]) => [key, Array.isArray(list) ? list.map((row) => ({ ...row })) : []]));
  const orphans = { ...(sheet.orphans ?? {}) };
  const moved = [];
  const restored = [];

  for (const key of Object.keys(values)) {
    if (!inField(template, key)) {
      orphans[`values.${key}`] = values[key];
      delete values[key];
      moved.push(`values.${key}`);
    }
  }

  for (const key of Object.keys(pools)) {
    if (!template.pools.some((pool) => pool.key === key)) {
      orphans[`pools.${key}`] = pools[key];
      delete pools[key];
      moved.push(`pools.${key}`);
    }
  }

  for (const key of Object.keys(collections)) {
    const collection = template.collections.find((entry) => entry.key === key);

    if (!collection) {
      orphans[`collections.${key}`] = collections[key];
      delete collections[key];
      moved.push(`collections.${key}`);
      continue;
    }

    const known = new Set(collection.fields.filter((field) => field.type !== "derived").map((field) => field.key));

    for (const row of collections[key]) {
      for (const field of Object.keys(row)) {
        if (field !== "id" && !known.has(field)) {
          orphans[`rows.${key}.${row.id}.${field}`] = row[field];
          delete row[field];
          moved.push(`rows.${key}.${row.id}.${field}`);
        }
      }
    }
  }

  for (const [path, stored] of Object.entries(orphans)) {
    const [scope, ...rest] = path.split(".");

    if (scope === "values") {
      const field = inField(template, rest.join("."));

      if (field && validateValue(field, stored).ok) {
        values[field.key] = stored;
        delete orphans[path];
        restored.push(path);
      }
    } else if (scope === "pools" && template.pools.some((pool) => pool.key === rest[0])) {
      pools[rest[0]] = stored;
      delete orphans[path];
      restored.push(path);
    } else if (scope === "collections" && template.collections.some((entry) => entry.key === rest[0])) {
      collections[rest[0]] = stored;
      delete orphans[path];
      restored.push(path);
    } else if (scope === "rows") {
      const [collectionKey, rowId, fieldKey] = rest;
      const collection = template.collections.find((entry) => entry.key === collectionKey);
      const field = collection?.fields.find((entry) => entry.key === fieldKey && entry.type !== "derived");
      const row = collections[collectionKey]?.find((entry) => entry.id === rowId);

      if (field && row && validateValue(field, stored).ok) {
        row[fieldKey] = stored;
        delete orphans[path];
        restored.push(path);
      }
    }
  }

  return { sheet: { ...sheet, values, pools, collections, orphans }, moved, restored };
}

/**
 * Applies a named rest (DEF-005): each pool follows its rule for that rest, and every `uses` field that
 * resets on it goes back to unused. Returns a new sheet; the caller makes it one undoable step.
 */
export function applyRest(template, sheet, restId) {
  const computed = evaluateSheet(template, sheet);
  const analysis = analyzeTemplate(template);
  const context = buildContext(
    template,
    analysis,
    computed.values,
    Object.fromEntries(Object.entries(computed.collections).map(([key, list]) => [key, list.map((row) => ({ authored: row.values, derived: {}, id: row.id }))]))
  );
  const pools = { ...(sheet.pools ?? {}) };

  for (const pool of template.pools) {
    const rule = pool.rests?.[restId];
    const state = computed.pools[pool.key];

    if (!rule || rule === "none" || !state) {
      continue;
    }

    const stored = { current: null, temp: 0, ...(pools[pool.key] ?? {}) };

    if (rule === "full") {
      pools[pool.key] = { ...stored, current: null };
      continue;
    }

    const verb = typeof rule.add === "string" ? "add" : "set";
    const parsed = analysis.restFormulas.get(`${pool.key}.${restId}`)?.parsed;
    const result = parsed ? evaluateFormula(parsed, context) : { ok: false };

    if (!result.ok || typeof result.value !== "number") {
      continue;
    }

    const target = verb === "add" ? state.current + result.value : result.value;
    pools[pool.key] = { ...stored, current: Math.min(Math.max(Math.round(target), 0), state.max) };
  }

  const collections = Object.fromEntries(
    template.collections.map((collection) => {
      const resets = collection.fields.filter((field) => field.type === "uses" && field.resetOn === restId).map((field) => field.key);
      const list = sheet.collections?.[collection.key] ?? [];

      return [collection.key, resets.length ? list.map((row) => ({ ...row, ...Object.fromEntries(resets.map((key) => [key, { used: 0 }])) })) : list];
    })
  );

  return { ...sheet, pools, collections };
}
