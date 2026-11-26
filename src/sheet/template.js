import { pageId } from "./layout.js";
import { FORMULA_LIMITS, checkFormula, parseFormula } from "./formula.js";

/**
 * Game systems as data (G-1, G-5, S-15). Pure: this module imports only the formula language.
 * `docs/SHEET.md` owns the format.
 */
export const TEMPLATE_FORMAT = "omniscribe-system";
export const TEMPLATE_FORMAT_VERSION = 1;

export const KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
export const ID_PATTERN = /^[a-z0-9][a-z0-9_.-]{0,63}$/;

export const FIELD_TYPES = Object.freeze(["number", "text", "longtext", "flag", "choice", "list", "derived", "track"]);
export const ITEM_FIELD_TYPES = Object.freeze([...FIELD_TYPES.filter((type) => type !== "track"), "uses", "roll", "link"]);
export const TRACK_PARTS = Object.freeze(["crossed", "boxes"]);
export const TRACK_MAX = 20;
export const DISPLAY_FORMATS = Object.freeze(["number", "signed", "integer", "percent", "text"]);
export const POOL_DISPLAYS = Object.freeze(["number", "boxes"]);
export const SECTION_LAYOUTS = Object.freeze(["fields", "table", "text"]);
export const POOL_PARTS = Object.freeze(["max", "current", "temp"]);

export const TEMPLATE_LIMITS = Object.freeze({
  bytes: 1024 * 1024,
  fields: 400,
  pools: 40,
  collections: 40,
  itemFields: 40,
  rows: 500,
  defaultRows: 200,
  tables: 60,
  tableEntries: 400,
  conditions: 100,
  rests: 8,
  rolls: 200,
  sections: 60,
  choices: 100,
  subs: 20,
  label: 80,
  hint: 300,
  text: 200,
  longtext: 20000,
  list: 100,
  baseChain: 5
});

const ENVELOPE_KEYS = new Set([
  "format", "formatVersion", "id", "version", "name", "system", "description", "base", "overlay",
  "fields", "pools", "collections", "tables", "conditions", "rests", "rolls", "sections", "extensions"
]);

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isString = (value, max) => typeof value === "string" && value.length <= max;
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

/**
 * A number where a formula is expected (a pool's maximum, a rest's add or set) means that number, so `"max": 3`
 * is accepted as `"max": "3"` and the file is told so. Anything else is left for validation to judge.
 */
function friendlyPool(pool, path, warnings) {
  if (!isObject(pool)) {
    return pool;
  }

  let next = pool;

  if (isFiniteNumber(pool.max)) {
    warnings.push({ path: `${path}.max`, message: "A number was given where a formula is expected; it was read as the formula \"" + pool.max + "\"" });
    next = { ...next, max: String(pool.max) };
  }

  if (isObject(pool.rests)) {
    const rests = {};

    for (const [restId, rule] of Object.entries(pool.rests)) {
      let fixed = rule;

      if (isObject(rule)) {
        for (const verb of ["add", "set"]) {
          if (isFiniteNumber(rule[verb])) {
            warnings.push({ path: `${path}.rests.${restId}.${verb}`, message: "A number was given where a formula is expected; it was read as the formula \"" + rule[verb] + "\"" });
            fixed = { ...fixed, [verb]: String(rule[verb]) };
          }
        }
      }

      rests[restId] = fixed;
    }

    next = { ...next, rests };
  }

  return next;
}

/**
 * Checks the envelope of a system file and fills in empty parts. Unknown top-level keys are kept in
 * `extensions` and reported as warnings (A-5, S-15). Returns `{ ok, template, errors, warnings }`.
 */
