import { carriedWeight, totalValue } from "../inventory.js";
import { STATUS_LABELS, displayName } from "../schema.js";
import { isEmptyValue } from "../layouts/values.js";
import { layoutOf } from "../sheet/layout.js";
import { formatValue } from "../sheet/template.js";

/**
 * The generated sheet as data (G-19, X-11): what a character looks like on paper, as the blocks `generate.js` lays out.
 * `template` and `computed` are the resolved system and its evaluation, or null when the character has no sheet.
 * Journal text and secret entries are left out unless `includeJournal` is set.
 */
const number = (value) => String(Number(Number(value).toFixed(3)));

function showValue(field, value) {
  if (value === null || value === undefined) {
    return "";
  }

  switch (field.type) {
    case "flag":
      return value ? "Yes" : "No";
    case "choice":
      return field.choices?.find((choice) => choice.value === value)?.label ?? String(value);
    case "list":
      return Array.isArray(value) ? value.join(", ") : String(value);
    case "uses":
      return `${value.used ?? 0}`;
    default:
      return formatValue(field, value);
  }
}

function trackText(field, states = []) {
  return field.boxes.map((name, position) => `${name} ${["[ ]", "[X]", "[/]"][states[position] ?? 0]}`).join("  ");
}

function poolText(pool, state) {
  if (!state) {
    return "";
  }

  return `${state.current} / ${state.max}${state.temp ? ` (+${state.temp} temporary)` : ""}`;
}

function systemBlocks(template, computed) {
  const blocks = [];

  for (const section of layoutOf(template)) {
    const heading = { type: "heading", text: section.title };

    if (section.layout === "table") {
      for (const key of section.items) {
        const collection = template.collections.find((entry) => entry.key === key);
        const rows = computed.collections[key] ?? [];

        if (!collection || !rows.length) {
          continue;
        }

        const columns = collection.fields.filter((field) => field.type !== "roll");
        blocks.push(heading, {
          type: "table",
          columns: columns.map((field) => ({ label: field.label ?? field.key, align: field.type === "number" || (field.type === "derived" && !["text"].includes(field.format)) ? "right" : "left" })),
          rows: rows.map((row) =>
            columns.map((field) => {
              if (field.type === "uses") {
                const use = row.uses[field.key];
                return use ? `${use.left ?? use.used}${use.max === null ? "" : ` / ${use.max}`}` : "";
              }

              return showValue(field, row.values[field.key]);
            })
          )
        });
      }

      continue;
    }

    const pairs = [];
    const texts = [];

    for (const key of section.items) {
      const field = template.fields.find((entry) => entry.key === key);
      const pool = template.pools.find((entry) => entry.key === key);

      if (field) {
        const value = field.type === "track" ? trackText(field, computed.tracks?.[key]) : computed.values[key];

        if (field.type === "longtext" || section.layout === "text") {
          const text = String(value ?? "");

          if (text.trim()) {
            texts.push({ type: "text", label: field.label ?? key, text });
          }
        } else {
          pairs.push([field.label ?? key, showValue(field, value)]);
        }
      } else if (pool) {
        pairs.push([pool.label ?? key, poolText(pool, computed.pools[key])]);
      }
    }

    if (pairs.length || texts.length) {
      blocks.push(heading);

      if (pairs.length) {
        blocks.push({ type: "pairs", rows: pairs });
      }

      blocks.push(...texts);
    }
  }

  if (computed.conditions.length) {
    blocks.push({ type: "heading", text: "Conditions" }, { type: "list", items: computed.conditions.map((entry) => (entry.note ? `${entry.name}: ${entry.note}` : entry.name)) });
  }

  return blocks;
}

function ownText(item, value) {
  if (item.type === "checkbox") {
    return value ? "Yes" : "No";
  }

  return Array.isArray(value) ? value.join(", ") : String(value);
}

/** The fields of your own that a page shows and that hold a value in at least one of the records, as columns. */
function ownColumns(layouts, surface, records, include) {
  const items = (layouts?.[surface]?.sections ?? [])
    .flatMap((section) => section.items)
    .filter((item) => item.own && !item.hidden && (include || !item.secret) && records.some((record) => !isEmptyValue(item.def, record.fields?.[item.key])));

  return {
    columns: items.map((item) => ({ label: item.label, align: item.type === "number" ? "right" : "left" })),
    cells: (record) => items.map((item) => (isEmptyValue(item.def, record.fields?.[item.key]) ? "" : ownText(item, record.fields[item.key])))
  };
}

