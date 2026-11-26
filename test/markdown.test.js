import assert from "node:assert/strict";
import test from "node:test";
import { parseInline, parseMarkdown } from "../src/markdown.js";

test("inline bold, italic and code", () => {
  assert.deepEqual(parseInline("a **b** c *d* `e` _f_"), [
    { text: "a " }, { text: "b", bold: true }, { text: " c " }, { text: "d", italic: true }, { text: " " }, { text: "e", code: true }, { text: " " }, { text: "f", italic: true }
  ]);
  assert.deepEqual(parseInline("2 * 3 * 4"), [{ text: "2 * 3 * 4" }]);
  assert.deepEqual(parseInline("snake_case_name"), [{ text: "snake_case_name" }]);
});

test("blocks: headings, lists, quotes and paragraphs", () => {
  const blocks = parseMarkdown("# Title\nfirst line\nsecond line\n\n- one\n- **two**\n\n1. a\n2. b\n\n> quoted\n> more");
  assert.deepEqual(blocks.map((block) => block.type), ["h", "p", "ul", "ol", "quote"]);
  assert.equal(blocks[0].level, 1);
  assert.equal(blocks[1].lines.length, 2);
  assert.equal(blocks[2].items.length, 2);
  assert.deepEqual(blocks[2].items[1], [{ text: "two", bold: true }]);
  assert.equal(blocks[4].lines.length, 2);
});

test("markup in the text stays text and nothing is turned into a link or tag", () => {
  const blocks = parseMarkdown('<img src=x onerror=alert(1)> [click](javascript:alert(1)) **<b>hi</b>**');
  const flat = JSON.stringify(blocks);
  assert.ok(flat.includes("<img src=x onerror=alert(1)>"));
  assert.ok(flat.includes("[click](javascript:alert(1))"));
  assert.equal(blocks[0].type, "p");
  assert.equal(parseMarkdown("").length, 0);
});

test("a plain unformatted note is one paragraph and keeps its line breaks", () => {
  const [block] = parseMarkdown("line one\nline two");
  assert.equal(block.type, "p");
  assert.equal(block.lines.length, 2);
});
