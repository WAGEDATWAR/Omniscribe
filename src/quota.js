import { LIMITS } from "./limits.js";

/** Pure storage-pressure maths (DEF-033, `docs/EXCHANGE.md` 6). `usage` and `quota` are bytes, or null when unknown. */
export function quotaLevel(usage, quota, { warnAt = LIMITS.backupWarnAt, refuseAt = LIMITS.quotaRefuseAt } = {}) {
  if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) {
    return { level: "unknown", ratio: null };
  }

  const ratio = usage / quota;
  return { level: ratio >= refuseAt ? "full" : ratio >= warnAt ? "warn" : "ok", ratio };
}

/** Whether a new file of `size` bytes still fits under the refuse line. Unknown quota always fits. */
export function fitsInQuota(usage, quota, size, { refuseAt = LIMITS.quotaRefuseAt } = {}) {
  if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) {
    return true;
  }

  return (usage + size) / quota < refuseAt;
}

/** The biggest stored files, each with what owns it, for the Data page's per-file list. */
export function largestFiles(blobs, characters, campaigns = [], limit = 10) {
  const owners = new Map();

  for (const character of characters) {
    const name = character.name?.trim() || "Unnamed character";

    if (character.portraitBlobId) {
      owners.set(character.portraitBlobId, `${name} (portrait)`);
    }

    for (const familiar of character.familiars ?? []) {
      if (familiar.portraitBlobId) {
        owners.set(familiar.portraitBlobId, `${name} (familiar portrait)`);
      }
    }

    for (const document of character.documents ?? []) {
      owners.set(document.blobId, `${name}: ${document.name}`);
    }
  }

  for (const campaign of campaigns) {
    for (const handout of campaign.handouts ?? []) {
      if (handout.blobId) {
        owners.set(handout.blobId, `${campaign.name?.trim() || "Unnamed campaign"}: ${handout.name}`);
      }
    }
  }

  return [...blobs]
    .sort((left, right) => (right.size ?? 0) - (left.size ?? 0))
    .slice(0, limit)
    .map((blob) => ({ id: blob.id, size: blob.size ?? 0, owner: owners.get(blob.id) ?? "Unused" }));
}
