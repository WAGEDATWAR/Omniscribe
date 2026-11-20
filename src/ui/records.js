import { RECORD_LIMITS } from "../records/kinds.js";
import { button, emptyState, field, h, replace, section } from "./dom.js";

function controlFor(kind, spec) {
  const id = `rec-${kind.id}-${spec.key}`;
  const mono = spec.mono ? " input-mono" : "";

  switch (spec.type) {
    case "long":
      return h("textarea", { id, class: `input input-tall${mono}`, rows: 4, maxLength: spec.max, spellcheck: true });
    case "int":
    case "num":
      return h("input", { id, class: "input", type: "number", inputMode: spec.type === "int" ? "numeric" : "decimal", min: String(spec.min), max: String(spec.max), step: spec.type === "int" ? "1" : "any" });
    case "bool":
      return h("input", { id, class: "checkbox", type: "checkbox" });
    case "choice":
      return h("select", { id, class: "input" }, spec.values.map((value) => h("option", { value, text: value[0].toUpperCase() + value.slice(1) })));
    case "date":
      return h("input", { id, class: "input", type: "date" });
    case "tags":
      return h("input", { id, class: "input", type: "text", autocomplete: "off", placeholder: "comma, separated" });
    case "uses":
      return null;
    default: {
      const input = h("input", { id, class: `input${mono}`, type: "text", maxLength: spec.max, autocomplete: "off", spellcheck: false });

      if (spec.suggest) {
        const list = h("datalist", { id: `${id}-list` }, spec.suggest.map((value) => h("option", { value })));
        input.setAttribute("list", list.id);
        input.listElement = list;
      }

      return input;
    }
  }
}

function writeControl(spec, control, value) {
  if (!control) {
    return;
  }

  if (spec.type === "bool") {
    control.checked = value === true;
  } else if (spec.type === "tags") {
    control.value = (value ?? []).join(", ");
  } else {
    control.value = value === null || value === undefined ? "" : String(value);
  }
}

/** Reads one control into a typed value, or `{ error }` that names the problem; nothing is clamped silently. */
function readControl(spec, control) {
  if (spec.type === "bool") {
    return { value: control.checked };
  }

  if (spec.type === "tags") {
    return { value: control.value.split(",").map((tag) => tag.trim()).filter(Boolean) };
  }

  if (spec.type === "int" || spec.type === "num") {
    const text = control.value.trim();

    if (!text) {
      return spec.nullable ? { value: null } : { value: spec.def ?? 0 };
    }

    const number = Number(text);
    const whole = spec.type === "int";

    if (!Number.isFinite(number) || (whole && !Number.isInteger(number)) || number < spec.min || number > spec.max) {
      return { error: `${spec.label} must be ${whole ? "a whole number" : "a number"} from ${spec.min} to ${spec.max}` };
    }

    return { value: number };
  }

  if (spec.type === "date") {
    return { value: control.value };
  }

  return { value: control.value };
}

