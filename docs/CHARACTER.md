# CHARACTER - the pages that grow a character: inventory, abilities, journal, relations, progression, familiars

> **Scope.** This document owns the records a character carries beyond its sheet, and the pages that edit
> them. The sheet, the formula language and systems are `docs/SHEET.md`; rolls are `docs/DICE.md`; storage is
> `docs/PERSISTENCE.md`. Choices are `DECISIONS.md` G-14, S-11, A-1 and C-1 to C-10.

**Status:** designed (P4). Nothing below is built yet; `TODO.md` says which parts exist.

---

## 1. The one idea

> A character is one aggregate. Everything a player writes down about them lives inside it, is saved with it,
> duplicates with it, and is undone with the same history.

Every page here is a **list of records on the character**, edited by the same row editor pattern the Sheet
page already uses, rendered with the same page anatomy (U-6). None of it needs a game system: a system can
*enrich* a page (a carry limit, a companion template) but an empty system still gives a usable page.

The pure helpers (`src/inventory.js`, `src/relations.js`, `src/journal.js`, `src/progression.js`) never
import the DOM or storage (A-1). The store is the only writer (A-2); controllers wire pages to it
(`src/app/<page>.js`, one per page, A-9).

## 2. The shared shape

All five list pages use one record shape discipline:

- A record has a string `id` with its own prefix (`item_`, `abil_`, `jrnl_`, `rel_`, `prog_`, `fam_`), never reused.
- Text is bounded and rendered with `textContent` only. Numbers are finite and bounded. A bad stored record is
  dropped by `normalize*` with the rest kept (never a crash), and unknown keys survive in `extensions`.
- Each list has a **limit** (a number stated per page), reached with a plain message, never a silent clamp.
- Add, edit, remove and reorder are store methods; remove is always undoable and toasts an Undo.
- Typing coalesces into one history step per field (as the Sheet does).
- The page has an **empty state** that says what the page is for and offers the one action.
- A page is a sub-route of the character: `#/character/<id>/<page>`. The link bar (U-11) gains the pages in
  the order of section 9 once they exist, and every new page and dialog joins `e2e/a11y.mjs` (U-3).

## 3. Inventory (`#/character/<id>/inventory`)

```text
Item {
  id,                       // item_ prefix
  name, quantity,           // quantity: whole number 0..999999
  weight,                   // per unit, finite, >= 0, in the system's unit (a plain number)
  value,                    // per unit, in the wallet's smallest listed currency; optional
  containerId | null,       // another item flagged as a container, or null for "carried"
  isContainer, equipped, attuned,   // booleans
  tags: string[], notes
}
Wallet: { [currencyKey]: whole number }     // "gp", "sp", "cp"; keys are the system's or free
Inventory { items: Item[], wallets: Wallet }
```

- **Containers** are items with `isContainer`. An item sits in at most one container; a container cannot sit
  inside itself or its own descendants (`inventory.js` rejects a cycle with a reason). Deleting a container
  moves its contents out to carried and says so; nothing is deleted with it (G-8, destructive is guarded).
- **Carried weight** = sum of `quantity * weight` over carried items and everything inside their containers.
  A container may carry a `weightMultiplier` (a bag of holding, default 1) that scales its contents.
- **Limits.** A system may define `limits.carry` (a formula over the sheet, such as `@str * 15`); the page
  shows `carried / limit`, flags over-limit with text (not colour alone), and never blocks adding. A system
  without a limit shows the total only. Adding `limits` to the system format is a validated, optional key
  (`docs/SHEET.md` 2, an additive change; no system version is rewritten).
- **Wallets.** One number per currency with plus and minus steppers and a typed delta (`+25`, `-3`). A wallet
  cannot go below zero; the page says so. Currency names and an optional conversion list come from the system
  (`currencies: [{ key, label, perGold }]`) or default to a plain `gp, sp, cp` set.
- **Equipped and attuned** are flags. A system may cap attunement (`limits.attunement`, a number or formula);
  the page warns over the cap and still allows it.
- **Quick actions** at table speed (U-9): quantity stepper on each row, equip toggle, "drop" (remove with undo).
- The list groups by container, filters by text and tag, and sorts by name or order (manual order is stored).
- Limit: 2,000 items per character.

## 4. Abilities (`#/character/<id>/abilities`)

An ability is a feature, spell, power or technique as free-form data. It is *not* the template's `collections`
(S-11): those are structured rows a system defines; abilities are what the player writes when the system has no
collection for it, or for homebrew.

```text
Ability {
  id,                       // abil_ prefix
  name, kind,               // kind: free text with suggestions (Feature, Spell, Power, Technique, Feat, Trait)
  source,                   // where it comes from: a class, an item, a race; free text
  summary, text,            // a one-line summary and the full description
  tags: string[],
  uses: { max: whole | null, used: whole, resetOn: restId | "" },   // optional per-ability counter
  expression: string,       // optional dice expression (docs/DICE.md); "" for none
  critMin | null
}
```

- **Uses** reuse the sheet's rest rules: `resetOn` names a rest id from the system (`short`, `long`, ...), and
  applying that rest on the Sheet page restores matching abilities too. With no system, a "Restore all" button
  does the same by hand.
- **Roll.** An ability with an `expression` gets a Roll button that goes through the one rolling path
  (`src/app/rolling.js`): same scope, same log, `label` = the ability name.
