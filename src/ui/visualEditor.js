import { DISPLAY_FORMATS, FIELD_TYPES, ITEM_FIELD_TYPES, POOL_DISPLAYS, SECTION_LAYOUTS } from "../sheet/template.js";
import { button, h, replace } from "./dom.js";

/**
 * The visual system editor: forms over a resolved system. Every commit hands a changed copy to
 * `handlers.onEdit`; the controller turns it into a file (an overlay for a derived system) and validates
 * it. Forms commit on `change`, so typing is never interrupted.
 */
const TABS = [
  ["details", "Details"],
  ["field", "Fields"],
  ["pool", "Pools"],
  ["collection", "Collections"],
  ["table", "Tables"],
  ["condition", "Conditions"],
  ["rest", "Rests"],
  ["roll", "Rolls"],
  ["section", "Sections"]
];

const LISTS = { field: "fields", pool: "pools", collection: "collections", roll: "rolls", rest: "rests", section: "sections" };
const IDENTITY = { field: "key", pool: "key", collection: "key", roll: "key", rest: "id", section: "id" };
const label = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const options = (values) => values.map((value) => (typeof value === "string" ? { value, label: label(value) } : value));
const noneFirst = (list) => [{ value: "", label: "None" }, ...list];

let counter = 0;

function parseLines(text) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

function parsePairs(text, separator) {
  const pairs = [];

  for (const line of parseLines(text)) {
    const at = line.indexOf(separator);

    if (at < 1) {
      return { error: `Each line needs a name, "${separator.trim()}" and a value: ${line}` };
    }

    pairs.push([line.slice(0, at).trim(), line.slice(at + separator.length).trim()]);
  }

  return { pairs };
}

/* ---- specs: what a form shows for each kind of entry ---- */

const fieldSpec = (inCollection, rests) => [
  { prop: "label", label: "Label", kind: "text" },
  { prop: "type", label: "Type", kind: "select", options: () => options(inCollection ? ITEM_FIELD_TYPES : FIELD_TYPES) },
  { prop: "default", label: "Default", kind: "scalar", showIf: (entry) => ["number", "text", "longtext", "flag", "choice", "roll"].includes(entry.type) },
  { prop: "min", label: "Minimum", kind: "number", showIf: (entry) => entry.type === "number" },
  { prop: "max", label: "Maximum", kind: "number", showIf: (entry) => entry.type === "number" },
  { prop: "integer", label: "Whole numbers only", kind: "flag", defaultTrue: true, showIf: (entry) => entry.type === "number" },
  {
    prop: "choices",
    label: "Choices, one per line as value | label",
    kind: "lines",
    showIf: (entry) => entry.type === "choice",
    read: (entry) => (entry.choices ?? []).map((choice) => `${choice.value} | ${choice.label}`).join("\n"),
    write: (text) => {
      const parsed = parsePairs(text, "|");
      return parsed.error ? parsed : { value: parsed.pairs.map(([value, choiceLabel]) => ({ value, label: choiceLabel })) };
    }
  },
  { prop: "formula", label: "Formula", kind: "text", mono: true, showIf: (entry) => entry.type === "derived" },
  { prop: "format", label: "Show as", kind: "select", options: () => noneFirst(options(DISPLAY_FORMATS)), showIf: (entry) => entry.type === "derived" },
  { prop: "max", label: "Uses (a number or a formula)", kind: "usesMax", showIf: (entry) => inCollection && entry.type === "uses" },
  { prop: "resetOn", label: "Resets on", kind: "select", options: () => noneFirst(rests.map((rest) => ({ value: rest.id, label: rest.label }))), showIf: (entry) => inCollection && entry.type === "uses" },
  { prop: "marker", label: "Marker (up to 4 characters)", kind: "text" },
  { prop: "hint", label: "Hint", kind: "text" },
  ...(inCollection
    ? []
    : [
      {
        prop: "subs",
        label: "Sub-values, one per line as name = formula",
        kind: "lines",
        read: (entry) => Object.entries(entry.subs ?? {}).map(([name, formula]) => `${name} = ${formula}`).join("\n"),
        write: (text) => {
          const parsed = parsePairs(text, "=");
          return parsed.error ? parsed : { value: parsed.pairs.length ? Object.fromEntries(parsed.pairs) : null };
        }
      },
      {
        prop: "subFormats",
        label: "How sub-values are shown, one per line as name = format",
        kind: "lines",
        read: (entry) => Object.entries(entry.subFormats ?? {}).map(([name, format]) => `${name} = ${format}`).join("\n"),
        write: (text) => {
          const parsed = parsePairs(text, "=");
          return parsed.error ? parsed : { value: parsed.pairs.length ? Object.fromEntries(parsed.pairs) : null };
        }
      }
    ])
];

