import assert from "node:assert/strict";
import { test } from "node:test";
import { findOrphanBlobs, referencedBlobIds } from "../src/integrity.js";
import { LIMITS } from "../src/limits.js";
import { MIGRATIONS, SCHEMA_VERSION, migrateProject } from "../src/migrations.js";
import { createCharacter, createDocument, initials, normalizeCharacter, normalizeDocument } from "../src/schema.js";
import { createStorage } from "../src/storage.js";
import { createMemoryBackend } from "../src/storage/memory.js";
import { createStore } from "../src/store.js";

function makeStore() {
  return createStore({ now: () => 1000 });
}

function withDocument(store, name = "Sheet.pdf", blobId = "blob_a") {
  const character = store.addCharacter({ name: "Mira" });
  const document = store.addDocument(character.id, { blobId, name, size: 1234 });
  return { character, document };
}

test("a document is normalized and must point at a valid blob", () => {
  const document = createDocument({ blobId: "blob_a", name: "Sheet.pdf", size: 5 }, { now: 7 });

  assert.match(document.id, /^doc_[0-9a-f]{16}$/);
  assert.equal(document.kind, "pdf");
  assert.equal(document.addedAt, 7);
  assert.equal(normalizeDocument({ blobId: "bad id" }), null);
  assert.equal(normalizeDocument(null), null);
  assert.equal(normalizeDocument({ blobId: "blob_a", name: "", size: -4 }).name, "Untitled");
  assert.equal(normalizeDocument({ blobId: "blob_a", size: -4 }).size, 0);
});

test("a character normalizes its documents, drops bad ones and caps the list", () => {
  const many = Array.from({ length: LIMITS.documents + 5 }, (_, index) => ({ id: `doc_${index}`, blobId: `blob_${index}` }));
  const character = normalizeCharacter({ id: "char_a", documents: [{ id: "doc_x" }, ...many, { id: "doc_0", blobId: "blob_dup" }] });

  assert.equal(character.documents.length, LIMITS.documents);
  assert.equal(new Set(character.documents.map((document) => document.id)).size, LIMITS.documents);
  assert.deepEqual(normalizeCharacter({ id: "char_a", documents: "nope" }).documents, []);
});

test("the sheet choice must name an existing document and stays in sync", () => {
  const document = { id: "doc_a", blobId: "blob_a" };

  assert.deepEqual(
    normalizeCharacter({ id: "char_a", documents: [document], pdf: { uploadedId: "doc_a" } }).pdf,
    { preference: "uploaded", uploadedId: "doc_a" }
  );
  assert.deepEqual(
    normalizeCharacter({ id: "char_a", documents: [document], pdf: { uploadedId: "doc_zzz" } }).pdf,
    { preference: "generated", uploadedId: null }
  );
  assert.deepEqual(
    normalizeCharacter({ id: "char_a", pdf: { preference: "uploaded", uploadedId: "doc_a" } }).pdf,
    { preference: "generated", uploadedId: null }
  );
});

test("migrations 2 to 4 give stored characters documents, a sheet choice, an empty sheet and no roll presets without touching other fields", () => {
  assert.equal(SCHEMA_VERSION, 1 + MIGRATIONS.length);

  const migrated = migrateProject({ version: 1, characters: [{ id: "char_a", name: "Old" }, null, { id: "char_b", documents: [{ keep: true }] }] });

  assert.deepEqual(migrated.characters[0], { documents: [], pdf: { preference: "generated", uploadedId: null }, sheet: null, rollPresets: [], inventory: { items: [], wallets: {} }, abilities: [], journal: [], relations: [], progression: [], familiars: [], id: "char_a", name: "Old" });
  assert.equal(migrated.characters[1], null);
  assert.deepEqual(migrated.characters[2].documents, [{ keep: true }]);
  assert.equal(migrated.version, SCHEMA_VERSION);
});

test("storage migrates version 1 data on load and reports it", async () => {
  const backend = createMemoryBackend();
  await backend.apply([
    { store: "characters", put: [["char_a", { id: "char_a", name: "Legacy" }]] },
    { store: "meta", put: [["schemaVersion", 1]] }
  ]);

  const loaded = await createStorage(backend).load();

  assert.equal(loaded.migrated, true);
  assert.deepEqual(loaded.characters[0].documents, []);
  assert.deepEqual(loaded.characters[0].pdf, { preference: "generated", uploadedId: null });
});

test("addDocument stores a record pointing at a blob and respects the limit", () => {
  const store = makeStore();
  const { character, document } = withDocument(store);

  assert.equal(store.getCharacter(character.id).documents[0].blobId, "blob_a");
  assert.equal(document.name, "Sheet.pdf");
  assert.equal(store.addDocument("char_none", { blobId: "blob_a" }), null);

  for (let index = 1; index < LIMITS.documents; index += 1) {
    store.addDocument(character.id, { blobId: `blob_${index}`, name: `Doc ${index}` });
  }

  assert.equal(store.addDocument(character.id, { blobId: "blob_over", name: "Too many" }), null);
});

test("renameDocument coalesces typing and ignores unknown documents", () => {
  const store = makeStore();
  const { character, document } = withDocument(store);

  store.renameDocument(character.id, document.id, "Mi");
  store.renameDocument(character.id, document.id, "Mira");

  assert.equal(store.getCharacter(character.id).documents[0].name, "Mira");
  assert.equal(store.renameDocument(character.id, "doc_none", "x"), null);

  store.undo();
  assert.equal(store.getCharacter(character.id).documents[0].name, "Sheet.pdf");
});

