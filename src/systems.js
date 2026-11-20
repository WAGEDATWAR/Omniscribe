import { resolveTemplate } from "./sheet/resolve.js";
import { normalizeSystemFile } from "./sheet/template.js";

const keyOf = (id, version) => `${id}@${version}`;

/**
 * Every game system the app knows: the built-ins (read-only) and the person's own (G-17). A system is
 * immutable once added; editing makes a new version, so a character pinned to an older one keeps
 * working until it is moved (S-3, S-10). Pure; storage is the caller's job.
 */
export function createRegistry({ builtins = [], custom = [] } = {}) {
  const entries = new Map();
  const resolved = new Map();

  function lookup(id, version) {
    return entries.get(keyOf(id, version))?.file ?? null;
  }

  function add(raw, { builtin = false } = {}) {
    const normalized = normalizeSystemFile(raw);

    if (!normalized.ok) {
      return { ok: false, errors: normalized.errors, warnings: normalized.warnings };
    }

    const file = normalized.template;
    const key = keyOf(file.id, file.version);

    if (entries.has(key)) {
      return { ok: false, errors: [{ path: "version", message: `Version ${file.version} of "${file.id}" already exists; save changes as a new version` }], warnings: [] };
    }

    if (!builtin && [...entries.values()].some((entry) => entry.builtin && entry.file.id === file.id)) {
      return { ok: false, errors: [{ path: "id", message: `"${file.id}" is a built-in system; choose another id` }], warnings: [] };
    }

    entries.set(key, { file, builtin });
    const result = resolveTemplate(file, lookup);

    if (!result.ok) {
      entries.delete(key);
      return { ok: false, errors: result.errors, warnings: result.warnings };
    }

    resolved.set(key, result);
    return { ok: true, file, errors: [], warnings: [...normalized.warnings, ...result.warnings] };
  }

  for (const file of builtins) {
    add(file, { builtin: true });
  }

  const rejected = [];

  for (const file of custom) {
    const result = add(file);

    if (!result.ok) {
      rejected.push({ id: file?.id, version: file?.version, errors: result.errors });
    }
  }

  return {
    lookup,
    add,
    rejected,
    /** Validates a candidate system without adding it. */
    check(raw) {
      const normalized = normalizeSystemFile(raw);

      if (!normalized.ok) {
        return { ok: false, errors: normalized.errors, warnings: normalized.warnings, template: null };
      }

      const result = resolveTemplate(normalized.template, lookup);
      return { ok: result.ok, errors: result.errors, warnings: [...normalized.warnings, ...result.warnings], template: result.template };
    },
    latestFile(id) {
      const versions = [...entries.values()].filter((entry) => entry.file.id === id).map((entry) => entry.file.version);
      return versions.length ? lookup(id, Math.max(...versions)) : null;
    },
    has: (id, version) => entries.has(keyOf(id, version)),
    isBuiltin: (id) => [...entries.values()].some((entry) => entry.builtin && entry.file.id === id),
    resolve(ref) {
      if (!ref) {
        return { ok: false, template: null, errors: [{ path: "", message: "No system chosen" }] };
      }

      const key = keyOf(ref.id, ref.version);

      if (!entries.has(key)) {
        return { ok: false, template: null, errors: [{ path: "", message: `The system "${ref.id}" version ${ref.version} is not available on this device` }] };
      }

      if (!resolved.has(key)) {
        resolved.set(key, resolveTemplate(entries.get(key).file, lookup));
      }

      return resolved.get(key);
    },
    remove(id, version) {
      const key = keyOf(id, version);
      const entry = entries.get(key);

      if (!entry || entry.builtin) {
        return false;
      }

      const inUse = [...entries.values()].some((other) => other.file.base?.id === id && other.file.base.version === version);

      if (inUse) {
        return false;
      }

      entries.delete(key);
      resolved.delete(key);
      return true;
    },
    versions(id) {
      return [...entries.values()].filter((entry) => entry.file.id === id).map((entry) => entry.file.version).sort((a, b) => a - b);
    },
    latest(id) {
      const versions = this.versions(id);
      return versions.length ? versions.at(-1) : null;
    },
    /** One row per system id, at its latest version, built-ins first. */
    list() {
      const ids = [...new Set([...entries.values()].map((entry) => entry.file.id))];

      return ids
        .map((id) => {
          const version = this.latest(id);
          const entry = entries.get(keyOf(id, version));

          return {
            id,
            version,
            name: entry.file.name,
            system: entry.file.system,
            description: entry.file.description,
            builtin: entry.builtin,
            base: entry.file.base,
            versions: this.versions(id),
            ok: this.resolve({ id, version }).ok
          };
        })
        .sort((left, right) => Number(right.builtin) - Number(left.builtin) || left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
    }
  };
}
