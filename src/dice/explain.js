function dieText(die) {
  let text = String(die.value);

  if (die.rerolled) {
    text = `r${text}`;
  }

  if (die.exploded) {
    text = `${text}!`;
  }

  return die.kept ? text : `~${text}~`;
}

function termText(term) {
  return `${term.text} [${term.dice.map(dieText).join(", ")}]`;
}

function poolText(term) {
  const successes = `${term.successes} ${term.successes === 1 ? "success" : "successes"}`;
  return term.failures ? `${successes} - ${term.failures} ${term.failures === 1 ? "failure" : "failures"}` : successes;
}

/** The one sentence every surface shows for a roll (D-4): each die, what happened to it, and the total. */
export function explain(roll) {
  const lone = roll.terms.length === 1 && roll.inputs.length === 0 && roll.resolved === roll.terms[0].text;
  const parts = [...roll.terms.map(termText), ...roll.inputs.map((input) => `@${input.ref} (${input.value})`)];
  const pools = roll.terms.filter((term) => term.pool).map(poolText);
  const head = lone ? parts[0] : `${roll.resolved} -> ${parts.join(", ")}`;
  const tail = pools.length ? ` = ${roll.total} (${pools.join("; ")})` : ` = ${roll.total}`;
  const flags = [roll.flags.critical ? "critical" : "", roll.flags.fumble ? "fumble" : "", roll.flags.botch ? "botch" : ""].filter(Boolean);
  const verdict = roll.verdict ? ` vs ${roll.verdict.target}: ${roll.verdict.success ? "success" : "failure"} by ${roll.verdict.margin}` : "";
  return `${head}${tail}${flags.length ? ` (${flags.join(", ")})` : ""}${verdict}`;
}
