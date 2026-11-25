import { campaignListOf, campaignName } from "./campaigns.js";
import { LIMITS } from "./limits.js";
import { CAMPAIGN_KINDS, KINDS } from "./records/kinds.js";
import { listOf } from "./records/normalize.js";
import { displayName } from "./schema.js";

/**
 * Pure search over the library (X-10). `buildIndex` flattens records into entries; `search` ranks them. Matching is
 * case- and accent-insensitive, every word must match, and a match in the title beats one in the body. Secret session
 * notes are never indexed.
 */
export function fold(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const TEXT_TYPES = new Set(["text", "long", "tags", "choice"]);
const NEVER_INDEXED = new Set(["secretNotes"]);

function bodyOf(descriptor, record, labels) {
  const parts = [];

  for (const field of descriptor.fields) {
    if (!TEXT_TYPES.has(field.type) || NEVER_INDEXED.has(field.key) || field.key === descriptor.title) {
      continue;
    }

    const value = record[field.key];

    if (Array.isArray(value)) {
      parts.push(value.join(" "));
    } else if (typeof value === "string" && value) {
      parts.push(value);
    }
  }

  for (const [id, value] of Object.entries(record.fields ?? {})) {
    if (labels.has(id) && value !== false && value !== null && value !== "") {
      parts.push(`${labels.get(id)} ${Array.isArray(value) ? value.join(" ") : value === true ? "" : value}`);
    }
  }

  return parts.join(" ");
}

function entry({ kind, title, detail, body = "", route }) {
  return { kind, title: String(title ?? "").trim() || "Untitled", detail, route, foldedTitle: fold(title), folded: fold(`${title} ${body}`) };
}

export function buildIndex(characters, campaigns, labels = new Map()) {
  const entries = [];

  for (const character of characters) {
    const name = displayName(character);

    entries.push(
      entry({
        kind: "Character",
        title: name,
        detail: [character.player, character.systemId].filter((part) => part?.trim()).join(" · "),
        body: [character.player, character.systemId, character.summary, character.notes, character.tags.join(" "), bodyOf({ fields: [] }, character, labels)].join(" "),
        route: { view: "character", id: character.id, sub: "overview" }
      })
    );

    for (const [kindId, descriptor] of Object.entries(KINDS)) {
      for (const record of listOf(character, kindId)) {
        entries.push(
          entry({
            kind: descriptor.label,
            title: record[descriptor.title],
            detail: name,
            body: bodyOf(descriptor, record, labels),
            route: { view: "character", id: character.id, sub: kindId }
          })
        );
      }
    }
  }

  for (const campaign of campaigns) {
    const name = campaignName(campaign);

    entries.push(
      entry({
        kind: "Campaign",
        title: name,
        detail: campaign.system,
        body: [campaign.system, campaign.description, campaign.tags.join(" "), bodyOf({ fields: [] }, campaign, labels)].join(" "),
        route: { view: "campaign", id: campaign.id, sub: "overview" }
      })
    );

    for (const kindId of ["roster", "sessions", "handouts"]) {
      const descriptor = CAMPAIGN_KINDS[kindId];

      for (const record of campaignListOf(campaign, kindId)) {
        const rosterName = kindId === "roster" ? characters.find((character) => character.id === record.characterId)?.name : null;

        entries.push(
          entry({
            kind: descriptor.label,
            title: rosterName ?? record[descriptor.title],
            detail: name,
            body: bodyOf(descriptor, record, labels),
            route: { view: "campaign", id: campaign.id, sub: kindId }
          })
        );
      }
    }
  }

  return entries;
}

/** Ranks entries for a query. Returns `{ hits, total, truncated }`; each hit is an entry. */
export function search(index, query, limit = LIMITS.searchResults) {
  const words = fold(query).split(/\s+/).filter(Boolean);

  if (!words.length) {
    return { hits: [], total: 0, truncated: false };
  }

  const scored = [];

  index.forEach((item, order) => {
    if (!words.every((word) => item.folded.includes(word))) {
      return;
    }

    let score = 0;

    for (const word of words) {
      const at = item.foldedTitle.indexOf(word);
      score += at === 0 ? 0 : at > 0 ? (item.foldedTitle[at - 1] === " " ? 1 : 3) : 10;
    }

    scored.push({ item, score, order });
  });

  scored.sort((left, right) => left.score - right.score || left.order - right.order);
  return { hits: scored.slice(0, limit).map((row) => row.item), total: scored.length, truncated: scored.length > limit };
}