function poolSpec(rests) {
  return [
    { prop: "label", label: "Label", kind: "text" },
    { prop: "max", label: "Maximum (a formula)", kind: "text", mono: true },
    { prop: "temp", label: "Has temporary points", kind: "flag" },
    { prop: "display", label: "Shown as", kind: "select", options: () => options(POOL_DISPLAYS) },
    { prop: "boxSize", label: "Points per box", kind: "number", showIf: (entry) => entry.display === "boxes" },
    {
      prop: "rests",
      label: `What each rest does, one per line as rest = full, none, add: formula or set: formula (${rests.map((rest) => rest.id).join(", ") || "no rests yet"})`,
      kind: "lines",
      read: (entry) => Object.entries(entry.rests ?? {}).map(([id, rule]) => `${id} = ${typeof rule === "string" ? rule : rule.add !== undefined ? `add: ${rule.add}` : `set: ${rule.set}`}`).join("\n"),
      write: (text) => {
        const parsed = parsePairs(text, "=");

        if (parsed.error) {
          return parsed;
        }

        const rules = {};

        for (const [id, rule] of parsed.pairs) {
          rules[id] = rule === "full" || rule === "none" ? rule : rule.startsWith("add:") ? { add: rule.slice(4).trim() } : rule.startsWith("set:") ? { set: rule.slice(4).trim() } : rule;
        }

        return { value: Object.keys(rules).length ? rules : null };
      }
    },
    { prop: "hint", label: "Hint", kind: "text" }
  ];
}

function collectionSpec(entry) {
  const keys = entry.fields.map((field) => ({ value: field.key, label: field.label ?? field.key }));

  return [
    { prop: "label", label: "Label", kind: "text" },
    { prop: "groupBy", label: "Group rows by", kind: "select", options: () => noneFirst(keys) },
    { prop: "sortBy", label: "Sort rows by", kind: "select", options: () => noneFirst(keys) },
    {
      prop: "columns",
      label: "Columns shown, comma separated keys (empty shows all)",
      kind: "lines",
      single: true,
      read: (current) => (current.columns ?? []).join(", "),
      write: (text) => {
        const list = text.split(",").map((part) => part.trim()).filter(Boolean);
        return { value: list.length ? list : null };
      }
    },
    { prop: "maxItems", label: "Most rows", kind: "number" },
    { prop: "hint", label: "Hint", kind: "text" }
  ];
}

const ROLL_SPEC = [
  { prop: "label", label: "Label", kind: "text" },
  { prop: "group", label: "Group", kind: "text" },
  { prop: "expression", label: "Expression", kind: "text", mono: true }
];

const REST_SPEC = [{ prop: "label", label: "Label", kind: "text" }];

const SECTION_SPEC = [
  { prop: "title", label: "Title", kind: "text" },
  { prop: "layout", label: "Layout", kind: "select", options: () => options(SECTION_LAYOUTS) },
  {
    prop: "items",
    label: "Items, comma separated keys",
    kind: "lines",
    single: true,
    read: (entry) => (entry.items ?? []).join(", "),
    write: (text) => ({ value: text.split(",").map((part) => part.trim()).filter(Boolean) })
  }
];

/* ---- controls ---- */

