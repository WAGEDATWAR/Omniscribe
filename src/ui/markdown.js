import { parseMarkdown } from "../markdown.js";
import { h } from "./dom.js";

function inlineNodes(parts) {
  return parts.map((part) => {
    if (part.code) {
      return h("code", { text: part.text });
    }

    if (part.bold) {
      return h("strong", { text: part.text });
    }

    return part.italic ? h("em", { text: part.text }) : part.text;
  });
}

function withBreaks(lines) {
  return lines.flatMap((line, index) => (index ? [h("br"), ...inlineNodes(line)] : inlineNodes(line)));
}

/** Long text as a safe element: a small markdown subset built from text nodes only (DEF-103). */
export function markdownElement(source, className = "record-text md") {
  const root = h("div", { class: className });

  for (const block of parseMarkdown(source)) {
    if (block.type === "h") {
      root.append(h(`h${3 + block.level}`, { class: "md-heading" }, ...inlineNodes(block.inline)));
    } else if (block.type === "ul" || block.type === "ol") {
      root.append(h(block.type, { class: "md-list" }, block.items.map((item) => h("li", {}, ...inlineNodes(item)))));
    } else if (block.type === "quote") {
      root.append(h("blockquote", { class: "md-quote" }, ...withBreaks(block.lines)));
    } else {
      root.append(h("p", { class: "md-p" }, ...withBreaks(block.lines)));
    }
  }

  return root;
}
