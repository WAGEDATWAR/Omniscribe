import { formatValue } from "../sheet/template.js";
import { button, emptyState, h, replace, section } from "./dom.js";
import { createTagInput } from "./tagInput.js";

const MAX_BOXES = 100;

const errorOf = (errors, path) => errors.find((entry) => entry.path === path)?.message ?? "";

/**
 * One typed control for a field or a table cell. `onCommit(value)` must return `{ ok, reason }`; a
 * refusal is shown beside the control and the value is not stored (S-2).
 */
function createInput(field, { id, label, onCommit }) {
  const error = h("p", { class: "field-error", id: `${id}-error`, hidden: true });
  let typed = "";
  let stored = "";
  let control;
  let write = () => {};
  let focused = () => false;

  function show() {
    const message = typed || stored;
    error.hidden = !message;
    error.textContent = message;

    for (const element of control instanceof Array ? control : [control]) {
      element.setAttribute("aria-invalid", message ? "true" : "false");

      if (message) {
        element.setAttribute("aria-describedby", error.id);
      } else {
        element.removeAttribute("aria-describedby");
      }
    }
  }

  function commit(value) {
    const result = onCommit(value);
    typed = result.ok ? "" : result.reason;
    show();
  }

  const common = { id, "aria-label": label };

  if (field.type === "number") {
    control = h("input", {
      ...common,
      class: "input",
      type: "number",
      inputmode: field.integer === false ? "decimal" : "numeric",
      step: field.integer === false ? "any" : "1",
      min: field.min,
      max: field.max,
      oninput: (event) => commit(event.target.value.trim() === "" ? Number.NaN : Number(event.target.value))
    });
    write = (value) => {
      control.value = String(value);
    };
  } else if (field.type === "flag") {
    control = h("input", { ...common, type: "checkbox", onchange: (event) => commit(event.target.checked) });
    write = (value) => {
      control.checked = value === true;
    };
  } else if (field.type === "choice") {
    control = h(
      "select",
      { ...common, class: "input", onchange: (event) => commit(event.target.value) },
      field.choices.map((choice) => h("option", { value: choice.value, text: choice.label }))
    );
    write = (value) => {
      control.value = value;
    };
  } else if (field.type === "list") {
    const tags = createTagInput({ id, label: field.label, onChange: (next) => commit(next) });
    control = tags.input;
    write = (value) => tags.set(value);
    focused = () => document.activeElement === tags.input;

    return {
      element: tags.element,
      error,
      set(value, message = "") {
        stored = message;

        if (!focused()) {
          write(value);
        }

        show();
      }
    };
  } else if (field.type === "longtext") {
    control = h("textarea", { ...common, class: "input", rows: 4, oninput: (event) => commit(event.target.value) });
    write = (value) => {
      control.value = value;
    };
  } else {
    control = h("input", {
      ...common,
      class: field.type === "roll" ? "input input-mono" : "input",
      type: "text",
      autocomplete: "off",
      oninput: (event) => commit(event.target.value)
    });
    write = (value) => {
      control.value = value;
    };
  }

  focused = () => document.activeElement === control;

  return {
    element: control,
    error,
    focus: () => control.focus(),
    set(value, message = "") {
      stored = message;

      if (!focused() && (field.type === "flag" ? control.checked !== (value === true) : control.value !== String(value))) {
        write(value);
      }

      show();
    }
  };
}

/** A single value on the sheet: an input for an authored field, a read-out for a derived one. */
function createFieldBlock(field, handlers) {
  const id = `sheet-f-${field.key}`;
  const subs = field.subs ? h("p", { class: "subs" }) : null;

  if (field.type === "derived") {
    const value = h("p", { class: "derived-value" });
    const marker = field.marker ? h("span", { class: "marker", "aria-hidden": "true", title: "Marked in this system", text: field.marker }) : null;
    const error = h("p", { class: "field-error", hidden: true });
    const block = h(
      "div",
      { class: "field field-derived", "data-key": field.key },
      h("span", { class: "field-label", text: field.label }),
      h("div", { class: "derived-row" }, value, marker),
      subs,
      field.hint ? h("p", { class: "field-hint", text: field.hint }) : null,
      error
    );

    return {
      element: block,
      update(computed, errors) {
        const message = errorOf(errors, `@${field.key}`);
        value.textContent = message ? "-" : formatValue(field, computed.values[field.key]);
        error.hidden = !message;
        error.textContent = message;
        updateSubs(subs, field, computed, errors);
      }
    };
  }

  const control = createInput(field, {
    id,
    label: field.label,
    onCommit: (value) => handlers.onValue(field.key, value)
  });
  const labelled = field.type === "flag";

  return {
    element: h(
      "div",
      { class: `field${field.type === "longtext" ? " field-wide" : ""}`, "data-key": field.key },
      labelled
        ? h("label", { class: "check", for: id }, control.element, h("span", { text: field.label }))
        : h("label", { class: "field-label", for: id, text: field.label }),
      labelled ? null : control.element,
      subs,
      field.hint ? h("p", { class: "field-hint", text: field.hint }) : null,
      control.error
    ),
    update(computed, errors) {
      control.set(computed.values[field.key], errorOf(errors, `values.${field.key}`));
      updateSubs(subs, field, computed, errors);
    }
  };
}

