import { CAMPAIGN_KINDS, KINDS } from "../records/kinds.js";

/**
 * The pages whose fields a layout arranges, and each one's default sections (docs/LAYOUTS.md 3). Generated from the
 * record descriptors so the default is always the current app's, and never stored.
 */
const CHARACTER = [
  {
    id: "identity",
    title: "Identity",
    fields: [
      { key: "name", type: "text", label: "Name", required: true },
      { key: "player", type: "text", label: "Player" },
      { key: "systemId", type: "text", label: "Game system" },
      { key: "status", type: "choice", label: "Status" },
      { key: "summary", type: "long", label: "Summary", wide: true },
      { key: "tags", type: "tags", label: "Tags", wide: true }
    ]
  },
  { id: "notes", title: "Notes", fields: [{ key: "notes", type: "long", label: "Notes", wide: true }] }
];

const CAMPAIGN = [
  {
    id: "details",
    title: "Details",
    fields: [
      { key: "name", type: "text", label: "Name", required: true },
      { key: "status", type: "choice", label: "Status" },
      { key: "system", type: "text", label: "Game system", hint: "Free text; a campaign may mix systems." },
      { key: "tags", type: "tags", label: "Tags", wide: true },
      { key: "description", type: "long", label: "Description", wide: true },
      { key: "initiativeExpression", type: "text", label: "Initiative roll", hint: "Optional. Empty uses the game system's, then 1d20." }
    ]
  }
];

const RECORD_SURFACES = ["inventory", "abilities", "journal", "relations", "progression", "familiars", "roster", "sessions", "handouts"];

function fromKind(kind) {
  return [
    {
      id: "main",
      title: "",
      fields: kind.fields
        .filter((field) => !field.hidden)
        .map((field) => ({ key: field.key, type: field.type, label: field.label, hint: field.hint, wide: field.type === "long", required: field.key === kind.title || field.required === true }))
    }
  ];
}

export const SURFACE_IDS = Object.freeze(["character", "campaign", ...RECORD_SURFACES]);

export function isSurface(id) {
  return SURFACE_IDS.includes(id);
}

/** The default sections of a surface: `[{ id, title, fields: [{ key, type, label, hint?, wide, required }] }]`. */
export function defaultSections(surface) {
  if (surface === "character") {
    return CHARACTER;
  }

  if (surface === "campaign") {
    return CAMPAIGN;
  }

  const kind = KINDS[surface] ?? CAMPAIGN_KINDS[surface];
  return kind ? fromKind(kind) : [];
}
