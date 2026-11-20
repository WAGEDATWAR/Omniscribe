import { h } from "./dom.js";

const TOAST_MS = 4500;
const ACTION_TOAST_MS = 9000;

/** Transient messages in an `aria-live` region. A toast may carry one action, such as Undo. */
export function createToaster(region) {
  return function toast(message, { tone = "info", action = null } = {}) {
    const element = h("div", { class: `toast toast-${tone}` }, h("span", { text: message }));
    let timer = null;

    function dismiss() {
      clearTimeout(timer);
      element.remove();
    }

    if (action) {
      element.append(
        h("button", {
          type: "button",
          class: "btn btn-small",
          text: action.label,
          onclick: () => {
            dismiss();
            action.run();
          }
        })
      );
    }

    region.append(element);
    timer = setTimeout(dismiss, action ? ACTION_TOAST_MS : TOAST_MS);
    return dismiss;
  };
}

/** A promise based confirmation over a native `<dialog>` (U-2). Resolves true only on the confirm button. */
export function createConfirm({ dialog, title, message, ok, cancel }) {
  return function confirm({ heading, body, confirmLabel = "Confirm", danger = false }) {
    title.textContent = heading;
    message.textContent = body;
    ok.textContent = confirmLabel;
    ok.className = `btn ${danger ? "btn-danger" : "btn-primary"}`;

    return new Promise((resolve) => {
      function finish() {
        dialog.removeEventListener("close", finish);
        resolve(dialog.returnValue === "confirm");
      }

      dialog.returnValue = "cancel";
      dialog.addEventListener("close", finish);
      dialog.showModal();
      cancel.focus();
    });
  };
}