function updateSubs(element, field, computed, errors) {
  if (!element) {
    return;
  }

  replace(
    element,
    Object.keys(field.subs).map((name) => {
      const message = errorOf(errors, `@${field.key}.${name}`);
      const value = computed.values[`${field.key}.${name}`];
      const format = field.subFormats?.[name];

      return h(
        "span",
        { class: "sub", title: message || `${field.label} ${name}` },
        h("span", { class: "sub-name", text: name }),
        " ",
        h("strong", { text: message ? "-" : formatValue({ type: "derived", format }, value) })
      );
    })
  );
}

/** A pool: a number with a maximum, or boxes you tick (S-13). */
function createPoolBlock(pool, handlers) {
  const id = `sheet-p-${pool.key}`;
  const boxed = pool.display === "boxes";
  const size = pool.boxSize ?? 1;
  const error = h("p", { class: "field-error", hidden: true });
  const readout = h("p", { class: "pool-readout" });
  const boxes = h("div", { class: "boxes", role: "group", "aria-label": pool.label });
  let boxCount = -1;
  let latest = { max: 0, current: 0 };

  const current = h("input", {
    id,
    class: "input pool-input",
    type: "number",
    min: "0",
    step: "1",
    "aria-label": `${pool.label} current`,
    oninput: (event) => handlers.onPool(pool.key, { current: event.target.value.trim() === "" ? Number.NaN : Number(event.target.value) }, latest.max)
  });
  const temp = pool.temp
    ? h("input", {
      id: `${id}-temp`,
      class: "input pool-input",
      type: "number",
      min: "0",
      step: "1",
      "aria-label": `${pool.label} temporary`,
      oninput: (event) => handlers.onPool(pool.key, { temp: event.target.value.trim() === "" ? 0 : Number(event.target.value) }, latest.max)
    })
    : null;

  const maxText = h("span", { class: "pool-max" });
  const lower = button({ label: "-1", variant: "btn-small", ariaLabel: `-1 ${pool.label}`, onclick: () => handlers.onPool(pool.key, { current: latest.current - size }, latest.max) });
  const raise = button({ label: "+1", variant: "btn-small", ariaLabel: `+1 ${pool.label}`, onclick: () => handlers.onPool(pool.key, { current: latest.current + size }, latest.max) });

  function drawBoxes(max) {
    const count = Math.ceil(max / size);

    if (count === boxCount) {
      return;
    }

    boxCount = count;
    replace(
      boxes,
      Array.from({ length: count }, (_, index) => h("button", {
        type: "button",
        class: "box",
        "aria-pressed": "false",
        "aria-label": `Set ${pool.label} to ${Math.min((index + 1) * size, max)} of ${max}`,
        "data-index": String(index),
        onclick: () => {
          const filled = Math.ceil(latest.current / size);
          handlers.onPool(pool.key, { current: (filled === index + 1 ? index : index + 1) * size }, latest.max);
        }
      }))
    );
  }

  const body = boxed
    ? h("div", { class: "pool-body" }, boxes, readout)
    : h("div", { class: "pool-body" }, lower, current, maxText, raise, temp ? h("label", { class: "pool-temp" }, h("span", { text: "Temp" }), temp) : null);

  return {
    element: h("div", { class: "pool field-wide", "data-key": pool.key }, h("h3", { class: "pool-title", text: pool.label }), body, pool.hint ? h("p", { class: "field-hint", text: pool.hint }) : null, error),
    update(computed, errors) {
      const state = computed.pools[pool.key];
      const message = errorOf(errors, `@${pool.key}.max`);

      error.hidden = !message;
      error.textContent = message;

      if (!state) {
        readout.textContent = "-";
        return;
      }

      latest = state;

      if (boxed) {
        if (state.max / size > MAX_BOXES) {
          boxes.hidden = true;
        } else {
          boxes.hidden = false;
          drawBoxes(state.max);
          const filled = Math.ceil(state.current / size);

          for (const box of boxes.children) {
            box.setAttribute("aria-pressed", String(Number(box.dataset.index) < filled));
          }
        }

        readout.textContent = `${state.current} / ${state.max}${state.temp ? ` (+${state.temp} temporary)` : ""}`;
      } else {
        if (document.activeElement !== current) {
          current.value = String(state.current);
        }

        current.max = String(state.max);
        maxText.textContent = `/ ${state.max}`;

        if (temp && document.activeElement !== temp) {
          temp.value = String(state.temp);
        }
      }
    }
  };
}

