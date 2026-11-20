import { formatBytes, plural } from "../utils.js";
import { button, h, pageHeader, replace, section } from "./dom.js";

function row(label, value, id) {
  return [h("dt", { text: label }), h("dd", { id, text: value })];
}

/** The Data page: where data lives and how safe it is. `render` takes a plain info object. */
export function mountDataPage(root, handlers) {
  const body = h("div", { class: "stack" });

  replace(
    root,
    pageHeader({
      title: "Data",
      subtitle: "Where your characters live and how safe they are.",
      titleId: "data-title"
    }),
    body
  );

  return {
    render(info) {
      const persistence = info.persistence.supported
        ? info.persistence.persisted
          ? "Protected: the browser will not clear this data under storage pressure."
          : "Not protected: the browser may clear this data if the device runs low on space."
        : "Not available in this browser.";

      replace(
        body,
        section(
          { id: "data-storage", title: "Storage", description: "Everything is stored on this device, in this app." },
          h(
            "dl",
            { class: "facts" },
            row("Backend", info.degraded ? "Memory only (storage unavailable)" : info.backend, "storage-backend"),
            row("Persistent storage", persistence, "storage-persistence"),
            row("Characters", plural(info.characters, "character"), "storage-characters"),
            row("Files", `${plural(info.blobs.count, "file")}, ${formatBytes(info.blobs.bytes)}`, "storage-files"),
            row(
              "Space used",
              info.usage.usage === null ? "Unknown" : `${formatBytes(info.usage.usage)} of ${formatBytes(info.usage.quota)}`,
              "storage-usage"
            ),
            row("Data version", String(info.schemaVersion), "storage-schema")
          ),
          info.persistence.supported && !info.persistence.persisted
            ? button({ id: "persist-btn", label: "Request protection", onclick: handlers.onPersist })
            : null
        ),
        section(
          { id: "data-devices", title: "Devices and backups" },
          h("p", {
            text: "The web app, the installed app, the Windows build and the Android app each keep their own separate data. A backup file is the only way to move characters between them."
          }),
          h("p", { class: "muted", text: "Backups and restore arrive in a later phase (DEF-030)." })
        )
      );
    }
  };
}
