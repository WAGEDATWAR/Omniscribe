/**
 * A small, safe markdown subset for long text (DEF-103), as pure data: headings, bullet and numbered lists, quotes,
 * paragraphs with line breaks, and bold, italic and code inside them. Nothing is ever turned into markup here; the
 * result is a tree the UI builds with `textContent`, so no text can carry HTML, links or scripts.
 *
 * Block: `{ type: "p" | "h" | "ul" | "ol" | "quote", level?, items?, inline }`. Inline: `[{ text, bold?, italic?, code? }]`.
 */
const MAX_CHARS = 60000;

export function parseInline(text) {
  const parts = [];
  const pattern = /(\*\*([^*\n]+?)\*\*|`([^`\n]+?)`|(?<![\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])|(?<![\w_])_(?=\S)([^_\n]*?\S)_(?![\w_]))/g;
  let last = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index > last) {
      parts.push({ text: text.slice(last, match.index) });
    }

    if (match[2] !== undefined) {
      parts.push({ text: match[2], bold: true });
    } else if (match[3] !== undefined) {
      parts.push({ text: match[3], code: true });
    } else {
      parts.push({ text: match[4] ?? match[5], italic: true });
    }

    last = match.index + match[0].length;
  }

  if (last < text.length) {
    parts.push({ text: text.slice(last) });
  }

  return parts.length ? parts : [{ text }];
}

export function parseMarkdown(source) {
  const lines = String(source ?? "").slice(0, MAX_CHARS).replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;
  let quote = [];

  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: "p", lines: paragraph.map(parseInline) });
      paragraph = [];
    }

    if (list) {
      blocks.push(list);
      list = null;
    }

    if (quote.length) {
      blocks.push({ type: "quote", lines: quote.map(parseInline) });
      quote = [];
    }
  };

  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.*\S)\s*$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*\S)\s*$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*\S)\s*$/.exec(line);
    const quoted = /^>\s?(.*)$/.exec(line);

    if (!line.trim()) {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ type: "h", level: heading[1].length, inline: parseInline(heading[2]) });
    } else if (bullet || numbered) {
      const type = bullet ? "ul" : "ol";

      if (list && list.type !== type) {
        flush();
      }

      if (paragraph.length || quote.length) {
        const keep = list;
        list = null;
        flush();
        list = keep;
      }

      list = list ?? { type, items: [] };
      list.items.push(parseInline((bullet ?? numbered)[1]));
    } else if (quoted) {
      if (paragraph.length || list) {
        flush();
      }

      quote.push(quoted[1]);
    } else {
      if (list || quote.length) {
        flush();
      }

      paragraph.push(line);
    }
  }

  flush();
  return blocks;
}
