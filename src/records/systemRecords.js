import { rollExpression } from "../dice/roll.js";
import { seededRng } from "../dice/rng.js";
import { parseFormula } from "../sheet/formula.js";
import { isPlainObject } from "../utils.js";

/**
 * What a game system may say about a character's records (C-12). It lives under the system's own
 * `extensions.records`, so it needs no change to the system format, derived systems inherit it, and a
 * system that says nothing still gives a working page.
 *
 *   "extensions": { "records": {
 *     "limits": { "carry": "@str * 15", "attunement": 3 },
 *     "currencies": [ { "key": "gp", "label": "Gold" } ]
 *   } }
 */
function limitSource(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return String(value);
  }

  if (typeof value === "string" && value.trim() && value.length <= 200 && parseFormula(value).ok) {
    return value.trim();
  }

  return null;
}

export function systemRecords(template) {
  const source = isPlainObject(template?.extensions?.records) ? template.extensions.records : {};
  const limits = isPlainObject(source.limits) ? source.limits : {};
  const currencies = [];

  for (const entry of Array.isArray(source.currencies) ? source.currencies : []) {
    if (isPlainObject(entry) && /^[A-Za-z0-9_-]{1,12}$/.test(entry.key) && !currencies.some((item) => item.key === entry.key) && currencies.length < 20) {
      currencies.push({ key: entry.key, label: typeof entry.label === "string" ? entry.label.slice(0, 40) : entry.key });
    }
  }

  return { carry: limitSource(limits.carry), attunement: limitSource(limits.attunement), currencies };
}

/** A limit's number for a sheet, or null when there is no limit or the formula does not give a number. */
export function evaluateLimit(source, scope) {
  if (!source) {
    return null;
  }

  const result = rollExpression(source, { scope, rng: seededRng(1) });
  return result.ok && Number.isFinite(result.roll.total) && result.roll.total >= 0 ? result.roll.total : null;
}
