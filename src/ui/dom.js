const SVG_NS = "http://www.w3.org/2000/svg";
const ATTRIBUTE_ONLY = /^(aria-|data-)/;
const ATTRIBUTE_NAMES = new Set(["role", "for", "list"]);

function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) {
      continue;
    }

    parent.append(typeof child === "object" ? child : document.createTextNode(String(child)));
  }
}

/** Builds an element. Strings always become text nodes or `textContent`; markup is never parsed (G-3). */
export function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);

  for (const [name, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) {
      continue;
    }

    if (name === "class") {
      element.className = value;
    } else if (name === "text") {
      element.textContent = value;
    } else if (name.startsWith("on") && typeof value === "function") {
      element.addEventListener(name.slice(2), value);
    } else if (ATTRIBUTE_ONLY.test(name) || ATTRIBUTE_NAMES.has(name)) {
      element.setAttribute(name, value === true ? "" : String(value));
    } else if (name in element) {
      element[name] = value;
    } else {
      element.setAttribute(name, value === true ? "" : String(value));
    }
  }

  append(element, children);
  return element;
}

export function replace(parent, ...children) {
  parent.replaceChildren();
  append(parent, children);
}

const ICONS = {
  undo: ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
  redo: ["m15 14 5-5-5-5", "M20 9H9.5a5.5 5.5 0 0 0 0 11H13"],
  command: ["M9 9V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"],
  plus: ["M12 5v14", "M5 12h14"],
  download: ["M12 4v11", "m7 11 5 5 5-5", "M5 20h14"],
  copy: ["M9 9h10v10H9z", "M5 15V5h10"],
  trash: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 13h10l1-13", "M9 7V4h6v3"],
  back: ["m15 18-6-6 6-6"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
  check: ["m5 12 5 5 9-10"]
};

export function icon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");

  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("icon");

  for (const data of ICONS[name] ?? []) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", data);
    svg.append(path);
  }

  return svg;
}

export function button({ label, icon: iconName, variant = "", onclick, ariaLabel, title, type = "button", disabled = false, id }) {
  return h(
    "button",
    {
      id,
      type,
      class: `btn ${variant}`.trim(),
      onclick,
      "aria-label": ariaLabel,
      title,
      disabled
    },
    iconName ? icon(iconName) : null,
    label ? h("span", { text: label }) : null
  );
}

/** The one page anatomy (U-6): a header, then sections, with a shared empty state. */
export function pageHeader({ title, subtitle, back, actions = [], titleId }) {
  return h(
    "header",
    { class: "page-header" },
    back ? h("a", { class: "back-link", href: back.href }, icon("back"), h("span", { text: back.label })) : null,
    h(
      "div",
      { class: "page-title-row" },
      h(
        "div",
        { class: "page-title-block" },
        h("h1", { id: titleId, class: "page-title", tabindex: "-1", text: title }),
        subtitle ? h("p", { class: "page-subtitle", text: subtitle }) : null
      ),
      actions.length ? h("div", { class: "page-actions" }, actions) : null
    )
  );
}

export function section({ title, description, id }, ...body) {
  const headingId = id ? `${id}-heading` : undefined;

  return h(
    "section",
    { class: "panel", id, "aria-labelledby": headingId },
    h("h2", { class: "panel-title", id: headingId, text: title }),
    description ? h("p", { class: "panel-description", text: description }) : null,
    ...body
  );
}

export function emptyState({ title, message }, ...actions) {
  return h(
    "div",
    { class: "empty-state" },
    h("h2", { class: "empty-title", text: title }),
    h("p", { class: "empty-message", text: message }),
    actions.length ? h("div", { class: "empty-actions" }, actions) : null
  );
}

export function field({ id, label, hint, wide = false }, control) {
  return h(
    "div",
    { class: `field${wide ? " field-wide" : ""}` },
    h("label", { class: "field-label", for: id, text: label }),
    control,
    hint ? h("p", { class: "field-hint", id: `${id}-hint`, text: hint }) : null
  );
}
