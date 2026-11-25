/**
 * An own minimal PDF writer (X-11). It lays out a document of simple blocks on A4 pages with the built-in Helvetica and
 * Courier fonts (WinAnsi), so it needs no library and no font files. Pure: no DOM, no storage.
 *
 * Blocks: `title` (text, sub), `heading` (text), `pairs` (rows of [label, value]), `table` (columns, rows), `text`
 * (text, label?, mono?) and `list` (items). Text outside WinAnsi becomes `?`; the count comes back and is said on the
 * last page.
 */
const PAGE = { width: 595.28, height: 841.89, margin: 42, footer: 30 };
const LEADING = 1.25;
const MAX_CELL_LINES = 80;

const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];

const WIN_ANSI_EXTRA = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87],
  [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91],
  [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98],
  [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]
]);

const FONTS = { regular: "F1", bold: "F2", mono: "F3" };
const BASE_FONTS = { F1: "Helvetica", F2: "Helvetica-Bold", F3: "Courier" };

/** Maps text to a string of WinAnsi characters (each code 0-255). Returns `{ text, replaced }`. */
export function toWinAnsi(input) {
  let replaced = 0;
  let text = "";

  for (const symbol of String(input ?? "")) {
    const code = symbol.codePointAt(0);

    if (code === 9) {
      text += " ";
    } else if (code === 10) {
      text += "\n";
    } else if ((code >= 32 && code <= 126) || (code >= 161 && code <= 255)) {
      text += symbol;
    } else if (code === 160) {
      text += " ";
    } else if (WIN_ANSI_EXTRA.has(code)) {
      text += String.fromCharCode(WIN_ANSI_EXTRA.get(code));
    } else if (code === 13 || code < 32 || code === 127) {
      text += "";
    } else {
      text += "?";
      replaced += 1;
    }
  }

  return { text, replaced };
}

export function textWidth(text, font, size) {
  if (font === FONTS.mono) {
    return text.length * 0.6 * size;
  }

  let total = 0;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    total += code >= 32 && code <= 126 ? HELVETICA[code - 32] : 556;
  }

  return (total / 1000) * size * (font === FONTS.bold ? 1.06 : 1);
}

