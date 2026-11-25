import { OWN_TYPES, OWN_TYPE_LABELS } from "../layouts/limits.js";
import { createId } from "../utils.js";
import { button, h, replace } from "./dom.js";

/**
 * The in-place layout editor (L-5): the page's sections and fields as an editable outline. Every action is a button or a
 * native control, so it works from the keyboard; each one reports operations to the controller and the outline is
 * redrawn from the resolved layout. Focus returns to the control that was used.
 */
const BUILTIN_TYPES = { text: "Text", long: "Long text", int: "Number", num: "Number", bool: "Yes or no", choice: "Choice", date: "Date", tags: "Tags", checkbox: "Yes or no", number: "Number" };

export function createLayoutEditor(handlers) {
  const bar = h("div", { class: "toolbar layout-editor-bar" });
  const message = h("p", { class: "field-error", id: "layout-editor-message", role: "alert", hidden: true });
  const outline = h("div", { class: "stack" });
  const switcher = h("div", { class: "toolbar layout-switcher" });
  const element = h(
    "section",
    { class: "panel layout-editor", id: "layout-editor", "aria-labelledby": "layout-editor-title" },
    h("h2", { class: "panel-title", id: "layout-editor-title", text: "Edit layout" }),
    h("p", { class: "field-hint", text: "Rename, move, hide and add fields. Changes save as you make them; Undo steps back one change." }),
    switcher,
    bar,
    message,
    outline
  );
  let lastAct = null;

  function act(name, run) {
    return () => {
      lastAct = name;
      run();
    };
  }

  function tagged(control, name) {
    control.dataset.act = name;
    return control;
  }

  function addFieldForm(section) {
    const name = h("input", { class: "input", type: "text", maxLength: 60, autocomplete: "off", "aria-label": `Name of the new field in ${section.title || "this section"}`, placeholder: "Name" });
    const type = h("select", { class: "input", "aria-label": "Type of the new field" }, OWN_TYPES.map((value) => h("option", { value, text: OWN_TYPE_LABELS[value] })));
    const choices = h("input", { class: "input", type: "text", autocomplete: "off", "aria-label": "Choices, separated by commas", placeholder: "Choices, separated by commas", hidden: true });

    type.addEventListener("change", () => {
      choices.hidden = type.value !== "choice";
    });

    const submit = (event) => {
      event.preventDefault();
      const field = { id: createId("cf"), label: name.value.trim(), type: type.value };

      if (type.value === "choice") {
        field.choices = choices.value.split(",").map((choice) => choice.trim()).filter(Boolean);
      }

      lastAct = `${section.id}:add`;
      handlers.onOps([{ op: "add", target: "field", field, section: section.id }]);
    };

    return h(
      "details",
      { class: "layout-add" },
      h("summary", { text: "Add a field", "data-act": `${section.id}:add` }),
      h("form", { class: "toolbar", onsubmit: submit, novalidate: true }, name, type, choices, button({ label: "Add field", variant: "btn-small", type: "submit" }))
    );
  }

  function itemRow(section, sections, item, index, total) {
    const key = item.key;
    const label = h("input", { class: "input", type: "text", maxLength: 60, value: item.label, autocomplete: "off", "aria-label": `Name of ${item.label}` });
    label.addEventListener("change", () => {
      lastAct = `${key}:label`;
      handlers.onOps([{ op: "override", target: "field", key, value: { label: label.value } }]);
    });

    const move = h(
      "select",
      { class: "input", "aria-label": `Move ${item.label} to a section`, "data-act": `${key}:section` },
      sections.map((entry) => h("option", { value: entry.id, text: entry.title || "Main", selected: entry.id === section.id }))
    );
    move.addEventListener("change", () => {
      lastAct = `${key}:section`;
      handlers.onOps([{ op: "move", target: "field", key, section: move.value }]);
    });

    const flag = (name, text, value) => {
      const box = h("input", { type: "checkbox", class: "checkbox", checked: value, "data-act": `${key}:${name}` });
      box.addEventListener("change", () => {
        lastAct = `${key}:${name}`;
        handlers.onOps([{ op: "override", target: "field", key, value: { [name]: box.checked } }]);
      });
      return h("label", { class: "check-label" }, box, h("span", { text }));
    };

    const typeText = item.own ? OWN_TYPE_LABELS[item.type] : BUILTIN_TYPES[item.type] ?? item.type;

    return h(
      "li",
      { class: `layout-item${item.hidden ? " is-hidden" : ""}`, "data-key": key },
      h(
        "div",
        { class: "toolbar" },
        label,
        h("span", { class: "field-hint", text: `${typeText}${item.own ? ", yours" : ""}${item.hidden ? ", hidden" : ""}` }),
        tagged(button({ label: "Up", ariaLabel: `Move ${item.label} up`, variant: "btn-small", disabled: index === 0, onclick: act(`${key}:up`, () => handlers.onOps([{ op: "move", target: "field", key, section: section.id, index: index - 1 }])) }), `${key}:up`),
        tagged(button({ label: "Down", ariaLabel: `Move ${item.label} down`, variant: "btn-small", disabled: index === total - 1, onclick: act(`${key}:down`, () => handlers.onOps([{ op: "move", target: "field", key, section: section.id, index: index + 1 }])) }), `${key}:down`),
        item.required
          ? null
          : tagged(button({ label: item.hidden ? "Show" : "Hide", ariaLabel: `${item.hidden ? "Show" : "Hide"} ${item.label}`, variant: "btn-small", onclick: act(`${key}:hide`, () => handlers.onOps([{ op: item.hidden ? "show" : "hide", target: "field", key }])) }), `${key}:hide`)
      ),
      h(
        "div",
        { class: "toolbar layout-item-more" },
        move,
        flag("wide", "Full width", item.wide),
        item.required ? null : flag("hideWhenEmpty", "Hide when empty", item.hideWhenEmpty),
        item.own ? flag("showInList", "Show in the list", item.showInList) : null,
        item.own
          ? tagged(button({ label: "Remove", ariaLabel: `Remove ${item.label}`, variant: "btn-small btn-danger-text", onclick: act(`${key}:remove`, () => handlers.onRemoveField(item)) }), `${key}:remove`)
          : null
      )
    );
  }

  function sectionBlock(section, sections, index) {
    const title = h("input", { class: "input", type: "text", maxLength: 60, value: section.title, autocomplete: "off", "aria-label": `Name of section ${section.title || index + 1}`, placeholder: "Section name" });
    title.addEventListener("change", () => {
      lastAct = `${section.id}:title`;
      handlers.onOps([{ op: "override", target: "section", id: section.id, value: { title: title.value } }]);
    });

    return h(
      "div",
      { class: "layout-section-edit", role: "group", "aria-label": section.title || "Main section", "data-section": section.id },
      h(
        "div",
        { class: "toolbar" },
        title,
        tagged(button({ label: "Up", ariaLabel: `Move section ${section.title || index + 1} up`, variant: "btn-small", disabled: index === 0, onclick: act(`${section.id}:up`, () => handlers.onOps([{ op: "move", target: "section", id: section.id, index: index - 1 }])) }), `${section.id}:up`),
        tagged(button({ label: "Down", ariaLabel: `Move section ${section.title || index + 1} down`, variant: "btn-small", disabled: index === sections.length - 1, onclick: act(`${section.id}:down`, () => handlers.onOps([{ op: "move", target: "section", id: section.id, index: index + 1 }])) }), `${section.id}:down`),
        section.own ? tagged(button({ label: "Remove section", ariaLabel: `Remove section ${section.title}`, variant: "btn-small btn-danger-text", onclick: act(`${section.id}:remove`, () => handlers.onRemoveSection(section)) }), `${section.id}:remove`) : null
      ),
      h("ul", { class: "plain-list layout-items" }, section.items.map((item, position) => itemRow(section, sections, item, position, section.items.length))),
      addFieldForm(section)
    );
  }

  function addSectionForm() {
    const name = h("input", { class: "input", type: "text", maxLength: 60, autocomplete: "off", "aria-label": "Name of the new section", placeholder: "New section" });
    return h(
      "form",
      {
        class: "toolbar",
        novalidate: true,
        onsubmit: (event) => {
          event.preventDefault();
          lastAct = "new-section";
          handlers.onOps([{ op: "add", target: "section", id: createId("s"), title: name.value.trim() }]);
        }
      },
      name,
      tagged(button({ id: "layout-add-section", label: "Add section", variant: "btn-small", type: "submit" }), "new-section")
    );
  }

  return {
    element,
    render(resolved, { canUndo, canRedo, problem = "", surfaceLabel = "this page", choices = [], chosen = "default" }) {
      const pick = h("select", { class: "input", id: "layout-choose", "aria-label": "Layout used for this page" }, [h("option", { value: "default", text: "Default layout", selected: chosen === "default" }), ...choices.map((file) => h("option", { value: file.id, text: file.name, selected: file.id === chosen }))]);
      pick.addEventListener("change", () => {
        lastAct = "choose";
        handlers.onChoose(pick.value);
      });
      const name = h("input", { class: "input", id: "layout-new-name", type: "text", maxLength: 60, autocomplete: "off", "aria-label": "Name for a new layout", placeholder: "New layout name" });
      const rename = h("input", { class: "input", id: "layout-rename", type: "text", maxLength: 60, autocomplete: "off", "aria-label": "Name of this layout", value: choices.find((file) => file.id === chosen)?.name ?? "", hidden: chosen === "default" });
      rename.addEventListener("change", () => handlers.onRenameLayout(rename.value));
      replace(
        switcher,
        pick,
        rename,
        chosen === "default" ? null : button({ id: "layout-delete", label: "Delete layout", variant: "btn-small btn-danger-text", onclick: act("delete", handlers.onDeleteLayout) }),
        name,
        button({ id: "layout-new", label: "New layout", variant: "btn-small", onclick: act("new", () => handlers.onNewLayout(name.value)) })
      );

      replace(
        bar,
        button({ id: "layout-undo", label: "Undo", variant: "btn-small", disabled: !canUndo, onclick: act("undo", handlers.onUndo) }),
        button({ id: "layout-redo", label: "Redo", variant: "btn-small", disabled: !canRedo, onclick: act("redo", handlers.onRedo) }),
        button({ id: "layout-reset", label: "Reset to default", variant: "btn-small btn-danger-text", onclick: act("reset", handlers.onReset) }),
        button({ id: "layout-done", label: "Done", variant: "btn-primary btn-small", onclick: () => handlers.onDone() })
      );
      element.querySelector(".panel-title").textContent = `Edit layout: ${surfaceLabel}`;
      message.textContent = problem;
      message.hidden = !problem;
      replace(outline, resolved.sections.map((section, index) => sectionBlock(section, resolved.sections, index)), addSectionForm());

      if (lastAct) {
        const target = element.querySelector(`[data-act="${CSS.escape(lastAct)}"]:not(:disabled)`) ?? element.querySelector(`[data-act="${CSS.escape(lastAct.replace(/:(up|down)$/, (match) => (match === ":up" ? ":down" : ":up")))}"]:not(:disabled)`);
        target?.focus();
        lastAct = null;
      }
    }
  };
}
