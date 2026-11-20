import { filterCommands } from "../commands.js";
import { h, replace } from "./dom.js";

/**
 * The palette is a native dialog with a combobox and a listbox. `getCommands` is called each time it
 * opens so it always reflects the current library.
 */
export function createPalette({ dialog, input, list, empty, getCommands }) {
  let commands = [];
  let filtered = [];
  let active = 0;

  function optionId(index) {
    return `palette-option-${index}`;
  }

  function draw() {
    empty.hidden = filtered.length > 0;
    input.setAttribute("aria-expanded", String(filtered.length > 0));
    input.setAttribute("aria-activedescendant", filtered.length ? optionId(active) : "");

    replace(
      list,
      filtered.map((command, index) => h(
        "li",
        {
          id: optionId(index),
          role: "option",
          class: `palette-option${index === active ? " is-active" : ""}`,
          "aria-selected": String(index === active),
          onmousemove: () => {
            if (active !== index) {
              active = index;
              draw();
            }
          },
          onclick: () => run(command)
        },
        h("span", { class: "palette-title", text: command.title }),
        command.hint ? h("span", { class: "palette-hint", text: command.hint }) : null
      ))
    );

    list.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
  }

  function refresh() {
    filtered = filterCommands(commands, input.value);
    active = 0;
    draw();
  }

  function run(command) {
    dialog.close();
    command.run();
  }

  input.addEventListener("input", refresh);

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      if (filtered.length) {
        active = (active + (event.key === "ArrowDown" ? 1 : filtered.length - 1)) % filtered.length;
        draw();
      }
    } else if (event.key === "Enter") {
      event.preventDefault();

      if (filtered[active]) {
        run(filtered[active]);
      }
    }
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });

  return {
    open() {
      commands = getCommands();
      input.value = "";
      refresh();
      dialog.showModal();
      input.focus();
    },
    isOpen: () => dialog.open
  };
}
