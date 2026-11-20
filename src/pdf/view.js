import { button, h, replace } from "../ui/dom.js";

const ASSETS = new URL("../vendor/pdfjs/", import.meta.url);
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const FIT_PADDING = 24;
const MAX_OUTPUT_SCALE = 2;

let library = null;

/** PDF.js is loaded the first time a PDF is opened, never at start-up (P-14). */
function loadLibrary() {
  if (!library) {
    library = import("../vendor/pdfjs/build/pdf.min.mjs").then(
      (pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("build/pdf.worker.min.mjs", ASSETS).href;
        return pdfjs;
      },
      (error) => {
        library = null;
        throw error;
      }
    );
  }

  return library;
}

export function describeError(error) {
  switch (error?.name) {
    case "PasswordException":
      return "This PDF is password protected, and Omniscribe cannot open protected PDFs yet. You can still download it.";
    case "InvalidPDFException":
      return "This file is damaged or is not a valid PDF. You can still download it.";
    default:
      return "This PDF could not be displayed. You can still download it.";
  }
}

/**
 * A viewer that draws pages to canvases. Pages render as they approach the viewport and are released
 * when they leave it, so a long PDF never holds every page in memory.
 */
export function createPdfViewer(host) {
  const status = h("p", { class: "pdf-status", role: "status" });
  const count = h("span", { class: "pdf-count" });
  const zoomLabel = h("span", { class: "pdf-zoom-label", "aria-live": "polite" });
  const pages = h("div", { class: "pdf-pages", tabindex: "0", role: "region", "aria-label": "PDF pages" });

  let pdf = null;
  let loading = null;
  let entries = [];
  let baseSize = { width: 612, height: 792 };
  let zoom = "fit";
  let observer = null;
  let resizer = null;
  let resizeTimer = null;
  let lastWidth = 0;
  let token = 0;

  const zoomOut = button({ label: "Zoom out", variant: "btn-small", onclick: () => stepZoom(-1), disabled: true });
  const zoomIn = button({ label: "Zoom in", variant: "btn-small", onclick: () => stepZoom(1), disabled: true });
  const fit = button({ label: "Fit width", variant: "btn-small", onclick: () => setZoom("fit"), disabled: true });
  const toolbar = h("div", { class: "pdf-toolbar", role: "toolbar", "aria-label": "PDF view" }, zoomOut, zoomIn, fit, zoomLabel, count);

  replace(host, toolbar, status, pages);

  function scale() {
    if (zoom === "fit") {
      const available = Math.max(pages.clientWidth - FIT_PADDING, 200);
      return Math.min(Math.max(available / baseSize.width, 0.25), 4);
    }

    return zoom;
  }

  function size(entry, width, height) {
    entry.wrapper.style.width = `${Math.round(width)}px`;
    entry.wrapper.style.height = `${Math.round(height)}px`;
  }

  function release(entry) {
    entry.task?.cancel();
    entry.task = null;
    entry.rendering = false;
    entry.canvas.width = 0;
    entry.canvas.height = 0;
    entry.rendered = false;
  }

  async function renderPage(entry) {
    if (!pdf || entry.rendered || entry.rendering) {
      return;
    }

    const current = token;
    entry.rendering = true;

    try {
      const page = await pdf.getPage(entry.number);

      if (current !== token) {
        return;
      }

      const viewport = page.getViewport({ scale: scale() });
      const output = Math.min(window.devicePixelRatio || 1, MAX_OUTPUT_SCALE);

      size(entry, viewport.width, viewport.height);
      entry.canvas.width = Math.floor(viewport.width * output);
      entry.canvas.height = Math.floor(viewport.height * output);
      entry.canvas.style.width = `${Math.round(viewport.width)}px`;
      entry.canvas.style.height = `${Math.round(viewport.height)}px`;

      entry.task = page.render({
        canvas: entry.canvas,
        viewport,
        transform: output === 1 ? undefined : [output, 0, 0, output, 0, 0]
      });

      await entry.task.promise;

      if (current === token) {
        entry.rendered = true;
        entry.wrapper.dataset.rendered = "true";
      }
    } catch (error) {
      if (error?.name !== "RenderingCancelledException" && current === token) {
        entry.wrapper.dataset.error = "true";
      }
    } finally {
      entry.rendering = false;
      entry.task = null;
    }
  }

  function watch() {
    observer?.disconnect();

    observer = new IntersectionObserver(
      (changes) => {
        for (const change of changes) {
          const entry = entries[Number(change.target.dataset.index)];

          if (!entry) {
            continue;
          }

          if (change.isIntersecting) {
            renderPage(entry);
          } else if (entry.rendered) {
            release(entry);
            delete entry.wrapper.dataset.rendered;
          }
        }
      },
      { root: pages, rootMargin: "900px 0px" }
    );

    for (const entry of entries) {
      observer.observe(entry.wrapper);
    }
  }

  function updateControls() {
    const loaded = Boolean(pdf);
    const index = ZOOM_STEPS.indexOf(zoom);

    zoomOut.disabled = !loaded || (zoom !== "fit" && index <= 0);
    zoomIn.disabled = !loaded || (zoom !== "fit" && index >= ZOOM_STEPS.length - 1);
    fit.disabled = !loaded || zoom === "fit";
    zoomLabel.textContent = loaded ? (zoom === "fit" ? "Fit width" : `${Math.round(zoom * 100)}%`) : "";
  }

  function refresh() {
    if (!entries.length) {
      return;
    }

    token += 1;

    const current = scale();

    for (const entry of entries) {
      release(entry);
      delete entry.wrapper.dataset.rendered;
      size(entry, baseSize.width * current, baseSize.height * current);
    }

    watch();
    updateControls();
  }

  function setZoom(next) {
    zoom = next;
    refresh();
  }

  function stepZoom(direction) {
    const current = zoom === "fit" ? scale() : zoom;
    const target = direction > 0
      ? ZOOM_STEPS.find((step) => step > current + 0.001) ?? ZOOM_STEPS.at(-1)
      : [...ZOOM_STEPS].reverse().find((step) => step < current - 0.001) ?? ZOOM_STEPS[0];

    setZoom(target);
  }

  function clear() {
    token += 1;
    observer?.disconnect();
    resizer?.disconnect();
    clearTimeout(resizeTimer);

    for (const entry of entries) {
      entry.task?.cancel();
    }

    entries = [];
    loading?.destroy().catch(() => {});
    loading = null;
    pdf = null;
    replace(pages);
    status.textContent = "";
    status.hidden = true;
    count.textContent = "";
    zoom = "fit";
    updateControls();
  }

  async function show(blob, { name = "PDF" } = {}) {
    clear();
    const current = token;

    status.hidden = false;
    status.textContent = `Loading ${name}…`;

    try {
      const [pdfjs, buffer] = await Promise.all([loadLibrary(), blob.arrayBuffer()]);

      if (current !== token) {
        return;
      }

      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buffer),
        wasmUrl: new URL("wasm/", ASSETS).href,
        iccUrl: new URL("iccs/", ASSETS).href,
        standardFontDataUrl: new URL("standard_fonts/", ASSETS).href
      });

      loading = loadingTask;
      const loaded = await loadingTask.promise;

      if (current !== token) {
        loadingTask.destroy().catch(() => {});
        return;
      }

      pdf = loaded;

      const first = await pdf.getPage(1);

      if (current !== token) {
        return;
      }

      const view = first.getViewport({ scale: 1 });
      baseSize = { width: view.width, height: view.height };

      entries = Array.from({ length: pdf.numPages }, (_, index) => {
        const canvas = h("canvas", {
          class: "pdf-canvas",
          role: "img",
          "aria-label": `Page ${index + 1} of ${pdf.numPages}`
        });
        const wrapper = h("div", { class: "pdf-page", "data-index": String(index) }, canvas);

        pages.append(wrapper);
        return { number: index + 1, wrapper, canvas, rendered: false, rendering: false, task: null };
      });

      count.textContent = `${pdf.numPages} ${pdf.numPages === 1 ? "page" : "pages"}`;
      status.textContent = "";
      status.hidden = true;
      lastWidth = pages.clientWidth;

      resizer = new ResizeObserver(() => {
        if (zoom !== "fit" || Math.abs(pages.clientWidth - lastWidth) < 3) {
          return;
        }

        lastWidth = pages.clientWidth;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(refresh, 150);
      });
      resizer.observe(pages);

      refresh();
    } catch (error) {
      if (current === token) {
        clear();
        status.hidden = false;
        status.textContent = describeError(error);
      }
    }
  }

  clear();

  return { show, clear, element: host };
}
