import { LIMITS } from "../limits.js";
import { findOrphanBlobs } from "../integrity.js";

/**
 * Deletes blobs that no character points at (P-17). `graceMs` protects an upload another tab has not
 * saved yet; an explicit cleanup passes 0. Returns what was removed.
 */
export async function collectUnusedFiles({ storage, characters, campaigns = [], graceMs = LIMITS.orphanGraceMs, now = Date.now() }) {
  const revisions = (await storage.listRevisions?.().catch(() => [])) ?? [];
  const orphans = findOrphanBlobs(characters, await storage.listBlobs(), { now, graceMs, campaigns, revisions });

  if (orphans.length) {
    await storage.deleteBlobs(orphans.map((blob) => blob.id));
  }

  return orphans;
}
