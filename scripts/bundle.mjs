import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Builds the web bundle (R-1): the shipped files copied to `www/`, with the service worker stamped by a hash of
 * them. Every shell (Pages, the installed web app, Electron, Capacitor) loads this directory unchanged.
 */
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const ENTRIES = ["index.html", "src", "favicon.svg", "manifest.webmanifest", "sw.js", "icons"];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const found = [];

  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = resolve(dir, item.name);

    if (item.isDirectory()) {
      found.push(...(await walk(full)));
    } else {
      found.push(full);
    }
  }

  return found;
}

/** Writes the bundle to `out` and returns `{ version, files, copied }`; `files` is what the service worker precaches. */
export async function buildBundle({ source = root, out = resolve(root, "www") } = {}) {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, ".nojekyll"), "");

  let copied = 0;

  for (const entry of ENTRIES) {
    const from = resolve(source, entry);

    if (await exists(from)) {
      await cp(from, resolve(out, entry), { recursive: true });
      copied += 1;
    }
  }

  const files = (await walk(out))
    .map((file) => relative(out, file).split("\\").join("/"))
    .filter((file) => file !== ".nojekyll" && file !== "sw.js" && !file.endsWith("SOURCE.md"))
    .sort();
  const hash = createHash("sha256");

  for (const file of files) {
    hash.update(file);
    hash.update(await readFile(resolve(out, file)));
  }

  const version = hash.digest("hex").slice(0, 12);
  const swPath = resolve(out, "sw.js");
  let sw = await readFile(swPath, "utf8");
  sw = sw.replace(/const VERSION = "[^"]*";/, `const VERSION = "${version}";`);
  sw = sw.replace(/const PRECACHE = \[[\s\S]*?\];/, `const PRECACHE = ${JSON.stringify(["./", ...files], null, 2)};`);
  await writeFile(swPath, sw);

  return { version, files, copied };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { version, files, copied } = await buildBundle();
  console.log(`web bundle: ${copied} entries written to www/ (service worker cache ${version}, ${files.length} files precached)`);
}
