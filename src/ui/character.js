import { CHARACTER_STATUSES, STATUS_LABELS, displayName } from "../schema.js";
import { LIMITS } from "../limits.js";
import { button, field, h, pageHeader, replace, section } from "./dom.js";
import { createTagInput } from "./tagInput.js";

/**
 * Mounts the character page for one character. Inputs are written to the store through `onChange` as
 * you type (autosave, no Save step). `render` mirrors the store back into the form, skipping a field
 * that has focus so typing is never interrupted.
 */
export function mountCharacterPage(root, handlers) {
  const name = h("input", {
    id: "character-name",
    class: "input",
    type: "text",
    maxLength: LIMITS.nameLength,
    autocomplete: "off",
    oninput: (event) => handlers.onChange({ name: event.target.value }, "name")
  });

  const player = h("input", {
    id: "character-player",
    class: "input",
    type: "text",
    maxLength: LIMITS.playerLength,
    autocomplete: "off",
    oninput: (event) => handlers.onChange({ player: event.target.value }, "player")
  });

  const system = h("input", {
    id: "character-system",
    class: "input",
    type: "text",
    maxLength: LIMITS.systemLength,
    autocomplete: "off",
    oninput: (event) => handlers.onChange({ systemId: event.target.value }, "system")
  });

  const status = h(
    "select",
    {
      id: "character-status",
      class: "input",
      onchange: (event) => handlers.onChange({ status: event.target.value }, null)
    },
    CHARACTER_STATUSES.map((value) => h("option", { value, text: STATUS_LABELS[value] }))
  );

  const summary = h("textarea", {
    id: "character-summary",
    class: "input",
    rows: 3,
    maxLength: LIMITS.summaryLength,
    oninput: (event) => handlers.onChange({ summary: event.target.value }, "summary")
  });

  const notes = h("textarea", {
    id: "character-notes",
    class: "input input-tall",
    rows: 10,
    maxLength: LIMITS.notesLength,
    oninput: (event) => handlers.onChange({ notes: event.target.value }, "notes")
  });

  const tags = createTagInput({
    id: "character-tags",
    label: "Tags",
    onChange: (next) => handlers.onChange({ tags: next }, null)
  });

  const header = h("div", { id: "character-header" });
  const content = h(
    "div",
    { class: "stack" },
    section(
      { id: "character-identity", title: "Identity", description: "Who this character is. Everything saves as you type." },
      h(
        "div",
        { class: "field-grid" },
        field({ id: "character-name", label: "Name" }, name),
        field({ id: "character-player", label: "Player" }, player),
        field({ id: "character-system", label: "Game system", hint: "A free label for now; game systems become real sheets in a later phase." }, system),
        field({ id: "character-status", label: "Status" }, status),
        field({ id: "character-summary", label: "Summary", wide: true }, summary),
        field({ id: "character-tags", label: "Tags", hint: "Press Enter or comma to add a tag.", wide: true }, tags.element)
      )
    ),
    section(
      { id: "character-notes-section", title: "Notes", description: "Anything worth keeping that has no field yet." },
      field({ id: "character-notes", label: "Notes", wide: true }, notes)
    )
  );

  replace(root, header, content);

  let shownId = null;

  function setValue(element, value, force) {
    if ((force || document.activeElement !== element) && element.value !== value) {
      element.value = value;
    }
  }

  return {
    render(character, { force: forced = false } = {}) {
      const force = forced || character.id !== shownId;
      shownId = character.id;

      if (!header.firstChild) {
        replace(
          header,
          pageHeader({
            title: "Character",
            subtitle: "Character",
            titleId: "character-title",
            back: { href: "#/library", label: "Library" },
            actions: [
              button({ id: "character-duplicate", icon: "copy", label: "Duplicate", onclick: handlers.onDuplicate }),
              button({
                id: "character-delete",
                icon: "trash",
                label: "Delete",
                variant: "btn-danger-text",
                onclick: handlers.onDelete
              })
            ]
          })
        );
      }

      header.querySelector(".page-title").textContent = displayName(character);
      header.querySelector(".page-subtitle").textContent =
        [character.player, character.systemId].filter((part) => part.trim()).join(" · ") || "Character";

      setValue(name, character.name, force);
      setValue(player, character.player, force);
      setValue(system, character.systemId, force);
      setValue(status, character.status, true);
      setValue(summary, character.summary, force);
      setValue(notes, character.notes, force);

      if (force || document.activeElement !== tags.input) {
        tags.set(character.tags);
      }

      return force;
    },
    focusName: () => name.focus()
  };
}