export function normalizeSystemFile(raw) {
  const errors = [];
  const warnings = [];

  if (!isObject(raw)) {
    return { ok: false, template: null, errors: [{ path: "", message: "A system file must be a JSON object" }], warnings };
  }

  if (raw.format !== TEMPLATE_FORMAT) {
    errors.push({ path: "format", message: `format must be "${TEMPLATE_FORMAT}"` });
  }

  if (raw.formatVersion !== TEMPLATE_FORMAT_VERSION) {
    errors.push({ path: "formatVersion", message: `formatVersion must be ${TEMPLATE_FORMAT_VERSION}` });
  }

  if (typeof raw.id !== "string" || !ID_PATTERN.test(raw.id)) {
    errors.push({ path: "id", message: "id must be lowercase letters, digits, dots, dashes or underscores (up to 64)" });
  }

  if (!Number.isInteger(raw.version) || raw.version < 1) {
    errors.push({ path: "version", message: "version must be a whole number from 1" });
  }

  if (!isString(raw.name, TEMPLATE_LIMITS.label) || !raw.name.trim()) {
    errors.push({ path: "name", message: `name is required (up to ${TEMPLATE_LIMITS.label} characters)` });
  }

  if (raw.base !== null && raw.base !== undefined) {
    if (!isObject(raw.base) || typeof raw.base.id !== "string" || !ID_PATTERN.test(raw.base.id) || !Number.isInteger(raw.base.version) || raw.base.version < 1) {
      errors.push({ path: "base", message: "base must be { id, version }" });
    }
  }

  if (raw.overlay !== undefined && !Array.isArray(raw.overlay)) {
    errors.push({ path: "overlay", message: "overlay must be a list of operations" });
  }

  if (raw.overlay?.length && !raw.base) {
    errors.push({ path: "overlay", message: "an overlay needs a base" });
  }

  const extensions = isObject(raw.extensions) ? { ...raw.extensions } : {};
  const unknown = {};

  for (const key of Object.keys(raw)) {
    if (!ENVELOPE_KEYS.has(key)) {
      unknown[key] = raw[key];
      warnings.push({ path: key, message: `Unknown key "${key}" was kept but is not used` });
    }
  }

  if (Object.keys(unknown).length) {
    extensions.unknown = { ...(isObject(extensions.unknown) ? extensions.unknown : {}), ...unknown };
  }

  const template = {
    format: TEMPLATE_FORMAT,
    formatVersion: TEMPLATE_FORMAT_VERSION,
    id: raw.id,
    version: raw.version,
    name: typeof raw.name === "string" ? raw.name : "",
    system: typeof raw.system === "string" ? raw.system : "",
    description: typeof raw.description === "string" ? raw.description : "",
    base: raw.base ?? null,
    overlay: Array.isArray(raw.overlay) ? raw.overlay : [],
    fields: Array.isArray(raw.fields) ? raw.fields : [],
    pools: Array.isArray(raw.pools) ? raw.pools : [],
    collections: Array.isArray(raw.collections) ? raw.collections : [],
    tables: isObject(raw.tables) ? raw.tables : {},
    conditions: Array.isArray(raw.conditions) ? raw.conditions : [],
    rests: Array.isArray(raw.rests) ? raw.rests : [],
    rolls: Array.isArray(raw.rolls) ? raw.rolls : [],
    sections: Array.isArray(raw.sections) ? raw.sections : [],
    extensions
  };

  template.pools = template.pools.map((pool, position) => friendlyPool(pool, `pools.${pool?.key ?? position}`, warnings));

  for (const part of ["fields", "pools", "collections", "conditions", "rests", "rolls", "sections"]) {
    if (raw[part] !== undefined && !Array.isArray(raw[part])) {
      errors.push({ path: part, message: `${part} must be a list` });
    }
  }

  if (raw.tables !== undefined && !isObject(raw.tables)) {
    errors.push({ path: "tables", message: "tables must be an object" });
  }

  return { ok: errors.length === 0, template, errors, warnings };
}

/* The lookup of everything a formula may name. */

export function indexTemplate(template) {
  return {
    fields: new Map(template.fields.map((field) => [field.key, field])),
    pools: new Map(template.pools.map((pool) => [pool.key, pool])),
    collections: new Map(template.collections.map((collection) => [collection.key, collection])),
    rests: new Set(template.rests.map((rest) => rest.id))
  };
}

function itemFieldSet(collection) {
  const set = new Set(collection.fields.filter((field) => field.type !== "uses").map((field) => field.key));
  set.links = new Map(collection.fields.filter((field) => field.type === "link" && typeof field.to === "string").map((field) => [field.key, field.to]));
  return set;
}

function buildEnv(template, index, item = null) {
  return {
    ref(path) {
      const [head, tail] = path;

      if (path.length > 2) {
        return null;
      }

      const collection = index.collections.get(head);

      if (collection) {
        if (path.length === 1) {
          return "collection";
        }

        const column = collection.fields.find((field) => field.key === tail);
        return column && column.type !== "uses" && column.type !== "roll" ? "column" : null;
      }

      if (index.pools.has(head)) {
        return path.length === 2 && POOL_PARTS.includes(tail) ? "value" : null;
      }

      const field = index.fields.get(head);

      if (!field) {
        return null;
      }

      if (path.length === 1) {
        return field.type === "choice" ? "choice" : field.type === "list" ? "list" : "value";
      }

      if (field.type === "track") {
        return TRACK_PARTS.includes(tail) ? "value" : null;
      }

      return isObject(field.subs) && Object.hasOwn(field.subs, tail) ? "value" : null;
    },
    collectionFields: (key) => {
      const collection = index.collections.get(key);
      return collection ? itemFieldSet(collection) : null;
    },
    tables: new Set(Object.keys(template.tables)),
    item
  };
}

/** The graph node a reference names: `f:` field or sub, `p:` pool part, `c:` collection column. */
export function refNodeId(path, index) {
  const [head, tail] = path;

  if (index.collections.has(head)) {
    return path.length === 2 ? `c:${head}.${tail}` : null;
  }

  if (index.pools.has(head)) {
    return `p:${head}.${tail}`;
  }

  return `f:${path.join(".")}`;
}

export function nodeLabel(id) {
  return `@${id.slice(2)}`;
}

