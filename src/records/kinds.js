/**
 * Every list a character carries is described here as data (C-1, C-11). The normalizer, the store and the
 * generic page all read these descriptors, so a new kind of record, or a new field on an existing one, is a
 * descriptor change and not a new code path.
 *
 * Field types: text, long, int, num, bool, tags, choice, date, id, ids, uses, sheet.
 * `nullable` fields keep `null` for "none"; `suggest` is a list of ideas shown while typing, never a limit.
 */
export const RECORD_LIMITS = Object.freeze({
  custom: 30,
  customLabel: 60,
  customText: 500,
  wallets: 20,
  currencyKey: 12,
  walletMax: 1e12
});

export const KINDS = Object.freeze({
  inventory: {
    id: "inventory",
    prefix: "item",
    label: "Inventory",
    noun: "item",
    nouns: "items",
    limit: 2000,
    title: "name",
    summary: ["quantity", "weight"],
    empty: "Add what this character carries: gear, treasure, a bag of holding. Weight and containers are optional.",
    fields: [
      { key: "name", type: "text", max: 200, label: "Name", required: true },
      { key: "quantity", type: "int", min: 0, max: 999999, def: 1, label: "Quantity" },
      { key: "weight", type: "num", min: 0, max: 1e9, def: 0, label: "Weight each" },
      { key: "value", type: "num", min: 0, max: 1e12, def: 0, label: "Value each" },
      { key: "isContainer", type: "bool", def: false, label: "Holds other items" },
      { key: "weightMultiplier", type: "num", min: 0, max: 1000, def: 1, label: "Contents weigh x", hint: "A bag of holding is 0.1; leave 1 for normal." },
      { key: "equipped", type: "bool", def: false, label: "Equipped" },
      { key: "attuned", type: "bool", def: false, label: "Attuned" },
      { key: "containerId", type: "id", nullable: true, label: "Inside", hidden: true },
      { key: "tags", type: "tags", label: "Tags" },
      { key: "notes", type: "long", max: 5000, label: "Notes" }
    ]
  },
  abilities: {
    id: "abilities",
    prefix: "abil",
    label: "Abilities",
    noun: "ability",
    nouns: "abilities",
    limit: 1000,
    title: "name",
    summary: ["kind", "summary"],
    empty: "Write down features, spells, powers and techniques, including ones no game system lists.",
    fields: [
      { key: "name", type: "text", max: 200, label: "Name", required: true },
      { key: "kind", type: "text", max: 60, label: "Kind", suggest: ["Feature", "Spell", "Power", "Technique", "Feat", "Trait"] },
      { key: "source", type: "text", max: 120, label: "Source", hint: "A class, an item, a race." },
      { key: "summary", type: "text", max: 300, label: "Summary" },
      { key: "text", type: "long", max: 20000, label: "Description" },
      { key: "uses", type: "uses", label: "Uses" },
      { key: "expression", type: "text", max: 300, label: "Roll", mono: true, hint: "Optional dice, such as 2d6 + @str.mod." },
      { key: "critMin", type: "int", min: 2, max: 1000000, nullable: true, def: null, label: "Critical from" },
      { key: "tags", type: "tags", label: "Tags" }
    ]
  },
  journal: {
    id: "journal",
    prefix: "jrnl",
    label: "Journal",
    noun: "entry",
    nouns: "entries",
    limit: 2000,
    title: "title",
    summary: ["date", "kind"],
    empty: "Keep session notes, goals, recaps and secrets here. Entries are plain text.",
    fields: [
      { key: "title", type: "text", max: 200, label: "Title", required: true },
      { key: "date", type: "date", label: "Date", today: true },
      { key: "kind", type: "choice", values: ["note", "session", "goal", "secret", "recap"], def: "note", label: "Kind" },
      { key: "text", type: "long", max: 20000, label: "Text" },
      { key: "done", type: "bool", def: false, label: "Done" },
      { key: "tags", type: "tags", label: "Tags" }
    ]
  },
  relations: {
    id: "relations",
    prefix: "rel",
    label: "Relations",
    noun: "relation",
    nouns: "relations",
    limit: 500,
    title: "targetName",
    summary: ["kind", "attitude"],
    empty: "Note who this character knows: allies, rivals, family, patrons, factions.",
    fields: [
      { key: "targetName", type: "text", max: 200, label: "Who", required: true },
      { key: "targetType", type: "choice", values: ["npc", "character", "faction"], def: "npc", label: "Is a" },
      { key: "targetId", type: "id", nullable: true, label: "Character", hidden: true },
      { key: "kind", type: "text", max: 60, label: "Kind", suggest: ["Ally", "Rival", "Family", "Mentor", "Patron", "Enemy"] },
      { key: "attitude", type: "int", min: -5, max: 5, def: 0, label: "Attitude" },
      { key: "notes", type: "long", max: 5000, label: "Notes" }
    ]
  },
  progression: {
    id: "progression",
    prefix: "prog",
    label: "Progression",
    noun: "entry",
    nouns: "entries",
    limit: 2000,
    title: "label",
    summary: ["kind", "delta"],
    empty: "Log experience, levels and milestones so the story of this character stays visible.",
    fields: [
      { key: "label", type: "text", max: 200, label: "What happened", required: true },
      { key: "kind", type: "choice", values: ["xp", "level", "milestone", "other"], def: "milestone", label: "Kind" },
      { key: "delta", type: "num", min: -1e9, max: 1e9, nullable: true, def: null, label: "Amount" },
      { key: "date", type: "date", label: "Date", today: false },
      { key: "applied", type: "bool", def: false, label: "Applied to the sheet", hidden: true },
      { key: "at", type: "num", min: 0, max: 8.64e15, def: 0, label: "Recorded", hidden: true },
      { key: "notes", type: "long", max: 5000, label: "Notes" }
    ]
  },
  familiars: {
    id: "familiars",
    prefix: "fam",
    label: "Familiars",
    noun: "familiar",
    nouns: "familiars",
    limit: 50,
    title: "name",
    summary: ["kind", "summoned"],
    empty: "Track a familiar, mount, companion or summon, with its own sheet if you want one.",
    fields: [
      { key: "name", type: "text", max: 200, label: "Name", required: true },
      { key: "kind", type: "text", max: 60, label: "Kind", suggest: ["Familiar", "Mount", "Companion", "Summon"] },
      { key: "summoned", type: "bool", def: false, label: "Present now" },
      { key: "portraitBlobId", type: "id", nullable: true, label: "Portrait", hidden: true },
      { key: "sheet", type: "sheet", label: "Sheet", hidden: true },
      { key: "linkedCharacterId", type: "id", nullable: true, label: "Linked character", hidden: true },
      { key: "notes", type: "long", max: 5000, label: "Notes" }
    ]
  }
});


