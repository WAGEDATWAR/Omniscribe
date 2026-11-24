import { LIMITS } from "./limits.js";

/**
 * Pure revision rules (P-6, P-7, X-7): a revision is a snapshot of one character. These functions decide what to
 * store and what to drop; storage and timing are the controller's job.
 */
export const REVISION_PREFIX = "rev_";
export const SESSION_GAP_MS = 30 * 60 * 1000;
export const DELETED_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

const LABELS = {
  name: "name",
  player: "player",
  summary: "summary",
  notes: "notes",
  tags: "tags",
  status: "status",
  sheet: "sheet",
  documents: "PDF sheets",
  inventory: "inventory",
  abilities: "abilities",
  journal: "journal",
  relations: "relations",
  progression: "progression",
  familiars: "familiars",
  custom: "your own fields",
  wallets: "money",
  portraitBlobId: "portrait"
};

/** A stable signature of a character's content, ignoring when it was last touched. */
export function signatureOf(character) {
  const text = JSON.stringify(character, (key, value) => (key === "updatedAt" ? undefined : value));
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 2654435761);
    b = Math.imul(b ^ code, 1597334677);
  }

  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return `${(b >>> 0).toString(16).padStart(8, "0")}${(a >>> 0).toString(16).padStart(8, "0")}${text.length.toString(16)}`;
}

export function makeRevision(character, { id, at, label = "" }) {
  const data = JSON.parse(JSON.stringify(character));
  return { id, characterId: character.id, at, label: String(label).slice(0, 80), signature: signatureOf(character), size: JSON.stringify(data).length, data };
}

/** Whether a new editing session has begun, so the state before it is worth keeping. */
export function sessionDue(lastAt, now) {
  return !Number.isFinite(lastAt) || now - lastAt >= SESSION_GAP_MS;
}

/**
 * Decides what a new revision does to the stored set: nothing when it repeats the latest one for that character,
 * otherwise it is added and the set is pruned to the per-character and total bounds, dropping unlabelled and oldest first.
 */
export function planRevisions(existing, revision, { perCharacter = LIMITS.revisionsPerCharacter, totalBytes = LIMITS.revisionBytes } = {}) {
  const mine = existing.filter((entry) => entry.characterId === revision.characterId).sort((a, b) => b.at - a.at);

  if (mine[0]?.signature === revision.signature && !revision.label) {
    return { add: null, remove: [] };
  }

  const remove = new Set();
  const order = (entries) => [...entries].sort((a, b) => Number(Boolean(a.label)) - Number(Boolean(b.label)) || a.at - b.at);
  const own = [revision, ...mine];

  for (const entry of order(own).slice(0, Math.max(0, own.length - perCharacter))) {
    remove.add(entry.id);
  }

  let total = [...existing, revision].filter((entry) => !remove.has(entry.id)).reduce((sum, entry) => sum + entry.size, 0);

  for (const entry of order([...existing, revision].filter((item) => !remove.has(item.id) && item.id !== revision.id))) {
    if (total <= totalBytes) {
      break;
    }

    remove.add(entry.id);
    total -= entry.size;
  }

  return { add: remove.has(revision.id) ? null : revision, remove: [...remove].filter((id) => id !== revision.id) };
}

/** A short line saying what differs between two states of a character, such as "sheet, 3 inventory entries added". */
export function describeChange(older, newer) {
  const parts = [];

  for (const [key, label] of Object.entries(LABELS)) {
    const before = older?.[key];
    const after = newer?.[key];

    if (JSON.stringify(before) === JSON.stringify(after)) {
      continue;
    }

    if (Array.isArray(before) && Array.isArray(after) && before.length !== after.length) {
      const delta = after.length - before.length;
      parts.push(`${Math.abs(delta)} ${label} ${Math.abs(delta) === 1 ? "entry" : "entries"} ${delta > 0 ? "added" : "removed"}`);
    } else {
      parts.push(label);
    }
  }

  return parts.length ? parts.slice(0, 5).join(", ") + (parts.length > 5 ? ` and ${parts.length - 5} more` : "") : "No difference";
}

/** Revisions of characters that are gone and older than the keep window; returns their ids. */
export function expiredRevisions(revisions, liveIds, now, keepMs = DELETED_KEEP_MS) {
  const live = new Set(liveIds);
  return revisions.filter((entry) => !live.has(entry.characterId) && now - entry.at > keepMs).map((entry) => entry.id);
}

/** For each deleted character, its newest revision, newest first: the recently deleted list. */
export function deletedCharacters(revisions, liveIds) {
  const live = new Set(liveIds);
  const latest = new Map();

  for (const entry of revisions) {
    if (!live.has(entry.characterId) && (!latest.has(entry.characterId) || latest.get(entry.characterId).at < entry.at)) {
      latest.set(entry.characterId, entry);
    }
  }

  return [...latest.values()].sort((a, b) => b.at - a.at);
}
