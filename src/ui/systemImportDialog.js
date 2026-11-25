import { button, h } from "./dom.js";

/**
 * The review shown before a game system file is imported: every problem with its place in the file, every warning,
 * a plain summary, and an outline of the sheet it would make. Nothing is saved until the person confirms.
 * Resolves true on Import, false on Cancel.
 */
function problemList(id, title, entries, tone) {
  return h(
    "div",
    { class: "stack", id },
    h("h3", { class: "subsection-title", text: `${title} (${entries.length})` }),
    h("ul", { class: "problem-list" }, entries.map((entry) => h("li", { class: tone }, entry.path ? h("code", { text: entry.path }) : null, entry.path ? ` ${entry.message}` : entry.message)))
  );
}

export function openSystemImportDialog(report) {
  return new Promise((resolve) => {
    let done = false;
    const dialog = h(
      "dialog",
      { class: "dialog dialog-wide", "aria-labelledby": "system-import-title", "aria-describedby": "system-import-summary" },
      h("h2", { id: "system-import-title", class: "dialog-title", text: report.ok ? `Import ${report.name}, version ${report.version}?` : `${report.fileName} cannot be imported` }),
      h("p", { id: "system-import-summary", class: report.ok ? "muted" : "field-error", text: report.summary }),
      report.errors.length ? problemList("system-import-errors", "Problems to fix", report.errors, "is-error") : null,
      report.evalErrors.length ? problemList("system-import-eval", "Values that fail on a new sheet", report.evalErrors, "is-error") : null,
      report.warnings.length ? problemList("system-import-warnings", "Notes", report.warnings, "is-warning") : null,
      report.outline.length
        ? h(
            "details",
            { id: "system-import-outline", class: "layout-add" },
            h("summary", { text: `The sheet it would make (${report.outline.length} sections)` }),
            h("ul", { class: "plain-list" }, report.outline.map((entry) => h("li", {}, h("strong", { text: entry.title }), ` ${entry.where}: ${entry.items.join(", ") || "nothing yet"}`)))
          )
        : null
    );

    function finish(value) {
      if (done) {
        return;
      }

      done = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    }

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });
    dialog.append(
      h(
        "div",
        { class: "dialog-actions" },
        button({ id: "system-import-cancel", label: report.ok ? "Cancel" : "Close", onclick: () => finish(false) }),
        report.ok ? button({ id: "system-import-confirm", label: "Import", variant: "btn-primary", onclick: () => finish(true) }) : null
      )
    );
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector(report.ok ? "#system-import-confirm" : "#system-import-cancel")?.focus();
  });
}
