import { LIMITS } from "./limits.js";
import { normalizeStoredValues } from "./layouts/values.js";
import { normalizeList } from "./records/normalize.js";
import { createId, cleanText, finiteNumber, isPlainObject, isValidId, normalizeTags } from "./utils.js";

/**
 * Pure campaign model (K-1 to K-3). A campaign links to characters by id and never copies them.
 * It never imports the DOM or storage (A-1).
 */
export const CAMPAIGN_STATUSES = Object.freeze(["planning", "active", "paused", "finished"]);

export const CAMPAIGN_STATUS_LABELS = Object.freeze({ planning: "Planning", active: "Active", paused: "Paused", finished: "Finished" });

export const CAMPAIGN_LIMITS = Object.freeze({ name: 200, system: 100, description: 20000, expression: 100 });

const CAMPAIGN_FIELDS = new Set([
  "id",
  "name",
  "system",
  "description",
  "status",
  "tags",
  "roster",
  "sessions",
  "handouts",
  "partyColumns",
  "initiative",
  "initiativeExpression",
  "custom",
  "fields",
  "extensions",
  "createdAt",
  "updatedAt"
]);

const LISTS = ["roster", "sessions", "handouts", "partyColumns"];

/** Roster rows are unique per character; a row without a valid character is dropped. */
function uniqueRoster(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (!row.characterId || seen.has(row.characterId)) {
      return false;
    }

    seen.add(row.characterId);
    return true;
  });
}

export function normalizeInitiative(raw) {
  if (!isPlainObject(raw)) {
    return null;
  }

  const entries = normalizeList("initiative", raw.entries);
  const round = Math.min(100000, Math.max(1, Math.trunc(finiteNumber(raw.round, 1))));
  const turn = Math.min(Math.max(0, entries.length - 1), Math.max(0, Math.trunc(finiteNumber(raw.turn, 0))));
  return { round, turn, entries };
}

export function normalizeCampaign(raw, { now = Date.now() } = {}) {
  if (!isPlainObject(raw)) {
    return null;
  }

  const extensions = isPlainObject(raw.extensions) ? { ...raw.extensions } : {};
  const unknown = {};

  for (const key of Object.keys(raw)) {
    if (!CAMPAIGN_FIELDS.has(key)) {
      unknown[key] = raw[key];
    }
  }

  if (Object.keys(unknown).length) {
    extensions.unknown = { ...(isPlainObject(extensions.unknown) ? extensions.unknown : {}), ...unknown };
  }

  const createdAt = finiteNumber(raw.createdAt, now);
  const campaign = {
    id: isValidId(raw.id) ? raw.id : createId("camp"),
    name: cleanText(raw.name, CAMPAIGN_LIMITS.name),
    system: cleanText(raw.system, CAMPAIGN_LIMITS.system),
    description: cleanText(raw.description, CAMPAIGN_LIMITS.description),
    status: CAMPAIGN_STATUSES.includes(raw.status) ? raw.status : "planning",
    tags: normalizeTags(raw.tags, { max: LIMITS.tags, maxLength: LIMITS.tagLength }),
    initiativeExpression: cleanText(raw.initiativeExpression, CAMPAIGN_LIMITS.expression),
    fields: normalizeStoredValues(raw.fields),
    extensions,
    createdAt,
    updatedAt: finiteNumber(raw.updatedAt, createdAt)
  };

  for (const list of LISTS) {
    campaign[list] = normalizeList(list, raw[list]);
  }

  campaign.roster = uniqueRoster(campaign.roster);
  campaign.initiative = normalizeInitiative(raw.initiative);
  return campaign;
}

export function createCampaign(fields = {}, { now = Date.now(), bytes } = {}) {
  return normalizeCampaign({ name: "New campaign", ...fields, id: createId("camp", bytes), createdAt: now, updatedAt: now }, { now });
}

export function sameCampaign(left, right) {
  return JSON.stringify({ ...left, updatedAt: 0 }) === JSON.stringify({ ...right, updatedAt: 0 });
}

