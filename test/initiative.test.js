import assert from "node:assert/strict";
import test from "node:test";
import { checkHandout } from "../src/files.js";
import { currentEntry, keepTurnOn, moveWithinTie, nextTurn, orderEntries, previousTurn } from "../src/initiative.js";
import { evaluateColumn, evaluateFormulaText, partyRows, sortRows } from "../src/party.js";
import { systemRecords } from "../src/records/systemRecords.js";
import { normalizeCharacter } from "../src/schema.js";

const entry = (id, value, extra = {}) => ({ id, name: id, value, tiebreak: 0, done: false, characterId: null, hp: "", note: "", ...extra });
const names = (list) => list.map((item) => item.id);

test("order is value descending, then tiebreak, then the order added", () => {
  const ordered = orderEntries([entry("a", 10), entry("b", 15), entry("c", 10, { tiebreak: 2 }), entry("d", 10)]);
  assert.deepEqual(names(ordered), ["b", "c", "a", "d"]);
});

test("turns advance, wrap into a new round and clear who has acted", () => {
  let state = { round: 1, turn: 0, entries: [entry("a", 20), entry("b", 10)] };
  assert.equal(currentEntry(state).id, "a");
  state = nextTurn(state);
  assert.equal(state.turn, 1);
  assert.equal(state.entries.find((item) => item.id === "a").done, true);
  state = nextTurn(state);
  assert.equal(state.round, 2);
  assert.equal(state.turn, 0);
  assert.equal(state.entries.some((item) => item.done), false);
});

test("stepping back reopens the entry and returns to the previous round", () => {
  let state = nextTurn({ round: 1, turn: 0, entries: [entry("a", 20), entry("b", 10)] });
  state = previousTurn(state);
  assert.equal(state.turn, 0);
  assert.equal(state.entries.find((item) => item.id === "a").done, false);
  assert.equal(previousTurn(state).round, 1);

  const second = previousTurn({ round: 2, turn: 0, entries: [entry("a", 20), entry("b", 10)] });
  assert.equal(second.round, 1);
  assert.equal(second.turn, 1);
  assert.equal(second.entries.find((item) => item.id === "a").done, true);
  assert.equal(second.entries.find((item) => item.id === "b").done, false);
});

test("an empty tracker has no turn and does not throw", () => {
  const empty = { round: 1, turn: 0, entries: [] };
  assert.equal(currentEntry(empty), null);
  assert.equal(currentEntry(null), null);
  assert.equal(nextTurn(empty), empty);
  assert.equal(previousTurn(empty), empty);
});

test("the turn follows a combatant once the fight has begun, and the top of the order leads before", () => {
  const fresh = { round: 1, turn: 0, entries: [entry("a", 20), entry("b", 10)] };
  const edited = { ...fresh, entries: fresh.entries.map((item) => (item.id === "b" ? { ...item, value: 30 } : item)) };
  assert.equal(currentEntry(keepTurnOn(edited, "a")).id, "b");

  const begun = nextTurn({ round: 1, turn: 0, entries: [entry("a", 20), entry("b", 10), entry("c", 5)] });
  assert.equal(currentEntry(begun).id, "b");
  const bumped = { ...begun, entries: begun.entries.map((item) => (item.id === "c" ? { ...item, value: 50 } : item)) };
  assert.equal(currentEntry(keepTurnOn(bumped, "b")).id, "b");
});

test("only a tie can be reordered with up and down", () => {
  const entries = [entry("a", 10), entry("b", 10), entry("c", 5)];
  const moved = moveWithinTie(entries, "b", -1);
  assert.deepEqual(names(orderEntries(moved)), ["b", "a", "c"]);
  assert.equal(moveWithinTie(entries, "b", 1), entries);
  assert.equal(moveWithinTie(entries, "c", -1), entries);
});

test("a party column is a sheet formula with no dice, evaluated per character", () => {
  assert.equal(evaluateFormulaText("@hp.current").ok, true);
  assert.equal(evaluateFormulaText("").ok, false);
  assert.equal(evaluateFormulaText("((").ok, false);
  assert.equal(evaluateFormulaText("1d20").ok, false);
  const cell = evaluateColumn("@hp.current / @hp.max", { "hp.current": 6, "hp.max": 12 });
  assert.deepEqual([cell.ok, cell.value], [true, 0.5]);
  assert.equal(evaluateColumn("@missing", {}).ok, false);
  assert.equal(evaluateColumn("1d20", {}).ok, false);
});

test("party rows survive a missing sheet, a missing character and an error, and sort sensibly", () => {
  const campaign = { roster: [{ id: "r1", characterId: "char_a" }, { id: "r2", characterId: "char_b" }, { id: "r3", characterId: "char_gone" }, { id: "r4", characterId: "char_c" }], partyColumns: [{ label: "HP", ref: "@hp" }] };
  const characters = [normalizeCharacter({ id: "char_a", name: "A" }), normalizeCharacter({ id: "char_b", name: "B" }), normalizeCharacter({ id: "char_c", name: "C" })];
  const scopes = { char_a: { hp: 9 }, char_b: null, char_c: { hp: 10 } };
  const rows = partyRows(campaign, characters, (character) => scopes[character.id]);
  assert.equal(rows.length, 4);
  assert.equal(rows[1].cells[0].text, "No sheet");
  assert.equal(rows[2].missing, true);
  assert.deepEqual(rows[0].familiars, []);
  assert.deepEqual(sortRows(rows.filter((row) => !row.missing), 0, -1).map((row) => row.character.id), ["char_c", "char_a", "char_b"]);
});

test("a system suggests party columns and an initiative roll, and bad ones are dropped", () => {
  const rules = systemRecords({ extensions: { records: { party: [{ label: "HP", ref: "@hp.current" }, { label: "Bad", ref: "((" }, { label: "", ref: "@ac" }], initiative: "1d20 + @dex.mod" } } });
  assert.deepEqual(rules.party, [{ label: "HP", ref: "@hp.current" }]);
  assert.equal(rules.initiative, "1d20 + @dex.mod");
  assert.equal(systemRecords({ extensions: { records: { initiative: "((" } } }).initiative, null);
});

test("a handout is an image or a PDF judged by its bytes", () => {
  const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(checkHandout({ size: 10, head: pdf }).kind, "pdf");
  assert.equal(checkHandout({ size: 10, head: png }).kind, "png");
  assert.equal(checkHandout({ size: 10, head: Uint8Array.from([1, 2, 3]) }).ok, false);
  assert.equal(checkHandout({ size: 0, head: pdf }).ok, false);
  assert.equal(checkHandout({ size: 30 * 1024 * 1024, head: pdf }).ok, false);
  assert.equal(checkHandout({ size: 10, head: pdf }, { count: 100 }).ok, false);
});
