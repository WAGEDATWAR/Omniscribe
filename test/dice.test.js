import assert from "node:assert/strict";
import { test } from "node:test";
import { explain } from "../src/dice/explain.js";
import { cryptoRng, scriptedRng, seededRng } from "../src/dice/rng.js";
import { DICE_LIMITS, rollExpression } from "../src/dice/roll.js";
import { parseFormula } from "../src/sheet/formula.js";

function roll(source, values, extra = {}) {
  return rollExpression(source, { rng: scriptedRng(values), ...extra });
}

function total(source, values, extra) {
  const result = roll(source, values, extra);
  assert.ok(result.ok, result.error?.message);
  return result.roll.total;
}

test("sheet formulas never roll; dice are opt-in", () => {
  assert.equal(parseFormula("2d6").ok, false);
  assert.equal(parseFormula("2d6", { dice: true }).ok, true);
});

test("plain terms, modifiers on the total and precedence", () => {
  assert.equal(total("d20", [14]), 14);
  assert.equal(total("2d6+3", [4, 5]), 12);
  assert.equal(total("2d6 * 2", [3, 4]), 14);
  assert.equal(total("-2d6", [3, 4]), -7);
  assert.equal(total("0d6", []), 0);
});

test("keep and drop choose which dice count", () => {
  const kept = roll("4d6kh3", [6, 5, 3, 2]);
  assert.equal(kept.roll.total, 14);
  assert.deepEqual(kept.roll.terms[0].dice.map((die) => die.kept), [true, true, true, false]);
  assert.equal(total("4d6dl1", [6, 5, 3, 2]), 14);
  assert.equal(total("4d6kl2", [6, 5, 3, 2]), 5);
  assert.equal(total("4d6dh1", [6, 5, 3, 2]), 10);
  assert.equal(total("2d6kh3", [3, 4]), 7);
  assert.equal(total("2d6dl5", [3, 4]), 0);
});

test("explode adds dice and marks them", () => {
  const result = roll("2d6!", [6, 3, 6, 6, 2]);
  assert.equal(result.roll.total, 6 + 3 + 6 + 6 + 2 - 3 + 3);
  assert.equal(result.roll.terms[0].dice.filter((die) => die.exploded).length, 3);
  assert.equal(total("1d6!>4", [5, 6, 1]), 12);
  assert.equal(total("1d6!>=5", [5, 4]), 9);
  assert.equal(total("1d6!2", [2, 1]), 3);
});

test("reroll repeats, reroll once stops after one", () => {
  assert.equal(total("1d6r1", [1, 1, 4]), 4);
  assert.equal(total("1d6ro1", [1, 1]), 1);
  assert.equal(total("1d6r<=2", [2, 1, 3]), 3);
  const marked = roll("1d6r1", [1, 5]);
  assert.equal(marked.roll.terms[0].dice[0].rerolled, true);
});

test("min and max clamp each die", () => {
  assert.equal(total("3d6min2", [1, 2, 6]), 10);
  assert.equal(total("3d6max4", [1, 5, 6]), 9);
});

test("pools count successes and failures and flag a botch", () => {
  const pool = roll("8d10cs>=8cf=1", [9, 8, 8, 5, 3, 1, 1, 10]);
  assert.equal(pool.roll.total, 2);
  assert.equal(pool.roll.mode, "pool");
  assert.equal(pool.roll.flags.botch, false);
  const botch = roll("3d10cs>=8cf=1", [1, 2, 3]);
  assert.equal(botch.roll.total, -1);
  assert.equal(botch.roll.flags.botch, true);
  assert.equal(total("4d6cs>5", [6, 6, 1, 2]), 2);
});

test("advantage, disadvantage and the roll option", () => {
  assert.equal(total("d20adv", [4, 17]), 17);
  assert.equal(total("d20dis + 2", [4, 17]), 6);
  assert.equal(total("d20", [4, 17], { options: { adv: true } }), 17);
  assert.equal(total("d20 + d20", [4, 17, 9], { options: { dis: true } }), 4 + 17 + 9 - 17);
  assert.equal(roll("d6adv", [1, 2]).ok, false);
  assert.equal(roll("2d20adv", [1, 2]).ok, false);
  assert.equal(roll("d20advdis", [1, 2]).ok, false);
});

