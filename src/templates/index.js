import { resolveTemplate } from "../sheet/resolve.js";

/**
 * The built-in systems (G-17, S-5). They are plain JSON files; `readJson(name)` is injected so the
 * browser can fetch them and the tests can read them from disk. Built-ins are read-only bases.
 */
export const BUILTIN_FILES = Object.freeze(["generic", "dnd35", "dnd5e"]);

export async function loadBuiltinSystems(readJson) {
  const files = [];

  for (const name of BUILTIN_FILES) {
    files.push(await readJson(name));
  }

  const lookup = (id, version) => files.find((file) => file.id === id && file.version === version) ?? null;
  const resolved = new Map();

  for (const file of files) {
    resolved.set(file.id, resolveTemplate(file, lookup));
  }

  return { files, lookup, resolved };
}