export function normalizeCampaigns(raw, { now = Date.now() } = {}) {
  const seen = new Set();
  const campaigns = [];

  for (const item of Array.isArray(raw) ? raw : []) {
    const campaign = normalizeCampaign(item, { now });

    if (campaign && !seen.has(campaign.id)) {
      seen.add(campaign.id);
      campaigns.push(campaign);

      if (campaigns.length >= LIMITS.campaigns) {
        break;
      }
    }
  }

  return campaigns;
}

export function campaignName(campaign) {
  return campaign.name.trim() || "Unnamed campaign";
}

/** The list a record kind lives in on a campaign; initiative entries sit inside `initiative`. */
export function campaignListOf(campaign, kindId) {
  return kindId === "initiative" ? campaign.initiative?.entries ?? [] : campaign[kindId];
}

export function campaignListPatch(campaign, kindId, list) {
  if (kindId === "initiative") {
    const base = campaign.initiative ?? { round: 1, turn: 0, entries: [] };
    return { initiative: { ...base, entries: list } };
  }

  return { [kindId]: list };
}

/** Campaigns a character belongs to, with its roster row. Derived; nothing is stored on the character (K-10). */
export function campaignsOf(campaigns, characterId) {
  const found = [];

  for (const campaign of campaigns) {
    const row = campaign.roster.find((entry) => entry.characterId === characterId);

    if (row) {
      found.push({ campaign, row });
    }
  }

  return found;
}

export function onRoster(campaign, characterId) {
  return campaign.roster.some((row) => row.characterId === characterId);
}

/** How many campaigns a character appears in, used by the delete confirmation. */
export function rosterCount(campaigns, characterId) {
  return campaigns.filter((campaign) => onRoster(campaign, characterId)).length;
}

/** The campaign with every trace of a deleted character removed (K-1). Returns the same object when there was none. */
export function withoutCharacter(campaign, characterId) {
  const roster = campaign.roster.filter((row) => row.characterId !== characterId);
  const entries = campaign.initiative?.entries.filter((entry) => entry.characterId !== characterId);
  const sessions = campaign.sessions.map((session) => (session.attendeeIds.includes(characterId) ? { ...session, attendeeIds: session.attendeeIds.filter((id) => id !== characterId) } : session));
  const changed = roster.length !== campaign.roster.length || (entries && entries.length !== campaign.initiative.entries.length) || sessions.some((session, index) => session !== campaign.sessions[index]);

  if (!changed) {
    return campaign;
  }

  const initiative = campaign.initiative ? normalizeInitiative({ ...campaign.initiative, entries }) : null;
  return { ...campaign, roster, sessions, initiative };
}

/** Puts back what `withoutCharacter` took from `after`, using `before` (an undo of a character delete). */
export function relinkCharacter(after, before, characterId) {
  const rows = before.roster.filter((row) => row.characterId === characterId && !onRoster(after, characterId));
  const entries = (before.initiative?.entries ?? []).filter((entry) => entry.characterId === characterId);
  const sessions = after.sessions.map((session) => {
    const old = before.sessions.find((entry) => entry.id === session.id);
    return old?.attendeeIds.includes(characterId) && !session.attendeeIds.includes(characterId) ? { ...session, attendeeIds: [...session.attendeeIds, characterId] } : session;
  });

  const current = after.initiative?.entries ?? [];
  const restored = entries.filter((entry) => !current.some((item) => item.id === entry.id));
  const initiative = restored.length ? normalizeInitiative({ ...(after.initiative ?? { round: 1, turn: 0 }), entries: [...current, ...restored] }) : after.initiative;
  return { ...after, roster: uniqueRoster([...after.roster, ...rows]), sessions, initiative };
}

/** Secret things are kept out of every shared view and export (K-9). One rule, used by all of them. */
export function isShared(record) {
  return !(record?.secret === true || record?.kind === "secret");
}

/** A plain-text recap of a session for the players, without secrets (K-8). */
export function recapText(campaign, session, characters) {
  const names = session.attendeeIds.map((id) => characters.find((character) => character.id === id)?.name || "Unknown").filter(Boolean);
  const lines = [`${session.title || "Session"}${session.date ? ` (${session.date})` : ""}`, campaignName(campaign)];

  if (names.length) {
    lines.push(`Present: ${names.join(", ")}`);
  }

  if (session.notes.trim()) {
    lines.push("", session.notes.trim());
  }

  return lines.join("\n");
}