- Grouped by kind or tag, searchable, reorderable. Limit: 1,000 abilities.

## 5. Journal (`#/character/<id>/journal`)

```text
JournalEntry {
  id,                       // jrnl_ prefix
  title, date,              // date: YYYY-MM-DD, defaults to today; any valid calendar day
  kind,                     // session | note | goal | secret | recap
  text,                     // plain text, up to 20,000 characters
  tags: string[],
  done                      // goals only: completed or not
}
```

- Entries are plain text rendered as text with line breaks preserved. There is no markup or HTML (G-3).
- Sorted newest first by date, then creation order. Filter by kind and tag, and a search over title and text.
- **Secret** entries are marked "Secret" in text and are not shown on any party or campaign view (P5); on the
  character's own page they behave like any other entry.
- **Goals** show a checkbox; open goals can be listed first.
- Limit: 2,000 entries.

## 6. Relations (`#/character/<id>/relations`)

Exactly the model in `docs/ARCHITECTURE.md`:

```text
Relation { id, targetType: "character" | "npc" | "faction", targetId | null, targetName,
           kind, attitude, notes }
```

- `attitude` is a whole number from -5 to +5 shown with its word (Hostile ... Devoted) so it never relies on
  colour. `kind` is free text with suggestions (Ally, Rival, Family, Mentor, Patron, Enemy).
- A **character** relation stores the other character's `targetId` and caches `targetName`. If that character
  is deleted, the relation keeps the cached name and shows "(not in this library)"; nothing is dropped.
- **Reciprocal view.** `relations.js` derives, from every character, the relations that *point at* this one and
  lists them under "Others who know this character" with a link. No second record is stored (the
  `docs/ARCHITECTURE.md` rule). Editing a reciprocal entry opens the other character's page.
- A relation can be to an NPC or faction by name only (`targetId = null`).
- The list sorts by attitude or name and filters by kind. The graph view is DEF-063 and stays after the list.
- Limit: 500 relations.

## 7. Progression (`#/character/<id>/progression`)

A progression entry is a note about a change that matters, so the character's history is visible.

```text
ProgressionEntry {
  id,                       // prog_ prefix
  at,                       // timestamp it was recorded
  date,                     // in-fiction or session date (YYYY-MM-DD), optional
  kind,                     // xp | level | milestone | other
  delta | null,             // a number for xp or level changes, else null
  label, notes
}
```

- It is a **log**, not a calculator: adding an XP entry does not edit the sheet's XP. Two buttons offer the
  link when the character has a sheet with a field of that key: "Apply to the sheet" sets `xp` or `level` as
  one undoable step together with the entry. Without a matching field the buttons are absent. (Automatic
  level-up is DEF-004, after v1.)
- A running total of the `xp` deltas and the last recorded `level` are shown at the top.
- Entries are read newest first and are removable with undo; they are never edited silently.
- Limit: 2,000 entries.

## 8. Familiars (`#/character/<id>/familiars`)

A familiar is a companion, mount or summon with its own compact sheet.

```text
Familiar {
  id,                       // fam_ prefix
  name, kind,               // kind: free text with suggestions (Familiar, Mount, Companion, Summon)
  summoned,                 // present now or not
  portraitBlobId | null,
  sheet: Sheet | null,      // the same shape as a character's sheet (docs/SHEET.md), or none yet
  notes,
  linkedCharacterId | null  // set when promoted
}
```

- A familiar's `sheet` is exactly the character sheet shape and is evaluated by the same engine against any
  system the person picks, normally a small companion system (a derived system such as "Animal companion").
  The page reuses the Sheet page's builder, so it needs no new engine (A-3).
- A familiar without a sheet is just a named record with notes.
- **Promote to a full character** creates a character from the familiar (name, portrait, sheet, notes) as one
  undoable step and links it by `linkedCharacterId`. The familiar is kept, not removed.
- The `summoned` flag is shown on the Overview and in party views.
- Limit: 50 familiars per character. Each familiar's sheet counts toward the character's record size.

## 9. Build order and phase gate

Sliced so each page is usable the moment it lands (ease times value; the pages above are independent):

1. **Shared groundwork.** Schema migration 5 (all new lists, empty), `normalize*` for each, store methods
   with undo, the common list editor UI, character duplicate and delete cover every list.
2. **Inventory** (with carry and wallets), then **Abilities**, then **Journal**, then **Relations**, then
   **Progression**, then **Familiars** (the last depends on the Sheet builder being reusable).
3. A pass that adds the new pages to the command palette, the Overview summary (counts and the summoned
   familiars) and the character duplicate test.

**Gate.** Every page has pure-module unit tests (limits, normalization, hostile stored data, the weight maths,
cycle rejection, reciprocal derivation), a browser scenario (add, edit, persist across a reload, delete with
undo), an accessibility state per page and dialog, and the docs updated. The gate holds twice (PLAN.md).

## 10. Not in P4

A shared item or ability library across characters and "give to" actions (`docs/OMNISCRIBE.md` backlog,
DEF-084), the relations graph view (DEF-063), automatic level-up (DEF-004), journal attachments and images
(DEF-085), per-item roll presets beyond abilities (DEF-086), search across every record (P6), and campaign
and party views of these records (P5).
