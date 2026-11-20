import { button, emptyState, h, replace, section } from "./dom.js";

/**
 * The party page: a table with one row per roster character and one column per chosen sheet value (K-4), and a
 * container for the column list editor. Handlers: `onSuggest`, `onRoll(characterId)`.
 */
export function mountPartyPage(root, handlers) {
  const table = h("div", { class: "table-scroll", id: "party-table" });
  const hint = h("div", { id: "party-hint" });
  const columns = h("div", { id: "campaign-partyColumns" });
  let sort = { index: -1, direction: 1 };
  let last = null;

  function header(label, index) {
    const pressed = sort.index === index;
    const text = pressed ? `${label} ${sort.direction === 1 ? "(ascending)" : "(descending)"}` : label;

    return h(
      "th",
      { scope: "col", "aria-sort": pressed ? (sort.direction === 1 ? "ascending" : "descending") : "none" },
      index < 0
        ? label
        : h("button", {
            type: "button",
            class: "btn btn-ghost btn-small",
            "aria-label": `Sort by ${label}`,
            text: pressed ? `${label} ${sort.direction === 1 ? "▲" : "▼"}` : label,
            title: text,
            onclick: () => {
              sort = sort.index === index ? { index, direction: -sort.direction } : { index, direction: 1 };
              render(last);
            }
          })
    );
  }

  function render(data) {
    last = data;
    const { rows, columns: defs, suggestion } = data;

    if (!rows.length) {
      replace(table, emptyState({ title: "Nobody on the roster", message: "Add characters on the Roster page to see them here." }));
    } else if (!defs.length) {
      replace(
        table,
        emptyState(
          { title: "Choose what to show", message: "Pick sheet values for the columns below, such as @hp.current." },
          suggestion ? button({ id: "party-suggest", label: `Use ${suggestion.name} suggestions`, variant: "btn-primary", onclick: () => handlers.onSuggest(suggestion.columns) }) : null
        )
      );
    } else {
      const ordered = data.order(rows, sort);

      replace(
        table,
        h(
          "table",
          { class: "sheet-table", "aria-label": "Party" },
          h(
            "thead",
            {},
            h("tr", {}, header("Character", -1), header("Role", -1), defs.map((column, index) => header(column.label, index)), header("Conditions", -1), header("Roll", -1))
          ),
          h(
            "tbody",
            {},
            ordered.map((row) =>
              h(
                "tr",
                { "data-member": row.member.id },
                h(
                  "th",
                  { scope: "row" },
                  row.character ? h("a", { href: row.href, text: row.character.name.trim() || "Unnamed character" }) : h("span", { text: "(not in this library)" }),
                  row.familiars?.length ? h("span", { class: "field-hint party-with", text: ` With ${row.familiars.join(", ")}` }) : null
                ),
                h("td", { text: [row.member.role, row.member.status].filter(Boolean).join(" · ") }),
                defs.map((_, index) => h("td", { class: row.cells[index]?.ok ? "" : "muted", text: row.cells[index]?.text ?? "" })),
                h("td", { text: row.conditions?.length ? row.conditions.join(", ") : "" }),
                h("td", {}, row.character ? button({ label: "Roll as", ariaLabel: `Roll as ${row.character.name.trim() || "Unnamed character"}`, variant: "btn-small", onclick: () => handlers.onRoll(row.character.id) }) : null)
              )
            )
          )
        )
      );
    }

    replace(hint, data.notes?.length ? h("ul", { class: "plain-list" }, data.notes.map((note) => h("li", { text: note }))) : null);
  }

  replace(
    root,
    h(
      "div",
      { class: "stack" },
      section({ id: "party-section", title: "Party", description: "Read from each character's sheet when you look; nothing is copied. Secret entries never appear here." }, table, hint),
      columns
    )
  );

  return { render };
}
