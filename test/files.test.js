import assert from "node:assert/strict";
import { test } from "node:test";
import { HEAD_BYTES, checkImage, checkPdf, cleanFileName, detectKind, fitWithin, isImageKind } from "../src/files.js";
import { LIMITS } from "../src/limits.js";

const bytes = (...values) => new Uint8Array(values);
const text = (value) => new TextEncoder().encode(value);
const PDF = text("%PDF-1.7\n1 0 obj\n");
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50);
const GIF = text("GIF89a....");

test("detectKind recognises each supported format by its bytes", () => {
  assert.equal(detectKind(PDF), "pdf");
  assert.equal(detectKind(PNG), "png");
  assert.equal(detectKind(JPEG), "jpeg");
  assert.equal(detectKind(WEBP), "webp");
  assert.equal(detectKind(GIF), "gif");
});

test("detectKind tolerates junk before the PDF header, as real files have", () => {
  assert.equal(detectKind(text("\n\n   junk %PDF-1.4")), "pdf");
});

test("detectKind only looks in the first 1,024 bytes", () => {
  const late = new Uint8Array(HEAD_BYTES + 20);
  late.set(text("%PDF-"), HEAD_BYTES + 5);

  assert.equal(detectKind(late.subarray(0, HEAD_BYTES)), null);
});

test("detectKind returns null for unknown, empty and missing input", () => {
  assert.equal(detectKind(text("hello world")), null);
  assert.equal(detectKind(new Uint8Array()), null);
  assert.equal(detectKind(null), null);
  assert.equal(detectKind(text("RIFF....WAVE")), null);
});

test("isImageKind", () => {
  assert.equal(isImageKind("png"), true);
  assert.equal(isImageKind("pdf"), false);
  assert.equal(isImageKind(null), false);
});

test("checkPdf accepts a real PDF and refuses with a plain reason otherwise", () => {
  assert.deepEqual(checkPdf({ size: 100, head: PDF }), { ok: true });
  assert.match(checkPdf({ size: 0, head: PDF }).reason, /empty/);
  assert.match(checkPdf({ size: LIMITS.pdfBytes + 1, head: PDF }).reason, /larger than the 25 MB limit for a PDF/);
  assert.match(checkPdf({ size: 100, head: text("not a pdf at all") }).reason, /does not look like a PDF/);
  assert.match(checkPdf({ size: 100, head: PNG }).reason, /does not look like a PDF/);
  assert.match(checkPdf({ size: 100, head: PDF }, { count: LIMITS.documents }).reason, /already has 20 documents/);
});

test("checkPdf accepts a file exactly at the size limit", () => {
  assert.equal(checkPdf({ size: LIMITS.pdfBytes, head: PDF }).ok, true);
});

test("checkImage accepts images and refuses others", () => {
  for (const head of [PNG, JPEG, WEBP, GIF]) {
    assert.equal(checkImage({ size: 10, head }).ok, true);
  }

  assert.match(checkImage({ size: 0, head: PNG }).reason, /empty/);
  assert.match(checkImage({ size: LIMITS.portraitBytes + 1, head: PNG }).reason, /larger than the 8\.0 MB limit/);
  assert.match(checkImage({ size: 10, head: PDF }).reason, /not a PNG, JPEG, WebP or GIF/);
});

test("cleanFileName drops paths and control characters and falls back", () => {
  assert.equal(cleanFileName("C:\\Users\\me\\Mira Sheet.pdf"), "Mira Sheet.pdf");
  assert.equal(cleanFileName("/tmp/x/sheet.pdf"), "sheet.pdf");
  assert.equal(cleanFileName("bad\u0000name\u001f.pdf"), "badname.pdf");
  assert.equal(cleanFileName("   "), "Untitled");
  assert.equal(cleanFileName(undefined), "Untitled");
  assert.equal(cleanFileName("a".repeat(500)).length, LIMITS.documentNameLength);
});

test("fitWithin scales the longer side down and never enlarges", () => {
  assert.deepEqual(fitWithin(2048, 1024), { width: 512, height: 256 });
  assert.deepEqual(fitWithin(1000, 4000), { width: 128, height: 512 });
  assert.deepEqual(fitWithin(100, 50), { width: 100, height: 50 });
  assert.deepEqual(fitWithin(0, 0), { width: 1, height: 1 });
});