function wrapText(text, font, size, maxWidth, maxLines = Infinity) {
  const lines = [];

  for (const paragraph of text.split("\n")) {
    let line = "";

    for (const word of paragraph.split(" ")) {
      let piece = word;

      while (textWidth(piece, font, size) > maxWidth && piece.length > 1) {
        let cut = piece.length - 1;

        while (cut > 1 && textWidth(piece.slice(0, cut), font, size) > maxWidth) {
          cut -= 1;
        }

        if (line) {
          lines.push(line);
          line = "";
        }

        lines.push(piece.slice(0, cut));
        piece = piece.slice(cut);
      }

      const candidate = line ? `${line} ${piece}` : piece;

      if (line && textWidth(candidate, font, size) > maxWidth) {
        lines.push(line);
        line = piece;
      } else {
        line = candidate;
      }
    }

    lines.push(line);
  }

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, Math.max(0, kept[maxLines - 1].length - 3))}...`;
    return kept;
  }

  return lines;
}

function escapeLiteral(text) {
  let out = "";

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const symbol = text[index];

    if (symbol === "\\" || symbol === "(" || symbol === ")") {
      out += `\\${symbol}`;
    } else if (code > 126) {
      out += `\\${code.toString(8).padStart(3, "0")}`;
    } else {
      out += symbol;
    }
  }

  return out;
}

const fix = (number) => Number(number.toFixed(2));

class Pages {
  constructor() {
    this.pages = [];
    this.y = 0;
    this.newPage();
  }

  newPage() {
    this.pages.push([]);
    this.y = PAGE.height - PAGE.margin;
  }

  get ops() {
    return this.pages[this.pages.length - 1];
  }

  room() {
    return this.y - (PAGE.margin + PAGE.footer);
  }

  ensure(need) {
    if (this.room() < need) {
      this.newPage();
      return true;
    }

    return false;
  }

  text(x, y, font, size, content, gray = 0) {
    this.ops.push(`BT ${gray} g /${font} ${size} Tf ${fix(x)} ${fix(y)} Td (${escapeLiteral(content)}) Tj ET`);
  }

  rect(x, y, width, height, gray) {
    this.ops.push(`${gray} g ${fix(x)} ${fix(y)} ${fix(width)} ${fix(height)} re f 0 g`);
  }

  line(x1, y1, x2, y2, gray = 0.7) {
    this.ops.push(`${gray} G 0.5 w ${fix(x1)} ${fix(y1)} m ${fix(x2)} ${fix(y2)} l S 0 G`);
  }
}

const contentWidth = PAGE.width - PAGE.margin * 2;

function drawLines(pages, lines, { x, font, size, gray = 0 }) {
  const leading = size * LEADING;

  for (const line of lines) {
    pages.ensure(leading);
    pages.y -= leading;
    pages.text(x, pages.y + leading * 0.22, font, size, line, gray);
  }
}

function drawTitle(pages, block, state) {
  const title = toWinAnsi(block.text);
  const sub = toWinAnsi(block.sub);
  state.replaced += title.replaced + sub.replaced;
  drawLines(pages, wrapText(title.text, FONTS.bold, 22, contentWidth, 3), { x: PAGE.margin, font: FONTS.bold, size: 22 });

  if (sub.text) {
    drawLines(pages, wrapText(sub.text, FONTS.regular, 10.5, contentWidth, 3), { x: PAGE.margin, font: FONTS.regular, size: 10.5, gray: 0.35 });
  }

  pages.y -= 6;
}

function drawHeading(pages, block, state) {
  const heading = toWinAnsi(block.text);
  state.replaced += heading.replaced;
  pages.ensure(60);
  pages.y -= 10;
  pages.ensure(24);
  pages.y -= 14;
  pages.text(PAGE.margin, pages.y, FONTS.bold, 12.5, heading.text);
  pages.line(PAGE.margin, pages.y - 4, PAGE.margin + contentWidth, pages.y - 4);
  pages.y -= 8;
}

function drawPairs(pages, block, state) {
  const columns = 3;
  const gap = 12;
  const cell = (contentWidth - gap * (columns - 1)) / columns;

  for (let start = 0; start < block.rows.length; start += columns) {
    const group = block.rows.slice(start, start + columns).map(([label, value]) => {
      const encodedLabel = toWinAnsi(label);
      const encodedValue = toWinAnsi(value === "" || value === null || value === undefined ? "-" : value);
      state.replaced += encodedLabel.replaced + encodedValue.replaced;

      return {
        label: wrapText(encodedLabel.text, FONTS.regular, 8, cell, 2),
        value: wrapText(encodedValue.text, FONTS.bold, 10.5, cell, 6)
      };
    });

    const height = Math.max(...group.map((item) => item.label.length * 8 * LEADING + item.value.length * 10.5 * LEADING)) + 6;
    pages.ensure(height);
    const top = pages.y;

    group.forEach((item, index) => {
      const x = PAGE.margin + index * (cell + gap);
      let y = top;

      for (const line of item.label) {
        y -= 8 * LEADING;
        pages.text(x, y + 2, FONTS.regular, 8, line, 0.4);
      }

      for (const line of item.value) {
        y -= 10.5 * LEADING;
        pages.text(x, y + 3, FONTS.bold, 10.5, line);
      }
    });

    pages.y = top - height;
  }
}

function drawTable(pages, block, state) {
  const size = 9;
  const pad = 3;
  const leading = size * LEADING;
  const columns = block.columns.map((column) => ({ ...column, label: toWinAnsi(column.label).text }));
  const rows = block.rows.map((row) =>
    row.map((cell) => {
      const encoded = toWinAnsi(cell === null || cell === undefined ? "" : cell);
      state.replaced += encoded.replaced;
      return encoded.text;
    })
  );

  const natural = columns.map((column, index) => {
    const widest = Math.max(textWidth(column.label, FONTS.bold, size), ...rows.map((row) => Math.max(...row[index].split("\n").map((line) => textWidth(line, FONTS.regular, size)), 0)));
    return Math.min(widest + pad * 2, contentWidth * 0.6);
  });
  const total = natural.reduce((sum, width) => sum + width, 0);
  const widths = natural.map((width) => Math.max(34, (width / total) * contentWidth));
  const scale = contentWidth / widths.reduce((sum, width) => sum + width, 0);
  const finalWidths = widths.map((width) => width * scale);

  function drawHeader() {
    const height = leading + pad * 2;
    pages.ensure(height + leading * 2);
    pages.rect(PAGE.margin, pages.y - height, contentWidth, height, 0.9);
    let x = PAGE.margin;

    columns.forEach((column, index) => {
      const shift = column.align === "right" ? finalWidths[index] - pad * 2 - textWidth(column.label, FONTS.bold, size) : 0;
      pages.text(x + pad + shift, pages.y - pad - size * 0.9, FONTS.bold, size, column.label);
      x += finalWidths[index];
    });

    pages.y -= height;
  }

  drawHeader();

  for (const row of rows) {
    const cells = row.map((cell, index) => wrapText(cell, FONTS.regular, size, finalWidths[index] - pad * 2, MAX_CELL_LINES));
    const height = Math.max(...cells.map((lines) => lines.length)) * leading + pad * 2;

    if (height > pages.room()) {
      pages.newPage();
      drawHeader();
    }

    let x = PAGE.margin;
    const top = pages.y;

    cells.forEach((lines, index) => {
      lines.forEach((line, lineIndex) => {
        const shift = columns[index].align === "right" ? finalWidths[index] - pad * 2 - textWidth(line, FONTS.regular, size) : 0;
        pages.text(x + pad + shift, top - pad - size * 0.9 - lineIndex * leading, FONTS.regular, size, line);
      });
      x += finalWidths[index];
    });

    pages.y = top - height;
    pages.line(PAGE.margin, pages.y, PAGE.margin + contentWidth, pages.y, 0.85);
  }

  pages.y -= 4;
}

function drawText(pages, block, state) {
  const body = toWinAnsi(block.text);
  const label = toWinAnsi(block.label);
  state.replaced += body.replaced + label.replaced;
  const font = block.mono ? FONTS.mono : FONTS.regular;

  if (label.text) {
    pages.ensure(40);
    pages.y -= 4;
    drawLines(pages, wrapText(label.text, FONTS.bold, 10, contentWidth, 2), { x: PAGE.margin, font: FONTS.bold, size: 10 });
  }

  drawLines(pages, wrapText(body.text, font, 9.5, contentWidth), { x: PAGE.margin, font, size: 9.5 });
  pages.y -= 4;
}

function drawList(pages, block, state) {
  for (const item of block.items) {
    const encoded = toWinAnsi(item);
    state.replaced += encoded.replaced;
    const lines = wrapText(encoded.text, FONTS.regular, 9.5, contentWidth - 14);
    pages.ensure(9.5 * LEADING);
    const startY = pages.y - 9.5 * LEADING;
    pages.text(PAGE.margin + 2, startY + 3, FONTS.regular, 9.5, "-");
    drawLines(pages, lines, { x: PAGE.margin + 14, font: FONTS.regular, size: 9.5 });
  }

  pages.y -= 4;
}

const DRAWERS = { title: drawTitle, heading: drawHeading, pairs: drawPairs, table: drawTable, text: drawText, list: drawList };

function assemble(pages, { title, producer }) {
  const parts = [];
  const offsets = [];
  let length = 0;

  const push = (chunk) => {
    parts.push(chunk);
    length += chunk.length;
  };

  const object = (number, body) => {
    offsets[number] = length;
    push(`${number} 0 obj\n${body}\nendobj\n`);
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${8 + index * 2} 0 R`).join(" ")}] >>`);

  Object.values(FONTS).forEach((name, index) => {
    object(3 + index, `<< /Type /Font /Subtype /Type1 /BaseFont /${BASE_FONTS[name]} /Encoding /WinAnsiEncoding >>`);
  });

  const created = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  object(6, `<< /Title (${escapeLiteral(title)}) /Producer (${escapeLiteral(producer)}) /CreationDate (D:${created}Z) >>`);
  object(7, "<< >>");

  pages.forEach((ops, index) => {
    const content = ops.join("\n");
    object(9 + index * 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    object(
      8 + index * 2,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${9 + index * 2} 0 R >>`
    );
  });

  const count = 8 + pages.length * 2;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);

  for (let number = 1; number < count; number += 1) {
    push(`${String(offsets[number]).padStart(10, "0")} 00000 n \n`);
  }

  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const text = parts.join("");
  const bytes = new Uint8Array(text.length);

  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff;
  }

  return bytes;
}

