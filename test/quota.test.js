import assert from "node:assert/strict";
import test from "node:test";
import { fitsInQuota, largestFiles, quotaLevel } from "../src/quota.js";

test("quota levels follow the warn and refuse lines", () => {
  assert.equal(quotaLevel(50, 100).level, "ok");
  assert.equal(quotaLevel(80, 100).level, "warn");
  assert.equal(quotaLevel(95, 100).level, "full");
  assert.equal(quotaLevel(null, 100).level, "unknown");
  assert.equal(quotaLevel(5, 0).level, "unknown");
});

test("a file fits only below the refuse line, and an unknown quota always fits", () => {
  assert.equal(fitsInQuota(90, 100, 4), true);
  assert.equal(fitsInQuota(90, 100, 5), false);
  assert.equal(fitsInQuota(null, null, 1e12), true);
});

test("largest files are sorted and name their owner", () => {
  const characters = [{ name: "Mira", portraitBlobId: "b1", documents: [{ blobId: "b2", name: "Sheet" }], familiars: [] }];
  const campaigns = [{ name: "Fight", handouts: [{ blobId: "b3", name: "Map" }] }];
  const blobs = [{ id: "b1", size: 10 }, { id: "b2", size: 300 }, { id: "b3", size: 20 }, { id: "b4", size: 5 }];
  const top = largestFiles(blobs, characters, campaigns, 3);

  assert.deepEqual(top.map((file) => file.id), ["b2", "b3", "b1"]);
  assert.equal(top[0].owner, "Mira: Sheet");
  assert.equal(top[1].owner, "Fight: Map");
  assert.equal(largestFiles(blobs, characters, campaigns, 10).at(-1).owner, "Unused");
});