function groupOrder(collection) {
  const field = collection.fields.find((entry) => entry.key === collection.groupBy);
  return field?.type === "choice" ? field.choices.map((choice) => choice.value) : null;
}

/** A collection as a table of typed rows with grouping, use counters, adding and removing. */
function createTable(collection, handlers) {
  const columns = (collection.columns?.length ? collection.columns : collection.fields.map((field) => field.key))
    .map((key) => collection.fields.find((field) => field.key === key))
    .filter(Boolean);
  const rows = new Map();
  const groups = new Map();
  const body = h("tbody");
  const empty = h("p", { class: "muted", text: "Nothing here yet." });
  const wrap = h(
    "div",
    { class: "table-scroll", tabindex: "0", role: "region", "aria-label": `${collection.label} table` },
    h(
      "table",
      { class: "sheet-table" },
      h("caption", { class: "visually-hidden", text: collection.label }),
      h("thead", {}, h("tr", {}, columns.map((column) => h("th", { scope: "col", text: column.label })), h("th", { scope: "col", text: "Actions" }))),
      body
    )
  );
  const add = button({ id: `sheet-add-${collection.key}`, icon: "plus", label: `Add to ${collection.label}`, onclick: () => handlers.onRowAdd(collection.key) });

  function createRowView(rowId) {
    const cells = new Map();
    const tr = h("tr", { class: "sheet-row", "data-row": rowId });
    const remove = button({ label: "Remove", variant: "btn-small btn-danger-text", onclick: () => handlers.onRowRemove(collection.key, rowId) });

    for (const column of columns) {
      const td = h("td", { "data-label": column.label });

      if (column.type === "derived") {
        const value = h("span", { class: "derived-value" });
        const error = h("span", { class: "field-error", hidden: true });
        td.append(value, error);
        cells.set(column.key, { kind: "derived", value, error, column });
      } else if (column.type === "uses") {
        const readoutText = h("span", { class: "uses-count" });
        const use = button({ label: "Use", variant: "btn-small", onclick: () => handlers.onUses(collection.key, rowId, column.key, 1) });
        const restore = button({ label: "Restore", variant: "btn-small", onclick: () => handlers.onUses(collection.key, rowId, column.key, -1) });
        td.append(readoutText, use, restore);
        cells.set(column.key, { kind: "uses", readoutText, use, restore, column });
      } else {
        const control = createInput(column, {
          id: `sheet-${collection.key}-${rowId}-${column.key}`,
          label: column.label,
          onCommit: (value) => handlers.onRowValue(collection.key, rowId, column.key, value)
        });
        td.append(control.element, control.error);
        cells.set(column.key, { kind: "input", control, column });
      }

      tr.append(td);
    }

    tr.append(h("td", { "data-label": "Actions" }, remove));
    return { tr, cells, remove };
  }

  function nameOf(row, position) {
    const name = row.values.name;
    return typeof name === "string" && name.trim() ? name.trim() : `row ${position + 1}`;
  }

  function order(rowList) {
    const sortKey = collection.sortBy;
    const sorted = [...rowList];

    if (sortKey) {
      sorted.sort((left, right) => String(left.values[sortKey] ?? "").localeCompare(String(right.values[sortKey] ?? ""), undefined, { sensitivity: "base" }));
    }

    if (!collection.groupBy) {
      return sorted.map((row) => ({ row }));
    }

    const preferred = groupOrder(collection) ?? [];
    const seen = [];

    for (const row of sorted) {
      const value = row.values[collection.groupBy];

      if (!seen.includes(value)) {
        seen.push(value);
      }
    }

    const sequence = [...preferred.filter((value) => seen.includes(value)), ...seen.filter((value) => !preferred.includes(value))];
    const output = [];

    for (const value of sequence) {
      output.push({ group: value });
      sorted.filter((row) => row.values[collection.groupBy] === value).forEach((row) => output.push({ row }));
    }

    return output;
  }

  function groupLabel(value) {
    const field = collection.fields.find((entry) => entry.key === collection.groupBy);
    return field?.type === "choice" ? field.choices.find((choice) => choice.value === value)?.label ?? String(value) : String(value || "None");
  }

  let previousOrder = [];

  return {
    element: h("div", { class: "collection", "data-collection": collection.key }, h("div", { class: "section-actions" }, add), empty, wrap),
    focusRow(rowId) {
      rows.get(rowId)?.tr.querySelector("input, select, textarea")?.focus();
    },
    update(computedRows, errors) {
      const known = new Set(computedRows.map((row) => row.id));

      for (const [id, view] of rows) {
        if (!known.has(id)) {
          view.tr.remove();
          rows.delete(id);
        }
      }

      computedRows.forEach((row, position) => {
        let view = rows.get(row.id);

        if (!view) {
          view = createRowView(row.id);
          rows.set(row.id, view);
        }

        const rowName = nameOf(row, position);

        view.remove.setAttribute("aria-label", `Remove ${rowName}`);

        for (const [key, cell] of view.cells) {
          if (cell.kind === "derived") {
            const message = errorOf(errors, `collections.${collection.key}.${row.id}.${key}`);
            cell.value.textContent = message ? "-" : formatValue(cell.column, row.values[key]);
            cell.error.hidden = !message;
            cell.error.textContent = message;
          } else if (cell.kind === "uses") {
            const use = row.uses[key];
            cell.readoutText.textContent = use.max === null ? `${use.used} used` : `${use.left} of ${use.max} left`;
            cell.use.setAttribute("aria-label", `Use one: ${rowName}`);
            cell.restore.setAttribute("aria-label", `Restore one: ${rowName}`);
            cell.use.disabled = use.max !== null && use.left === 0;
            cell.restore.disabled = use.used === 0;
          } else {
            cell.control.element.setAttribute("aria-label", `${cell.column.label}, ${rowName}`);
            cell.control.set(row.values[key], errorOf(errors, `collections.${collection.key}.${row.id}.${key}`));
          }
        }
      });

      const wanted = order(computedRows);
      const sameRows = wanted.filter((entry) => entry.row).length === previousOrder.filter((entry) => entry.row).length;

      if (!(wrap.contains(document.activeElement) && sameRows && previousOrder.length)) {
        const nodes = wanted.map((entry) => {
          if (entry.row) {
            return rows.get(entry.row.id).tr;
          }

          if (!groups.has(entry.group)) {
            groups.set(entry.group, h("tr", { class: "group-row" }, h("th", { scope: "rowgroup", colspan: String(columns.length + 1), text: groupLabel(entry.group) })));
          }

          const heading = groups.get(entry.group);
          heading.querySelector("th").textContent = groupLabel(entry.group);
          return heading;
        });

        nodes.forEach((node, index) => {
          if (body.children[index] !== node) {
            body.insertBefore(node, body.children[index] ?? null);
          }
        });

        while (body.children.length > nodes.length) {
          body.lastChild.remove();
        }

        previousOrder = wanted;
      }

      empty.hidden = computedRows.length > 0;
      wrap.hidden = computedRows.length === 0;
    }
  };
}

