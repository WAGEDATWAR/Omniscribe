import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Deferral scan (PLAN.md -> Deferral discipline). Greps the project docs for trigger phrases and reports
 * any line that does not name a `DEF-###` id, so a new prose deferral cannot slip in untracked.
 *
 * Usage: `npm run deferral-scan`. Advisory by default; `--strict` fails.
 */
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const triggers = /\b(deferred|defer|for now|comes? with|post-v1|later milestone|not yet)\b/i;
const skipFiles = new Set(["DEFERRALS.md", "CHANGELOG.md"]);
const skipLine = /\b(status|legend|is deferred to|never archived|reference|historical|DEFERRALS|deferral-scan|deferral ledger|Deferral discipline)\b/i;
const strict = process.argv.includes("--strict");
const files = [];

function walk(dir, depth = 0) {
  if (depth > 1) {
    return;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "docs") {
        continue;
      }

      walk(join(dir, entry.name), depth + 1);
    } else if (entry.name.endsWith(".md") && !skipFiles.has(entry.name)) {
      files.push(join(dir, entry.name));
    }
  }
}

if (existsSync(root)) {
  walk(root);
}

let untracked = 0;

for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    if (!triggers.test(line) || skipLine.test(line) || /DEF-\d/.test(line) || /^\s*#/.test(line)) {
      return;
    }

    if (!/^\s*[-*|]|^\s*\*\*/.test(line) || line.trim().length < 20) {
      return;
    }

    console.log(`deferral-scan: ${file.replace(root, "")}:${index + 1}  no DEF- id: ${line.trim().slice(0, 90)}`);
    untracked += 1;
  });
}

console.log(`deferral-scan: ${untracked} untracked deferral line(s)`);

if (strict && untracked > 0) {
  process.exit(1);
}