function collectDeps(ast, ownCollection, index, add) {
  const visit = (node, rowCollection) => {
    if (node.kind === "binary") {
      visit(node.left, rowCollection);
      visit(node.right, rowCollection);
    } else if (node.kind === "unary") {
      visit(node.operand, rowCollection);
    } else if (node.kind === "ref") {
      const id = refNodeId(node.path, index);

      if (id) {
        add(id);
      }
    } else if (node.kind === "item") {
      const collection = index.collections.get(rowCollection);
      const field = collection?.fields.find((entry) => entry.key === node.field);

      if (field?.type === "derived") {
        add(`c:${rowCollection}.${node.field}`);
      }

      if (node.via && field?.type === "link") {
        const target = index.collections.get(field.to)?.fields.find((entry) => entry.key === node.via);

        if (target?.type === "derived") {
          add(`c:${field.to}.${node.via}`);
        }
      }
    } else if (node.kind === "call") {
      const aggregated = ["sum", "avg", "count", "min", "max"].includes(node.name) && node.args[0]?.kind === "ref" && index.collections.has(node.args[0].path[0]);

      node.args.forEach((argument, position) => {
        visit(argument, aggregated && position > 0 ? node.args[0].path[0] : rowCollection);
      });
    }
  };

  visit(ast, ownCollection);
}

/**
 * Parses every formula in a resolved system and builds the dependency graph. Returns the nodes,
 * a safe evaluation order, the nodes on a cycle, and any problems found. Cached per template object.
 */
const analyses = new WeakMap();

export function analyzeTemplate(template) {
  const cached = analyses.get(template);

  if (cached) {
    return cached;
  }

  const index = indexTemplate(template);
  const nodes = new Map();
  const problems = [];

  function site(path, source, env, ownCollection) {
    const parsed = parseFormula(source);

    if (!parsed.ok) {
      problems.push({ path, message: parsed.error.message });
      return { parsed, deps: new Set() };
    }

    for (const issue of checkFormula(parsed, env)) {
      problems.push({ path, message: issue.message });
    }

    const deps = new Set();
    collectDeps(parsed.ast, ownCollection, index, (id) => deps.add(id));
    return { parsed, deps };
  }

  const sheetEnv = buildEnv(template, index);

  for (const field of template.fields) {
    if (field.type === "derived" && typeof field.formula === "string") {
      const { parsed, deps } = site(`fields.${field.key}.formula`, field.formula, sheetEnv, null);
      nodes.set(`f:${field.key}`, { id: `f:${field.key}`, kind: "field", field, parsed, deps });
    }

    if (isObject(field.subs)) {
      for (const [name, source] of Object.entries(field.subs)) {
        if (typeof source === "string") {
          const { parsed, deps } = site(`fields.${field.key}.subs.${name}`, source, sheetEnv, null);
          deps.add(`f:${field.key}`);
          nodes.set(`f:${field.key}.${name}`, { id: `f:${field.key}.${name}`, kind: "sub", field, name, parsed, deps });
        }
      }
    }
  }

  for (const pool of template.pools) {
    const { parsed, deps } = site(`pools.${pool.key}.max`, typeof pool.max === "string" ? pool.max : "", sheetEnv, null);
    nodes.set(`p:${pool.key}.max`, { id: `p:${pool.key}.max`, kind: "poolMax", pool, parsed, deps });
    nodes.set(`p:${pool.key}.current`, { id: `p:${pool.key}.current`, kind: "poolCurrent", pool, parsed: null, deps: new Set([`p:${pool.key}.max`]) });
    nodes.set(`p:${pool.key}.temp`, { id: `p:${pool.key}.temp`, kind: "poolTemp", pool, parsed: null, deps: new Set() });
  }

  for (const collection of template.collections) {
    const itemEnv = buildEnv(template, index, itemFieldSet(collection));

    for (const field of collection.fields) {
      if (field.type === "derived" && typeof field.formula === "string") {
        const { parsed, deps } = site(`collections.${collection.key}.fields.${field.key}.formula`, field.formula, itemEnv, collection.key);
        nodes.set(`c:${collection.key}.${field.key}`, { id: `c:${collection.key}.${field.key}`, kind: "column", collection, field, parsed, deps });
      }

      if (field.type === "uses" && typeof field.max === "string") {
        const { parsed, deps } = site(`collections.${collection.key}.fields.${field.key}.max`, field.max, itemEnv, collection.key);
        nodes.set(`c:${collection.key}.${field.key}.max`, { id: `c:${collection.key}.${field.key}.max`, kind: "usesMax", collection, field, parsed, deps });
      }
    }
  }

  const rest = new Map();

  for (const pool of template.pools) {
    for (const [restId, rule] of Object.entries(isObject(pool.rests) ? pool.rests : {})) {
      if (isObject(rule)) {
        const verb = typeof rule.add === "string" ? "add" : typeof rule.set === "string" ? "set" : null;

        if (verb) {
          const { parsed } = site(`pools.${pool.key}.rests.${restId}.${verb}`, rule[verb], sheetEnv, null);
          rest.set(`${pool.key}.${restId}`, { verb, parsed });
        }
      }
    }
  }

  const color = new Map();
  const order = [];
  const cyclic = new Set();
  const cycles = [];

  function visit(id, trail) {
    color.set(id, 1);
    trail.push(id);

    for (const dep of nodes.get(id).deps) {
      if (!nodes.has(dep)) {
        continue;
      }

      if (color.get(dep) === 1) {
        const cycle = trail.slice(trail.indexOf(dep));
        cycles.push(cycle);
        cycle.forEach((member) => cyclic.add(member));
      } else if (!color.has(dep)) {
        visit(dep, trail);
      }
    }

    trail.pop();
    color.set(id, 2);
    order.push(id);
  }

  for (const id of nodes.keys()) {
    if (!color.has(id)) {
      visit(id, []);
    }
  }

  for (const cycle of cycles) {
    problems.push({
      path: "formulas",
      message: `These values depend on each other in a loop: ${[...cycle, cycle[0]].map(nodeLabel).join(" -> ")}`
    });
  }

  const analysis = { index, nodes, order, cyclic, cycles, problems, restFormulas: rest, sheetEnv };
  analyses.set(template, analysis);
  return analysis;
}

