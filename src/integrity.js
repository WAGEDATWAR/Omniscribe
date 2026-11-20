/** Pure reachability checks over blobs. A blob is wanted if a character points at it (P-17). */
export function referencedBlobIds(characters, campaigns = []) {
  const ids = new Set();

  for (const campaign of campaigns) {
    for (const handout of campaign.handouts ?? []) {
      if (handout.blobId) {
        ids.add(handout.blobId);
      }
    }
  }

  for (const character of characters) {
    if (character.portraitBlobId) {
      ids.add(character.portraitBlobId);
    }

    for (const familiar of character.familiars ?? []) {
      if (familiar.portraitBlobId) {
        ids.add(familiar.portraitBlobId);
      }
    }

    for (const document of character.documents ?? []) {
      ids.add(document.blobId);
    }
  }

  return ids;
}

/** Blobs that nothing references and that are at least `graceMs` old. */
export function findOrphanBlobs(characters, blobs, { now = Date.now(), graceMs = 0, campaigns = [] } = {}) {
  const wanted = referencedBlobIds(characters, campaigns);
  return blobs.filter((blob) => !wanted.has(blob.id) && now - (blob.addedAt ?? 0) >= graceMs);
}
