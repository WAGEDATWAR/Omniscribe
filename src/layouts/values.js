import { LAYOUT_LIMITS, OWN_TYPES } from "./limits.js";

/**
 * Typed rules for the fields of your own (L-2): a bad value is rejected with a reason, never coerced.
 */
const FIELD_ID = /^cf_[a-z0-9_]{3,32}$/;
const isString = (value, max) => typeof value === "string" && value.length <= max;
const isPlain = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const isFieldId = (value) => typeof value === "string" && FIELD_ID.test(value);

/** Checks a field definition; returns `{ ok, def }` with a cleaned copy, or `{ ok: false, reason }`. */
export function validateFieldDef(raw) {
  if (!isPlain(raw) || !isFieldId(raw.id)) {
    return { ok: false, reason: "a field needs an id that starts with cf_" };
  }

  if (!isString(raw.label, LAYOUT_LIMITS.label) || !raw.label.trim()) {
    return { ok: false, reason: `a field needs a name of up to ${LAYOUT_LIMITS.label} characters` };
  }

  if (!OWN_TYPES.includes(raw.type)) {
    return { ok: false, reason: `the type of ${raw.label} is not one of ${OWN_TYPES.join(", ")}` };
  }

  const def = { id: raw.id, label: raw.label.trim(), type: raw.type };

  if (raw.hint !== undefined) {
    if (!isString(raw.hint, LAYOUT_LIMITS.hint)) {
      return { ok: false, reason: `the hint of ${raw.label} is too long` };
    }

    def.hint = raw.hint;
  }

  if (raw.type === "choice") {
    const choices = raw.choices;

    if (!Array.isArray(choices) || !choices.length || choices.length > LAYOUT_LIMITS.choices || choices.some((choice) => !isString(choice, LAYOUT_LIMITS.choiceLength) || !choice.trim()) || new Set(choices).size !== choices.length) {
      return { ok: false, reason: `${raw.label} needs 1 to ${LAYOUT_LIMITS.choices} different choices` };
    }

    def.choices = [...choices];
  }

  for (const flag of ["hideWhenEmpty", "showInList", "secret", "wide"]) {
    if (raw[flag] !== undefined) {
      if (typeof raw[flag] !== "boolean") {
        return { ok: false, reason: `${flag} of ${raw.label} must be true or false` };
      }

      def[flag] = raw[flag];
    }
  }

  return { ok: true, def };
}

/** The value a new record starts with for a field. */
export function ownDefault(def) {
  switch (def.type) {
    case "number":
      return null;
    case "checkbox":
      return false;
    case "tags":
      return [];
    default:
      return "";
  }
}

/** Whether a value counts as "nothing here" (used by hide-when-empty). */
export function isEmptyValue(def, value) {
  if (value === undefined || value === null) {
    return true;
  }

  switch (def.type) {
    case "checkbox":
      return value === false;
    case "tags":
      return !Array.isArray(value) || value.length === 0;
    default:
      return value === "";
  }
}

/** Checks one value against its definition: `{ ok, value }` or `{ ok: false, reason }`. */
export function validateOwnValue(def, raw) {
  if (isEmptyValue(def, raw) && def.type !== "checkbox") {
    return { ok: true, value: ownDefault(def) };
  }

  switch (def.type) {
    case "text":
    case "long": {
      const limit = def.type === "long" ? LAYOUT_LIMITS.long : LAYOUT_LIMITS.text;
      return typeof raw !== "string" ? { ok: false, reason: `${def.label} must be text` } : raw.length > limit ? { ok: false, reason: `${def.label} is limited to ${limit} characters` } : { ok: true, value: raw };
    }
    case "number":
      return typeof raw === "number" && Number.isFinite(raw) ? { ok: true, value: raw } : { ok: false, reason: `${def.label} must be a number` };
    case "checkbox":
      return typeof raw === "boolean" ? { ok: true, value: raw } : { ok: false, reason: `${def.label} must be yes or no` };
    case "choice":
      return def.choices.includes(raw) ? { ok: true, value: raw } : { ok: false, reason: `${def.label} must be one of its choices` };
    case "date": {
      const valid = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && new Date(`${raw}T00:00:00Z`).toISOString().startsWith(raw);
      return valid ? { ok: true, value: raw } : { ok: false, reason: `${def.label} must be a date such as 2026-03-14` };
    }
    case "tags":
      return Array.isArray(raw) && raw.length <= LAYOUT_LIMITS.tags && raw.every((tag) => isString(tag, LAYOUT_LIMITS.tagLength) && tag.trim()) ? { ok: true, value: [...raw] } : { ok: false, reason: `${def.label} must be a list of up to ${LAYOUT_LIMITS.tags} short tags` };
    default:
      return { ok: false, reason: `${def.label} has an unknown type` };
  }
}

/**
 * Cleans the stored `fields` object of a record: keeps only well-formed ids and value shapes. A value whose
 * definition is gone is kept (L-4); only the shape is checked here, the value against its definition on read.
 */
export function normalizeStoredValues(raw) {
  const out = {};

  for (const [key, value] of Object.entries(isPlain(raw) ? raw : {})) {
    const fine =
      value === null ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value)) ||
      (typeof value === "string" && value.length <= LAYOUT_LIMITS.long) ||
      (Array.isArray(value) && value.length <= LAYOUT_LIMITS.tags && value.every((tag) => typeof tag === "string" && tag.length <= LAYOUT_LIMITS.tagLength));

    if (isFieldId(key) && fine && Object.keys(out).length < LAYOUT_LIMITS.ownFields * 4) {
      out[key] = value;
    }
  }

  return out;
}