function checkField(field, path, errors, warnings, { inCollection }) {
  const err = (suffix, message) => errors.push({ path: suffix ? `${path}.${suffix}` : path, message });
  const types = inCollection ? ITEM_FIELD_TYPES : FIELD_TYPES;

  if (typeof field.key !== "string" || !KEY_PATTERN.test(field.key)) {
    err("key", "key must be lowercase letters, digits and underscores, starting with a letter (up to 32)");
  }

  if (!isString(field.label, TEMPLATE_LIMITS.label) || !field.label.trim()) {
    err("label", `label is required (up to ${TEMPLATE_LIMITS.label} characters)`);
  }

  if (!types.includes(field.type)) {
    err("type", `type must be one of ${types.join(", ")}`);
    return;
  }

  if (field.hint !== undefined && !isString(field.hint, TEMPLATE_LIMITS.hint)) {
    err("hint", `hint must be text up to ${TEMPLATE_LIMITS.hint} characters`);
  }

  if (field.marker !== undefined && !isString(field.marker, 4)) {
    err("marker", "marker must be text up to 4 characters");
  }

  if (field.type !== "derived" && field.formula !== undefined) {
    warnings.push({ path: `${path}.formula`, message: "formula is ignored because the field is not derived" });
  }

  if (field.type === "number") {
    for (const bound of ["default", "min", "max"]) {
      if (field[bound] !== undefined && !isFiniteNumber(field[bound])) {
        err(bound, `${bound} must be a number`);
      }
    }

    if (isFiniteNumber(field.min) && isFiniteNumber(field.max) && field.min > field.max) {
      err("min", "min is above max");
    }

    if (isFiniteNumber(field.default) && ((isFiniteNumber(field.min) && field.default < field.min) || (isFiniteNumber(field.max) && field.default > field.max))) {
      err("default", "default is outside min and max");
    }
  } else if (field.type === "text" || field.type === "longtext") {
    const limit = field.type === "text" ? TEMPLATE_LIMITS.text : TEMPLATE_LIMITS.longtext;

    if (field.default !== undefined && !isString(field.default, limit)) {
      err("default", `default must be text up to ${limit} characters`);
    }
  } else if (field.type === "flag") {
    if (field.default !== undefined && typeof field.default !== "boolean") {
      err("default", "default must be true or false");
    }
  } else if (field.type === "choice") {
    const choices = field.choices;

    if (!Array.isArray(choices) || !choices.length || choices.length > TEMPLATE_LIMITS.choices) {
      err("choices", `choices must be a list of 1 to ${TEMPLATE_LIMITS.choices}`);
    } else {
      const seen = new Set();

      choices.forEach((choice, position) => {
        if (!isObject(choice) || !isString(choice.value, 40) || !choice.value || !isString(choice.label, TEMPLATE_LIMITS.label) || !choice.label) {
          err(`choices.${position}`, "each choice needs a value and a label");
        } else if (seen.has(choice.value)) {
          err(`choices.${position}`, `choice "${choice.value}" is repeated`);
        } else {
          seen.add(choice.value);
        }
      });

      if (field.default !== undefined && !seen.has(field.default)) {
        err("default", "default must be one of the choices");
      }
    }
  } else if (field.type === "list") {
    if (field.default !== undefined && (!Array.isArray(field.default) || field.default.some((entry) => !isString(entry, TEMPLATE_LIMITS.text)))) {
      err("default", "default must be a list of text");
    }
  } else if (field.type === "derived") {
    if (typeof field.formula !== "string" || !field.formula.trim()) {
      err("formula", "a derived field needs a formula");
    }

    if (field.format !== undefined && !DISPLAY_FORMATS.includes(field.format)) {
      err("format", `format must be one of ${DISPLAY_FORMATS.join(", ")}`);
    }
  } else if (field.type === "track") {
    if (!Array.isArray(field.boxes) || field.boxes.length < 1 || field.boxes.length > TRACK_MAX || field.boxes.some((name) => !isString(name, 40) || !name.trim())) {
      err("boxes", `a track needs 1 to ${TRACK_MAX} named boxes, each up to 40 characters`);
    }
  } else if (field.type === "link") {
    if (typeof field.to !== "string" || !KEY_PATTERN.test(field.to)) {
      err("to", "a link needs to: the key of the collection whose rows it points at");
    }
  } else if (field.type === "uses") {
    if (!(Number.isInteger(field.max) && field.max >= 1) && !(typeof field.max === "string" && field.max.trim())) {
      err("max", "max must be a whole number or a formula");
    }
  } else if (field.type === "roll") {
    if (field.default !== undefined && !isString(field.default, FORMULA_LIMITS.chars)) {
      err("default", `a roll must be text up to ${FORMULA_LIMITS.chars} characters`);
    }
  }

  if (field.subFormats !== undefined) {
    if (!isObject(field.subFormats) || Object.entries(field.subFormats).some(([name, format]) => !isObject(field.subs) || !Object.hasOwn(field.subs, name) || !DISPLAY_FORMATS.includes(format))) {
      err("subFormats", "subFormats must map a sub name to one of " + DISPLAY_FORMATS.join(", "));
    }
  }

  if (field.subs !== undefined) {
    if (inCollection) {
      err("subs", "subs are not available on collection fields");
    } else if (!isObject(field.subs) || Object.keys(field.subs).length > TEMPLATE_LIMITS.subs) {
      err("subs", `subs must be an object of up to ${TEMPLATE_LIMITS.subs} formulas`);
    } else {
      for (const [name, source] of Object.entries(field.subs)) {
        if (!KEY_PATTERN.test(name)) {
          err(`subs.${name}`, "a sub name must be lowercase letters, digits and underscores");
        } else if (typeof source !== "string" || !source.trim()) {
          err(`subs.${name}`, "a sub needs a formula");
        }
      }
    }
  }
}