test("percentile and Fudge dice", () => {
  assert.equal(total("d%", [64]), 64);
  assert.equal(total("4dF", [1, 2, 3, 3]), -1 + 0 + 1 + 1);
});

test("counts and sides can be expressions that read the character", () => {
  const scope = { level: 3, size: 8, "str.mod": 2 };
  const result = rollExpression("(@level)d6 + 1d(@size) + @str.mod", { scope, rng: scriptedRng([1, 2, 3, 8]) });
  assert.equal(result.roll.total, 1 + 2 + 3 + 8 + 2);
  assert.deepEqual(result.roll.inputs.map((input) => input.ref), ["level", "size", "str.mod"]);
  assert.equal(result.roll.resolved, "3d6 + 1d(8) + 2".replace("3d6", "(3)d6"));
});

test("if only rolls the branch it takes", () => {
  const scope = { level: 5 };
  assert.equal(total("if(@level > 4, 3d6, 2d6)", [1, 2, 3], { scope }), 6);
  assert.equal(total("if(@level > 9, 3d6, 2d6)", [1, 2], { scope }), 3);
});

test("a missing value or a non-number fails before anything is recorded", () => {
  assert.equal(roll("d20 + @nope", [5]).ok, false);
  assert.equal(roll("d20 > 3", [5]).ok, false);
  assert.equal(roll("d20 + $.bonus", [5]).ok, false);
  assert.equal(total("d20 + $.bonus", [5], { item: { get: () => 4 } }), 9);
});

test("limits are errors, not clamps", () => {
  assert.equal(roll("1001d6", []).ok, false);
  assert.equal(roll("1d1000001", []).ok, false);
  assert.equal(roll("d6!>=1", [1]).ok, false);
  assert.equal(roll("d6r<=6", [1]).ok, false);
  assert.equal(roll("d6r>0", [1]).ok, false);
  assert.equal(roll("1d6!", Array(DICE_LIMITS.explosions + 2).fill(6)).ok, false);
  assert.equal(roll("1d6r1", Array(DICE_LIMITS.rerolls + 2).fill(1)).ok, false);
  const many = roll("1000d6 + 1000d6 + 1000d6 + 1000d6 + 1000d6 + 1d6", Array(5001).fill(1));
  assert.equal(many.ok, false);
  assert.equal(roll("(0.5)d6", []).ok, false);
  assert.equal(roll("(-1)d6", []).ok, false);
});

test("a failed roll throws and records nothing the caller must undo", () => {
  const failed = roll("2d6 + @missing", [1, 2]);
  assert.equal(failed.ok, false);
  assert.equal(failed.roll, undefined);
});

test("critical and fumble come from the first d20", () => {
  assert.equal(roll("d20", [20]).roll.flags.critical, true);
  assert.equal(roll("d20", [19]).roll.flags.critical, false);
  assert.equal(roll("d20", [19], { options: { critMin: 19 } }).roll.flags.critical, true);
  assert.equal(roll("d20", [1]).roll.flags.fumble, true);
  assert.equal(roll("d20adv", [1, 20]).roll.flags.critical, true);
  assert.equal(roll("d6", [6]).roll.flags.critical, false);
});

test("the explanation shows every die and what happened to it", () => {
  assert.equal(explain(roll("4d6kh3", [6, 5, 3, 2]).roll), "4d6kh3 [6, 5, 3, ~2~] = 14");
  assert.equal(explain(roll("d20 + @str.mod", [14], { scope: { "str.mod": 3 } }).roll), "d20 + 3 -> d20 [14], @str.mod (3) = 17");
  assert.match(explain(roll("8d10cs>=8cf=1", [9, 8, 8, 5, 3, 1, 1, 10]).roll), /= 2 \(4 successes - 2 failures\)/);
  assert.match(explain(roll("1d6!", [6, 2]).roll), /\[6!?, 2!\]|\[6, 2!\]/);
  assert.match(explain(roll("d20", [20]).roll), /critical/);
});

