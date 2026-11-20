import { h, replace } from "./dom.js";

/**
 * Tags as chips. Enter or a comma adds, a paste splits on commas, Backspace on an empty input removes
 * the last chip. `set` mirrors the store value into the view; `onChange` receives the next list.
 */
export function createTagInput({ id, label, onChange }) {
  let tags = [];

  const list = h("ul", { class: "chips chips-editable", "aria-label": `${label} list` });
  const input = h("input", {
    id,
    class: "chip-input",
    type: "text",
    autocomplete: "off",
    placeholder: "Add a tag",
    "aria-describedby": `${id}-hint`
  });
  const box = h("div", { class: "chip-box", onclick: () => input.focus() }, list, input);

  function commit(next) {
    tags = next;
    draw();
    onChange(next);
  }

  function addFrom(text) {
    const additions = text.split(",").map((part) => part.trim()).filter(Boolean);

    if (!additions.length) {
      return false;
    }

    commit([...tags, ...additions]);
    return true;
  }

  function draw() {
    replace(
      list,
      tags.map((tag, index) => h(
        "li",
        { class: "chip" },
        h("span", { text: tag }),
        h("button", {
          type: "button",
          class: "chip-remove",
          "aria-label": `Remove tag ${tag}`,
          text: "×",
          onclick: (event) => {
            event.stopPropagation();
            commit(tags.filter((_, position) => position !== index));
            input.focus();
          }
        })
      ))
    );
  }

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addFrom(input.value);
      input.value = "";
    } else if (event.key === "Backspace" && !input.value && tags.length) {
      commit(tags.slice(0, -1));
    }
  });

  input.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text") ?? "";

    if (text.includes(",")) {
      event.preventDefault();
      addFrom(text);
    }
  });

  input.addEventListener("blur", () => {
    if (addFrom(input.value)) {
      input.value = "";
    }
  });

  return {
    element: box,
    input,
    set(next) {
      tags = [...next];
      draw();
    }
  };
}
