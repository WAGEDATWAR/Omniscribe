import { repairContainers } from "./inventory.js";

/** Pure reachability checks over blobs. A blob is wanted if a character points at it (P-17). */
export function referencedBlobIds(characters, campaigns = [], revisions = []) {
  const ids = new Set();

  for (const revision of revisions) {
    for (const id of referencedBlobIds([revision.data])) {
      ids.add(id);
    }
  }

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
export function findOrphanBlobs(characters, blobs, { now = Date.now(), graceMs = 0, campaigns = [], revisions = [] } = {}) {
  const wanted = referencedBlobIds(characters, campaigns, revisions);
  return blobs.filter((blob) => !wanted.has(blob.id) && now - (blob.addedAt ?? 0) >= graceMs);
}

/**
 * Everything a library can get wrong that has a safe repair (P-9, `docs/EXCHANGE.md` 9). Pure: it returns the
 * repaired records (unchanged ones keep their identity), the touched character and campaign ids, and one finding
 * per fix. `storedBlobIds` is the set of files that exist; a missing one clears its reference and keeps the record.
 */
export function repairLibrary(characters, campaigns, storedBlobIds) {
  const live = new Set(characters.map((character) => character.id));
  const findings = [];
  const touchedCharacters = new Set();
  const touchedCampaigns = new Set();
  const missing = (id) => Boolean(id) && !storedBlobIds.has(id);

  const nextCharacters = characters.map((character) => {
    let next = character;
    const name = character.name?.trim() || "Unnamed character";
    const change = (patch, finding) => {
      next = { ...next, ...patch };
      touchedCharacters.add(character.id);
      findings.push({ ...finding, owner: name });
    };

    if (missing(character.portraitBlobId)) {
      change({ portraitBlobId: null }, { type: "missing-file", text: "Portrait file is missing" });
    }

    const documents = (character.documents ?? []).filter((entry) => !missing(entry.blobId));

    if (documents.length !== (character.documents ?? []).length) {
      const dropped = character.documents.length - documents.length;
      change({ documents, pdf: documents.some((entry) => entry.id === character.pdf?.uploadedId) ? character.pdf : { ...character.pdf, preference: "generated", uploadedId: null } }, { type: "missing-file", text: `${dropped} PDF sheet${dropped === 1 ? "" : "s"} with a missing file removed` });
    }

    const familiars = (character.familiars ?? []).map((familiar) => {
      let fixed = familiar;

      if (missing(familiar.portraitBlobId)) {
        fixed = { ...fixed, portraitBlobId: null };
      }

      if (familiar.linkedCharacterId && !live.has(familiar.linkedCharacterId)) {
        fixed = { ...fixed, linkedCharacterId: null };
      }

      return fixed;
    });

    if (familiars.some((familiar, index) => familiar !== character.familiars[index])) {
      change({ familiars }, { type: "dead-link", text: "A familiar pointed at a missing file or character" });
    }

    const relations = (character.relations ?? []).map((row) => (row.targetId && !live.has(row.targetId) ? { ...row, targetId: null } : row));

    if (relations.some((row, index) => row !== character.relations[index])) {
      change({ relations }, { type: "dead-link", text: "A relation pointed at a character that no longer exists and is now unlinked" });
    }

    const items = character.inventory?.items ?? [];
    const repaired = repairContainers(items);

    if (repaired.some((item, index) => item.containerId !== items[index].containerId)) {
      change({ inventory: { ...character.inventory, items: repaired } }, { type: "bad-container", text: "An item sat inside something that is not a container, or in a loop, and was taken out" });
    }

    return next;
  });

  const nextCampaigns = campaigns.map((campaign) => {
    let next = campaign;
    const name = campaign.name?.trim() || "Unnamed campaign";
    const roster = campaign.roster.filter((row) => live.has(row.characterId));
    const entries = (campaign.initiative?.entries ?? []).filter((entry) => !entry.characterId || live.has(entry.characterId));
    const sessions = campaign.sessions.map((session) => (session.attendeeIds.every((id) => live.has(id)) ? session : { ...session, attendeeIds: session.attendeeIds.filter((id) => live.has(id)) }));
    const handouts = campaign.handouts.map((handout) => (missing(handout.blobId) ? { ...handout, blobId: null } : handout));

    const note = (patch, finding) => {
      next = { ...next, ...patch };
      touchedCampaigns.add(campaign.id);
      findings.push({ ...finding, owner: name });
    };

    if (roster.length !== campaign.roster.length) {
      note({ roster }, { type: "dead-roster", text: `${campaign.roster.length - roster.length} roster row${campaign.roster.length - roster.length === 1 ? "" : "s"} for missing characters removed` });
    }

    if (entries.length !== (campaign.initiative?.entries ?? []).length) {
      note({ initiative: { ...campaign.initiative, entries } }, { type: "dead-roster", text: "Initiative entries for missing characters removed" });
    }

    if (sessions.some((session, index) => session !== campaign.sessions[index])) {
      note({ sessions }, { type: "dead-roster", text: "Session attendees who no longer exist removed" });
    }

    if (handouts.some((handout, index) => handout !== campaign.handouts[index])) {
      note({ handouts }, { type: "missing-file", text: "A handout's file is missing; the handout is kept without it" });
    }

    return next;
  });

  return { characters: nextCharacters, campaigns: nextCampaigns, touchedCharacters: [...touchedCharacters], touchedCampaigns: [...touchedCampaigns], findings };
}
