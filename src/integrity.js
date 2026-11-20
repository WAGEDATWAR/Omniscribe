/** Pure reachability checks over blobs. A blob is wanted if a character points at it (P-17). */
export function referencedBlobIds(characters) {
  const ids = new Set();

  for (const character of characters) {
    if (character.portraitBlobId) {
      ids.add(character.portraitBlobId);
    }

    for (const document of character.documents ?? []) {
      ids.add(document.blobId);
    }
  }

  return ids;
}

/** Blobs that nothing references and that are at least `graceMs` old. */
export function findOrphanBlobs(characters, blobs, { now = Date.now(), graceMs = 0 } = {}) {
  const wanted = referencedBlobIds(characters);
  return blobs.filter((blob) => !wanted.has(blob.id) && now - (blob.addedAt ?? 0) >= graceMs);
}
