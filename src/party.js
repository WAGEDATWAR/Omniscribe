import { evaluateFormula, formatNumber, parseFormula } from "./sheet/formula.js";

/**
 * Pure party maths (K-4): a column is a sheet formula (no dice) evaluated against each character's own evaluated
 * sheet. Nothing is stored per character; a missing sheet or an error is shown as text, never as 0.
 */
export function evaluateFormulaText(source) {
  const text = typeof source === "string" ? source.trim() : "";

  if (!text) {
    return { ok: false, reason: "Write a value, such as @hp.current" };
  }

  const parsed = parseFormula(text);
  return parsed.ok ? { ok: true, source: text } : { ok: false, reason: parsed.error.message };
}

export function formatValue(value) {
  if (typeof value === "number") {
    return formatNumber(value);
  }

  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }

  return String(value);
}

/** One cell: `{ ok, value, text }`, or `{ ok: false, text }` explaining why there is no value. */
export function evaluateColumn(source, scope) {
  const parsed = parseFormula(source);

  if (!parsed.ok) {
    return { ok: false, text: parsed.error.message };
  }

  const context = {
    scalar: (path) => scope[path.join(".")],
    collection: () => null,
    list: () => null,
    choiceIndex: () => null,
    table: () => null,
    item: null
  };

  try {
    const result = evaluateFormula(parsed, context);
    return result.ok ? { ok: true, value: result.value, text: formatValue(result.value) } : { ok: false, text: result.error.message };
  } catch (error) {
    return { ok: false, text: error instanceof Error ? error.message : "No value" };
  }
}

/**
 * One row per roster member that is still in the library, in roster order. `scopeFor(character)` gives the
 * evaluated values of that character's sheet, or null when it has no sheet.
 */
export function partyRows(campaign, characters, scopeFor) {
  const rows = [];

  for (const member of campaign.roster) {
    const character = characters.find((entry) => entry.id === member.characterId);

    if (!character) {
      rows.push({ member, character: null, cells: [], missing: true });
      continue;
    }

    const scope = scopeFor(character);
    const cells = campaign.partyColumns.map((column) => (scope ? evaluateColumn(column.ref, scope) : { ok: false, text: "No sheet" }));
    rows.push({ member, character, cells, missing: false, conditions: (character.sheet?.conditions ?? []).map((entry) => entry.name), familiars: character.familiars.filter((familiar) => familiar.summoned).map((familiar) => familiar.name.trim() || "Unnamed") });
  }

  return rows;
}

/** Sorts party rows by a column index: numbers numerically, text naturally, and cells without a value last. */
export function sortRows(rows, columnIndex, direction = 1) {
  return [...rows].sort((left, right) => {
    const a = left.cells[columnIndex];
    const b = right.cells[columnIndex];

    if (!a?.ok && !b?.ok) {
      return 0;
    }

    if (!a?.ok) {
      return 1;
    }

    if (!b?.ok) {
      return -1;
    }

    const order = typeof a.value === "number" && typeof b.value === "number" ? a.value - b.value : String(a.value).localeCompare(String(b.value), undefined, { numeric: true });
    return order * direction;
  });
}
