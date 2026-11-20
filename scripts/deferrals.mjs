import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The deferral ledger check (PLAN.md -> Deferral discipline). Fails on a malformed or ownerless row so
 * a deferral can never be silently forgotten.
 *
 * Usage: `npm run deferrals` (also run in CI). Pass an owner phase to list only its rows, e.g.
 * `npm run deferrals -- P4`.
 */
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ledger = resolve(root, "DEFERRALS.md");

if (!existsSync(ledger)) {
  console.error("deferrals: DEFERRALS.md not found");
  process.exit(1);
}

const statuses = new Set(["open", "scheduled", "doing", "done", "dropped"]);
const rows = [];
const ids = new Set();
const problems = [];
const text = readFileSync(ledger, "utf8");

for (const line of text.split(/\r?\n/)) {
  if (!line.startsWith("| DEF-")) {
    continue;
  }

  const cells = line.split("|").map((cell) => cell.trim());
  const id = cells[1] ?? "";
  const owner = cells[4] ?? "";
  const status = cells[5] ?? "";

  if (!id) {
    continue;
  }

  if (ids.has(id)) {
    problems.push(`duplicate id ${id}`);
  }

  ids.add(id);

  if (!owner) {
    problems.push(`${id}: no owner`);
  }

  if (!status || !statuses.has(status)) {
    problems.push(`${id}: bad status "${status}"`);
  }

  rows.push({ id, owner, status });
}

const filter = process.argv.slice(2).find((arg) => /^(P\d|post-v1)$/.test(arg));
const shown = filter ? rows.filter((row) => row.owner === filter) : rows;
const open = rows.filter((row) => row.status === "open").length;
const scheduled = rows.filter((row) => row.status === "scheduled").length;
const done = rows.filter((row) => row.status === "done").length;

if (filter && shown.length) {
  console.log(`== deferrals owned by ${filter} ==`);

  for (const row of shown) {
    console.log(`  ${row.id}  [${row.status}]  ${row.owner}`);
  }
}

console.log(`deferrals: ${rows.length} row(s) - ${open} open, ${scheduled} scheduled, ${done} done`);

if (problems.length) {
  for (const problem of problems) {
    console.error(`  FAIL ${problem}`);
  }

  process.exit(1);
}

console.log("deferrals: ledger is well-formed");
