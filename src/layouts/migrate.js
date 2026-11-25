import { LAYOUT_LIMITS } from "./limits.js";

/**
 * Moves today's anonymous `custom` entries ({ label, type, value } on a record) to declared fields (L-6). Each distinct
 * label and type becomes one field of your own in a section called "From earlier", with an id derived from the surface,
 * label and type so the same entry migrates to the same field on every device and in every backup. Pure.
 */
export const EARLIER_SECTION = "earlier";

function hashId(text) {
  let a = 0x811c9dc5;
  let b = 0x01000193;

  for (let index = 0; index < text.length; index += 1) {
    a = Math.imul(a ^ text.charCodeAt(index), 16777619) >>> 0;
    b = Math.imul(b + a, 2246822519) >>> 0;
  }

  return `cf_m${a.toString(16).padStart(8, "0")}${(b >>> 8).toString(16).padStart(6, "0")}`;
}

const TYPE_OF = { text: "text", number: "number", checkbox: "checkbox" };

export function migrateCustom(surface, records) {
  const defs = new Map();
  const migrated = records.map((record) => {
    if (!record || typeof record !== "object" || !Array.isArray(record.custom)) {
      return record;
    }

    const { custom, ...rest } = record;
    const fields = { ...(record.fields ?? {}) };

    for (const entry of custom) {
      const label = String(entry?.label ?? "").trim().slice(0, LAYOUT_LIMITS.label);
      const type = TYPE_OF[entry?.type] ?? "text";

      if (!label) {
        continue;
      }

      const id = hashId(`${surface}|${label.toLowerCase()}|${type}`);

      if (!defs.has(id) && defs.size < LAYOUT_LIMITS.ownFields) {
        defs.set(id, { id, label, type, hideWhenEmpty: true });
      }

      if (defs.has(id) && fields[id] === undefined) {
        fields[id] = type === "number" ? (Number.isFinite(entry.value) ? entry.value : 0) : type === "checkbox" ? entry.value === true : String(entry.value ?? "");
      }
    }

    return { ...rest, fields };
  });

  const ops = defs.size
    ? [{ op: "add", target: "section", id: EARLIER_SECTION, title: "From earlier" }, ...[...defs.values()].map((field) => ({ op: "add", target: "field", field, section: EARLIER_SECTION }))]
    : [];

  return { ops, records: migrated, changed: defs.size > 0 || migrated.some((record, index) => record !== records[index]) };
}

/** Adds migration operations to a layout file's list without repeating a field or section already there. */
export function mergeOps(existing, added) {
  const seen = new Set(existing.map((operation) => `${operation.target}:${operation.id ?? operation.field?.id}`));
  return [...existing, ...added.filter((operation) => !seen.has(`${operation.target}:${operation.id ?? operation.field?.id}`))];
}

/** Merges layouts that arrive (from a migration or an import) into the stored ones by id, never dropping an operation. */
export function mergeLayouts(stored, incoming) {
  const byId = new Map(stored.map((layout) => [layout.id, layout]));

  for (const layout of incoming) {
    const have = byId.get(layout.id);
    byId.set(layout.id, have ? { ...have, ops: mergeOps(have.ops, layout.ops) } : layout);
  }

  return [...byId.values()];
}
