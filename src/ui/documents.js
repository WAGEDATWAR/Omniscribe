import { LIMITS } from "../limits.js";
import { formatBytes } from "../utils.js";
import { button, emptyState, h, replace, section } from "./dom.js";

function formatDate(time) {
  return new Date(time).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * The PDF sheets page. Rows are updated in place so typing in a name field never loses focus; the
 * viewer host is handed to the PDF viewer and is not touched by `render`.
 */
export function mountDocumentsPage(root, handlers) {
  const input = h("input", {
    id: "pdf-input",
    type: "file",
    accept: "application/pdf,.pdf",
    multiple: true,
    hidden: true,
    onchange: (event) => {
      handlers.onFiles([...event.target.files]);
      event.target.value = "";
    }
  });

  const upload = button({
    id: "pdf-upload-btn",
    icon: "plus",
    label: "Upload PDF",
    variant: "btn-primary",
    onclick: () => input.click()
  });

  const journalBox = h("input", { id: "generated-journal", type: "checkbox", onchange: (event) => handlers.onIncludeJournal(event.target.checked) });
  const generatedMeta = h("p", { class: "muted", id: "generated-meta" });
  const generatedView = button({ id: "generated-view", label: "View", variant: "btn-small", onclick: () => handlers.onSelect("generated") });
  const generatedSection = section(
    {
      id: "pdf-generated",
      title: "Generated sheet",
      description: "A PDF built from this character's values, inventory, abilities and more. It is always available and always current; an uploaded PDF replaces it only when you use that one as the sheet."
    },
    generatedMeta,
    h("label", { class: "radio-row" }, journalBox, h("span", { text: "Include journal text and secret entries" })),
    h(
      "div",
      { class: "section-actions" },
      generatedView,
      button({ id: "generated-download", label: "Download", variant: "btn-small", onclick: () => handlers.onDownloadGenerated() }),
      button({ id: "generated-print", icon: "download", label: "Print the sheet", variant: "btn-small", onclick: () => handlers.onPrint() })
    )
  );

  const list = h("ul", { class: "doc-list", "aria-label": "PDF documents" });
  const empty = h("div", { id: "pdf-empty" });
  const viewerTitle = h("h3", { class: "viewer-title", id: "pdf-viewer-title" });
  const viewerHost = h("div", { class: "pdf-viewer", id: "pdf-viewer" });
  const viewerPanel = h("div", { class: "viewer-panel" }, viewerTitle, viewerHost);
  const rows = new Map();

  const documentsSection = section(
    {
      id: "pdf-documents",
      title: "PDF sheets",
      description: `Keep PDF character sheets with this character. Up to ${LIMITS.documents} files of ${formatBytes(LIMITS.pdfBytes)} each; they stay on this device.`
    },
    h("div", { class: "section-actions" }, upload, input),
    empty,
    list
  );

  replace(root, h("div", { class: "stack" }, generatedSection, documentsSection, viewerPanel));

  root.addEventListener("dragover", (event) => {
    if (event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault();
      root.classList.add("is-dragging");
    }
  });

  root.addEventListener("dragleave", (event) => {
    if (!root.contains(event.relatedTarget)) {
      root.classList.remove("is-dragging");
    }
  });

  root.addEventListener("drop", (event) => {
    if (event.dataTransfer?.files?.length) {
      event.preventDefault();
      root.classList.remove("is-dragging");
      handlers.onFiles([...event.dataTransfer.files]);
    }
  });

  function createRow(document) {
    const name = h("input", {
      class: "input doc-name",
      type: "text",
      maxLength: LIMITS.documentNameLength,
      autocomplete: "off",
      oninput: (event) => handlers.onRename(document.id, event.target.value)
    });
    const meta = h("p", { class: "doc-meta" });
    const view = button({ label: "View", variant: "btn-small", onclick: () => handlers.onSelect(document.id) });
    const sheet = button({ label: "Use as the sheet", variant: "btn-small", onclick: () => handlers.onSheet(document.id) });
    const download = button({ label: "Download", variant: "btn-small", onclick: () => handlers.onDownload(document.id) });
    const remove = button({ label: "Remove", variant: "btn-small btn-danger-text", onclick: () => handlers.onRemove(document.id) });

    const element = h(
      "li",
      { class: "doc", "data-id": document.id },
      h("div", { class: "doc-main" }, name, meta),
      h("div", { class: "doc-actions" }, view, sheet, download, remove)
    );

    return { element, name, meta, view, sheet, download, remove };
  }

  function updateRow(row, document, index, { selected, isSheet, missing }) {
    if (globalThis.document.activeElement !== row.name && row.name.value !== document.name) {
      row.name.value = document.name;
    }

    row.name.setAttribute("aria-label", `Document name, file ${index + 1}`);
    row.meta.textContent = [
      formatBytes(document.size),
      `Added ${formatDate(document.addedAt)}`,
      isSheet ? "This is the sheet" : null,
      missing ? "File missing" : null
    ].filter(Boolean).join(" · ");

    row.element.classList.toggle("is-selected", selected);
    row.view.setAttribute("aria-pressed", String(selected));
    row.view.setAttribute("aria-label", `View ${document.name}`);
    row.view.disabled = missing;
    row.sheet.querySelector("span").textContent = isSheet ? "Stop using as the sheet" : "Use as the sheet";
    row.sheet.setAttribute("aria-label", `${isSheet ? "Stop using as the sheet" : "Use as the sheet"}: ${document.name}`);
    row.sheet.disabled = missing;
    row.download.setAttribute("aria-label", `Download ${document.name}`);
    row.download.disabled = missing;
    row.remove.setAttribute("aria-label", `Remove ${document.name}`);
  }

  return {
    viewerHost,
    render({ documents, selectedId, sheetId, missing, includeJournal = false, generated = null }) {
      const showingGenerated = selectedId === "generated";

      journalBox.checked = includeJournal;
      generatedView.setAttribute("aria-pressed", String(showingGenerated));
      generatedMeta.textContent = [sheetId ? "Your uploaded PDF is the sheet" : "This is the sheet", generated ? `${generated.pages} page${generated.pages === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
      generatedSection.classList.toggle("is-selected", showingGenerated);

      const known = new Set(documents.map((document) => document.id));

      for (const [id, row] of rows) {
        if (!known.has(id)) {
          row.element.remove();
          rows.delete(id);
        }
      }

      documents.forEach((document, index) => {
        let row = rows.get(document.id);

        if (!row) {
          row = createRow(document);
          rows.set(document.id, row);
        }

        updateRow(row, document, index, {
          selected: document.id === selectedId,
          isSheet: document.id === sheetId,
          missing: missing.has(document.blobId)
        });

        if (list.children[index] !== row.element) {
          list.insertBefore(row.element, list.children[index] ?? null);
        }
      });

      const selected = documents.find((document) => document.id === selectedId);

      list.hidden = documents.length === 0;
      viewerPanel.hidden = !selected && !showingGenerated;
      viewerTitle.textContent = showingGenerated ? "Viewing the generated sheet" : selected ? `Viewing ${selected.name}` : "";

      if (documents.length === 0) {
        replace(
          empty,
          emptyState(
            {
              title: "No PDF sheets yet",
              message: "Upload a PDF character sheet to keep it with this character, or use the generated sheet above."
            },
            button({ icon: "plus", label: "Upload PDF", variant: "btn-primary", onclick: () => input.click() })
          )
        );
      } else {
        replace(empty);
      }
    }
  };
}