function customEditor(kindId) {
  const rows = h("div", { class: "stack custom-rows", id: `rec-${kindId}-custom-rows` });
  const entries = [];

  function addRow(entry = { label: "", type: "text", value: "" }) {
    const index = entries.length + 1;
    const label = h("input", { class: "input", type: "text", maxLength: RECORD_LIMITS.customLabel, "aria-label": `Custom field ${index} name`, placeholder: "Name" });
    const type = h("select", { class: "input", "aria-label": `Custom field ${index} type` }, [["text", "Text"], ["number", "Number"], ["checkbox", "Yes or no"]].map(([value, text]) => h("option", { value, text })));
    const value = h("input", { class: "input", type: "text", maxLength: RECORD_LIMITS.customText, "aria-label": `Custom field ${index} value` });
    const check = h("input", { class: "checkbox", type: "checkbox", "aria-label": `Custom field ${index} value` });
    const row = h("div", { class: "custom-row" });
    const record = { row, label, type, value, check };

    function sync() {
      value.hidden = type.value === "checkbox";
      check.hidden = type.value !== "checkbox";
      value.type = type.value === "number" ? "number" : "text";
      value.step = "any";
    }

    type.addEventListener("change", sync);
    label.value = entry.label;
    type.value = entry.type;

    if (entry.type === "checkbox") {
      check.checked = entry.value === true;
    } else {
      value.value = String(entry.value ?? "");
    }

    sync();
    row.append(label, type, value, check, button({ label: "Remove", ariaLabel: `Remove custom field ${index}`, variant: "btn-small btn-danger-text", onclick: () => {
      entries.splice(entries.indexOf(record), 1);
      row.remove();
    } }));
    entries.push(record);
    rows.append(row);
  }

  return {
    element: h(
      "div",
      { class: "stack" },
      h("h3", { class: "subsection-title", text: "Your own fields" }),
      h("p", { class: "field-hint", text: "Anything this page has no field for: a rarity, a school, an alignment. Each field has a name, a type and a value." }),
      rows,
      button({ id: `rec-${kindId}-add-custom`, label: "Add a field", variant: "btn-small", onclick: () => addRow() })
    ),
    set(list) {
      entries.length = 0;
      rows.replaceChildren();

      for (const entry of list ?? []) {
        addRow(entry);
      }
    },
    read() {
      const custom = [];

      for (const { label, type, value, check } of entries) {
        const name = label.value.trim();

        if (!name) {
          continue;
        }

        custom.push({
          label: name,
          type: type.value,
          value: type.value === "checkbox" ? check.checked : type.value === "number" ? (value.value.trim() === "" ? 0 : Number(value.value)) : value.value
        });
      }

      return custom;
    }
  };
}

/**
 * The one list page every kind of record uses (C-11). It is built from the kind's descriptor, plus the
 * kind's own hooks for what a descriptor cannot say (`ui`): `rowControls`, `summary`, `formExtras`, `top`,
 * `filters`, `sort`.
 * Handlers: `onSave(fields, editingId)` -> `{ ok, reason? }`, `onDelete(id)`, `onMove(id, delta)`.
 */
