import { FormulaError, evaluateFormula, parseFormula } from "../sheet/formula.js";
import { cryptoRng } from "./rng.js";

export const DICE_LIMITS = Object.freeze({
  perTerm: 1000,
  sides: 1000000,
  perRoll: 5000,
  rerolls: 100,
  explosions: 1000
});

function compare(cond, value) {
  switch (cond.op) {
    case ">=":
      return value >= cond.n;
    case "<=":
      return value <= cond.n;
    case ">":
      return value > cond.n;
    case "<":
      return value < cond.n;
    default:
      return value === cond.n;
  }
}

function coversEveryFace(cond, low, high) {
  switch (cond.op) {
    case ">=":
      return cond.n <= low;
    case "<=":
      return cond.n >= high;
    case ">":
      return cond.n < low;
    case "<":
      return cond.n > high;
    default:
      return low === high && cond.n === low;
  }
}

function describeCondition(cond) {
  return `${cond.op === "=" ? "" : cond.op}${cond.n}`;
}

function wholeNumber(value, node, what, min, max) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new FormulaError(`${what} must be a whole number`, node?.index ?? null);
  }

  if (value < min || value > max) {
    throw new FormulaError(`${what} must be between ${min.toLocaleString("en-US")} and ${max.toLocaleString("en-US")}`, node?.index ?? null);
  }

  return value;
}

function makeThrower(node, sides, rng, state) {
  const fudge = sides === "F";
  const low = fudge ? -1 : 1;
  const high = fudge ? 1 : sides;

  const draw = () => {
    state.thrown += 1;

    if (state.thrown > DICE_LIMITS.perRoll) {
      throw new FormulaError(`A roll is limited to ${DICE_LIMITS.perRoll.toLocaleString("en-US")} dice, counting rerolls and explosions`, node.index);
    }

    return fudge ? rng.int(3) - 2 : rng.int(sides);
  };

  return { low, high, draw };
}

function evaluateDice(node, evaluate, state) {
  const mods = [...node.mods];
  const has = (kind) => mods.filter((mod) => mod.kind === kind);

  let count = typeof node.count === "number" ? node.count : evaluate(node.count);
  count = wholeNumber(count, node, "The number of dice", 0, DICE_LIMITS.perTerm);

  let rawSides = node.sides;

  if (rawSides !== "%" && rawSides !== "F" && typeof rawSides !== "number") {
    rawSides = evaluate(rawSides);
  }

  const sides = rawSides === "%" ? 100 : rawSides === "F" ? "F" : wholeNumber(rawSides, node, "The sides of a die", 1, DICE_LIMITS.sides);

  const advantage = has("adv").length;
  const disadvantage = has("dis").length;

  if (advantage + disadvantage > 1) {
    throw new FormulaError("A die can have advantage or disadvantage once, not both or twice", node.index);
  }

  let keep = null;
  let optionAdvantage = null;

  if (advantage || disadvantage) {
    if (sides !== 20 || count !== 1) {
      throw new FormulaError("Advantage and disadvantage belong on a single d20", node.index);
    }

    count = 2;
    keep = { kind: advantage ? "kh" : "kl", n: 1 };
  } else if (sides === 20 && count === 1 && state.option && !state.optionUsed && !mods.some((mod) => mod.kind === "kh" || mod.kind === "kl" || mod.kind === "dh" || mod.kind === "dl")) {
    state.optionUsed = true;
    optionAdvantage = state.option;
    count = 2;
    keep = { kind: state.option === "adv" ? "kh" : "kl", n: 1 };
  }

  const { low, high, draw } = makeThrower(node, sides, state.rng, state);
  const rerolls = has("reroll");
  const clamps = mods.filter((mod) => mod.kind === "min" || mod.kind === "max");
  const explodes = has("explode");

  for (const reroll of rerolls) {
    if (coversEveryFace(reroll.cond, low, high)) {
      throw new FormulaError(`Reroll ${describeCondition(reroll.cond)} matches every face, so it could never stop`, node.index);
    }
  }

  for (const explode of explodes) {
    const cond = explode.cond.op === "max" ? { op: "=", n: high } : explode.cond;

    if (coversEveryFace(cond, low, high) && !(low === high)) {
      throw new FormulaError("This explosion matches every face, so it could never stop", node.index);
    }

    explode.test = cond;
  }

  const dice = [];
  let explosions = 0;

  const throwOne = (exploded) => {
    let value = draw();
    let rerolled = false;

    for (const reroll of rerolls) {
      let attempts = 0;

      while (compare(reroll.cond, value)) {
        if (attempts >= (reroll.once ? 1 : DICE_LIMITS.rerolls)) {
          if (reroll.once) {
            break;
          }

          throw new FormulaError(`A die was rerolled ${DICE_LIMITS.rerolls} times and still matched r${describeCondition(reroll.cond)}`, node.index);
        }

        value = draw();
        rerolled = true;
        attempts += 1;
      }
    }

    for (const clamp of clamps) {
      value = clamp.kind === "min" ? Math.max(value, clamp.n) : Math.min(value, clamp.n);
    }

    return { value, kept: true, exploded, rerolled, success: false, failure: false };
  };

  for (let index = 0; index < count; index += 1) {
    let die = throwOne(false);
    dice.push(die);

    while (explodes.some((explode) => compare(explode.test, die.value))) {
      explosions += 1;

      if (explosions > DICE_LIMITS.explosions) {
        throw new FormulaError(`A term is limited to ${DICE_LIMITS.explosions.toLocaleString("en-US")} explosions`, node.index);
      }

      die = throwOne(true);
      dice.push(die);
    }
  }

  const choices = keep ? [keep] : [];

  for (const mod of mods) {
    if (mod.kind === "kh" || mod.kind === "kl" || mod.kind === "dh" || mod.kind === "dl") {
      choices.push(mod);
    }
  }

  for (const choice of choices) {
    const live = dice.filter((die) => die.kept).sort((a, b) => a.value - b.value || dice.indexOf(a) - dice.indexOf(b));
    const n = Math.min(choice.n, live.length);
    const high = choice.kind === "kh" || choice.kind === "dh";
    const keeping = choice.kind[0] === "k";
    const chosen = high ? live.slice(live.length - n) : live.slice(0, n);

    for (const die of keeping ? live.filter((item) => !chosen.includes(item)) : chosen) {
      die.kept = false;
    }
  }

  const success = has("cs")[0];
  const failure = has("cf")[0];
  const pool = Boolean(success || failure);
  let successes = 0;
  let failures = 0;

  for (const die of dice) {
    if (!die.kept) {
      continue;
    }

    if (success && compare(success.cond, die.value)) {
      die.success = true;
      successes += 1;
    }

    if (failure && compare(failure.cond, die.value)) {
      die.failure = true;
      failures += 1;
    }
  }

  const subtotal = pool ? successes - failures : dice.reduce((sum, die) => sum + (die.kept ? die.value : 0), 0);
  const term = { text: node.text, count, sides: sides === "F" ? "F" : sides, dice, subtotal, pool, successes, failures, option: optionAdvantage };

  state.terms.push(term);

  if (pool) {
    state.pool = true;

    if (successes === 0 && failures > 0) {
      state.flags.botch = true;
    }
  }

  if (!state.flagged && sides === 20) {
    state.flagged = true;
    const natural = dice.find((die) => die.kept) ?? null;

    if (natural) {
      state.flags.critical = natural.value >= state.critMin;
      state.flags.fumble = natural.value === 1;
    }
  }

  return subtotal;
}

