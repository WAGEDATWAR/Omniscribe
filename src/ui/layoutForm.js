import { LAYOUT_LIMITS } from "../layouts/limits.js";
import { isSurface } from "../layouts/surfaces.js";
import { isEmptyValue, ownDefault, validateOwnValue } from "../layouts/values.js";
import { button, field, h, replace, section as panel } from "./dom.js";

/**
 * Draws a resolved layout (L-1) as sections of fields. Built-in fields bring their own controls; the fields of your
 * own get a control by type. The form holds no state beyond its controls: `read` and `write` move values in and out.
 * `builtins` maps a built-in field key to `{ control, extra? }`; `trailing` nodes (record-specific controls the layout
 * does not describe) go at the end of the first section.
 */
function ownControl(prefix, item) {
  const id = `${prefix}-${item.key}`;

  switch (item.type) {
    case "long":
      return h("textarea", { id, class: "input input-tall", rows: 4, maxLength: LAYOUT_LIMITS.long, spellcheck: true });
    case "number":
      return h("input", { id, class: "input", type: "number", step: "any", inputMode: "decimal" });
    case "checkbox":
      return h("input", { id, class: "checkbox", type: "checkbox" });
    case "choice":
      return h("select", { id, class: "input" }, [h("option", { value: "", text: "" }), ...item.choices.map((choice) => h("option", { value: choice, text: choice }))]);
    case "date":
      return h("input", { id, class: "input", type: "date" });
    case "tags":
      return h("input", { id, class: "input", type: "text", autocomplete: "off", placeholder: "comma, separated" });
    default:
      return h("input", { id, class: "input", type: "text", maxLength: LAYOUT_LIMITS.text, autocomplete: "off" });
  }
}

function writeOwn(item, control, value) {
  if (item.type === "checkbox") {
    control.checked = value === true;
  } else if (item.type === "tags") {
    control.value = Array.isArray(value) ? value.join(", ") : "";
  } else {
    control.value = value === null || value === undefined ? "" : String(value);
  }
}

function readOwn(item, control) {
  const def = item.def;

  if (item.type === "checkbox") {
    return { value: control.checked };
  }

  if (item.type === "tags") {
    return validateOwnValue(def, control.value.split(",").map((tag) => tag.trim()).filter(Boolean));
  }

  if (item.type === "number") {
    const text = control.value.trim();
    return text === "" ? { ok: true, value: null } : validateOwnValue(def, Number(text));
  }

  return validateOwnValue(def, control.value);
}

/** A value of a field of your own as short text. */
export function showOwn(item, value) {
  if (item.type === "checkbox") {
    return value ? "yes" : "no";
  }

  return Array.isArray(value) ? value.join(", ") : String(value);
}

export function createLayoutForm({ prefix, surface, editor = null, builtins, trailing = [], onOwnChange = null, panels = false, descriptions = {}, blocks = [] }) {
  const element = h("div", { class: "stack layout-form" });
  const owns = new Map();
  let drawn = null;
  let drawnEditing = false;

  function node(item) {
    const entry = item.own ? owns.get(item.key) : builtins.get(item.key);

    if (!entry) {
      return null;
    }

    if (item.type === "checkbox" || item.type === "bool") {
      return h("div", { class: "field" }, h("label", { class: "check-label" }, entry.control, h("span", { text: item.label })));
    }

    const wrapper = field({ id: entry.id ?? entry.control.id, label: item.label, hint: item.hint || undefined, wide: item.wide }, entry.control);
    entry.control.listElement && wrapper.append(entry.control.listElement);
    return wrapper;
  }

  function snapshot() {
    return new Map([...owns].map(([key, { item, control }]) => [key, item.type === "checkbox" ? control.checked : control.value]));
  }

  return {
    element,
    /** Redraws for a resolved layout; typed own values survive the redraw. */
    setLayout(resolved) {
      const editing = Boolean(editor?.active(surface));
      const canEdit = Boolean(editor) && isSurface(surface);

      if (drawn === resolved && drawnEditing === editing) {
        return false;
      }

      drawnEditing = editing;

      const before = snapshot();
      const next = new Map();

      for (const section of resolved.sections) {
        for (const item of section.items) {
          if (item.own && !item.hidden) {
            const control = ownControl(prefix, item);

            if (onOwnChange) {
              control.addEventListener(item.type === "checkbox" || item.type === "choice" ? "change" : "input", onOwnChange);
            }

            if (before.has(item.key)) {
              const kept = before.get(item.key);
              item.type === "checkbox" ? (control.checked = kept) : (control.value = kept);
            }

            next.set(item.key, { item, control });
          }
        }
      }

      owns.clear();
      next.forEach((value, key) => owns.set(key, value));
      drawn = resolved;

      const visibleSections = resolved.sections.filter((section) => section.items.some((item) => !item.hidden));
      let first = true;

      const rendered = visibleSections.map((section) => {
          const nodes = section.items.filter((item) => !item.hidden).map(node).filter(Boolean);

          if (first) {
            nodes.push(...trailing);
            first = false;
          }

          const grid = h("div", { class: "field-grid" }, nodes);

          return panels
            ? panel({ id: `${prefix}-s-${section.id}`, title: section.title || "Details", description: descriptions[section.id] }, grid)
            : h("div", { class: "stack layout-section", "data-section": section.id }, section.title ? h("h3", { class: "subsection-title", text: section.title }) : null, grid);
        });

      for (const { afterIndex, node: extra } of [...blocks].sort((a, b) => b.afterIndex - a.afterIndex)) {
        rendered.splice(Math.min(afterIndex, rendered.length), 0, extra);
      }

      const tools = canEdit ? h("div", { class: "layout-tools" }, button({ id: `${prefix}-edit-layout`, label: "Edit layout", variant: "btn-small", onclick: () => editor.begin(surface) })) : null;

      replace(element, editing ? editor.element : [tools, rendered]);
      return true;
    },
    /** Writes a record's stored values into the own controls. */
    write(values, { keepFocus = false } = {}) {
      for (const [key, { item, control }] of owns) {
        if (keepFocus && document.activeElement === control) {
          continue;
        }

        writeOwn(item, control, values?.[key] ?? (item.def ? ownDefault(item.def) : ""));
      }
    },
    /**
     * Reads the own controls into `{ values }` merged over `base` (values the form does not show are kept), or
     * `{ error }`. A value equal to "nothing here" is left out so records stay small.
     */
    read(base = {}) {
      const values = { ...base };

      for (const [key, { item, control }] of owns) {
        const read = readOwn(item, control);

        if (read.ok === false) {
          return { error: read.reason };
        }

        if (isEmptyValue(item.def, read.value)) {
          delete values[key];
        } else {
          values[key] = read.value;
        }
      }

      return { values };
    },
    focusFirstOwn: () => owns.values().next().value?.control.focus()
  };
}
