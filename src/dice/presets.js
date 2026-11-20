import { parseFormula } from "../sheet/formula.js";
import { cleanText, createId, isPlainObject, isValidId } from "../utils.js";

export const PRESET_LIMITS = Object.freeze({ perCharacter: 100, label: 80, group: 40, steps: 10 });

/** Checks an expression the way a typed roll is checked, without throwing any dice. Returns `{ ok }` or `{ ok: false, reason }`. */
export function checkExpression(expression) {
  const text = typeof expression === "string" ? expression.trim() : "";

  if (!text) {
    return { ok: false, reason: "Write a dice expression, such as 1d20 + @str.mod" };
  }

  const parsed = parseFormula(text, { dice: true });
  return parsed.ok ? { ok: true, expression: text } : { ok: false, reason: parsed.error.message };
}

function normalizeSteps(raw) {
  if (!Array.isArray(raw) || !raw.length) {
    return null;
  }

  const steps = [];

  for (const step of raw.slice(0, PRESET_LIMITS.steps)) {
    const expression = typeof step?.expression === "string" ? step.expression.trim() : "";

    if (expression) {
      steps.push({ label: cleanText(step.label, PRESET_LIMITS.label).trim() || expression, expression });
    }
  }

  return steps.length ? steps : null;
}

/** Cleans one stored preset, or returns null when it is not one. Never throws. */
export function normalizePreset(raw) {
  if (!isPlainObject(raw) || !isValidId(raw.id)) {
    return null;
  }

  const steps = normalizeSteps(raw.steps);
  const expression = typeof raw.expression === "string" ? raw.expression.trim() : "";

  if (!steps && !expression) {
    return null;
  }

  const critMin = Number.isInteger(raw.critMin) && raw.critMin >= 2 && raw.critMin <= 1000000 ? raw.critMin : null;

  return {
    id: raw.id,
    label: cleanText(raw.label, PRESET_LIMITS.label).trim() || expression || "Macro",
    expression,
    group: cleanText(raw.group, PRESET_LIMITS.group).trim(),
    critMin,
    steps
  };
}

export function normalizePresets(raw) {
  const seen = new Set();
  const presets = [];

  for (const item of Array.isArray(raw) ? raw : []) {
    const preset = normalizePreset(item);

    if (preset && !seen.has(preset.id)) {
      seen.add(preset.id);
      presets.push(preset);
    }

    if (presets.length >= PRESET_LIMITS.perCharacter) {
      break;
    }
  }

  return presets;
}

/** Builds a new preset from form fields, or explains what is wrong. Macro steps are checked one by one. */
export function buildPreset(fields, { bytes } = {}) {
  const steps = normalizeSteps(fields.steps);

  if (steps) {
    for (const [index, step] of steps.entries()) {
      const verdict = checkExpression(step.expression);

      if (!verdict.ok) {
        return { ok: false, reason: `Step ${index + 1}: ${verdict.reason}` };
      }
    }
  } else {
    const verdict = checkExpression(fields.expression);

    if (!verdict.ok) {
      return verdict;
    }
  }

  const label = cleanText(fields.label, PRESET_LIMITS.label).trim();

  if (!label) {
    return { ok: false, reason: "Give the roll a name" };
  }

  const preset = normalizePreset({ ...fields, label, id: isValidId(fields.id) ? fields.id : createId("preset", bytes) });
  return preset ? { ok: true, preset } : { ok: false, reason: "That roll could not be saved" };
}

/** The rolls to throw for a preset or system roll: one for a plain roll, one per step for a macro. */
export function stepsOf(preset) {
  return preset.steps ?? [{ label: preset.label, expression: preset.expression }];
}
