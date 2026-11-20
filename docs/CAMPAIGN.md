# CAMPAIGN - campaigns: roster, party view, sessions, initiative, handouts

> **Scope.** This document owns the campaign record and the pages that run a game from it. Characters and their
> records are `docs/CHARACTER.md`; rolls are `docs/DICE.md`; storage and the one-writer store are
> `docs/PERSISTENCE.md` and `docs/ARCHITECTURE.md`. Choices are `DECISIONS.md` G-14 and K-1 to K-12.

**Status:** designed (P5). Nothing below is built yet; `TODO.md` says which parts exist.

---

## 1. The one idea

> A campaign **links** to characters and never copies them. Everything it shows about a character is read from
> that character's own sheet at the moment you look.

A roster row holds a character id (G-14). The party view, the initiative order and the session attendees all
resolve ids against the library. Delete a character and its roster rows go with it, said in the confirmation.
Delete a campaign and every character stays.

A campaign is for the person who **runs** the game (the fourth job in the charter), but a player who keeps
several characters in one campaign uses the same pages. There is one user and no accounts; "secret" below
means *kept out of the shared views and exports*, not access control (K-9).

## 2. The campaign record

```text
Campaign {
  id,                       // camp_ prefix, never reused
  name, system,             // system: free text, optional (a campaign may mix systems)
  description, status,      // status: planning | active | paused | finished
  tags: string[],
  roster:    RosterRow[],   // up to 100
  sessions:  Session[],     // up to 1000
  handouts:  Handout[],     // up to 100
  initiative: Initiative | null,
  partyColumns: PartyColumn[],   // up to 12
  custom: Field[],          // fields of your own, as every record (C-11)
  extensions,               // unknown keys survive
  createdAt, updatedAt
}
RosterRow { id (rost_), characterId, role, status, joinedAt, notes, custom }   // role and status are free text with suggestions
Session   { id (sess_), date, title, notes, attendeeIds: string[], secretNotes, custom }
Handout   { id (hand_), blobId, name, size, kind: "image" | "pdf", notes }
```

- Roster, sessions and handouts are **record kinds described by data** like the character pages (C-11): the
  normalizer, store methods, limits and the generic list page all read a descriptor, and every row takes fields
  of your own. A roster row is unique per character within a campaign.
- A character can be in **many** campaigns and has a different role and status in each. The character's
  Overview gets a "Campaigns" panel listing them with links and a button to add it to a campaign (so the
  assignment can be made from either side). It stores nothing: it is derived from the campaigns.
- Status values on a roster row suggest `active`, `away`, `retired`, `dead`; they are text, not a closed set.

## 3. The store, history and storage

Campaigns are a second collection beside characters, owned by the same single writer (A-2).

- `store` state becomes `{ characters, campaigns }`. Both are immutable arrays of immutable records; a history
  step is a snapshot of **both**, so one Undo reverts a change that touched a character and a campaign together
  (deleting a character that sat on rosters is one step).
- Dirty tracking is per collection by reference comparison (P-10). Autosave writes `characters` and
  `campaigns` records separately through the existing per-record storage; the `campaigns` object store already
  exists in the schema.
- **Schema migration 6** adds `campaigns: []` to the project. The project version follows `MIGRATIONS.length`.
  A character has no new field: its campaign list is derived.
- The pure module `src/campaigns.js` holds roster and party maths and never imports the DOM or storage (A-1).
  `src/initiative.js` holds the turn order.
- The tab guard, "changed in another tab" dialog, import and the library already operate on a project; they
  gain campaigns through the same normalizer (`normalizeProject`).

## 4. Pages and routes

| Route | Page |
|---|---|
| `#/campaign/<id>` | Overview: name, status, system, description, tags, own fields, counts |
| `#/campaign/<id>/roster` | Roster |
| `#/campaign/<id>/party` | Party view |
| `#/campaign/<id>/sessions` | Session log |
| `#/campaign/<id>/initiative` | Initiative tracker |
| `#/campaign/<id>/handouts` | Handouts |

- A campaign shows its own link bar (U-4, U-11), the same anatomy as a character (U-6): header with Duplicate
  and Delete, then sections. Delete is guarded by a confirmation that names the roster size and says characters
  stay; it is undoable.
- **The Library** lists campaigns as tiles beside characters (a "Campaigns" section with its own New button,
  search and status filter; one tile per campaign with name, status, roster count). Search covers both.
- The command palette gains "New campaign" and "Open campaign: <name>"; `Alt+6` is not a hub shortcut because
  campaigns live in the Library.
- Every page and dialog joins `e2e/a11y.mjs` in the same change (U-3).

## 5. Roster

- Add a character from a picker of the library (not already on the roster), with a role and a status. Edit,
  reorder, remove with Undo. The row shows the character's name, portrait and status, and links to them.
- The generic list page from P4 renders it (C-11) with a character picker as its form extra, the same pattern
  as the relation target.
- Removing a row never touches the character.

## 6. Party view

One row per roster character, one column per `partyColumn`, **read from the sheets** with no stored copy.

```text
PartyColumn { id (col_), label, ref }     // ref: "@hp.current", "@ac", "@hp.current / @hp.max"
```

- A column's `ref` is a sheet formula (the same language as the sheet, no dice). It is evaluated per character
  against that character's own evaluated sheet (the `rolling.scopeFor` scope). A character with no sheet, or a
  value that errors, shows a plain "no value" or the error text, never a crash and never `0`.