/** Lays out the document and returns `{ bytes, pages, replaced }`. */
export function buildPdf({ title = "Document", producer = "Omniscribe", footer = "", blocks = [] } = {}) {
  const pages = new Pages();
  const state = { replaced: 0 };

  for (const block of blocks) {
    DRAWERS[block.type]?.(pages, block, state);
  }

  if (state.replaced) {
    pages.ensure(30);
    pages.y -= 10;
    drawLines(
      pages,
      wrapText(`${state.replaced} character${state.replaced === 1 ? "" : "s"} could not be drawn with this sheet's built-in fonts and show as ?. They are kept in Omniscribe.`, FONTS.regular, 8.5, contentWidth),
      { x: PAGE.margin, font: FONTS.regular, size: 8.5, gray: 0.35 }
    );
  }

  const total = pages.pages.length;
  const footerText = toWinAnsi(footer).text;

  pages.pages.forEach((ops, index) => {
    const label = `${footerText ? `${footerText} - ` : ""}Page ${index + 1} of ${total}`;
    ops.push(`BT 0.45 g /${FONTS.regular} 8 Tf ${fix(PAGE.margin)} ${fix(PAGE.margin - 10)} Td (${escapeLiteral(label)}) Tj ET`);
  });

  return { bytes: assemble(pages.pages, { title: toWinAnsi(title).text, producer }), pages: total, replaced: state.replaced };
}