function makeControl(spec, entry, { readOnly, commit }) {
  const id = `ve-${counter += 1}`;
  const error = h("p", { class: "field-error", hidden: true, id: `${id}-error` });
  const props = { id, disabled: readOnly };
  let control;

  function fail(message) {
    error.textContent = message;
    error.hidden = false;
    control.setAttribute("aria-invalid", "true");
    control.setAttribute("aria-describedby", error.id);
  }

  function succeed() {
    error.hidden = true;
    control.removeAttribute("aria-invalid");
    control.removeAttribute("aria-describedby");
  }

  const apply = (value) => {
    succeed();
    commit(spec.prop, value);
  };

  if (spec.kind === "flag") {
    const checked = spec.defaultTrue ? entry[spec.prop] !== false : entry[spec.prop] === true;
    control = h("input", { ...props, type: "checkbox", checked, onchange: (event) => apply(spec.defaultTrue ? (event.target.checked ? null : false) : event.target.checked ? true : null) });
    return { element: h("div", { class: "field" }, h("label", { class: "check", for: id }, control, h("span", { text: spec.label })), error), focusId: id };
  }

  if (spec.kind === "select") {
    const list = spec.options(entry);
    control = h("select", { ...props, class: "input", onchange: (event) => apply(event.target.value === "" ? null : event.target.value) }, list.map((option) => h("option", { value: option.value, text: option.label })));
    control.value = entry[spec.prop] ?? "";
  } else if (spec.kind === "number") {
    control = h("input", { ...props, class: "input", type: "number", step: "any", value: entry[spec.prop] ?? "", onchange: (event) => {
      const raw = event.target.value.trim();
      apply(raw === "" ? null : Number(raw));
    } });
  } else if (spec.kind === "scalar") {
    if (entry.type === "number") {
      control = h("input", { ...props, class: "input", type: "number", step: "any", value: entry[spec.prop] ?? "", onchange: (event) => apply(event.target.value.trim() === "" ? null : Number(event.target.value)) });
    } else if (entry.type === "flag") {
      control = h("select", { ...props, class: "input", onchange: (event) => apply(event.target.value === "" ? null : event.target.value === "true") }, noneFirst([{ value: "true", label: "On" }, { value: "false", label: "Off" }]).map((option) => h("option", { value: option.value, text: option.label })));
      control.value = entry[spec.prop] === undefined ? "" : String(entry[spec.prop]);
    } else if (entry.type === "choice") {
      control = h("select", { ...props, class: "input", onchange: (event) => apply(event.target.value === "" ? null : event.target.value) }, noneFirst((entry.choices ?? []).map((choice) => ({ value: choice.value, label: choice.label }))).map((option) => h("option", { value: option.value, text: option.label })));
      control.value = entry[spec.prop] ?? "";
    } else {
      control = h("input", { ...props, class: `input${entry.type === "roll" ? " input-mono" : ""}`, type: "text", value: entry[spec.prop] ?? "", onchange: (event) => apply(event.target.value === "" ? null : event.target.value) });
    }
  } else if (spec.kind === "usesMax") {
    control = h("input", { ...props, class: "input", type: "text", value: entry[spec.prop] ?? "", onchange: (event) => {
      const raw = event.target.value.trim();
      apply(raw === "" ? null : /^\d+$/.test(raw) ? Number(raw) : raw);
    } });
  } else if (spec.kind === "lines") {
    const rows = spec.single ? 1 : 4;
    const field = spec.single ? "input" : "textarea";
    control = h(field, { ...props, class: "input input-mono", ...(spec.single ? { type: "text", value: spec.read(entry) } : { rows }), onchange: (event) => {
      const result = spec.write(event.target.value, entry);

      if (result.error) {
        fail(result.error);
      } else {
        apply(result.value);
      }
    } });

    if (!spec.single) {
      control.value = spec.read(entry);
    }
  } else {
    control = h("input", { ...props, class: `input${spec.mono ? " input-mono" : ""}`, type: "text", value: entry[spec.prop] ?? "", onchange: (event) => apply(event.target.value === "" ? null : event.target.value) });
  }

  return { element: h("div", { class: "field" }, h("label", { class: "field-label", for: id, text: spec.label }), control, error), focusId: id };
}

function buildForm(spec, entry, { readOnly, commit }) {
  return h("div", { class: "field-grid" }, spec.filter((item) => !item.showIf || item.showIf(entry)).map((item) => makeControl(item, entry, { readOnly, commit }).element));
}

/**
 * Mounts the editor. `render({ flat, readOnly })` draws the current tab. State kept here is only which
 * tab and which entry are open, so the controller holds everything that matters.
 */