- Defaults: a game system may suggest columns under its own `extensions.records.party` (C-12 pattern:
  `[{ "label": "HP", "ref": "@hp.current" }]`, validated, inherited by derived systems). A campaign with no
  columns offers the suggestions of the roster's most common system, and the person can add any of their own.
- The row also shows the roster role and status, the character's conditions (sheet conditions), the portrait
  and a link. Present familiars are listed under the character.
- Sorted by roster order, or by a clicked column (numbers numerically, text naturally).
- **Secret** journal entries, secret session notes and secret rolls never appear here (K-9).
- A quick action per row: roll as that character (opens the dice page scoped to them).

## 7. Session log

- A session has a date (defaults to today), title, notes (plain text, up to 20,000 characters, `textContent`
  only) and attendees chosen from the roster, plus an optional `secretNotes` field marked Secret.
- Newest first; filter by text; "who attended" shown as names that link. Attendee ids of a removed character are
  dropped with the character.
- A **recap** button copies a plain-text summary (title, date, attendees, notes without the secrets) to the
  clipboard, so a GM can paste it to the players. Nothing is sent anywhere.
- Rolls made while a campaign page is open carry `campaignId` (D-9) and can be listed per campaign in the
  campaign's roll log section, excluding secret rolls.

## 8. Initiative tracker

```text
Initiative { round, turn, entries: Entry[] }          // entries up to 100; turn indexes the ordered list
Entry { id (init_), characterId | null, name, value, tiebreak, hp?, note, done }
```

- **Add the roster** in one action: each character rolls its initiative expression through the one rolling
  path (`rolling.roll`, same log, label `Initiative: <name>`), with the character's own values in scope. The
  expression comes from, in order, the campaign's `initiativeExpression`, the system's
  `extensions.records.initiative` (for example `1d20 + @dex.mod`), then `1d20`.
- Add **other combatants** by name (monsters, NPCs): a value typed or rolled with a typed expression.
- **Order** is value descending; ties keep the order they were added unless `tiebreak` is edited. Dragless
  controls: Up and Down within a tie, and "move before" is not needed because value decides.
- **Turn and round**: Next advances the turn and wraps to the next round; Previous steps back; the current
  entry is marked in text ("Current turn"), not by colour alone, and announced to assistive technology. Each
  entry can be marked done or skipped, removed, or have its value changed (the order updates live).
- A short note and optional hit points per combatant can be edited inline; character entries show the sheet's
  current HP through the party column mechanism when one is defined.
- **End encounter** clears the tracker (confirmed, undoable). Round and turn persist with the campaign so a
  reload resumes the fight.
- Removing a character from the roster removes their entry. Dead-end states (an empty order, a turn past the
  end) are normalized on load.

## 9. Handouts

- Images (PNG, JPEG, WebP, GIF) and PDFs, judged by their bytes (`files.js`), up to 25 MB each, 100 per
  campaign. They go to the blob store and are shared by reference like portraits and sheets (P-17); a
  duplicated campaign shares the files; unused files are collected as today. `integrity.js` counts handout
  blobs as referenced.
- Images are shown scaled in the page with alt text from the name; a PDF opens in the in-app viewer (`docs/PDF.md`).
  Rename, notes, download, remove with confirmation and Undo.
- A file that is not an image or PDF is refused with a reason and nothing is stored.

## 10. Secret rolls and secret text (DEF-013, K-9)

- The dice page and the roll buttons gain a **Secret** option. A secret roll is recorded with `secret: true`.
- The roll log marks it "Secret" and still shows it on the personal dice table (the person who rolled it is
  the only user). It is **excluded** from the campaign roll list, from any recap, and from exports meant for
  sharing (P6).
- Secret journal entries (C-6), secret session notes and secret rolls are the three secret kinds. The rule is
  one function, `isShared(record)`, used by every shared view so the exclusion cannot drift.

## 11. Limits and safety

100 roster rows, 1,000 sessions, 100 handouts, 100 combatants, 12 party columns, 50 tags, 30 own fields per
record; campaign names 200 characters; party column refs 200 characters and parsed with the budgeted formula
parser (no dice, no `eval`). Hostile stored data is normalized, never thrown on. All text is `textContent`.

## 12. Build order and phase gate

1. **Groundwork.** The store holds campaigns, a history step covers both collections, migration 6, the
   `campaigns` normalizer from descriptors, autosave of campaigns, `normalizeProject`, and delete-a-character
   cleans rosters and initiative in one step.
2. **Campaign record, Library tiles, routes and the overview page**, then **Roster** and the character's
   "Campaigns" panel.
3. **Party view** (columns, system suggestions, sorting).
4. **Session log**, then **Handouts**.
5. **Initiative tracker.**
6. **Secret rolls** across the dice page, log and campaign list; palette entries.

**Gate.** Pure-module tests (roster uniqueness, party column evaluation with missing and erroring sheets,
initiative ordering, turn and round wrap, secret exclusion, hostile stored data, migration 6, delete cleanup),
a browser scenario per page (create, edit, persist across a reload, delete with Undo), an accessibility state
per page and dialog, docs updated; the gate holds twice (PLAN.md).

## 13. Not in P5

A player-facing shared view or an export of a campaign (P6, with the bundle format), maps and tokens, automated
combat (attacks, damage, conditions that tick), conditions on initiative entries (DEF-088), a relations graph
across a campaign (DEF-063), calendars and in-fiction time (DEF-089), and several GMs or live sharing (no
accounts, K-9).
