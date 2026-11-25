import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildBundle } from "../scripts/bundle.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const precacheOf = (swText) => JSON.parse(swText.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);

test("the bundle ships the app and leaves out tests, docs and notes", async () => {
  const out = mkdtempSync(join(tmpdir(), "omniscribe-bundle-"));
  const { files, version } = await buildBundle({ out });

  assert.match(version, /^[0-9a-f]{12}$/);
  assert.ok(files.includes("index.html") && files.includes("src/main.js") && files.includes("manifest.webmanifest"));
  assert.ok(files.some((file) => file.startsWith("src/vendor/pdfjs/")));
  assert.ok(!files.some((file) => /^(test|e2e|scripts|docs|node_modules)\//.test(file) || file.endsWith("SOURCE.md")));
  assert.ok(existsSync(join(out, ".nojekyll")));
});

test("the service worker is stamped and precaches only files that exist", async () => {
  const out = mkdtempSync(join(tmpdir(), "omniscribe-bundle-"));
  const { version } = await buildBundle({ out });
  const sw = readFileSync(join(out, "sw.js"), "utf8");

  assert.ok(sw.includes(`const VERSION = "${version}";`));

  const precache = precacheOf(sw);
  assert.equal(precache[0], "./");

  for (const file of precache.slice(1)) {
    assert.ok(existsSync(join(out, file)), file);
  }

  assert.ok(!precache.includes("sw.js"));
});

test("the version changes when a shipped file changes", async () => {
  const source = mkdtempSync(join(tmpdir(), "omniscribe-source-"));
  mkdirSync(join(source, "src"));
  writeFileSync(join(source, "index.html"), "<p>a</p>");
  writeFileSync(join(source, "src", "main.js"), "export const a = 1;");
  writeFileSync(join(source, "sw.js"), readFileSync(join(root, "sw.js")));

  const first = await buildBundle({ source, out: mkdtempSync(join(tmpdir(), "omniscribe-out-")) });
  const again = await buildBundle({ source, out: mkdtempSync(join(tmpdir(), "omniscribe-out-")) });
  writeFileSync(join(source, "src", "main.js"), "export const a = 2;");
  const changed = await buildBundle({ source, out: mkdtempSync(join(tmpdir(), "omniscribe-out-")) });

  assert.equal(first.version, again.version);
  assert.notEqual(first.version, changed.version);
});

test("the manifest is complete and every icon it names exists", () => {
  const manifest = JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf8"));

  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.ok(manifest.name && manifest.short_name && manifest.theme_color && manifest.background_color);

  for (const icon of manifest.icons) {
    assert.ok(existsSync(join(root, icon.src)), icon.src);
  }

  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.type === "image/png"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
});
