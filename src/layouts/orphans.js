import { KIND_IDS } from "../records/kinds.js";

/**
 * Values of fields of your own whose definition is gone are kept aside (L-4). These helpers count them and, only when
 * the user asks, remove them. Pure: `known` is the set of field ids that some layout still declares.
 */
const CAMPAIGN_LISTS = ["roster", "sessions", "handouts"];

function clean(record, known, tally) {
  const stale = Object.keys(record.fields ?? {}).filter((key) => !known.has(key));

  if (!stale.length) {
    return record;
  }

  tally.removed += stale.length;
  return { ...record, fields: Object.fromEntries(Object.entries(record.fields).filter(([key]) => known.has(key))) };
}

function mapList(list, known, tally) {
  const next = list.map((record) => clean(record, known, tally));
  return next.some((record, index) => record !== list[index]) ? next : list;
}

/** Returns the library without stale values, and how many were removed; unchanged records keep their identity. */
export function purgeStaleValues(characters, campaigns, known) {
  const tally = { removed: 0 };
  const touched = new Set();

  const nextCharacters = characters.map((character) => {
    const before = tally.removed;
    let next = clean(character, known, tally);

    for (const kind of KIND_IDS) {
      if (kind === "inventory") {
        const items = mapList(character.inventory?.items ?? [], known, tally);
        next = items === (character.inventory?.items ?? []) ? next : { ...next, inventory: { ...character.inventory, items } };
      } else if (Array.isArray(character[kind])) {
        const list = mapList(character[kind], known, tally);
        next = list === character[kind] ? next : { ...next, [kind]: list };
      }
    }

    if (tally.removed !== before) {
      touched.add(character.id);
    }

    return next;
  });

  const nextCampaigns = campaigns.map((campaign) => {
    let next = clean(campaign, known, tally);

    for (const kind of CAMPAIGN_LISTS) {
      const list = mapList(campaign[kind] ?? [], known, tally);
      next = list === (campaign[kind] ?? []) ? next : { ...next, [kind]: list };
    }

    return next;
  });

  return { characters: nextCharacters, campaigns: nextCampaigns, removed: tally.removed, touchedCharacters: [...touched] };
}
