import { DICE_MODIFIERS, EXAMPLES, FIELD_TYPES, FUNCTION_DOCS, REFERENCES, SYSTEM_PARTS } from "../sheet/reference.js";
import { h, pageHeader, replace, section } from "./dom.js";

/**
 * The Reference page: the game system format and the formula language, drawn from `src/sheet/reference.js`. Nothing
 * here is stored; the function filter narrows the table as you type.
 */
function table(caption, headings, rows) {
  return h(
    "div",
    { class: "table-wrap" },
    h(
      "table",
      { class: "ref-table" },
      h("caption", { class: "visually-hidden", text: caption }),
      h("thead", {}, h("tr", {}, headings.map((heading) => h("th", { scope: "col", text: heading })))),
      h("tbody", {}, rows.map((row) => h("tr", {}, row.map((cell, index) => (index === 0 ? h("th", { scope: "row" }, h("code", { text: cell })) : h("td", { text: cell }))))))
    )
  );
}

export function mountReferencePage(root) {
  const filter = h("input", { id: "reference-filter", class: "input", type: "search", "aria-label": "Filter the functions", placeholder: "Filter the functions", autocomplete: "off" });
  const functionsBody = h("tbody");
  const functionsEmpty = h("p", { class: "muted", id: "reference-empty", hidden: true, text: "No function matches." });

  function drawFunctions() {
    const query = filter.value.trim().toLowerCase();
    const shown = FUNCTION_DOCS.filter((entry) => !query || `${entry.name} ${entry.summary}`.toLowerCase().includes(query));

    replace(
      functionsBody,
      shown.map((entry) => h("tr", {}, h("th", { scope: "row" }, h("code", { text: entry.signature })), h("td", { text: entry.summary }), h("td", {}, h("code", { text: entry.example }))))
    );
    functionsEmpty.hidden = shown.length > 0;
  }

  filter.addEventListener("input", drawFunctions);
  drawFunctions();

  const links = [
    ["reference-format", "A system file"],
    ["reference-fields", "Field types"],
    ["reference-formulas", "Formulas"],
    ["reference-functions", "Functions"],
    ["reference-dice", "Dice"],
    ["reference-examples", "Examples"]
  ];

  replace(
    root,
    pageHeader({ title: "Reference", subtitle: "The game system format and the formula language. Omniscribe works offline and keeps your sheets on this device.", titleId: "reference-title" }),
    h("nav", { class: "subnav", "aria-label": "On this page" }, links.map(([id, label]) => h("a", { class: "subnav-link", href: `#/reference`, onclick: (event) => { event.preventDefault(); document.getElementById(id)?.scrollIntoView({ block: "start" }); document.getElementById(id)?.focus(); }, text: label }))),
    h(
      "div",
      { class: "stack" },
      section(
        { id: "reference-format", title: "A system file", description: 'A game system is one JSON file: { "format": "omniscribe-system", "formatVersion": 1, "id", "version", "name", "base", "overlay", ... } plus these parts. Import and export it on the Game systems page; the editor there checks every formula as you type.' },
        table("Parts of a system file", ["Part", "Shape", "What it is"], SYSTEM_PARTS.map((part) => [part.key, part.shape, part.meaning]))
      ),
      section({ id: "reference-fields", title: "Field types", description: "Fields hold single values. Collections reuse the same types for their rows, plus uses and roll." }, table("Field types", ["Type", "Properties", "What it is"], FIELD_TYPES.map((entry) => [entry.type, entry.props, entry.meaning]))),
      section(
        { id: "reference-formulas", title: "Formulas", description: "A formula is evaluated against one character's sheet. It never changes anything, and a mistake in one formula only affects the values that read it." },
        table("What a formula can name", ["Write", "Meaning"], REFERENCES.map((entry) => [entry.code, entry.meaning]))
      ),
      section(
        { id: "reference-functions", title: "Functions", description: "Every function there is. Row tests inside sum, count, min, max, avg and join use $.field or .field for the current row." },
        h("div", { class: "toolbar" }, filter),
        h("div", { class: "table-wrap" }, h("table", { class: "ref-table" }, h("caption", { class: "visually-hidden", text: "Functions" }), h("thead", {}, h("tr", {}, ["Function", "What it does", "Example"].map((heading) => h("th", { scope: "col", text: heading })))), functionsBody)),
        functionsEmpty
      ),
      section(
        { id: "reference-dice", title: "Dice", description: "A roll is a formula that may also throw dice. A dice term has no spaces inside it. Dice work only in rolls, never in sheet values." },
        table("Dice terms", ["Write", "Meaning"], DICE_MODIFIERS.map((entry) => [entry.code, entry.meaning]))
      ),
      section(
        { id: "reference-examples", title: "Worked examples", description: "Each one is checked by the app's own parser." },
        h("div", { class: "stack" }, EXAMPLES.map((entry) => h("div", { class: "ref-example" }, h("h3", { class: "subsection-title", text: entry.title }), h("p", { class: "field-hint", text: entry.why }), h("pre", { class: "ref-code" }, h("code", { text: entry.code })))))
      )
    )
  );
}