test("the sheet choice is set, cleared and cleared again when its document is removed", () => {
  const store = makeStore();
  const { character, document } = withDocument(store);

  store.setSheetDocument(character.id, document.id);
  assert.deepEqual(store.getCharacter(character.id).pdf, { preference: "uploaded", uploadedId: document.id });

  store.setSheetDocument(character.id, null);
  assert.deepEqual(store.getCharacter(character.id).pdf, { preference: "generated", uploadedId: null });

  store.setSheetDocument(character.id, document.id);
  const removed = store.removeDocument(character.id, document.id);

  assert.equal(removed.wasSheet, true);
  assert.equal(store.getCharacter(character.id).documents.length, 0);
  assert.equal(store.getCharacter(character.id).pdf.uploadedId, null);
});

test("restoreDocument puts a removed document back in place and re-marks the sheet", () => {
  const store = makeStore();
  const { character, document } = withDocument(store);
  const second = store.addDocument(character.id, { blobId: "blob_b", name: "Second.pdf" });
  store.setSheetDocument(character.id, document.id);

  const removed = store.removeDocument(character.id, document.id);
  store.restoreDocument(character.id, removed);

  const restored = store.getCharacter(character.id);

  assert.deepEqual(restored.documents.map((item) => item.id), [document.id, second.id]);
  assert.equal(restored.pdf.uploadedId, document.id);
  assert.equal(store.restoreDocument(character.id, removed), null);
  assert.equal(store.removeDocument(character.id, "doc_none"), null);
});

test("duplicating a character copies document records but shares the files", () => {
  const store = makeStore();
  const { character, document } = withDocument(store);
  store.setSheetDocument(character.id, document.id);
  store.setPortrait(character.id, "blob_portrait");

  const copy = store.duplicateCharacter(character.id);

  assert.notEqual(copy.documents[0].id, document.id);
  assert.equal(copy.documents[0].blobId, document.blobId);
  assert.equal(copy.documents[0].addedAt, document.addedAt);
  assert.equal(copy.pdf.uploadedId, copy.documents[0].id);
  assert.equal(copy.portraitBlobId, "blob_portrait");

  store.removeDocument(copy.id, copy.documents[0].id);
  assert.equal(store.getCharacter(character.id).documents.length, 1);
});

test("setPortrait sets and clears the portrait", () => {
  const store = makeStore();
  const character = store.addCharacter({ name: "A" });

  store.setPortrait(character.id, "blob_p");
  assert.equal(store.getCharacter(character.id).portraitBlobId, "blob_p");
  store.setPortrait(character.id, null);
  assert.equal(store.getCharacter(character.id).portraitBlobId, null);
});

test("selectDocument is session state that never marks anything dirty", () => {
  const store = makeStore();
  const events = [];
  store.subscribe((event) => events.push(event.type));

  store.selectDocument("doc_a");

  assert.equal(store.getUi().selectedDocumentId, "doc_a");
  assert.deepEqual(events, ["ui"]);
  assert.equal(store.hasDirty(), false);
});

test("referencedBlobIds and findOrphanBlobs follow reachability and respect the grace period", () => {
  const characters = [
    { portraitBlobId: "blob_portrait", documents: [{ blobId: "blob_doc" }] },
    { portraitBlobId: null, documents: [] }
  ];
  const blobs = [
    { id: "blob_portrait", addedAt: 0 },
    { id: "blob_doc", addedAt: 0 },
    { id: "blob_old", addedAt: 0 },
    { id: "blob_fresh", addedAt: 9500 }
  ];

  assert.deepEqual([...referencedBlobIds(characters)].sort(), ["blob_doc", "blob_portrait"]);
  assert.deepEqual(findOrphanBlobs(characters, blobs, { now: 10000, graceMs: 1000 }).map((blob) => blob.id), ["blob_old"]);
  assert.deepEqual(findOrphanBlobs(characters, blobs, { now: 10000, graceMs: 0 }).map((blob) => blob.id), ["blob_old", "blob_fresh"]);
});

test("initials", () => {
  assert.equal(initials(createCharacter({ name: "Mira Vale" })), "MV");
  assert.equal(initials(createCharacter({ name: "Bram" })), "B");
  assert.equal(initials(createCharacter({ name: "  " })), "UC");
  assert.equal(initials(createCharacter({ name: "anna maria de la cruz" })), "AC");
});

test("storage lists and deletes blobs without loading their data", async () => {
  const storage = createStorage(createMemoryBackend(), { now: () => 50 });
  const first = await storage.putBlob({ type: "application/pdf", data: new Blob(["a"]) });
  const second = await storage.putBlob({ type: "image/webp", data: new Blob(["bb"]) });
  const listed = await storage.listBlobs();

  assert.deepEqual(listed.map((blob) => blob.id).sort(), [first.id, second.id].sort());
  assert.equal(listed.find((blob) => blob.id === second.id).size, 2);
  assert.equal("data" in listed[0], false);

  await storage.deleteBlobs([first.id]);

  assert.deepEqual((await storage.listBlobs()).map((blob) => blob.id), [second.id]);
});
