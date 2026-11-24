import assert from "node:assert/strict";
import test from "node:test";
import { deletedCharacters, describeChange, expiredRevisions, makeRevision, planRevisions, sessionDue, signatureOf } from "../src/revisions.js";

const character = (fields = {}) => ({ id: "char_a", name: "Mira", inventory: [], journal: [], updatedAt: 1, ...fields });
const rev = (id, at, fields = {}, label = "") => makeRevision(character(fields), { id, at, label });

test("the signature ignores updatedAt and follows content", () => {
  assert.equal(signatureOf(character({ updatedAt: 1 })), signatureOf(character({ updatedAt: 99 })));
  assert.notEqual(signatureOf(character()), signatureOf(character({ name: "Bram" })));
});

test("a session is due after a gap or when there is none", () => {
  assert.equal(sessionDue(undefined, 1000), true);
  assert.equal(sessionDue(1000, 1000 + 60000), false);
  assert.equal(sessionDue(1000, 1000 + 31 * 60000), true);
});

test("a repeat of the latest revision is not stored, unless it is labelled", () => {
  const first = rev("rev_1", 10);
  assert.deepEqual(planRevisions([first], rev("rev_2", 20)), { add: null, remove: [] });
  assert.equal(planRevisions([first], rev("rev_3", 20, {}, "Before the boss")).add.id, "rev_3");
  assert.equal(planRevisions([first], rev("rev_4", 20, { name: "Bram" })).add.id, "rev_4");
});

test("the per-character bound drops unlabelled and oldest first", () => {
  const existing = [rev("rev_1", 1, { name: "a" }, "keep me"), rev("rev_2", 2, { name: "b" }), rev("rev_3", 3, { name: "c" })];
  const plan = planRevisions(existing, rev("rev_4", 4, { name: "d" }), { perCharacter: 3 });

  assert.deepEqual(plan.remove, ["rev_2"]);
  assert.equal(plan.add.id, "rev_4");
});

test("the total size bound drops the oldest unlabelled revisions of any character", () => {
  const other = makeRevision({ id: "char_b", name: "x".repeat(500) }, { id: "rev_b", at: 1 });
  const mine = rev("rev_1", 2, { name: "m" });
  const plan = planRevisions([other], mine, { totalBytes: mine.size + 10 });

  assert.deepEqual(plan.remove, ["rev_b"]);
  assert.equal(plan.add.id, "rev_1");
});

test("a change is described in a few words", () => {
  const older = character({ inventory: [{}, {}] });
  const newer = character({ inventory: [{}, {}, {}, {}, {}], name: "Mira Vale" });

  assert.equal(describeChange(older, newer), "name, 3 inventory entries added");
  assert.equal(describeChange(older, older), "No difference");
});

test("deleted characters keep their revisions for thirty days", () => {
  const day = 24 * 60 * 60 * 1000;
  const old = makeRevision({ id: "char_gone", name: "G" }, { id: "rev_old", at: 0 });
  const recent = makeRevision({ id: "char_gone", name: "G2" }, { id: "rev_new", at: 20 * day });
  const alive = makeRevision({ id: "char_a", name: "A" }, { id: "rev_alive", at: 0 });

  assert.deepEqual(expiredRevisions([old, recent, alive], ["char_a"], 35 * day), ["rev_old"]);
  assert.deepEqual(deletedCharacters([old, recent, alive], ["char_a"]).map((entry) => entry.id), ["rev_new"]);
});