const REF_IN_TEXT = /@([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)/g;
const ITEM_IN_TEXT = /\$\.([a-z][a-z0-9_]*)(?:\.([a-z][a-z0-9_]*))?/g;

function checkRollRefs(text, path, env, errors) {
  for (const match of text.matchAll(REF_IN_TEXT)) {
    const kind = env.ref(match[1].split("."));

    if (kind !== "value" && kind !== "choice") {
      errors.push({ path, message: `The roll refers to @${match[1]}, which is not a single value` });
    }
  }

  for (const match of text.matchAll(ITEM_IN_TEXT)) {
    if (!env.item?.has(match[1])) {
      errors.push({ path, message: `The roll refers to $.${match[1]}, which this row does not have` });
    } else if (match[2] && !env.collectionFields(env.item.links?.get(match[1]) ?? "")?.has(match[2])) {
      errors.push({ path, message: `The roll refers to $.${match[1]}.${match[2]}, which is not a field of the linked row` });
    }
  }
}

/** Validates a resolved (flat) system. Returns `{ ok, errors, warnings }`; every entry is `{ path, message }`. */
export function validateTemplate(template) {
  const errors = [];
  const warnings = [];
  const err = (path, message) => errors.push({ path, message });

  if (!isObject(template)) {
    return { ok: false, errors: [{ path: "", message: "A system must be an object" }], warnings };
  }

  for (const [part, limit] of [["fields", TEMPLATE_LIMITS.fields], ["pools", TEMPLATE_LIMITS.pools], ["collections", TEMPLATE_LIMITS.collections], ["rests", TEMPLATE_LIMITS.rests], ["conditions", TEMPLATE_LIMITS.conditions], ["rolls", TEMPLATE_LIMITS.rolls], ["sections", TEMPLATE_LIMITS.sections]]) {
    if (!Array.isArray(template[part])) {
      err(part, `${part} must be a list`);
      return { ok: false, errors, warnings };
    }

    if (template[part].length > limit) {
      err(part, `${part} is limited to ${limit}`);
    }
  }

  if (!isObject(template.tables)) {
    err("tables", "tables must be an object");
    return { ok: false, errors, warnings };
  }

  const keys = new Set();

  function claim(key, path) {
    if (typeof key !== "string") {
      return;
    }

    if (keys.has(key)) {
      err(path, `The key "${key}" is used more than once`);
    }

    keys.add(key);
  }

  template.fields.forEach((field, position) => {
    if (!isObject(field)) {
      err(`fields.${position}`, "a field must be an object");
      return;
    }

    claim(field.key, `fields.${field.key ?? position}`);
    checkField(field, `fields.${field.key ?? position}`, errors, warnings, { inCollection: false });
  });

  const restIds = new Set();

  template.rests.forEach((rest, position) => {
    if (!isObject(rest) || typeof rest.id !== "string" || !KEY_PATTERN.test(rest.id) || !isString(rest.label, TEMPLATE_LIMITS.label) || !rest.label) {
      err(`rests.${position}`, "a rest needs an id and a label");
    } else if (restIds.has(rest.id)) {
      err(`rests.${position}`, `The rest "${rest.id}" is repeated`);
    } else {
      restIds.add(rest.id);
    }
  });

  template.pools.forEach((pool, position) => {
    const path = `pools.${pool?.key ?? position}`;

    if (!isObject(pool)) {
      err(path, "a pool must be an object");
      return;
    }

    claim(pool.key, path);

    if (typeof pool.key !== "string" || !KEY_PATTERN.test(pool.key)) {
      err(`${path}.key`, "key must be lowercase letters, digits and underscores, starting with a letter (up to 32)");
    }

    if (!isString(pool.label, TEMPLATE_LIMITS.label) || !pool.label?.trim()) {
      err(`${path}.label`, "label is required");
    }

    if (typeof pool.max !== "string" || !pool.max.trim()) {
      err(`${path}.max`, "a pool needs a max formula");
    }

    if (pool.display !== undefined && !POOL_DISPLAYS.includes(pool.display)) {
      err(`${path}.display`, `display must be one of ${POOL_DISPLAYS.join(", ")}`);
    }

    if (pool.boxSize !== undefined && !(Number.isInteger(pool.boxSize) && pool.boxSize >= 1 && pool.boxSize <= 1000)) {
      err(`${path}.boxSize`, "boxSize must be a whole number from 1 to 1000");
    }

    if (pool.temp !== undefined && typeof pool.temp !== "boolean") {
      err(`${path}.temp`, "temp must be true or false");
    }

    if (pool.rests !== undefined) {
      if (!isObject(pool.rests)) {
        err(`${path}.rests`, "rests must be an object");
      } else {
        for (const [restId, rule] of Object.entries(pool.rests)) {
          if (!restIds.has(restId)) {
            err(`${path}.rests.${restId}`, `There is no rest named "${restId}"`);
          } else if (!(rule === "full" || rule === "none" || (isObject(rule) && (typeof rule.add === "string") !== (typeof rule.set === "string")))) {
            err(`${path}.rests.${restId}`, 'a rest rule must be "full", "none", { "add": formula } or { "set": formula }, not both');
          }
        }
      }
    }
  });

  template.collections.forEach((collection, position) => {
    const path = `collections.${collection?.key ?? position}`;

    if (!isObject(collection)) {
      err(path, "a collection must be an object");
      return;
    }

    claim(collection.key, path);

    if (typeof collection.key !== "string" || !KEY_PATTERN.test(collection.key)) {
      err(`${path}.key`, "key must be lowercase letters, digits and underscores, starting with a letter (up to 32)");
    }

    if (!isString(collection.label, TEMPLATE_LIMITS.label) || !collection.label?.trim()) {
      err(`${path}.label`, "label is required");
    }

    if (!Array.isArray(collection.fields) || !collection.fields.length || collection.fields.length > TEMPLATE_LIMITS.itemFields) {
      err(`${path}.fields`, `a collection needs 1 to ${TEMPLATE_LIMITS.itemFields} fields`);
      return;
    }

    const itemKeys = new Set();

    collection.fields.forEach((field, itemPosition) => {
      const itemPath = `${path}.fields.${field?.key ?? itemPosition}`;

      if (!isObject(field)) {
        err(itemPath, "a field must be an object");
        return;
      }

      if (itemKeys.has(field.key)) {
        err(itemPath, `The key "${field.key}" is used more than once in this collection`);
      }

      itemKeys.add(field.key);
      checkField(field, itemPath, errors, warnings, { inCollection: true });

      if (field.type === "link" && typeof field.to === "string" && !template.collections.some((entry) => isObject(entry) && entry.key === field.to)) {
        err(`${itemPath}.to`, `There is no collection named "${field.to}"`);
      }

      if (field.type === "uses" && field.resetOn !== undefined && !restIds.has(field.resetOn)) {
        err(`${itemPath}.resetOn`, `There is no rest named "${field.resetOn}"`);
      }
    });

    for (const part of ["groupBy", "sortBy"]) {
      if (collection[part] !== undefined && !itemKeys.has(collection[part])) {
        err(`${path}.${part}`, `${part} must name a field of this collection`);
      }
    }

    if (collection.columns !== undefined && (!Array.isArray(collection.columns) || collection.columns.some((column) => !itemKeys.has(column)))) {
      err(`${path}.columns`, "columns must name fields of this collection");
    }

    if (collection.defaultRows !== undefined) {
      const limit = Math.min(collection.maxItems ?? TEMPLATE_LIMITS.defaultRows, TEMPLATE_LIMITS.rows);

      if (!Array.isArray(collection.defaultRows) || collection.defaultRows.length > limit) {
        err(`${path}.defaultRows`, `defaultRows must be a list of up to ${limit} rows`);
      } else {
        collection.defaultRows.forEach((row, rowPosition) => {
          if (!isObject(row)) {
            err(`${path}.defaultRows.${rowPosition}`, "a default row must be an object");
            return;
          }

          for (const [key, value] of Object.entries(row)) {
            const field = collection.fields.find((entry) => entry.key === key && entry.type !== "derived");
            const verdict = field ? validateValue(field, value) : { ok: false, reason: `"${key}" is not an authored field of this collection` };

            if (!verdict.ok) {
              err(`${path}.defaultRows.${rowPosition}.${key}`, verdict.reason);
            }
          }
        });
      }
    }

    if (collection.maxItems !== undefined && !(Number.isInteger(collection.maxItems) && collection.maxItems >= 1 && collection.maxItems <= TEMPLATE_LIMITS.rows)) {
      err(`${path}.maxItems`, `maxItems must be a whole number from 1 to ${TEMPLATE_LIMITS.rows}`);
    }
  });

  const tableNames = Object.keys(template.tables);

  if (tableNames.length > TEMPLATE_LIMITS.tables) {
    err("tables", `tables is limited to ${TEMPLATE_LIMITS.tables}`);
  }

  for (const name of tableNames) {
    const table = template.tables[name];

    if (!KEY_PATTERN.test(name)) {
      err(`tables.${name}`, "a table name must be lowercase letters, digits and underscores");
    } else if (!isObject(table) || Object.keys(table).length > TEMPLATE_LIMITS.tableEntries) {
      err(`tables.${name}`, `a table is an object of up to ${TEMPLATE_LIMITS.tableEntries} entries`);
    } else if (Object.values(table).some((entry) => !(isFiniteNumber(entry) || isString(entry, TEMPLATE_LIMITS.text)))) {
      err(`tables.${name}`, "table values must be numbers or short text");
    }
  }

  const conditions = new Set();

  template.conditions.forEach((name, position) => {
    if (!isString(name, 40) || !name.trim()) {
      err(`conditions.${position}`, "a condition is short text");
    } else if (conditions.has(name)) {
      err(`conditions.${position}`, `The condition "${name}" is repeated`);
    } else {
      conditions.add(name);
    }
  });

  const analysis = errors.length ? null : analyzeTemplate(template);

  if (analysis) {
    for (const problem of analysis.problems) {
      errors.push(problem);
    }

    const sheetEnv = analysis.sheetEnv;
    const rollKeys = new Set();

    for (const field of template.fields) {
      if (field?.defaultFormula === undefined) {
        continue;
      }

      const where = `fields.${field.key}.defaultFormula`;

      if (field.type !== "number") {
        err(where, "only a number field can have a default formula");
      } else if (typeof field.defaultFormula !== "string" || !field.defaultFormula.trim() || field.defaultFormula.length > FORMULA_LIMITS.chars) {
        err(where, "a default formula is text such as 4d10 or @level * 2");
      } else {
        const parsed = parseFormula(field.defaultFormula, { dice: true });

        if (!parsed.ok) {
          err(where, parsed.error.message);
        } else {
          checkRollRefs(field.defaultFormula, where, sheetEnv, errors);
        }
      }
    }

    template.rolls.forEach((roll, position) => {
      const path = `rolls.${roll?.key ?? position}`;

      if (!isObject(roll) || typeof roll.key !== "string" || !KEY_PATTERN.test(roll.key) || !isString(roll.label, TEMPLATE_LIMITS.label) || !roll.label || typeof roll.expression !== "string" || !roll.expression.trim() || roll.expression.length > FORMULA_LIMITS.chars) {
        err(path, "a roll needs a key, a label and an expression");
        return;
      }

      if (rollKeys.has(roll.key)) {
        err(path, `The roll "${roll.key}" is repeated`);
      }

      rollKeys.add(roll.key);
      checkRollRefs(roll.expression, `${path}.expression`, sheetEnv, errors);

      if (roll.target !== undefined) {
        if (typeof roll.target !== "string" || !roll.target.trim() || roll.target.length > FORMULA_LIMITS.chars) {
          err(`${path}.target`, "target is a formula, such as @skill or 12");
        } else {
          checkRollRefs(roll.target, `${path}.target`, sheetEnv, errors);
        }
      }

      if (roll.compare !== undefined && roll.compare !== "" && roll.compare !== "under" && roll.compare !== "over") {
        err(`${path}.compare`, 'compare is "under" (succeed at or below the target) or "over" (at or above it)');
      }
    });

    for (const collection of template.collections) {
      const itemEnv = buildEnv(template, analysis.index, itemFieldSet(collection));

      for (const field of collection.fields) {
        if (field.type === "roll" && typeof field.default === "string") {
          checkRollRefs(field.default, `collections.${collection.key}.fields.${field.key}.default`, itemEnv, errors);
        }
      }
    }

    const pageOwners = new Map();

    template.sections.forEach((section, position) => {
      const path = `sections.${section?.id ?? position}`;

      if (!isObject(section) || typeof section.id !== "string" || !KEY_PATTERN.test(section.id) || !isString(section.title, TEMPLATE_LIMITS.label) || !section.title || !SECTION_LAYOUTS.includes(section.layout) || !Array.isArray(section.items)) {
        err(path, "a section needs an id, a title, a layout (fields, table or text) and items");
        return;
      }

      if (section.page !== undefined) {
        if (!isString(section.page, 40) || !section.page.trim() || !pageId(section.page) || pageId(section.page) === "p-sheet") {
          err(`${path}.page`, "page is the name of a tab, up to 40 characters with at least one letter or digit, and not \"Sheet\"");
        } else {
          const owner = pageOwners.get(pageId(section.page));

          if (owner !== undefined && owner !== section.page.trim()) {
            err(`${path}.page`, `"${section.page}" and "${owner}" make the same tab address; rename one`);
          }

          pageOwners.set(pageId(section.page), section.page.trim());
        }
      }

      for (const item of section.items) {
        const known = section.layout === "table" ? analysis.index.collections.has(item) : analysis.index.fields.has(item) || analysis.index.pools.has(item);

        if (!known) {
          err(`${path}.items`, `"${item}" is not a ${section.layout === "table" ? "collection" : "field or pool"} of this system`);
        }
      }
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function fieldDefault(field) {
  switch (field.type) {
    case "number":
      return isFiniteNumber(field.default) ? field.default : isFiniteNumber(field.min) && field.min > 0 ? field.min : 0;
    case "text":
    case "longtext":
      return typeof field.default === "string" ? field.default : "";
    case "flag":
      return field.default === true;
    case "choice":
      return field.choices?.some((choice) => choice.value === field.default) ? field.default : field.choices?.[0]?.value ?? "";
    case "list":
      return Array.isArray(field.default) ? [...field.default] : [];
    case "uses":
      return { used: 0 };
    case "track":
      return Array.from({ length: field.boxes?.length ?? 0 }, () => 0);
    case "roll":
      return typeof field.default === "string" ? field.default : "";
    case "link":
      return "";
    default:
      return null;
  }
}

/**
 * Checks one authored value against its field (S-2). Never coerces: `{ ok, value }` or
 * `{ ok: false, reason }` for the person to read.
 */
export function validateValue(field, raw) {
  switch (field.type) {
    case "number": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        return { ok: false, reason: `${field.label} must be a number` };
      }

      if (field.integer !== false && !Number.isInteger(raw)) {
        return { ok: false, reason: `${field.label} must be a whole number` };
      }

      if (isFiniteNumber(field.min) && raw < field.min) {
        return { ok: false, reason: `${field.label} cannot be below ${field.min}` };
      }

      if (isFiniteNumber(field.max) && raw > field.max) {
        return { ok: false, reason: `${field.label} cannot be above ${field.max}` };
      }

      return { ok: true, value: raw };
    }
    case "text":
    case "longtext":
    case "roll": {
      const limit = field.type === "longtext" ? TEMPLATE_LIMITS.longtext : field.type === "roll" ? FORMULA_LIMITS.chars : Math.min(field.maxLength ?? TEMPLATE_LIMITS.text, TEMPLATE_LIMITS.text);

      if (typeof raw !== "string") {
        return { ok: false, reason: `${field.label} must be text` };
      }

      return raw.length > limit ? { ok: false, reason: `${field.label} is limited to ${limit} characters` } : { ok: true, value: raw };
    }
    case "link":
      return typeof raw === "string" && raw.length <= 64 ? { ok: true, value: raw } : { ok: false, reason: `${field.label} must name a row` };
    case "flag":
      return typeof raw === "boolean" ? { ok: true, value: raw } : { ok: false, reason: `${field.label} must be on or off` };
    case "choice":
      return field.choices?.some((choice) => choice.value === raw)
        ? { ok: true, value: raw }
        : { ok: false, reason: `${field.label} must be one of its listed choices` };
    case "list": {
      if (!Array.isArray(raw) || raw.length > TEMPLATE_LIMITS.list || raw.some((entry) => !isString(entry, TEMPLATE_LIMITS.text))) {
        return { ok: false, reason: `${field.label} must be a list of up to ${TEMPLATE_LIMITS.list} short entries` };
      }

      return { ok: true, value: [...raw] };
    }
    case "track":
      return Array.isArray(raw) && raw.length <= TRACK_MAX && raw.every((state) => state === 0 || state === 1 || state === 2)
        ? { ok: true, value: [...raw] }
        : { ok: false, reason: `${field.label} must be a list of boxes that are empty (0), marked (1) or crossed (2)` };
    case "uses":
      return isObject(raw) && Number.isInteger(raw.used) && raw.used >= 0
        ? { ok: true, value: { used: raw.used } }
        : { ok: false, reason: `${field.label} must be a count of uses` };
    default:
      return { ok: false, reason: `${field.label ?? "This"} is computed and cannot be set` };
  }
}

export function formatValue(field, value) {
  if (value === null || value === undefined) {
    return "";
  }

  const format = field.type === "derived" ? field.format ?? (typeof value === "number" ? "number" : "text") : "number";

  if (typeof value !== "number") {
    return String(value);
  }

  switch (format) {
    case "signed":
      return value >= 0 ? `+${value}` : String(value);
    case "integer":
      return String(Math.trunc(value));
    case "percent":
      return `${Number((value * 100).toFixed(2))}%`;
    default:
      return String(Number(value.toFixed(6)));
  }
}
