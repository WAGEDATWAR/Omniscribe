import { button, emptyState, field, h, replace, section } from "./dom.js";

/**
 * The initiative tracker page (K-5, K-6). It renders the ordered combatants it is given and holds no state of its
 * own beyond what you are typing. Handlers: `onAddRoster`, `onAddOther(fields)`, `onValue(id, text)`,
 * `onNote(id, text)`, `onHp(id, text)`, `onTie(id, delta)`, `onDone(id)`, `onRemove(id)`, `onNext`, `onPrev`, `onEnd`.
 */
export function mountInitiativePage(root, handlers) {
  const status = h("p", { class: "initiative-status", id: "initiative-status", role: "status", "aria-live": "polite" });
  const list = h("div", { class: "stack", id: "initiative-list" });
  const message = h("p", { class: "field-error", id: "initiative-error", hidden: true, role: "alert" });
  const name = h("input", { id: "initiative-name", class: "input", type: "text", maxLength: 200, autocomplete: "off" });
  const value = h("input", { id: "initiative-value", class: "input", type: "text", inputMode: "numeric", autocomplete: "off", placeholder: "or leave empty to roll" });
  const addForm = h(
    "form",
    {
      id: "initiative-form",
      class: "panel",
      novalidate: true,
      onsubmit: async (event) => {
        event.preventDefault();
        const verdict = await handlers.onAddOther({ name: name.value, value: value.value });

        if (verdict.ok) {
          name.value = "";
          value.value = "";
          message.hidden = true;
          name.focus();
        } else {
          message.textContent = verdict.reason;
          message.hidden = false;
        }
      }
    },
    h("h2", { class: "panel-title", text: "Add a combatant" }),
    h("div", { class: "field-grid" }, field({ id: "initiative-name", label: "Name" }, name), field({ id: "initiative-value", label: "Initiative", hint: "A number, or empty to roll the campaign's initiative." }, value)),
    message,
    h("div", { class: "section-actions" }, button({ id: "initiative-add", label: "Add combatant", variant: "btn-primary", type: "submit" }))
  );
  const controls = h(
    "div",
    { class: "toolbar" },
    button({ id: "initiative-prev", label: "Previous turn", onclick: () => handlers.onPrev() }),
    button({ id: "initiative-next", label: "Next turn", variant: "btn-primary", onclick: () => handlers.onNext() }),
    button({ id: "initiative-roster", label: "Add the roster", onclick: () => handlers.onAddRoster() }),
    button({ id: "initiative-end", label: "End encounter", variant: "btn-danger-text", onclick: () => handlers.onEnd() })
  );

  replace(root, h("div", { class: "stack" }, section({ id: "initiative-section", title: "Initiative", description: "Highest goes first. Roll the whole roster, add monsters by name, then step through the turns." }, status, controls, list), addForm));

  function row(entry, state) {
    const current = state.currentId === entry.id;
    const label = entry.name.trim() || "Unnamed combatant";
    const valueInput = h("input", { class: "input initiative-input", type: "text", inputMode: "numeric", value: String(entry.value), "aria-label": `Initiative of ${label}`, autocomplete: "off" });
    valueInput.addEventListener("change", () => handlers.onValue(entry.id, valueInput.value));
    const hp = h("input", { class: "input initiative-input", type: "text", maxLength: 20, value: entry.hp, "aria-label": `Hit points of ${label}`, autocomplete: "off" });
    hp.addEventListener("change", () => handlers.onHp(entry.id, hp.value));
    const note = h("input", { class: "input", type: "text", maxLength: 300, value: entry.note, "aria-label": `Note for ${label}`, autocomplete: "off" });
    note.addEventListener("change", () => handlers.onNote(entry.id, note.value));

    return h(
      "article",
      { class: `record-row${current ? " is-current" : ""}`, "data-entry": entry.id, "aria-label": label, "aria-current": current ? "true" : null },
      h(
        "div",
        { class: "record-main" },
        h("strong", { class: "record-title", text: label }),
        h("p", { class: "record-summary", text: [current ? "Current turn" : "", entry.done ? "Turn taken" : "", entry.characterId ? "" : "Not a character"].filter(Boolean).join(" · ") }),
        h("div", { class: "initiative-fields" }, valueInput, hp, note)
      ),
      h(
        "div",
        { class: "toolbar record-actions" },
        button({ label: entry.done ? "Reopen" : "Done", ariaLabel: `${entry.done ? "Reopen" : "Mark done"}: ${label}`, variant: "btn-small", onclick: () => handlers.onDone(entry.id) }),
        button({ label: "Up", ariaLabel: `Move ${label} up in a tie`, variant: "btn-small", onclick: () => handlers.onTie(entry.id, -1) }),
        button({ label: "Down", ariaLabel: `Move ${label} down in a tie`, variant: "btn-small", onclick: () => handlers.onTie(entry.id, 1) }),
        button({ label: "Remove", ariaLabel: `Remove ${label}`, variant: "btn-small btn-danger-text", onclick: () => handlers.onRemove(entry.id) })
      )
    );
  }

  return {
    render(state) {
      const { ordered, round } = state;
      const current = ordered.find((entry) => entry.id === state.currentId);

      status.textContent = ordered.length ? `Round ${round} · ${current ? `Current turn: ${current.name.trim() || "Unnamed combatant"}` : "No current turn"}` : "";
      replace(list, ordered.length ? ordered.map((entry) => row(entry, state)) : emptyState({ title: "No combatants yet", message: "Add the roster to roll for every character, or add a monster by name below." }));
      controls.querySelector("#initiative-next").disabled = !ordered.length;
      controls.querySelector("#initiative-prev").disabled = !ordered.length;
      controls.querySelector("#initiative-end").disabled = !ordered.length;
    }
  };
}
