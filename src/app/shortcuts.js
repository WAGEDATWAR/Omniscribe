import { SHORTCUTS } from "../shortcuts.js";
import { h, replace } from "../ui/dom.js";

export function initShortcuts(ctx) {
  const dialog = ctx.els.shortcutsDialog;

  replace(
    document.querySelector("#shortcuts-body"),
    SHORTCUTS.map((shortcut) => h(
      "tr",
      {},
      h("td", {}, h("kbd", { text: shortcut.keys })),
      h("td", { text: shortcut.label })
    ))
  );

  ctx.bus.on("shortcuts:open", () => {
    if (!dialog.open) {
      dialog.showModal();
    }
  });
}
