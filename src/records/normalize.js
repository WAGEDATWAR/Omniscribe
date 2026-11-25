import { repairContainers } from "../inventory.js";
import { cleanText, createId, finiteNumber, isPlainObject, isValidId, normalizeTags } from "../utils.js";
import { normalizeStoredValues } from "../layouts/values.js";
import { RECORD_LIMITS, kindOf } from "./kinds.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CUSTOM_TYPES = ["text", "number", "checkbox"];

export function isCalendarDay(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function today(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function plainCopy(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}

function normalizeUses(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const max = Number.isInteger(source.max) && source.max >= 0 ? Math.min(source.max, 9999) : null;
  const used = Number.isInteger(source.used) && source.used >= 0 ? Math.min(source.used, max ?? 9999) : 0;
  return { max, used, resetOn: cleanText(source.resetOn, 40).trim() };
}

/** One field value from stored data: typed, bounded, never thrown on. A bad value falls back to its default. */
export function normalizeValue(spec, raw, hooks = {}) {
  switch (spec.type) {
    case "text":
      return cleanText(raw, spec.max);
    case "long":
      return cleanText(raw, spec.max);
    case "int": {
      if (spec.nullable && (raw === null || raw === undefined)) {
        return null;
      }

      const value = finiteNumber(raw, spec.def ?? 0);
      return value === null ? null : clamp(Math.trunc(value), spec.min, spec.max);
    }
    case "num": {
      if (spec.nullable && (raw === null || raw === undefined)) {
        return null;
      }

      return clamp(finiteNumber(raw, spec.def ?? 0), spec.min, spec.max);
    }
    case "bool":
      return raw === true;
    case "tags":
      return normalizeTags(raw, { max: 50, maxLength: 40 });
    case "choice":
      return spec.values.includes(raw) ? raw : spec.def;
    case "date":
      return isCalendarDay(raw) ? raw : "";
    case "id":
      return isValidId(raw) ? raw : null;
    case "ids":
      return [...new Set((Array.isArray(raw) ? raw : []).filter(isValidId))].slice(0, 100);
    case "uses":
      return normalizeUses(raw);
    case "sheet":
      return hooks.sheet ? hooks.sheet(raw) : null;
    default:
      return null;
  }
}

/** The default value of a field for a brand-new record. */
export function defaultValue(spec, now = Date.now()) {
  switch (spec.type) {
    case "text":
    case "long":
      return "";
    case "int":
    case "num":
      return spec.def ?? 0;
    case "bool":
      return false;
    case "tags":
    case "ids":
      return [];
    case "choice":
      return spec.def;
    case "date":
      return spec.today ? today(now) : "";
    case "uses":
      return { max: null, used: 0, resetOn: "" };
    default:
      return null;
  }
}

/** Cleans one stored record of a kind, or returns null when it is not a record. Unknown keys are kept in `extensions`. */
export function normalizeRecord(kindId, raw, hooks = {}) {
  const kind = kindOf(kindId);

  if (!kind || !isPlainObject(raw)) {
    return null;
  }

  const known = new Set(["id", "custom", "fields", "extensions", ...kind.fields.map((field) => field.key)]);
  const extensions = isPlainObject(raw.extensions) ? plainCopy(raw.extensions) : {};
  const unknown = {};

  for (const key of Object.keys(raw)) {
    if (!known.has(key)) {
      unknown[key] = raw[key];
    }
  }

  if (Object.keys(unknown).length) {
    extensions.unknown = { ...(isPlainObject(extensions.unknown) ? extensions.unknown : {}), ...plainCopy(unknown) };
  }

  const record = { id: isValidId(raw.id) ? raw.id : createId(kind.prefix) };

  for (const spec of kind.fields) {
    record[spec.key] = normalizeValue(spec, raw[spec.key], hooks);
  }

  record.fields = normalizeStoredValues(raw.fields);
  record.extensions = extensions;
  return record;
}

export function normalizeList(kindId, raw, hooks = {}) {
  const kind = kindOf(kindId);
  const seen = new Set();
  const list = [];

  for (const item of Array.isArray(raw) ? raw : []) {
    const record = normalizeRecord(kindId, item, hooks);

    if (record && !seen.has(record.id)) {
      seen.add(record.id);
      list.push(record);

      if (list.length >= kind.limit) {
        break;
      }
    }
  }

  return kindId === "inventory" ? repairContainers(list) : list;
}

export function normalizeWallets(raw) {
  const wallets = {};

  for (const [key, value] of Object.entries(isPlainObject(raw) ? raw : {})) {
    if (/^[A-Za-z0-9_-]{1,12}$/.test(key) && Number.isFinite(value) && Object.keys(wallets).length < RECORD_LIMITS.wallets) {
      wallets[key] = clamp(Math.trunc(value), 0, RECORD_LIMITS.walletMax);
    }
  }

  return wallets;
}

/** The inventory aggregate is `{ items, wallets }`; every other kind is a plain array. */
export function normalizeInventory(raw, hooks = {}) {
  const source = isPlainObject(raw) ? raw : {};
  return { items: normalizeList("inventory", source.items, hooks), wallets: normalizeWallets(source.wallets) };
}

/** The list for a kind, wherever the character keeps it. */
export function listOf(character, kindId) {
  return kindId === "inventory" ? character.inventory.items : character[kindId];
}

/** A character patch that replaces one kind's list. */
export function listPatch(character, kindId, list) {
  return kindId === "inventory" ? { inventory: { ...character.inventory, items: list } } : { [kindId]: list };
}

/** A new record with every field at its default, overlaid with `fields`. Not yet normalized or stored. */
export function createRecord(kindId, fields = {}, { now = Date.now(), bytes, hooks = {} } = {}) {
  const kind = kindOf(kindId);
  const base = { id: createId(kind.prefix, bytes) };

  for (const spec of kind.fields) {
    base[spec.key] = defaultValue(spec, now);
  }

  if (kindId === "progression") {
    base.at = now;
  }

  return normalizeRecord(kindId, { ...base, ...fields, id: base.id }, hooks);
}