function withOwn(columns, rows, records, extra) {
  return extra.columns.length ? { columns: [...columns, ...extra.columns], rows: rows.map((row, index) => [...row, ...extra.cells(records[index])]) } : { columns, rows };
}

function inventoryBlocks(character, layouts, include) {
  const { items, wallets } = character.inventory;
  const money = Object.entries(wallets ?? {}).filter(([, amount]) => amount);

  if (!items.length && !money.length) {
    return [];
  }

  const blocks = [{ type: "heading", text: "Inventory" }];
  const summary = [["Carried weight", number(carriedWeight(items))], ["Total value", number(totalValue(items))], ...money.map(([code, amount]) => [code.toUpperCase(), number(amount)])];
  blocks.push({ type: "pairs", rows: summary });

  if (items.length) {
    const nameOf = new Map(items.map((item) => [item.id, item.name || "Unnamed"]));
    const base = [
      { label: "Item" },
      { label: "Qty", align: "right" },
      { label: "Weight", align: "right" },
      { label: "Value", align: "right" },
      { label: "Notes" }
    ];
    const rows = items.map((item) => [
        item.name || "Unnamed",
        number(item.quantity),
        number(item.weight),
        number(item.value),
        [item.equipped ? "Equipped" : "", item.attuned ? "Attuned" : "", item.containerId && nameOf.has(item.containerId) ? `In ${nameOf.get(item.containerId)}` : "", item.notes].filter(Boolean).join("; ")
    ]);
    blocks.push({ type: "table", ...withOwn(base, rows, items, ownColumns(layouts, "inventory", items, include)) });
  }

  return blocks;
}

function tableBlock(heading, columns, rows, records = [], layouts = null, surface = "", include = false) {
  return rows.length ? [{ type: "heading", text: heading }, { type: "table", ...withOwn(columns, rows, records, ownColumns(layouts, surface, records, include)) }] : [];
}

function journalBlocks(character, includeJournal, layouts) {
  const entries = character.journal.filter((entry) => includeJournal || entry.kind !== "secret");

  if (!entries.length) {
    return [];
  }

  if (!includeJournal) {
    return tableBlock("Journal", [{ label: "Date" }, { label: "Kind" }, { label: "Title" }], entries.map((entry) => [entry.date, entry.kind, entry.title || "Untitled"]), entries, layouts, "journal", false);
  }

  return [
    { type: "heading", text: "Journal" },
    ...entries.flatMap((entry) => [{ type: "text", label: `${entry.title || "Untitled"}${entry.date || entry.kind ? ` (${[entry.date, entry.kind].filter(Boolean).join(", ")})` : ""}`, text: entry.text || "" }])
  ];
}

export function sheetDocument(character, { template = null, computed = null, systemName = "", includeJournal = false, layouts = null } = {}) {
  const name = displayName(character);
  const sub = [character.player, systemName || character.systemId, STATUS_LABELS[character.status], character.tags.join(", ")].filter((part) => part && String(part).trim()).join("  |  ");
  const blocks = [{ type: "title", text: name, sub }];

  if (character.summary?.trim()) {
    blocks.push({ type: "text", text: character.summary });
  }

  const own = ownColumns(layouts, "character", [character], includeJournal);

  if (own.columns.length) {
    blocks.push({ type: "heading", text: "Details" }, { type: "pairs", rows: own.columns.map((column, index) => [column.label, own.cells(character)[index]]) });
  }

  if (template && computed) {
    blocks.push(...systemBlocks(template, computed));
  }

  blocks.push(
    ...inventoryBlocks(character, layouts, includeJournal),
    ...tableBlock("Abilities", [{ label: "Name" }, { label: "Kind" }, { label: "Summary" }], character.abilities.map((entry) => [entry.name || "Unnamed", entry.kind, entry.summary]), character.abilities, layouts, "abilities", includeJournal),
    ...tableBlock("Familiars", [{ label: "Name" }, { label: "Kind" }, { label: "Present" }, { label: "Notes" }], character.familiars.map((entry) => [entry.name || "Unnamed", entry.kind, entry.summoned ? "Yes" : "No", entry.notes]), character.familiars, layouts, "familiars", includeJournal),
    ...tableBlock("Relations", [{ label: "Who" }, { label: "Kind" }, { label: "Attitude", align: "right" }], character.relations.map((entry) => [entry.targetName || "Unnamed", entry.kind, entry.attitude > 0 ? `+${entry.attitude}` : String(entry.attitude)]), character.relations, layouts, "relations", includeJournal),
    ...journalBlocks(character, includeJournal, layouts)
  );

  return { title: name, footer: name, blocks };
}