function layoutOf(template) {
  const used = new Set();
  const sections = template.sections.map((definition) => {
    definition.items.forEach((item) => used.add(item));
    return definition;
  });
  const extraItems = [
    ...template.fields.filter((field) => !used.has(field.key)).map((field) => field.key),
    ...template.pools.filter((pool) => !used.has(pool.key)).map((pool) => pool.key)
  ];
  const extraTables = template.collections.filter((collection) => !used.has(collection.key));
  const output = [...sections];

  if (extraItems.length) {
    output.push({ id: "other", title: "Other", layout: "fields", items: extraItems });
  }

  for (const collection of extraTables) {
    output.push({ id: `table_${collection.key}`, title: collection.label, layout: "table", items: [collection.key] });
  }

  return output;
}

function systemCard(entry, { current, name, onChoose }) {
  const id = `system-${entry.id}`;

  return h(
    "label",
    { class: `system-card${current ? " is-current" : ""}`, for: id },
    h("input", { type: "radio", name, id, value: entry.id, disabled: !entry.ok, onchange: () => onChoose(entry) }),
    h(
      "span",
      { class: "system-card-body" },
      h("span", { class: "system-card-title" }, h("strong", { text: entry.name }), entry.builtin ? h("span", { class: "badge", text: "Built in" }) : h("span", { class: "badge", text: "Yours" })),
      h("span", { class: "system-card-meta", text: `Version ${entry.version}${entry.base ? `, derived from ${entry.base.id}` : ""}${entry.ok ? "" : ", has errors" }` }),
      entry.description ? h("span", { class: "field-hint", text: entry.description }) : null
    )
  );
}

