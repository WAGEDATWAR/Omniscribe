import assert from "node:assert/strict";
import test from "node:test";
import { ZipError, crc32, openZip, safePath, writeZip } from "../src/zip.js";

const text = (value) => new TextEncoder().encode(value);

test("crc32 matches the known check value", () => {
  assert.equal(crc32(text("123456789")), 0xcbf43926);
});

test("a zip round trips text and binary entries", async () => {
  const big = text("lorem ipsum ".repeat(500));
  const binary = Uint8Array.from({ length: 300 }, (_, index) => index % 256);
  const zip = await writeZip([
    { path: "manifest.json", data: text('{"a":1}') },
    { path: "files/blob_1", data: big },
    { path: "files/sheet.pdf", data: binary }
  ]);
  const opened = openZip(zip);

  assert.deepEqual(opened.entries.map((entry) => entry.path), ["manifest.json", "files/blob_1", "files/sheet.pdf"]);
  assert.equal(await opened.readText("manifest.json"), '{"a":1}');
  assert.deepEqual(await opened.readEntry("files/blob_1"), big);
  assert.deepEqual(await opened.readEntry("files/sheet.pdf"), binary);
  assert.equal(opened.entries[1].method, 8);
  assert.equal(opened.entries[2].method, 0);
  assert.ok(zip.length < big.length);
});

test("an empty archive and an empty entry are fine", async () => {
  assert.equal(openZip(await writeZip([])).entries.length, 0);
  assert.equal((await openZip(await writeZip([{ path: "a", data: new Uint8Array(0) }])).readEntry("a")).length, 0);
});

test("the writer refuses unsafe and duplicate paths", async () => {
  await assert.rejects(writeZip([{ path: "../x", data: text("a") }]), ZipError);
  await assert.rejects(writeZip([{ path: "a", data: text("a") }, { path: "a", data: text("b") }]), ZipError);
  assert.equal(safePath("files/blob_1"), true);

  for (const bad of ["/abs", "C:/x", "a\\b", "a/../b", "", "./a"]) {
    assert.equal(safePath(bad), false, bad);
  }
});

test("the reader refuses what is not a zip", () => {
  assert.throws(() => openZip(text("nope")), ZipError);
  assert.throws(() => openZip(new Uint8Array(100)), /not a zip/);
});

test("the reader enforces the entry count, size and total caps", async () => {
  const zip = await writeZip([
    { path: "a", data: text("aaaa") },
    { path: "b", data: text("bbbb") }
  ]);

  assert.throws(() => openZip(zip, { entries: 1 }), /2 entries/);
  assert.throws(() => openZip(zip, { entryBytes: 3 }), /larger than/);
  assert.throws(() => openZip(zip, { inflated: 7 }), /size limit/);
});

test("the reader refuses a suspicious ratio before inflating", async () => {
  const zeros = new Uint8Array(4 * 1024 * 1024);
  const zip = await writeZip([{ path: "z", data: zeros }]);

  assert.throws(() => openZip(zip), /suspiciously/);
  assert.ok(openZip(zip, { ratio: 100000 }).has("z"));
});

test("a damaged entry fails its check", async () => {
  const zip = await writeZip([{ path: "a", data: text("hello world, hello world") }]);
  const opened = openZip(zip);
  const damaged = zip.slice();
  damaged[opened.entries[0].dataStart] ^= 0xff;

  await assert.rejects(openZip(damaged).readEntry("a"), ZipError);
  await assert.rejects(opened.readEntry("missing"), /no "missing"/);
});

test("an entry that inflates past its declared size is stopped", async () => {
  const zip = await writeZip([{ path: "a", data: text("x".repeat(2000)) }]);
  const view = new DataView(zip.buffer);
  const central = zip.length - 22 - 46 - 1;

  assert.equal(view.getUint32(central, true), 0x02014b50);
  view.setUint32(central + 24, 10, true);
  await assert.rejects(openZip(zip).readEntry("a"), ZipError);
});

test("encrypted, unknown-method, traversal and zip64 archives are refused", async () => {
  const make = async (path = "a") => writeZip([{ path, data: text("data") }]);

  const encrypted = await make();
  const e = encrypted.length - 22 - 46 - 1;
  new DataView(encrypted.buffer).setUint16(e + 8, 0x0801, true);
  assert.throws(() => openZip(encrypted), /Encrypted/);

  const method = await make();
  new DataView(method.buffer).setUint16(method.length - 22 - 46 - 1 + 10, 14, true);
  assert.throws(() => openZip(method), /unsupported method/);

  const sixtyFour = await make();
  new DataView(sixtyFour.buffer).setUint16(sixtyFour.length - 22 + 10, 0xffff, true);
  assert.throws(() => openZip(sixtyFour), /Zip64/);

  const traversal = await make("xx");

  for (let index = 0; index < traversal.length; index += 1) {
    if (traversal[index] === 0x78) {
      traversal[index] = 0x2e;
    }
  }

  assert.throws(() => openZip(traversal), /unsafe path/);
});
