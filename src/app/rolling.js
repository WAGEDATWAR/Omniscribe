import { explain } from "../dice/explain.js";
import { stepsOf } from "../dice/presets.js";
import { rollExpression } from "../dice/roll.js";
import { cryptoRng } from "../dice/rng.js";
import { createRollLog } from "../rollLog.js";
import { evaluateSheet, scopeOf } from "../sheet/evaluate.js";
import { createId } from "../utils.js";

/**
 * Rolling for every surface: reads a character's evaluated sheet (G-16), throws, records to the log and
 * announces. The dice table, the Rolls page and the Sheet buttons all go through here.
 */
export function createRolling(ctx) {
  const { store, systems, bus } = ctx;
  const log = createRollLog(ctx.storage);
  const rng = cryptoRng();

  function templateOf(character) {
    const resolved = character?.sheet ? systems.resolve(character.sheet.template) : null;
    return resolved?.ok ? resolved.template : null;
  }

  function scopeFor(characterId) {
    const character = characterId ? store.getCharacter(characterId) : null;
    const template = templateOf(character);
    return template ? scopeOf(evaluateSheet(template, character.sheet)) : {};
  }

  function systemRolls(characterId) {
    const template = templateOf(characterId ? store.getCharacter(characterId) : null);
    return (template?.rolls ?? []).map((roll) => ({ id: `system:${roll.key}`, label: roll.label, expression: roll.expression, group: roll.group ?? "", critMin: roll.critMin ?? null, steps: null }));
  }

  function characterRolls(characterId) {
    const character = characterId ? store.getCharacter(characterId) : null;
    return (character?.rollPresets ?? []).map((preset) => ({ ...preset, id: `preset:${preset.id}` }));
  }

  function findPreset(characterId, key) {
    return [...characterRolls(characterId), ...systemRolls(characterId)].find((preset) => preset.id === key) ?? null;
  }

  /** Throws one expression. Returns `{ ok, roll, text }` or `{ ok: false, error }`, and logs a success. */
  async function roll(expression, { characterId = null, label, item = null, options = {}, groupId = null } = {}) {
    const result = rollExpression(expression, {
      scope: scopeFor(characterId),
      item,
      rng,
      options: { ...options, label, characterId, groupId }
    });

    if (!result.ok) {
      return result;
    }

    const text = explain(result.roll);

    try {
      await log.add(result.roll);
    } catch {
      ctx.toast("The roll could not be saved to the log.", { tone: "error" });
    }

    bus.emit("roll:done", { roll: result.roll, text });
    return { ok: true, roll: result.roll, text };
  }

  /** Fires a preset or macro. A macro's steps share a group id and stop at the first step that fails. */
  async function fire(preset, { characterId = null, options = {} } = {}) {
    const steps = stepsOf(preset);
    const groupId = steps.length > 1 ? createId("grp") : null;
    const results = [];

    for (const [index, step] of steps.entries()) {
      const result = await roll(step.expression, {
        characterId,
        label: steps.length > 1 ? `${preset.label}: ${step.label}` : preset.label,
        groupId,
        options: { ...options, critMin: preset.critMin ?? undefined, adv: index === 0 ? options.adv : false, dis: index === 0 ? options.dis : false }
      });

      results.push(result);

      if (!result.ok) {
        break;
      }
    }

    return results;
  }

  return { log, scopeFor, templateFor: (characterId) => templateOf(characterId ? store.getCharacter(characterId) : null), systemRolls, characterRolls, findPreset, roll, fire };
}
