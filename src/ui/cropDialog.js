import { CROP_ZOOM, cropSquare, dragCentre } from "../crop.js";
import { button, h } from "./dom.js";

const PREVIEW = 240;
const STEP = 12;

/**
 * A modal square crop with a zoom and a drag. Resolves with `{ zoom, cx, cy }`, `"whole"` for the uncropped image, or
 * null when cancelled. The bitmap is only read, never closed.
 */
export function openCropDialog(bitmap) {
  return new Promise((resolve) => {
    const state = { zoom: 1, cx: 0.5, cy: 0.5 };
    const canvas = h("canvas", {
      id: "crop-preview",
      class: "crop-preview",
      width: PREVIEW,
      height: PREVIEW,
      tabindex: "0",
      role: "img",
      "aria-label": "Crop preview. Drag, or use the arrow keys, to move the image."
    });
    const zoom = h("input", { id: "crop-zoom", class: "input", type: "range", min: String(CROP_ZOOM.min), max: String(CROP_ZOOM.max), step: "0.05", value: "1", "aria-label": "Zoom" });
    const dialog = h(
      "dialog",
      { class: "dialog", "aria-labelledby": "crop-title" },
      h("h2", { id: "crop-title", class: "dialog-title", text: "Crop the portrait" }),
      h("p", { class: "field-hint", text: "The portrait is square. Drag the image or use the arrow keys, and zoom to frame it." }),
      h("div", { class: "crop-stage" }, canvas),
      h("label", { class: "field-label", for: "crop-zoom", text: "Zoom" }),
      zoom
    );
    let done = false;

    function finish(value) {
      if (done) {
        return;
      }

      done = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    }

    function draw() {
      const { x, y, size } = cropSquare({ width: bitmap.width, height: bitmap.height, ...state });
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, PREVIEW, PREVIEW);
      context.drawImage(bitmap, x, y, size, size, 0, 0, PREVIEW, PREVIEW);
    }

    function move(dx, dy) {
      Object.assign(state, dragCentre({ width: bitmap.width, height: bitmap.height, ...state, dx, dy, previewSize: PREVIEW }));
      draw();
    }

    let last = null;

    canvas.addEventListener("pointerdown", (event) => {
      last = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (last) {
        move(event.clientX - last.x, event.clientY - last.y);
        last = { x: event.clientX, y: event.clientY };
      }
    });
    canvas.addEventListener("pointerup", () => {
      last = null;
    });
    canvas.addEventListener("keydown", (event) => {
      const delta = { ArrowLeft: [STEP, 0], ArrowRight: [-STEP, 0], ArrowUp: [0, STEP], ArrowDown: [0, -STEP] }[event.key];

      if (delta) {
        event.preventDefault();
        move(...delta);
      }
    });
    zoom.addEventListener("input", () => {
      state.zoom = Number(zoom.value);
      Object.assign(state, dragCentre({ width: bitmap.width, height: bitmap.height, ...state, dx: 0, dy: 0, previewSize: PREVIEW }));
      draw();
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(null);
    });

    dialog.append(
      h(
        "div",
        { class: "dialog-actions" },
        button({ id: "crop-cancel", label: "Cancel", onclick: () => finish(null) }),
        button({ id: "crop-whole", label: "Keep the whole image", onclick: () => finish("whole") }),
        button({ id: "crop-ok", label: "Use this crop", variant: "btn-primary", onclick: () => finish({ ...state }) })
      )
    );
    document.body.append(dialog);
    draw();
    dialog.showModal();
    canvas.focus();
  });
}
