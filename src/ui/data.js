import { formatBytes, plural } from "../utils.js";
import { button, h, pageHeader, replace, section } from "./dom.js";

function row(label, value, id) {
  return [h("dt", { text: label }), h("dd", { id, text: value })];
}

/** The Data page: where data lives and how safe it is. `render` takes a plain info object. */
export function mountDataPage(root, handlers) {
  const body = h("div", { class: "stack" });
  const restore = h("div", { id: "restore-box" });
  const fileInput = h("input", { id: "restore-file", class: "input", type: "file", accept: ".zip,application/zip", onchange: (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (file) {
      handlers.onRestoreFile(file);
    }
  } });
  const message = h("p", { id: "restore-message", class: "field-error", role: "alert", hidden: true });
  const review = h("div", { id: "restore-review", hidden: true });
  const lastBackup = h("p", { id: "backup-last", class: "muted" });
  const previous = h("div", { id: "restore-previous" });
  let mode = "add";

  replace(
    root,
    pageHeader({
      title: "Data",
      subtitle: "Where your characters live and how safe they are.",
      titleId: "data-title"
    }),
    body,
    restore
  );

  function drawReview(info) {
    if (!info) {
      review.hidden = true;
      replace(review);
      return;
    }

    review.hidden = false;
    const name = (value) => h("label", { class: "radio-row" }, h("input", { type: "radio", name: "restore-mode", value, checked: mode === value, onchange: () => { mode = value; } }), h("span", { text: value === "add" ? "Add to what is here. Nothing is overwritten; a character that already exists is kept and the new copy is marked (imported)." : "Replace everything. Your current library is swapped for the backup; a safety copy of it is kept so you can go back." }));

    replace(
      review,
      h("h3", { class: "subsection-title", text: "What is in this backup" }),
      h(
        "dl",
        { class: "facts", id: "restore-facts" },
        row("Made", info.created, "restore-made"),
        row("Contains", info.contents, "restore-contents"),
        row("Data version", String(info.schemaVersion), "restore-schema")
      ),
      info.problems.length ? h("ul", { id: "restore-problems", class: "field-error" }, info.problems.map((text) => h("li", { text }))) : null,
      h("fieldset", { class: "fieldset" }, h("legend", { text: "How to restore" }), name("add"), name("replace")),
      h(
        "div",
        { class: "section-actions" },
        button({ id: "restore-go", label: "Restore", variant: "btn-primary", onclick: () => handlers.onRestoreGo(mode) }),
        button({ id: "restore-cancel", label: "Cancel", onclick: handlers.onRestoreCancel })
      )
    );
  }

  replace(
    restore,
    section(
      { id: "data-restore", title: "Restore from a backup", description: "Choose a backup file. You will see what is in it before anything changes." },
      h("div", { class: "field" }, h("label", { class: "field-label", for: "restore-file", text: "Backup file (.zip)" }), fileInput),
      message,
      review,
      previous
    )
  );

  return {
    showReview(info, mode_ = "add") {
      mode = mode_;
      drawReview(info);
    },
    showMessage(text) {
      message.hidden = !text;
      message.textContent = text ?? "";
    },
    showPrevious(info) {
      replace(
        previous,
        info
          ? h("p", { class: "muted", id: "restore-previous-note", text: `A safety copy of your library from ${info.at} (${info.size}) is kept from the last replace.` })
          : null,
        info ? button({ id: "restore-previous-btn", label: "Restore the previous library", onclick: handlers.onRestorePrevious }) : null
      );
    },
    render(info) {
      const persistence = info.persistence.supported
        ? info.persistence.persisted
          ? "Protected: the browser will not clear this data under storage pressure."
          : "Not protected: the browser may clear this data if the device runs low on space."
        : "Not available in this browser.";

      lastBackup.textContent = info.lastBackup ? `Last backup: ${info.lastBackup}.${info.changedSince ? " Your library has changed since." : ""}` : "No backup has been made on this device yet.";

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
              "Unused files",
              info.unused.count ? `${plural(info.unused.count, "file")}, ${formatBytes(info.unused.bytes)}` : "None",
              "storage-unused"
            ),
            row(
              "Space used",
              info.usage.usage === null ? "Unknown" : `${formatBytes(info.usage.usage)} of ${formatBytes(info.usage.quota)}`,
              "storage-usage"
            ),
            row("Data version", String(info.schemaVersion), "storage-schema")
          ),
          h(
            "div",
            { class: "section-actions" },
            info.persistence.supported && !info.persistence.persisted
              ? button({ id: "persist-btn", label: "Request protection", onclick: handlers.onPersist })
              : null,
            info.unused.count ? button({ id: "cleanup-btn", label: "Remove unused files", onclick: handlers.onCleanup }) : null
          )
        ),
        info.quota.level === "warn" || info.quota.level === "full"
          ? h("p", { id: "storage-warning", class: "field-error", role: "alert", text: info.quota.level === "full" ? "Storage is nearly full, so new files are refused. Make a backup, then remove large files below." : "Storage is getting full. Make a backup and remove large files you no longer need." })
          : null,
        info.largest.length
          ? section(
              { id: "data-largest", title: "Largest files", description: "What takes the most space, and what owns it." },
              h(
                "ul",
                { id: "storage-largest", class: "plain-list" },
                info.largest.map((file) => h("li", { text: `${formatBytes(file.size)}: ${file.owner}` }))
              )
            )
          : null,
        section(
          { id: "data-devices", title: "Devices and backups" },
          h("p", {
            text: "The web app, the installed app, the Windows build and the Android app each keep their own separate data. A backup file is the only way to move characters between them."
          }),
          lastBackup,
          h("div", { class: "section-actions" }, button({ id: "backup-btn", label: "Download a backup", variant: "btn-primary", onclick: handlers.onBackup })),
          h("p", { class: "muted", text: "A backup holds every character, campaign, game system and file in one zip. It stays on your device until you move it." })
        )
      );
    }
  };
}