let counter = 0;

function newRollId() {
  counter += 1;
  return `roll_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function resolvedText(source, inputs) {
  let text = source;

  for (const input of [...inputs].sort((a, b) => b.ref.length - a.ref.length)) {
    text = text.split(`@${input.ref}`).join(String(input.value));
  }

  return text;
}

/**
 * Rolls one dice expression. `scope` is the flat map of readable values (`scopeOf`), `item` an optional row scope for `$`.
 * `options`: `{ adv | dis, critMin, label, characterId, campaignId, groupId, now }`.
 * Returns `{ ok: true, roll }` or `{ ok: false, error: { message, index } }`; a failed roll has thrown no recorded dice.
 */
export function rollExpression(source, { scope = {}, item = null, rng = cryptoRng(), options = {} } = {}) {
  const parsed = parseFormula(source, { dice: true });

  if (!parsed.ok) {
    return parsed;
  }

  const inputs = [];
  const seen = new Set();

  const state = {
    rng,
    thrown: 0,
    terms: [],
    flags: { critical: false, fumble: false, botch: false },
    flagged: false,
    pool: false,
    option: options.adv ? "adv" : options.dis ? "dis" : null,
    optionUsed: false,
    critMin: Number.isInteger(options.critMin) ? options.critMin : 20
  };

  const context = {
    scalar(path) {
      const key = path.join(".");
      const value = scope[key];

      if (value !== undefined && value !== null && !seen.has(key)) {
        seen.add(key);
        inputs.push({ ref: key, value });
      }

      return value;
    },
    collection: () => null,
    list: () => null,
    choiceIndex: () => null,
    table: () => null,
    item,
    dice: (node, evaluate) => evaluateDice(node, evaluate, state)
  };

  let result;

  try {
    result = evaluateFormula(parsed, context);
  } catch (error) {
    if (error instanceof RangeError || error instanceof Error) {
      return { ok: false, error: { message: error.message, index: null } };
    }

    throw error;
  }

  if (!result.ok) {
    return result;
  }

  if (typeof result.value !== "number") {
    return { ok: false, error: { message: "A dice expression must come out as a number; use if() to choose", index: null } };
  }

  const at = options.now ?? Date.now();

  return {
    ok: true,
    roll: {
      id: newRollId(),
      at,
      characterId: options.characterId ?? null,
      campaignId: options.campaignId ?? null,
      label: options.label || source,
      expression: source,
      resolved: resolvedText(source, inputs),
      total: result.value,
      mode: state.pool ? "pool" : "total",
      terms: state.terms,
      inputs,
      flags: state.flags,
      groupId: options.groupId ?? null,
      secret: false
    }
  };
}