export function mountVisualEditor(root, handlers) {
  let tab = "field";
  let selected = { field: null, pool: null, collection: null, table: null, roll: null, rest: null, section: null };
  let itemSelected = null;
  let latest = null;
  const message = h("p", { class: "field-hint", id: "visual-note" });
  const tabBar = h("div", { class: "tab-bar", role: "group", "aria-label": "Parts of the system" });
  const panel = h("div", { class: "visual-panel", id: "visual-panel" });

  replace(root, message, tabBar, panel);

  function select(kind, key) {
    selected[kind] = key;
    draw();
  }

  function addControl(kind, readOnly) {
    const id = `ve-add-${kind}`;
    const input = h("input", { id, class: "input", type: "text", autocomplete: "off", "aria-describedby": `${id}-hint`, placeholder: kind === "table" ? "table_name" : "new_key" });
    const error = h("p", { class: "field-error", hidden: true });
    const add = button({
      label: `Add ${kind}`,
      icon: "plus",
      disabled: readOnly,
      onclick: () => {
        const result = handlers.onAdd(kind, input.value.trim());

        if (result.ok) {
          input.value = "";
          error.hidden = true;
          selected[kind] = result.key;
          draw();
        } else {
          error.textContent = result.reason;
          error.hidden = false;
        }
      }
    });

    return h("div", { class: "add-row" }, h("label", { class: "field-label", for: id, text: kind === "table" || kind === "condition" ? "Name" : "Key" }), input, add, h("p", { class: "field-hint", id: `${id}-hint`, text: kind === "condition" ? "" : "Lowercase letters, digits and underscores, starting with a letter." }), error);
  }

  function entryList(kind, items, nameOf, { readOnly }) {
    const keyOf = (entry) => entry[IDENTITY[kind]] ?? entry;
    const current = selected[kind] && items.some((entry) => keyOf(entry) === selected[kind]) ? selected[kind] : items[0] ? keyOf(items[0]) : null;
    selected[kind] = current;

    return {
      current,
      element: h(
        "ul",
        { class: "entry-list", "aria-label": `${label(kind)} list` },
        items.map((entry) => h("li", {}, h("button", { type: "button", class: `entry-btn${keyOf(entry) === current ? " is-current" : ""}`, "aria-pressed": String(keyOf(entry) === current), onclick: () => select(kind, keyOf(entry)), text: nameOf(entry) })))
      )
    };
  }

  function listPanel(kind, flat, readOnly) {
    const items = flat[LISTS[kind]];
    const spec = {
      field: () => fieldSpec(false, flat.rests),
      pool: () => poolSpec(flat.rests),
      roll: () => ROLL_SPEC,
      rest: () => REST_SPEC,
      section: () => SECTION_SPEC,
      collection: (entry) => collectionSpec(entry)
    }[kind];
    const { current, element } = entryList(kind, items, (entry) => `${entry.label ?? entry.title ?? entry[IDENTITY[kind]]} (${entry[IDENTITY[kind]]})`, { readOnly });
    const entry = items.find((item) => item[IDENTITY[kind]] === current);
    const body = h("div", { class: "entry-form" });

    if (entry) {
      body.append(
        h("h3", { class: "entry-title", text: `${entry.label ?? entry.title ?? current} (${current})` }),
        buildForm(spec(entry), entry, { readOnly, commit: (prop, value) => handlers.onCommit(kind, current, prop, value) }),
        readOnly ? null : button({ label: `Remove ${kind}`, icon: "trash", variant: "btn-danger-text", ariaLabel: `Remove ${kind} ${current}`, onclick: () => handlers.onRemove(kind, current) })
      );

      if (kind === "collection") {
        body.append(columnsPanel(entry, flat, readOnly));
      }
    } else {
      body.append(h("p", { class: "muted", text: `No ${kind}s yet.` }));
    }

    return h("div", { class: "visual-split" }, h("div", {}, element, readOnly ? null : addControl(kind, readOnly)), body);
  }

  function columnsPanel(collection, flat, readOnly) {
    const key = itemSelected && collection.fields.some((field) => field.key === itemSelected) ? itemSelected : collection.fields[0]?.key ?? null;
    itemSelected = key;
    const field = collection.fields.find((entry) => entry.key === key);
    const add = h("div", { class: "add-row" });
    const input = h("input", { id: "ve-add-column", class: "input", type: "text", placeholder: "new_column", autocomplete: "off" });
    const error = h("p", { class: "field-error", hidden: true });

    add.append(
      h("label", { class: "field-label", for: "ve-add-column", text: "New column key" }),
      input,
      button({ label: "Add column", icon: "plus", disabled: readOnly, onclick: () => {
        const result = handlers.onAdd("item", input.value.trim(), collection.key);

        if (result.ok) {
          itemSelected = result.key;
          draw();
        } else {
          error.textContent = result.reason;
          error.hidden = false;
        }
      } }),
      error
    );

    return h(
      "div",
      { class: "columns-panel" },
      h("h4", { class: "entry-title", text: "Columns (the fields of each row)" }),
      h("ul", { class: "entry-list", "aria-label": "Columns" }, collection.fields.map((entry) => h("li", {}, h("button", { type: "button", class: `entry-btn${entry.key === key ? " is-current" : ""}`, "aria-pressed": String(entry.key === key), onclick: () => { itemSelected = entry.key; draw(); }, text: `${entry.label ?? entry.key} (${entry.key})` })))),
      field ? buildForm(fieldSpec(true, flat.rests), field, { readOnly, commit: (prop, value) => handlers.onCommit("item", `${collection.key}.${key}`, prop, value) }) : null,
      field && !readOnly ? button({ label: "Remove column", icon: "trash", variant: "btn-danger-text", ariaLabel: `Remove column ${key}`, onclick: () => handlers.onRemove("item", `${collection.key}.${key}`) }) : null,
      readOnly ? null : add
    );
  }

  function tablePanel(flat, readOnly) {
    const names = Object.keys(flat.tables);
    const current = selected.table && names.includes(selected.table) ? selected.table : names[0] ?? null;
    selected.table = current;
    const list = h("ul", { class: "entry-list", "aria-label": "Table list" }, names.map((name) => h("li", {}, h("button", { type: "button", class: `entry-btn${name === current ? " is-current" : ""}`, "aria-pressed": String(name === current), onclick: () => select("table", name), text: name }))));
    const body = h("div", { class: "entry-form" });

    if (current) {
      const spec = { prop: "entries", label: "Entries, one per line as key = value", kind: "lines", read: () => Object.entries(flat.tables[current]).map(([key, value]) => `${key} = ${value}`).join("\n"), write: (text) => {
        const parsed = parsePairs(text, "=");

        if (parsed.error) {
          return parsed;
        }

        return { value: Object.fromEntries(parsed.pairs.map(([key, value]) => [key, value !== "" && Number.isFinite(Number(value)) ? Number(value) : value])) };
      } };

      body.append(h("h3", { class: "entry-title", text: current }), makeControl(spec, flat.tables[current], { readOnly, commit: (prop, value) => handlers.onCommit("table", current, "entries", value) }).element, readOnly ? null : button({ label: "Remove table", icon: "trash", variant: "btn-danger-text", ariaLabel: `Remove table ${current}`, onclick: () => handlers.onRemove("table", current) }));
    } else {
      body.append(h("p", { class: "muted", text: "No tables yet." }));
    }

    return h("div", { class: "visual-split" }, h("div", {}, list, readOnly ? null : addControl("table", readOnly)), body);
  }

  function simplePanel(kind, flat, readOnly) {
    if (kind === "condition") {
      const spec = { prop: "conditions", label: "Conditions, one per line", kind: "lines", read: () => flat.conditions.join("\n"), write: (text) => ({ value: parseLines(text) }) };
      return h("div", { class: "entry-form" }, makeControl(spec, flat, { readOnly, commit: (prop, value) => handlers.onCommit("condition", "all", "list", value) }).element);
    }

    const spec = [
      { prop: "name", label: "Name", kind: "text" },
      { prop: "system", label: "System label", kind: "text" },
      { prop: "description", label: "Description", kind: "text" }
    ];

    return h("div", { class: "entry-form" }, buildForm(spec, flat, { readOnly, commit: (prop, value) => handlers.onCommit("details", "file", prop, value) }));
  }

  function draw() {
    if (!latest) {
      return;
    }

    const { flat, readOnly } = latest;
    const focusedId = document.activeElement?.id;

    replace(
      tabBar,
      TABS.map(([id, name]) => h("button", { type: "button", class: `tab${id === tab ? " is-current" : ""}`, "aria-pressed": String(id === tab), onclick: () => { tab = id; draw(); }, text: name }))
    );

    if (["field", "pool", "collection", "roll", "rest", "section"].includes(tab)) {
      replace(panel, listPanel(tab, flat, readOnly));
    } else if (tab === "table") {
      replace(panel, tablePanel(flat, readOnly));
    } else {
      replace(panel, simplePanel(tab, flat, readOnly));
    }

    if (focusedId?.startsWith("ve-")) {
      panel.querySelector(`#${focusedId}`)?.focus();
    }
  }

  return {
    render(state) {
      latest = state;
      message.textContent = state.note ?? "";
      message.hidden = !state.note;
      draw();
    }
  };
}