/** Records that live on a campaign (K-3). They use the same descriptors, normalizer and list page as a character's. */
export const CAMPAIGN_KINDS = Object.freeze({
  roster: {
    id: "roster",
    prefix: "rost",
    label: "Roster",
    noun: "member",
    nouns: "members",
    limit: 100,
    title: "role",
    summary: ["role", "status"],
    empty: "Add the characters who play in this campaign, with a role and a status for each.",
    fields: [
      { key: "characterId", type: "id", nullable: true, label: "Character", hidden: true },
      { key: "role", type: "text", max: 60, label: "Role", suggest: ["Player character", "Companion", "Guest", "Retainer"] },
      { key: "status", type: "text", max: 60, label: "Status", suggest: ["Active", "Away", "Retired", "Dead"] },
      { key: "joinedAt", type: "date", label: "Joined", today: true },
      { key: "notes", type: "long", max: 5000, label: "Notes" }
    ]
  },
  sessions: {
    id: "sessions",
    prefix: "sess",
    label: "Sessions",
    noun: "session",
    nouns: "sessions",
    limit: 1000,
    title: "title",
    summary: ["date"],
    empty: "Log each session: its date, who came and what happened. Notes are plain text.",
    fields: [
      { key: "title", type: "text", max: 200, label: "Title", required: true },
      { key: "date", type: "date", label: "Date", today: true },
      { key: "attendeeIds", type: "ids", label: "Attendees", hidden: true },
      { key: "notes", type: "long", max: 20000, label: "Notes" },
      { key: "secretNotes", type: "long", max: 20000, label: "Secret notes", hint: "Kept out of recaps and shared views." }
    ]
  },
  handouts: {
    id: "handouts",
    prefix: "hand",
    label: "Handouts",
    noun: "handout",
    nouns: "handouts",
    limit: 100,
    title: "name",
    summary: ["kind"],
    empty: "Attach images and PDFs the table should see: maps, letters, portraits.",
    fields: [
      { key: "name", type: "text", max: 200, label: "Name", required: true },
      { key: "blobId", type: "id", nullable: true, label: "File", hidden: true },
      { key: "size", type: "num", min: 0, max: 1e10, def: 0, label: "Size", hidden: true },
      { key: "kind", type: "choice", values: ["image", "pdf"], def: "image", label: "Kind", hidden: true },
      { key: "notes", type: "long", max: 5000, label: "Notes" }
    ]
  },
  partyColumns: {
    id: "partyColumns",
    prefix: "col",
    label: "Party columns",
    noun: "column",
    nouns: "columns",
    limit: 12,
    title: "label",
    summary: ["ref"],
    empty: "Choose which sheet values the party view shows, such as @hp.current.",
    fields: [
      { key: "label", type: "text", max: 60, label: "Label", required: true },
      { key: "ref", type: "text", max: 200, label: "Value", mono: true, hint: "A sheet formula, such as @hp.current or @ac." }
    ]
  },
  initiative: {
    id: "initiative",
    prefix: "init",
    label: "Initiative",
    noun: "combatant",
    nouns: "combatants",
    limit: 100,
    title: "name",
    summary: ["value"],
    empty: "Add the roster or any combatant to start tracking turns.",
    fields: [
      { key: "name", type: "text", max: 200, label: "Name", required: true },
      { key: "characterId", type: "id", nullable: true, label: "Character", hidden: true },
      { key: "value", type: "num", min: -1e6, max: 1e6, def: 0, label: "Initiative" },
      { key: "tiebreak", type: "int", min: -1000, max: 1000, def: 0, label: "Tiebreak" },
      { key: "hp", type: "text", max: 20, label: "Hit points" },
      { key: "note", type: "text", max: 300, label: "Note" },
      { key: "done", type: "bool", def: false, label: "Turn taken", hidden: true }
    ]
  }
});

const ALL_KINDS = Object.freeze({ ...KINDS, ...CAMPAIGN_KINDS });

export const KIND_IDS = Object.freeze(Object.keys(KINDS));

export function kindOf(id) {
  return Object.prototype.hasOwnProperty.call(ALL_KINDS, id) ? ALL_KINDS[id] : null;
}
