import { button, emptyState, field, h, replace, section } from "./dom.js";
import { resultCard } from "./dice.js";

function stepsToText(steps) {
  return (steps ?? []).map((step) => `${step.label} = ${step.expression}`).join("\n");
}

function textToSteps(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = /^(.+?)\s=\s(.+)$/.exec(line);
      return parts ? { label: parts[1].trim(), expression: parts[2].trim() } : { label: line, expression: line };
    });
}

/**
 * A character's Rolls page: their saved rolls and macros, the system's rolls, and their recent rolls.
 * Handlers: `onSave(fields, editingId)`, `onDelete`, `onMove`, `onRoll`, `onAgain`.
 */
export function mountRollsPage(root, handlers) {
  const label = h("input", { id: "preset-label", class: "input", type: "text", maxLength: 80, autocomplete: "off" });
  const expression = h("input", { id: "preset-expression", class: "input input-mono", type: "text", autocomplete: "off", spellcheck: false, placeholder: "1d20 + @str.mod" });
  const group = h("input", { id: "preset-group", class: "input", type: "text", maxLength: 40, autocomplete: "off" });
  const crit = h("input", { id: "preset-crit", class: "input", type: "number", min: "2", inputMode: "numeric" });
  const steps = h("textarea", { id: "preset-steps", class: "input input-tall input-mono", rows: 3, spellcheck: false, placeholder: "Attack = 1d20 + @str.mod\
Damage = 1d8 + @str.mod" });
  const error = h("p", { id: "preset-error", class: "field-error", hidden: true, role: "alert" });
  const saveButton = button({ id: "preset-save", label: "Add roll", variant: "btn-primary", type: "submit" });
  const cancelButton = button({ id: "preset-cancel", label: "Cancel", onclick: () => reset() });
  const result = h("div", { id: "rolls-result", class: "roll-slot", role: "status", "aria-live": "polite" });
  const own = h("div", { class: "stack", id: "preset-list" });
  const system = h("div", { class: "stack" });
  const recent = h("ol", { class: "roll-log", id: "rolls-recent" });
  let editing = null;

  function reset() {
    editing = null;
    label.value = "";
    expression.value = "";
    group.value = "";
    crit.value = "";
    steps.value = "";
    error.hidden = true;
    saveButton.querySelector("span").textContent = "Add roll";
    cancelButton.hidden = true;
  }

  function submit(event) {
    event.preventDefault();
    const stepList = textToSteps(steps.value);
    const verdict = handlers.onSave(
      {
        label: label.value,
        expression: stepList.length ? "" : expression.value,
        group: group.value,
        critMin: crit.value.trim() ? Number(crit.value) : null,
        steps: stepList.length ? stepList : null
      },
      editing
    );

    if (verdict.ok) {
      reset();
      label.focus();
    } else {
      error.textContent = verdict.reason;
      error.hidden = false;
    }
  }

  reset();

  replace(
    root,
    h(
      "div",
      { class: "stack" },
      section(
        { id: "rolls-saved", title: "Saved rolls", description: "Rolls you write for this character. A roll can read their sheet, such as 1d20 + @str.mod." },
        own,
        result
      ),
      h(
        "form",
        { id: "preset-form", class: "panel", onsubmit: submit, novalidate: true },
        h("h2", { class: "panel-title", text: "Add or edit a roll" }),
        h(
          "div",
          { class: "field-grid" },
          field({ id: "preset-label", label: "Name" }, label),
          field({ id: "preset-expression", label: "Expression", hint: "Leave empty when you write steps below." }, expression),
          field({ id: "preset-group", label: "Group", hint: "Optional heading to keep rolls together." }, group),
          field({ id: "preset-crit", label: "Critical from", hint: "Optional: the natural d20 result that counts as a critical." }, crit),
          field({ id: "preset-steps", label: "Macro steps", hint: "Optional, one roll per line as name = expression. Each step is recorded on its own.", wide: true }, steps)
        ),
        error,
        h("div", { class: "section-actions" }, saveButton, cancelButton)
      ),
      section({ id: "rolls-system", title: "System rolls", description: "From this character's game system. Roll them here or on the Sheet page." }, system),
      section({ id: "rolls-history", title: "Recent rolls" }, recent)
    )
  );

  return {
    renderResults(rolls) {
      replace(result, ...rolls.map(({ roll, text }) => resultCard(roll, text)));
    },
    renderError(reason) {
      replace(result, h("p", { class: "field-error", text: reason }));
    },
    renderOwn(presets) {
      replace(
        own,
        presets.length
          ? presets.map((preset, index) =>
              h(
                "div",
                { class: "preset-row", "data-preset": preset.id },
                h("div", {}, h("strong", { text: preset.label }), h("p", { class: "field-hint", text: preset.steps ? `${preset.steps.length} steps` : preset.expression })),
                h(
                  "div",
                  { class: "toolbar" },
                  button({ label: "Roll", ariaLabel: `Roll ${preset.label}`, variant: "btn-small btn-primary", onclick: () => handlers.onRoll(preset.id) }),
                  button({
                    label: "Edit",
                    ariaLabel: `Edit ${preset.label}`,
                    variant: "btn-small",
                    onclick: () => {
                      editing = preset.id;
                      label.value = preset.label;
                      expression.value = preset.expression;
                      group.value = preset.group;
                      crit.value = preset.critMin ? String(preset.critMin) : "";
                      steps.value = stepsToText(preset.steps);
                      error.hidden = true;
                      saveButton.querySelector("span").textContent = "Save roll";
                      cancelButton.hidden = false;
                      label.focus();
                    }
                  }),
                  button({ label: "Up", ariaLabel: `Move ${preset.label} up`, variant: "btn-small", disabled: index === 0, onclick: () => handlers.onMove(preset.id, -1) }),
                  button({ label: "Down", ariaLabel: `Move ${preset.label} down`, variant: "btn-small", disabled: index === presets.length - 1, onclick: () => handlers.onMove(preset.id, 1) }),
                  button({ label: "Delete", ariaLabel: `Delete ${preset.label}`, variant: "btn-small btn-danger-text", onclick: () => handlers.onDelete(preset.id) })
                )
              )
            )
          : emptyState({ title: "No saved rolls yet", message: "Add one below, such as a weapon attack or a favourite check." })
      );
    },
    renderSystem(rolls, { hasSheet }) {
      replace(
        system,
        rolls.length
          ? h("div", { class: "toolbar" }, rolls.map((roll) => button({ label: roll.label, title: roll.expression, onclick: () => handlers.onRoll(roll.id) })))
          : h("p", { class: "muted", text: hasSheet ? "This system has no rolls." : "Start a sheet on the Sheet page to use its rolls." })
      );
    },
    renderRecent(entries) {
      replace(
        recent,
        entries.length
          ? entries.map(({ roll, text }) =>
              h(
                "li",
                { class: "roll-entry" },
                h("div", { class: "roll-entry-head" }, h("strong", { text: roll.label }), h("span", { class: "roll-entry-total", text: String(roll.total) })),
                h("p", { class: "roll-explain", text }),
                button({ label: "Roll again", ariaLabel: `Roll again: ${roll.label}`, variant: "btn-small", onclick: () => handlers.onAgain(roll.id) })
              )
            )
          : h("li", { class: "roll-empty", text: "No rolls for this character yet." })
      );
    }
  };
}