/**
 * The Sheet page. Built once per character and system, then updated in place. `render` takes
 * `{ character, systems, resolution, computed }` and holds no state of its own beyond the controls.
 */
export function mountSheetPage(root, handlers) {
  const picker = h("div", { class: "stack" });
  const content = h("div", { class: "stack" });
  let builtKey = null;
  let built = null;
  let choosing = null;
  let drawnKey = null;

  replace(root, picker, content);

  function drawPicker({ systems, current, mode, reason }) {
    const key = `${mode}|${reason ?? ""}|${current?.id ?? ""}|${systems.map((entry) => `${entry.id}@${entry.version}:${entry.ok}`).join(",")}`;

    if (key === drawnKey) {
      return;
    }

    drawnKey = key;
    let chosen = null;
    const confirm = button({
      id: "sheet-picker-confirm",
      label: mode === "start" ? "Start a sheet" : mode === "repair" ? "Use this system" : "Change system",
      variant: "btn-primary",
      disabled: true,
      onclick: () => (mode === "start" ? handlers.onStart(chosen) : handlers.onChangeSystem(chosen))
    });

    replace(
      picker,
      section(
        {
          id: "sheet-picker",
          title: mode === "start" ? "Choose a game system" : mode === "repair" ? "Choose a game system for this sheet" : "Change game system",
          description: reason ?? (mode === "start"
            ? "A system defines the fields, pools and lists on this character's sheet. You can switch later; nothing is deleted."
            : "Values the new system does not have are kept aside and come back if you return. You can undo this.")
        },
        h(
          "fieldset",
          { class: "fieldset system-list" },
          h("legend", { class: "visually-hidden", text: "Game systems" }),
          systems.map((entry) => systemCard(entry, {
            current: current?.id === entry.id,
            name: "system",
            onChoose: (picked) => {
              chosen = { id: picked.id, version: picked.version };
              confirm.disabled = false;
            }
          }))
        ),
        h("div", { class: "section-actions" }, confirm, mode === "change" ? button({ id: "sheet-picker-cancel", label: "Cancel", onclick: () => handlers.onCancelChange() }) : null)
      )
    );
  }

  function build(template, characterName) {
    const controls = new Map();
    const pools = new Map();
    const tables = new Map();
    const conditions = new Map();
    const panels = [];

    for (const definition of layoutOf(template)) {
      const blocks = [];

      if (definition.layout === "table") {
        for (const key of definition.items) {
          const collection = template.collections.find((entry) => entry.key === key);

          if (collection) {
            const table = createTable(collection, handlers);
            tables.set(key, table);
            blocks.push(table.element);
          }
        }

        panels.push(section({ id: `sheet-s-${definition.id}`, title: definition.title }, ...blocks));
        continue;
      }

      const grid = h("div", { class: "field-grid" });

      for (const key of definition.items) {
        const field = template.fields.find((entry) => entry.key === key);
        const pool = template.pools.find((entry) => entry.key === key);

        if (field) {
          const block = createFieldBlock(field, handlers);
          controls.set(key, block);
          grid.append(block.element);
        } else if (pool) {
          const block = createPoolBlock(pool, handlers);
          pools.set(key, block);
          grid.append(block.element);
        }
      }

      panels.push(section({ id: `sheet-s-${definition.id}`, title: definition.title }, grid));
    }

    if (template.conditions.length) {
      const group = h("div", { class: "cond-group", role: "group", "aria-label": "Conditions" });

      for (const name of template.conditions) {
        const toggle = h("button", { type: "button", class: "cond", "aria-pressed": "false", text: name, onclick: () => handlers.onCondition(name) });
        conditions.set(name, toggle);
        group.append(toggle);
      }

      panels.push(section({ id: "sheet-conditions", title: "Conditions", description: "Tap a condition to mark it on or off." }, group));
    }

    const barTitle = h("p", { class: "sheet-system" });
    const restButtons = template.rests.map((rest) => button({ id: `sheet-rest-${rest.id}`, label: rest.label, onclick: () => handlers.onRest(rest.id) }));
    const bar = h(
      "div",
      { class: "sheet-bar" },
      barTitle,
      h("div", { class: "section-actions" }, restButtons, button({ id: "sheet-change", label: "Change system", onclick: () => handlers.onOpenChange() }))
    );
    const noticeText = h("span", { class: "sheet-update-text" });
    const notice = h("div", { id: "sheet-update", class: "sheet-update", hidden: true }, noticeText, button({ id: "sheet-update-review", label: "Review changes", onclick: () => handlers.onReviewUpdate() }));
    const problems = h("div", { id: "sheet-problems" });
    const orphans = h("div", { id: "sheet-orphans" });

    replace(content, bar, notice, problems, ...panels, orphans);
    return { controls, pools, tables, conditions, barTitle, notice, noticeText, problems, orphans, characterName };
  }

  function updateAside(view, computed, sheet) {
    if (computed.errors.length) {
      replace(
        view.problems,
        section(
          { id: "sheet-problems-list", title: "Problems with this sheet", description: "These values could not be used. Everything else still works." },
          h("ul", { class: "problem-list" }, computed.errors.slice(0, 50).map((entry) => h("li", {}, h("code", { text: entry.path }), ` ${entry.message}`)))
        )
      );
    } else {
      replace(view.problems);
    }

    const orphans = Object.entries(sheet.orphans ?? {});

    if (orphans.length) {
      replace(
        view.orphans,
        section(
          { id: "sheet-orphans-list", title: "Kept from another system", description: "These values have no field in this system. They are kept, not deleted, and return if you switch back." },
          h("ul", { class: "problem-list" }, orphans.slice(0, 50).map(([path, value]) => h("li", {}, h("code", { text: path }), ` ${typeof value === "object" ? JSON.stringify(value).slice(0, 120) : String(value)}`)))
        )
      );
    } else {
      replace(view.orphans);
    }
  }

  return {
    focusRow(collectionKey, rowId) {
      built?.tables.get(collectionKey)?.focusRow(rowId);
    },
    openChange({ systems, current }) {
      choosing = "change";
      drawnKey = null;
      drawPicker({ systems, current, mode: "change" });
      picker.hidden = false;
      picker.querySelector("input[type=radio]:not(:disabled)")?.focus();
    },
    closeChange() {
      choosing = null;
      drawnKey = null;
      replace(picker);
      picker.hidden = true;
    },
    render({ character, systems, resolution, computed, update = null }) {
      const sheet = character.sheet;

      if (!sheet) {
        builtKey = null;
        built = null;
        replace(content);
        picker.hidden = false;

        if (systems.length === 0) {
          replace(picker, emptyState({ title: "No game systems", message: "No game system is available on this device." }));
        } else {
          choosing = "start";
          drawPicker({ systems, current: null, mode: "start" });
        }

        return;
      }

      if (choosing === "start") {
        choosing = null;
        drawnKey = null;
        replace(picker);
      }

      if (!resolution.ok) {
        builtKey = null;
        built = null;
        replace(content);
        picker.hidden = false;
        choosing = "repair";
        drawPicker({
          systems,
          current: null,
          mode: "repair",
          reason: `${resolution.errors[0]?.message ?? "This sheet's system cannot be used."} Your values are safe; choose a system to use them with.`
        });
        return;
      }

      if (choosing === "repair") {
        choosing = null;
        drawnKey = null;
        replace(picker);
      }

      picker.hidden = choosing !== "change";

      const key = `${character.id}|${sheet.template.id}@${sheet.template.version}`;

      if (key !== builtKey) {
        built = build(resolution.template, character.name);
        builtKey = key;
      }

      built.barTitle.textContent = `Following ${resolution.template.name}, version ${sheet.template.version}.`;
      built.notice.hidden = !update;
      built.noticeText.textContent = update ? `Version ${update.version} of this system is available.` : "";

      for (const control of built.controls.values()) {
        control.update(computed, computed.errors);
      }

      for (const pool of built.pools.values()) {
        pool.update(computed, computed.errors);
      }

      for (const [key2, table] of built.tables) {
        table.update(computed.collections[key2] ?? [], computed.errors);
      }

      const active = new Set(computed.conditions.map((entry) => entry.name));

      for (const [name, toggle] of built.conditions) {
        toggle.setAttribute("aria-pressed", String(active.has(name)));
        toggle.classList.toggle("is-on", active.has(name));
      }

      updateAside(built, computed, sheet);
    }
  };
}