test("the record carries what a log needs", () => {
  const result = roll("d20 + 1", [7], { options: { label: "Attack", characterId: "char_a", groupId: "g1", now: 5 } });
  const { roll: record } = result;
  assert.match(record.id, /^roll_/);
  assert.equal(record.label, "Attack");
  assert.equal(record.characterId, "char_a");
  assert.equal(record.groupId, "g1");
  assert.equal(record.at, 5);
  assert.equal(record.secret, false);
  assert.equal(roll("d20", [7]).roll.label, "d20");
});

test("ids are never reused", () => {
  const ids = new Set(Array.from({ length: 200 }, () => roll("d6", [1]).roll.id));
  assert.equal(ids.size, 200);
});

test("the random sources are uniform and bounded", () => {
  const rng = seededRng(42);
  const counts = Array(6).fill(0);

  for (let index = 0; index < 60000; index += 1) {
    counts[rng.int(6) - 1] += 1;
  }

  const expected = 10000;
  const chi = counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
  assert.ok(chi < 20.5, `chi-square ${chi}`);

  const crypto = cryptoRng();

  for (let index = 0; index < 1000; index += 1) {
    const value = crypto.int(20);
    assert.ok(value >= 1 && value <= 20);
  }

  assert.throws(() => rng.int(0));
  assert.throws(() => scriptedRng([7]).int(6));
  assert.throws(() => scriptedRng([]).int(6));
});

function mean(source, runs = 40000, options) {
  const rng = seededRng(7);
  let sum = 0;

  for (let index = 0; index < runs; index += 1) {
    sum += rollExpression(source, { rng, options }).roll.total;
  }

  return sum / runs;
}

test("distributions match the maths", () => {
  assert.ok(Math.abs(mean("4d6kh3") - 12.2446) < 0.1);
  assert.ok(Math.abs(mean("d20adv") - 13.825) < 0.15);
  assert.ok(Math.abs(mean("d20dis") - 7.175) < 0.15);
  assert.ok(Math.abs(mean("8d10cs>=8") - 2.4) < 0.05);

  const rng = seededRng(3);
  const spread = new Map();

  for (let index = 0; index < 72000; index += 1) {
    const value = rollExpression("2d6", { rng }).roll.total;
    spread.set(value, (spread.get(value) ?? 0) + 1);
  }

  for (let sum = 2; sum <= 12; sum += 1) {
    const expected = (6 - Math.abs(sum - 7)) / 36;
    assert.ok(Math.abs(spread.get(sum) / 72000 - expected) < 0.01, `2d6 = ${sum}`);
  }
});

test("hostile dice text never throws", () => {
  const rng = seededRng(11);
  const pieces = ["d", "D", "4", "6", "20", "%", "F", "(", ")", "@", "x", "!", ">", "<", "=", "r", "ro", "kh", "kl", "dh", "dl", "cs", "cf", "min", "max", "adv", "dis", " ", "+", "-", "*", "999999999999", "$", ".", "\""];

  for (let run = 0; run < 4000; run += 1) {
    const length = 1 + (rng.int(10) - 1);
    let text = "";

    for (let part = 0; part < length; part += 1) {
      text += pieces[rng.int(pieces.length) - 1];
    }

    const result = rollExpression(text, { rng: seededRng(run + 1) });
    assert.ok(result.ok === true || result.ok === false);

    if (!result.ok) {
      assert.equal(typeof result.error.message, "string");
    }
  }
});

test("a target turns a roll into a verdict with its margin (DEF-100)", async () => {
  const { rollExpression, verdictOf } = await import("../src/dice/roll.js");
  const { explain } = await import("../src/dice/explain.js");

  const under = rollExpression("10", { options: { target: { value: 12, compare: "under" } } }).roll;
  assert.deepEqual(under.verdict, { target: 12, compare: "under", success: true, margin: 2 });
  assert.match(explain(under), /vs 12: success by 2$/);

  const over = rollExpression("10", { options: { target: { value: 12, compare: "over" } } }).roll;
  assert.deepEqual(over.verdict, { target: 12, compare: "over", success: false, margin: 2 });
  assert.match(explain(over), /failure by 2$/);

  assert.equal(verdictOf(12, { value: 12 }).success, true);
  assert.equal(verdictOf(12, { value: 12, compare: "over" }).margin, 0);
  assert.equal(rollExpression("10").roll.verdict, null);
  assert.equal(verdictOf(5, { value: Number.NaN }), null);
});
