import { createPdfViewer } from "../pdf/view.js";
import { button, h } from "./dom.js";

/** Shows a PDF blob in the app's own viewer inside a modal dialog (DEF-090). Resolves when it is closed. */
export function openViewerDialog({ title, blob, onDownload }) {
  return new Promise((resolve) => {
    const host = h("div", { class: "pdf-viewer", id: "viewer-dialog-host" });
    const dialog = h(
      "dialog",
      { class: "dialog dialog-viewer", "aria-labelledby": "viewer-dialog-title" },
      h("h2", { id: "viewer-dialog-title", class: "dialog-title", text: title }),
      host,
      h(
        "div",
        { class: "dialog-actions" },
        onDownload ? button({ id: "viewer-dialog-download", label: "Download", onclick: onDownload }) : null,
        button({ id: "viewer-dialog-close", label: "Close", variant: "btn-primary", onclick: () => dialog.close() })
      )
    );
    const viewer = createPdfViewer(host);

    dialog.addEventListener("close", () => {
      viewer.clear();
      dialog.remove();
      resolve();
    });
    document.body.append(dialog);
    dialog.showModal();
    viewer.show(blob, { name: title });
  });
}
