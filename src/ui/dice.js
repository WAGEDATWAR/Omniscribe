import { button, emptyState, field, h, pageHeader, replace, section } from "./dom.js";

const QUICK = [4, 6, 8, 10, 12, 20, "%"];

function when(at) {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** A roll result card: total, explanation and flags. Pure rendering of a recorded roll. */
export function resultCard(roll, text) {
  const flags = [roll.flags.critical ? "Critical" : "", roll.flags.fumble ? "Fumble" : "", roll.flags.botch ? "Botch" : ""].filter(Boolean);

  return h(
    "div",
    { class: `roll-result${roll.flags.critical ? " is-critical" : ""}${roll.flags.fumble || roll.flags.botch ? " is-fumble" : ""}` },
    h("p", { class: "roll-label", text: roll.label }),
    h("p", { class: "roll-total", text: String(roll.total) }),
    h("p", { class: "roll-explain", text }),
    flags.length ? h("p", { class: "roll-flags", text: flags.join(", ") }) : null
  );
}

/**
 * The dice table (`#/dice`). Form controls hold their own typing; everything else is rendered from what the
 * controller passes in. Handlers: `onRoll`, `onCheck`, `onPreset`, `onAgain`, `onClear`, `onScope`.
 */
export function mountDicePage(root, handlers) {
  const picker = h("select", { id: "dice-character", class: "input", onchange: () => handlers.onScope(picker.value || null) });
  const expression = h("input", {
    id: "dice-expression",
    class: "input input-mono",
    type: "text",
    autocomplete: "off",
    spellcheck: false,
    placeholder: "1d20 + @str.mod",
    "aria-describedby": "dice-expression-message",
    oninput: () => check()
  });
  const message = h("p", { id: "dice-expression-message", class: "field-hint", text: "Type a roll, or use a button below." });
  const result = h("div", { id: "dice-result", class: "roll-slot", role: "status", "aria-live": "polite" });
  const presets = h("div", { class: "stack" });
  const logList = h("ol", { class: "roll-log", id: "dice-log" });
  const search = h("input", { id: "dice-search", class: "input", type: "search", autocomplete: "off", oninput: () => handlers.onScope(undefined) });
  const everyone = h("input", { id: "dice-everyone", type: "checkbox", onchange: () => handlers.onScope(undefined) });
  const clear = button({ label: "Clear log", variant: "btn-danger-text", onclick: () => handlers.onClear(), id: "dice-clear" });

  const modeInputs = ["normal", "adv", "dis"].map((value) =>
    h("input", { type: "radio", name: "dice-mode", id: `dice-mode-${value}`, value, checked: value === "normal" })
  );
  const modeLabels = { normal: "Normal", adv: "Advantage", dis: "Disadvantage" };

  const secret = h("input", { id: "dice-secret", type: "checkbox" });

  function mode() {
    const picked = modeInputs.find((input) => input.checked)?.value;
    return { adv: picked === "adv", dis: picked === "dis", secret: secret.checked };
  }

  function check() {
    const text = expression.value.trim();

    if (!text) {
      message.textContent = "Type a roll, or use a button below.";
      message.classList.remove("field-error");
      return true;
    }

    const verdict = handlers.onCheck(text);
    message.textContent = verdict.ok ? "Looks good." : verdict.reason;
    message.classList.toggle("field-error", !verdict.ok);
    return verdict.ok;
  }

  function submit() {
    if (!expression.value.trim()) {
      message.textContent = "Type a roll first, such as 1d20 + 5.";
      message.classList.add("field-error");
      expression.focus();
      return;
    }

    handlers.onRoll({ expression: expression.value.trim(), ...mode() });
  }

  expression.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  });

  replace(
    root,
    pageHeader({ title: "Dice", subtitle: "Roll with a character's own values, and keep every roll.", titleId: "dice-title" }),
    h(
      "div",
      { class: "stack" },
      section(
        { id: "dice-roller", title: "Roller" },
        h(
          "div",
          { class: "field-grid" },
          field({ id: "dice-character", label: "Roll as", hint: "A character lets @references read their sheet." }, picker),
          field({ id: "dice-expression", label: "Expression", hint: undefined, wide: true }, expression)
        ),
        message,
        h(
          "div",
          { class: "toolbar", role: "group", "aria-label": "Quick dice" },
          QUICK.map((sides) =>
            button({
              label: `d${sides}`,
              ariaLabel: `Add a d${sides}`,
              onclick: () => {
                const text = `1d${sides}`;
                expression.value = expression.value.trim() ? `${expression.value.trim()} + ${text}` : text;
                check();
                expression.focus();
              }
            })
          )
        ),
        h(
          "fieldset",
          { class: "fieldset" },
          h("legend", { text: "Roll mode (a d20)" }),
          modeInputs.map((input) => h("label", { class: "radio-row", for: input.id }, input, h("span", { text: modeLabels[input.value] })))
        ),
        h("label", { class: "check-label", for: "dice-secret" }, secret, h("span", { text: "Secret roll (kept out of campaign views and recaps)" })),
        h("div", { class: "toolbar" }, button({ id: "dice-roll", label: "Roll", variant: "btn-primary", onclick: submit })),
        result
      ),
      section({ id: "dice-presets", title: "Saved rolls" }, presets),
      section(
        { id: "dice-history", title: "Roll log" },
        h(
          "div",
          { class: "toolbar" },
          field({ id: "dice-search", label: "Search" }, search),
          h("label", { class: "check-row", for: "dice-everyone" }, everyone, h("span", { text: "Show every character's rolls" })),
          clear
        ),
        logList
      )
    )
  );

  return {
    mode,
    expression: () => expression.value,
    setExpression(text) {
      expression.value = text;
      check();
    },
    filter: () => ({ search: search.value, everyone: everyone.checked }),

    renderCharacters(characters, selected) {
      replace(
        picker,
        h("option", { value: "", text: "No character (numbers only)" }),
        characters.map((character) => h("option", { value: character.id, text: character.label, selected: character.id === selected }))
      );
      picker.value = selected ?? "";
    },

    renderResults(rolls) {
      replace(result, ...rolls.map(({ roll, text }) => resultCard(roll, text)));
    },

    renderError(reason) {
      replace(result, h("p", { class: "field-error", text: reason }));
    },

    renderPresets(groups) {
      if (!groups.length) {
        replace(presets, emptyState({ title: "No saved rolls", message: "Pick a character whose system has rolls, or save your own on their Rolls page." }));
        return;
      }

      replace(
        presets,
        groups.map((group) =>
          h(
            "div",
            { class: "preset-group" },
            h("h3", { class: "preset-title", text: group.title }),
            h("div", { class: "toolbar" }, group.items.map((item) => button({ label: item.label, title: item.expression, onclick: () => handlers.onPreset(item.id) })))
          )
        )
      );
    },

    renderLog(rolls, { scoped }) {
      clear.disabled = rolls.length === 0;
      replace(
        logList,
        rolls.length
          ? rolls.map(({ roll, text, who }) =>
              h(
                "li",
                { class: "roll-entry", "data-roll": roll.id },
                h("div", { class: "roll-entry-head" }, h("strong", { text: roll.label }), h("span", { class: "roll-entry-total", text: String(roll.total) })),
                h("p", { class: "roll-explain", text }),
                h(
                  "p",
                  { class: "field-hint" },
                  `${when(roll.at)}${who ? ` · ${who}` : ""}${roll.secret ? " · Secret" : ""}`
                ),
                button({ label: "Roll again", ariaLabel: `Roll again: ${roll.label}`, variant: "btn-small", onclick: () => handlers.onAgain(roll.id) })
              )
            )
          : h("li", { class: "roll-empty", text: scoped ? "No rolls for this character yet." : "No rolls yet." })
      );
    }
  };
}
