import { plural } from "../utils.js";
import { button, emptyState, h, icon, pageHeader, replace } from "./dom.js";

/** The Game systems page: every system with its versions, who uses it, and the actions on it. */
export function mountSystemsPage(root, handlers) {
  const input = h("input", {
    id: "system-import-input",
    type: "file",
    accept: ".json,application/json",
    hidden: true,
    onchange: (event) => {
      const [file] = event.target.files;
      event.target.value = "";

      if (file) {
        handlers.onImport(file);
      }
    }
  });
  const list = h("div", { class: "stack", id: "systems-list" });

  replace(
    root,
    pageHeader({
      title: "Game systems",
      subtitle: "Built-in systems are read-only. Derive your own from any of them, or start empty.",
      titleId: "systems-title",
      actions: [
        button({ id: "new-system-btn", icon: "plus", label: "New system", variant: "btn-primary", onclick: () => handlers.onNew(null) }),
        button({ id: "import-system-btn", label: "Import system file", onclick: () => input.click() }),
        input
      ]
    }),
    list
  );

  return {
    render({ systems, usage }) {
      if (!systems.length) {
        replace(list, emptyState({ title: "No game systems", message: "No system is available on this device." }));
        return;
      }

      replace(
        list,
        systems.map((entry) => {
          const users = usage.get(entry.id) ?? 0;

          return h(
            "article",
            { class: "system-item", "data-id": entry.id },
            h(
              "div",
              { class: "tile-top" },
              h("h2", { class: "tile-title" }, h("a", { class: "tile-link", href: `#/systems/${entry.id}`, text: entry.name })),
              h("span", { class: "badge", text: entry.builtin ? "Built in" : "Yours" })
            ),
            h("p", { class: "tile-subtitle", text: [`Version ${entry.version}`, entry.versions.length > 1 ? `${entry.versions.length} versions` : null, entry.base ? `derived from ${entry.base.id} v${entry.base.version}` : null, plural(users, "character") + " using it", entry.ok ? null : "has errors"].filter(Boolean).join(" · ") }),
            entry.description ? h("p", { class: "tile-excerpt", text: entry.description }) : null,
            h(
              "div",
              { class: "tile-actions" },
              h("a", { class: "btn btn-ghost btn-small", href: `#/systems/${entry.id}`, "aria-label": `${entry.builtin ? "View" : "Edit"} ${entry.name}`, text: entry.builtin ? "View" : "Edit" }),
              button({ label: "Derive", icon: "copy", variant: "btn-ghost btn-small", ariaLabel: `Derive from ${entry.name}`, onclick: () => handlers.onNew(entry) }),
              button({ label: "Export", variant: "btn-ghost btn-small", ariaLabel: `Export ${entry.name}`, onclick: () => handlers.onExport(entry) }),
              entry.builtin ? null : button({ label: "Delete", icon: "trash", variant: "btn-ghost btn-small btn-danger-text", ariaLabel: `Delete ${entry.name} version ${entry.version}`, onclick: () => handlers.onDelete(entry) })
            )
          );
        })
      );
    }
  };
}
