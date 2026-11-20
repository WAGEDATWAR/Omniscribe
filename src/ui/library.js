import { SORT_MODES } from "../projects.js";
import { plural } from "../utils.js";
import { button, emptyState, h, pageHeader, replace } from "./dom.js";

function tile(item, handlers) {
  return h(
    "article",
    { class: "tile", "data-id": item.id },
    h(
      "div",
      { class: "tile-top" },
      h("h2", { class: "tile-title" }, h("a", { class: "tile-link", href: item.href, text: item.name })),
      h("span", { class: `badge badge-${item.status}`, text: item.statusLabel })
    ),
    item.subtitle ? h("p", { class: "tile-subtitle", text: item.subtitle }) : null,
    item.excerpt ? h("p", { class: "tile-excerpt", text: item.excerpt }) : null,
    item.tags.length
      ? h("ul", { class: "chips", "aria-label": "Tags" }, item.tags.map((tag) => h("li", { class: "chip", text: tag })))
      : null,
    h(
      "div",
      { class: "tile-actions" },
      button({
        icon: "copy",
        variant: "btn-ghost btn-small",
        label: "Duplicate",
        ariaLabel: `Duplicate ${item.name}`,
        onclick: () => handlers.onDuplicate(item.id)
      }),
      button({
        icon: "trash",
        variant: "btn-ghost btn-small btn-danger-text",
        label: "Delete",
        ariaLabel: `Delete ${item.name}`,
        onclick: () => handlers.onDelete(item.id)
      })
    )
  );
}

/** Mounts the Library skeleton once; `render` fills it from the store projection and holds no state. */
export function mountLibrary(root, handlers) {
  const search = h("input", {
    id: "library-search",
    class: "input",
    type: "search",
    placeholder: "Search name, player, system, tags",
    "aria-label": "Search characters",
    autocomplete: "off",
    oninput: (event) => handlers.onSearch(event.target.value)
  });

  const sort = h(
    "select",
    {
      id: "library-sort",
      class: "input",
      "aria-label": "Sort characters",
      onchange: (event) => handlers.onSort(event.target.value)
    },
    SORT_MODES.map((mode) => h("option", { value: mode.id, text: mode.label }))
  );

  const count = h("p", { class: "result-count", id: "library-count", role: "status" });
  const grid = h("div", { class: "tile-grid", id: "library-grid" });
  const empty = h("div", { id: "library-empty" });
  const toolbar = h("div", { class: "toolbar" }, search, sort);

  replace(
    root,
    pageHeader({
      title: "Library",
      subtitle: "Every character you keep, in one place.",
      titleId: "library-title",
      actions: [
        button({
          id: "new-character-btn",
          icon: "plus",
          label: "New character",
          variant: "btn-primary",
          onclick: handlers.onNew
        })
      ]
    }),
    toolbar,
    count,
    grid,
    empty
  );

  return {
    toolbar,
    render({ library, search: query, sort: mode }) {
      if (document.activeElement !== search) {
        search.value = query;
      }

      sort.value = mode;

      const hasItems = library.items.length > 0;
      toolbar.hidden = library.total === 0;
      count.textContent = library.total
        ? `${plural(library.items.length, "character")}${library.items.length === library.total ? "" : ` of ${library.total}`}`
        : "";

      replace(grid, library.items.map((item) => tile(item, handlers)));
      grid.hidden = !hasItems;

      if (library.total === 0) {
        replace(
          empty,
          emptyState(
            {
              title: "No characters yet",
              message: "Create your first character, or add a sample one to look around."
            },
            button({ icon: "plus", label: "New character", variant: "btn-primary", onclick: handlers.onNew }),
            button({ label: "Add a sample character", onclick: handlers.onSample, id: "sample-btn" })
          )
        );
      } else if (!hasItems) {
        replace(
          empty,
          emptyState(
            { title: "No matches", message: "No character matches your search." },
            button({ label: "Clear search", onclick: () => handlers.onSearch("") })
          )
        );
      } else {
        replace(empty);
      }
    }
  };
}
