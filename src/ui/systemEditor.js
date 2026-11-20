import { button, h, pageHeader, replace, section } from "./dom.js";
import { mountVisualEditor } from "./visualEditor.js";

/**
 * The system editor: the whole system file as JSON with live validation, because a file editor can
 * express everything the format can (DEF-078 tracks a visual editor). Errors are shown by path.
 */
export function mountSystemEditor(root, handlers) {
  const text = h("textarea", {
    id: "system-json",
    class: "input input-mono system-json",
    rows: 26,
    spellcheck: false,
    autocapitalize: "off",
    "aria-describedby": "system-report",
    oninput: (event) => handlers.onInput(event.target.value)
  });
  const save = button({ id: "system-save", label: "Save as a new version", variant: "btn-primary", disabled: true, onclick: () => handlers.onSave() });
  const revert = button({ id: "system-revert", label: "Revert", disabled: true, onclick: () => handlers.onRevert() });
  const report = h("div", { id: "system-report", class: "system-report", role: "region", "aria-label": "Validation", "aria-live": "polite" });
  const head = h("div");
  const note = h("p", { class: "field-hint", id: "system-note" });
  const visualRoot = h("div", { id: "visual-editor" });
  const jsonWrap = h("div", { id: "json-editor", hidden: true }, h("label", { class: "field-label", for: "system-json", text: "System file (JSON)" }), text);
  const visualButton = button({ id: "mode-visual", label: "Visual", onclick: () => handlers.onMode("visual") });
  const jsonButton = button({ id: "mode-json", label: "JSON", onclick: () => handlers.onMode("json") });
  const visual = mountVisualEditor(visualRoot, handlers.visual);
  let loaded = null;

  replace(
    root,
    head,
    h(
      "div",
      { class: "stack" },
      section(
        { id: "system-file", title: "System file", description: "Edit the JSON and it is checked as you type. Saving never changes a version that characters already use; it adds a new one." },
        h("div", { class: "mode-bar", role: "group", "aria-label": "Editor view" }, visualButton, jsonButton),
        visualRoot,
        jsonWrap,
        note,
        h("div", { class: "section-actions" }, save, revert)
      ),
      report
    )
  );

  return {
    render({ file, readOnly, nextVersion, users }) {
      const key = `${file.id}@${file.version}`;

      if (loaded !== key) {
        loaded = key;
        text.value = JSON.stringify(file, null, 2);
      }

      text.readOnly = readOnly;
      note.textContent = readOnly
        ? "This system is built in and read-only. Use Derive to make your own version of it."
        : `${users} character${users === 1 ? "" : "s"} follow this version. Saving creates version ${nextVersion}.`;

      replace(
        head,
        pageHeader({
          title: file.name,
          subtitle: `${file.id} · version ${file.version}${file.base ? ` · derived from ${file.base.id} v${file.base.version}` : ""}`,
          titleId: "system-title",
          back: { href: "#/systems", label: "Game systems" },
          actions: [
            button({ id: "system-derive", label: "Derive", icon: "copy", onclick: () => handlers.onDerive() }),
            button({ id: "system-export", label: "Export", onclick: () => handlers.onExport() })
          ]
        })
      );
    },
    visual,
    setMode(mode) {
      visualRoot.hidden = mode !== "visual";
      jsonWrap.hidden = mode !== "json";
      visualButton.setAttribute("aria-pressed", String(mode === "visual"));
      jsonButton.setAttribute("aria-pressed", String(mode === "json"));
    },
    reload(file) {
      loaded = null;
      this.render({ file, readOnly: false, nextVersion: file.version + 1, users: 0 });
    },
    setText(value) {
      text.value = value;
    },
    getText: () => text.value,
    setSaveState({ canSave, dirty, nextVersion }) {
      save.disabled = !canSave;
      save.querySelector("span").textContent = `Save as version ${nextVersion}`;
      revert.disabled = !dirty;
    },
    showReport({ status, errors, warnings, summary }) {
      replace(
        report,
        h("p", { class: `system-status ${status}`, id: "system-status", text: status === "valid" ? "Valid" : `${errors.length} problem${errors.length === 1 ? "" : "s"}` }),
        summary ? h("p", { class: "muted", id: "system-summary", text: summary }) : null,
        errors.length ? h("ul", { class: "problem-list", id: "system-errors" }, errors.slice(0, 40).map((entry) => h("li", {}, h("code", { text: entry.path || "file" }), ` ${entry.message}`))) : null,
        warnings.length ? h("ul", { class: "problem-list", id: "system-warnings" }, warnings.slice(0, 20).map((entry) => h("li", {}, h("code", { text: entry.path }), ` ${entry.message}`))) : null
      );
    }
  };
}
