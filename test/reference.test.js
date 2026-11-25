import assert from "node:assert/strict";
import test from "node:test";
import { FUNCTIONS, parseFormula } from "../src/sheet/formula.js";
import { EXAMPLES, FUNCTION_DOCS } from "../src/sheet/reference.js";

test("every function is documented and every documented function exists", () => {
  assert.deepEqual(FUNCTION_DOCS.map((entry) => entry.name).sort(), Object.keys(FUNCTIONS).sort());
});

test("every example in the reference parses with the app's own parser", () => {
  for (const entry of [...FUNCTION_DOCS.map((doc) => ({ title: doc.name, code: doc.example })), ...EXAMPLES]) {
    const parsed = parseFormula(entry.code, { dice: true });
    assert.equal(parsed.ok, true, `${entry.title}: ${entry.code} - ${parsed.error?.message}`);
  }
});
