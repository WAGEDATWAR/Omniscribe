import assert from "node:assert/strict";
import test from "node:test";
import { buildArchive, planAdd, readArchive, sha256Hex, verifyFiles } from "../src/backup.js";
import { createCampaign } from "../src/campaigns.js";
import { SCHEMA_VERSION } from "../src/migrations.js";
import { createCharacter, createDocument } from "../src/schema.js";
import { createStorage } from "../src/storage.js";
import { createMemoryBackend } from "../src/storage/memory.js";
import { createId } from "../src/utils.js";
import { writeZip } from "../src/zip.js";

const bytesOf = (text) => new TextEncoder().encode(text);

async function sample() {
  const pdf = bytesOf("%PDF-1.4 sample pdf bytes");
  const blob = { id: "blob_one", type: "application/pdf", addedAt: 5, bytes: pdf };
  const mira = { ...createCharacter({ name: "Mira" }), documents: [createDocument({ name: "Sheet", blobId: "blob_one", type: "application/pdf", size: pdf.length })] };
  const bram = createCharacter({ name: "Bram" });
  const camp = createCampaign({ name: "Fight", roster: [{ id: "r1", characterId: mira.id, note: "" }] });
  return { blob, mira, bram, camp };
}

test("a backup reads back with its records and verified files", async () => {
  const { blob, mira, bram, camp } = await sample();
  const { bytes, manifest } = await buildArchive({ characters: [mira, bram], campaigns: [camp], blobs: [blob], appVersion: "0.6.0", now: 1000 });
  const archive = await readArchive(bytes);

  assert.equal(manifest.counts.characters, 2);
  assert.equal(archive.manifest.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(archive.characters.map((entry) => entry.name).sort(), ["Bram", "Mira"]);
  assert.equal(archive.campaigns[0].roster[0].characterId, mira.id);
  assert.deepEqual(await verifyFiles(archive), []);
  assert.deepEqual(await archive.readFile("blob_one"), blob.bytes);
});

test("a tampered file is reported and not trusted", async () => {
  const { blob, mira } = await sample();
  const { bytes } = await buildArchive({ characters: [mira], blobs: [blob] });
  const tampered = await buildArchive({ characters: [mira], blobs: [{ ...blob, bytes: bytesOf("%PDF-1.4 other bytes....") }] });
  const archive = await readArchive(bytes);
  const other = await readArchive(tampered.bytes);

  assert.deepEqual(await verifyFiles(archive), []);
  other.files.get("blob_one").hash = archive.files.get("blob_one").hash;
  assert.deepEqual(await verifyFiles(other), ["blob_one"]);
});

test("a file that is not a backup, or is from a newer schema, is refused", async () => {
  await assert.rejects(readArchive(await writeZip([{ path: "a.txt", data: bytesOf("x") }])), /not an Omniscribe backup/);

  const manifest = { format: "omniscribe-backup", formatVersion: 1, schemaVersion: SCHEMA_VERSION + 1 };
  const newer = await writeZip([
    { path: "manifest.json", data: bytesOf(JSON.stringify(manifest)) },
    { path: "project.json", data: bytesOf('{"characters":[]}') }
  ]);
  await assert.rejects(readArchive(newer), /newer version/);

  const future = await writeZip([
    { path: "manifest.json", data: bytesOf(JSON.stringify({ ...manifest, formatVersion: 9, schemaVersion: 1 })) },
    { path: "project.json", data: bytesOf('{"characters":[]}') }
  ]);
  await assert.rejects(readArchive(future), /newer version/);
});

test("add mode keeps both: a colliding id is remapped and every link follows", async () => {
  const { blob, mira, bram, camp } = await sample();
  const { bytes } = await buildArchive({ characters: [mira, bram], campaigns: [camp], blobs: [blob] });
  const archive = await readArchive(bytes);
  const plan = planAdd(archive, {
    characterIds: new Set([mira.id]),
    campaignIds: new Set(),
    blobIds: new Set(["blob_one"]),
    existingBlobs: new Map(),
    createId
  });
  const newMira = plan.characters.find((entry) => entry.name.startsWith("Mira"));

  assert.notEqual(newMira.id, mira.id);
  assert.equal(newMira.name, "Mira (imported)");
  assert.equal(plan.characters.find((entry) => entry.name === "Bram").id, bram.id);
  assert.equal(plan.campaigns[0].roster[0].characterId, newMira.id);
  assert.equal(plan.campaigns[0].name, "Fight");
  assert.equal(plan.blobs[0].to === "blob_one", false);
  assert.equal(newMira.documents[0].blobId, plan.blobs[0].to);
  assert.deepEqual(plan.renamed, [mira.id]);
});

test("a file whose bytes already exist is reused, and a bad file is dropped from its owner", async () => {
  const { blob, mira } = await sample();
  const { bytes } = await buildArchive({ characters: [mira], blobs: [blob] });
  const archive = await readArchive(bytes);
  const hash = await sha256Hex(blob.bytes);
  const reused = planAdd(archive, { characterIds: new Set([mira.id]), existingBlobs: new Map([[hash, "blob_have"]]), blobIds: new Set(["blob_have"]), createId });

  assert.equal(reused.characters[0].documents[0].blobId, "blob_have");
  assert.deepEqual(reused.blobs, []);

  const dropped = planAdd(archive, { badFiles: new Set(["blob_one"]), createId });

  assert.equal(dropped.characters[0].documents.length, 0);
  assert.equal(dropped.documentsDropped, 1);
});

test("replaceLibrary swaps records, systems and files in one go", async () => {
  const storage = createStorage(createMemoryBackend(), { now: () => 9 });
  await storage.save({ upserts: [{ id: "char_old", name: "Old" }], campaignUpserts: [] });
  await storage.putBlob({ id: "blob_old", type: "text/plain", data: new Blob(["old"]) });
  await storage.putSystem({ id: "oldsys", version: 1 });

  await storage.replaceLibrary({
    characters: [{ id: "char_new", name: "New" }],
    campaigns: [],
    systems: [{ id: "newsys", version: 2 }],
    blobs: [{ id: "blob_new", type: "text/plain", data: new Blob(["new"]) }]
  });

  const loaded = await storage.load();

  assert.deepEqual(loaded.characters.map((entry) => entry.id), ["char_new"]);
  assert.deepEqual((await storage.listSystems()).map((file) => file.id), ["newsys"]);
  assert.deepEqual((await storage.listBlobs()).map((entry) => entry.id), ["blob_new"]);
});

test("a character bundle holds only that character, its systems and its files", async () => {
  const { bundleContents } = await import("../src/backup.js");
  const { mira, bram } = await sample();
  const withSystem = { ...mira, sheet: { template: { id: "mine", version: 2 }, values: {}, pools: {}, collections: {}, conditions: [], orphans: {} } };
  const custom = [
    { id: "mine", version: 2, base: { id: "mybase", version: 1 } },
    { id: "mybase", version: 1, base: null },
    { id: "other", version: 1, base: null }
  ];
  const bundle = bundleContents({ kind: "character", character: withSystem, customSystems: custom });

  assert.deepEqual(bundle.characters.map((entry) => entry.id), [mira.id]);
  assert.deepEqual(bundle.systems.map((file) => file.id).sort(), ["mine", "mybase"]);
  assert.deepEqual(bundle.blobIds, ["blob_one"]);
  assert.equal(bundleContents({ kind: "character", character: bram, customSystems: custom }).systems.length, 0);
});

test("a campaign bundle takes the roster and leaves secrets out unless asked", async () => {
  const { bundleContents } = await import("../src/backup.js");
  const { mira, bram, camp } = await sample();
  const secretMira = { ...mira, journal: [{ id: "j1", title: "Plan", kind: "secret" }, { id: "j2", title: "Open", kind: "note" }] };
  const campaign = { ...camp, sessions: [{ id: "s1", title: "One", secretNotes: "the twist", notes: "fun" }] };
  const shared = bundleContents({ kind: "campaign", campaign, characters: [secretMira, bram] });
  const full = bundleContents({ kind: "campaign", campaign, characters: [secretMira, bram], secrets: true });

  assert.deepEqual(shared.characters.map((entry) => entry.id), [mira.id]);
  assert.equal(shared.campaigns[0].sessions[0].secretNotes, "");
  assert.equal(shared.campaigns[0].sessions[0].notes, "fun");
  assert.deepEqual(shared.characters[0].journal.map((entry) => entry.id), ["j2"]);
  assert.equal(full.campaigns[0].sessions[0].secretNotes, "the twist");
  assert.equal(full.characters[0].journal.length, 2);
});