export function mountRecordPage(root, kind, ui, handlers) {
  const search = h("input", { id: `rec-${kind.id}-search`, class: "input", type: "search", "aria-label": `Search ${kind.nouns}`, placeholder: `Search ${kind.nouns}`, autocomplete: "off" });
  const list = h("div", { class: "stack", id: `rec-${kind.id}-list` });
  const count = h("p", { class: "field-hint", id: `rec-${kind.id}-count`, role: "status", "aria-live": "polite" });
  const top = h("div", { class: "stack", id: `rec-${kind.id}-top` });
  const extra = h("div", { class: "stack", id: `rec-${kind.id}-extra` });
  const error = h("p", { class: "field-error", id: `rec-${kind.id}-error`, hidden: true, role: "alert" });
  const controls = new Map();
  const custom = customEditor(kind.id);
  const extras = ui.formExtras ?? [];
  const saveButton = button({ id: `rec-${kind.id}-save`, label: `Add ${kind.noun}`, variant: "btn-primary", type: "submit" });
  const cancelButton = button({ id: `rec-${kind.id}-cancel`, label: "Cancel", onclick: () => reset() });
  const filterBar = h("div", { class: "toolbar", id: `rec-${kind.id}-filters` });
  let editing = null;
  let filterState = {};
  let lastView = { records: [], character: null };

  const fieldNodes = [];

  for (const spec of kind.fields.filter((entry) => !entry.hidden && entry.type !== "uses")) {
    const control = controlFor(kind, spec);
    controls.set(spec.key, control);

    if (spec.type === "bool") {
      fieldNodes.push(h("div", { class: "field" }, h("label", { class: "check-label" }, control, h("span", { text: spec.label }))));
    } else {
      fieldNodes.push(field({ id: control.id, label: spec.label, hint: spec.hint, wide: spec.type === "long" }, control));
    }

    if (control.listElement) {
      fieldNodes.push(control.listElement);
    }
  }

  if (kind.fields.some((spec) => spec.type === "uses")) {
    const max = h("input", { id: `rec-${kind.id}-uses-max`, class: "input", type: "number", min: "0", max: "9999", step: "1", inputMode: "numeric" });
    const resetOn = h("input", { id: `rec-${kind.id}-uses-reset`, class: "input", type: "text", maxLength: 40, autocomplete: "off", placeholder: "long, short, daily" });
    controls.set("uses.max", max);
    controls.set("uses.resetOn", resetOn);
    fieldNodes.push(
      field({ id: max.id, label: "Uses", hint: "Leave empty when it has no limit." }, max),
      field({ id: resetOn.id, label: "Restores on", hint: "A rest from the game system, or empty to restore by hand." }, resetOn)
    );
  }

  const extraControls = extras.map((extra) => ({ extra, node: extra.build() }));

  for (const { extra, node } of extraControls) {
    fieldNodes.push(field({ id: node.id, label: extra.label, hint: extra.hint }, node));
  }

  function reset() {
    editing = null;
    error.hidden = true;

    for (const spec of kind.fields) {
      if (controls.has(spec.key)) {
        writeControl(spec, controls.get(spec.key), spec.type === "date" && spec.today ? new Date().toISOString().slice(0, 10) : spec.def ?? (spec.type === "bool" ? false : spec.type === "tags" ? [] : ""));
      }
    }

    controls.get("uses.max") && (controls.get("uses.max").value = "");
    controls.get("uses.resetOn") && (controls.get("uses.resetOn").value = "");

    for (const { extra, node } of extraControls) {
      extra.write(node, null, lastView);
    }

    custom.set([]);
    saveButton.querySelector("span").textContent = `Add ${kind.noun}`;
    cancelButton.hidden = true;
  }

  function collect() {
    const fields = {};

    for (const spec of kind.fields) {
      const control = controls.get(spec.key);

      if (!control) {
        continue;
      }

      const read = readControl(spec, control);

      if (read.error) {
        return { error: read.error };
      }

      fields[spec.key] = read.value;
    }

    const maxUses = controls.get("uses.max");

    if (maxUses) {
      const text = maxUses.value.trim();
      const number = Number(text);

      if (text && (!Number.isInteger(number) || number < 0 || number > 9999)) {
        return { error: "Uses must be a whole number from 0 to 9999" };
      }

      fields.uses = { max: text ? number : null, resetOn: controls.get("uses.resetOn").value.trim() };
    }

    for (const { extra, node } of extraControls) {
      Object.assign(fields, extra.read(node));
    }

    fields.custom = custom.read();
    return { fields };
  }

  function submit(event) {
    event.preventDefault();
    const collected = collect();

    if (collected.error) {
      error.textContent = collected.error;
      error.hidden = false;
      return;
    }

    const verdict = handlers.onSave(collected.fields, editing);

    if (verdict.ok) {
      reset();
      controls.get(kind.fields[0].key)?.focus();
    } else {
      error.textContent = verdict.reason;
      error.hidden = false;
    }
  }

  function startEdit(record) {
    editing = record.id;
    error.hidden = true;

    for (const spec of kind.fields) {
      if (controls.has(spec.key)) {
        writeControl(spec, controls.get(spec.key), record[spec.key]);
      }
    }

    if (record.uses) {
      controls.get("uses.max").value = record.uses.max === null ? "" : String(record.uses.max);
      controls.get("uses.resetOn").value = record.uses.resetOn;
    }

    for (const { extra, node } of extraControls) {
      extra.write(node, record, lastView);
    }

    custom.set(record.custom);
    saveButton.querySelector("span").textContent = `Save ${kind.noun}`;
    cancelButton.hidden = false;
    controls.get(kind.fields[0].key)?.focus();
  }

  const form = h(
    "form",
    { id: `rec-${kind.id}-form`, class: "panel", onsubmit: submit, novalidate: true },
    h("h2", { class: "panel-title", text: `Add or edit ${/^[aeiou]/i.test(kind.noun) ? "an" : "a"} ${kind.noun}` }),
    h("div", { class: "field-grid" }, fieldNodes),
    custom.element,
    error,
    h("div", { class: "section-actions" }, saveButton, cancelButton)
  );

  search.addEventListener("input", () => handlers.onRefresh?.());

  reset();

  replace(
    root,
    h(
      "div",
      { class: "stack" },
      top,
      section(
        { id: `rec-${kind.id}-section`, title: kind.label, description: ui.description },
        h("div", { class: "toolbar" }, h("div", { class: "grow" }, search), filterBar),
        count,
        list
      ),
      extra,
      form
    )
  );

  function recordRow(record, index, total, character) {
    const title = String(record[kind.title] ?? "").trim() || `Untitled ${kind.noun}`;
    const api = { character, update: (patch, key) => handlers.onUpdate(record.id, patch, key), record };
    const summary = ui.summary ? ui.summary(record, character) : "";
    const custom = record.custom.length ? record.custom.map((entry) => `${entry.label}: ${entry.type === "checkbox" ? (entry.value ? "yes" : "no") : entry.value}`).join(" · ") : "";

    return h(
      "article",
      { class: "record-row", "data-record": record.id, "aria-label": title },
      h(
        "div",
        { class: "record-main" },
        h("strong", { class: "record-title", text: title }),
        summary ? h("p", { class: "record-summary", text: summary }) : null,
        custom ? h("p", { class: "field-hint", text: custom }) : null,
        ui.detail ? ui.detail(record, character) : null
      ),
      h(
        "div",
        { class: "toolbar record-actions" },
        ui.rowControls ? ui.rowControls(record, api) : null,
        button({ label: "Edit", ariaLabel: `Edit ${title}`, variant: "btn-small", onclick: () => startEdit(record) }),
        index !== null && ui.manualOrder !== false
          ? [
              button({ label: "Up", ariaLabel: `Move ${title} up`, variant: "btn-small", disabled: index === 0, onclick: () => handlers.onMove(record.id, -1) }),
              button({ label: "Down", ariaLabel: `Move ${title} down`, variant: "btn-small", disabled: index === total - 1, onclick: () => handlers.onMove(record.id, 1) })
            ]
          : null,
        button({ label: "Delete", ariaLabel: `Delete ${title}`, variant: "btn-small btn-danger-text", onclick: () => handlers.onDelete(record.id) })
      )
    );
  }

  return {
    query: () => search.value.trim().toLowerCase(),
    filters: () => filterState,
    render(character, records) {
      lastView = { records, character };
      const query = search.value.trim().toLowerCase();
      const visible = ui.filter ? ui.filter(records, { query, filters: filterState, character }) : records.filter((record) => JSON.stringify(record).toLowerCase().includes(query));
      const ordered = ui.sort ? ui.sort(visible) : visible;
      const manual = ordered.length === records.length && !ui.sort;

      if (ui.filters) {
        replace(
          filterBar,
          ui.filters.map((filter) => {
            const select = h("select", { class: "input", "aria-label": filter.label, id: `rec-${kind.id}-filter-${filter.key}` }, filter.options(records).map((option) => h("option", { value: option.value, text: option.label })));
            select.value = filterState[filter.key] ?? "";
            select.addEventListener("change", () => {
              filterState = { ...filterState, [filter.key]: select.value };
              handlers.onRefresh?.();
            });
            return select;
          })
        );
      }

      for (const { extra, node } of extraControls) {
        extra.refresh?.(node, records, character);
      }

      replace(top, ui.top ? ui.top(character, records, handlers) : null);
      replace(extra, ui.extra ? ui.extra(character, records, handlers) : null);
      count.textContent = records.length ? `${visible.length} of ${records.length} ${records.length === 1 ? kind.noun : kind.nouns}` : "";

      replace(
        list,
        ordered.length
          ? ordered.map((record, index) => recordRow(record, manual ? index : null, ordered.length, character))
          : records.length
            ? h("p", { class: "muted", text: `No ${kind.nouns} match.` })
            : emptyState({ title: `No ${kind.nouns} yet`, message: kind.empty })
      );
    },
    startEdit
  };
}
