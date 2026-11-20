# OMNISCRIBE - the charter

> **Scope.** This document owns product intent: pillars, constraints, non-goals, the feature catalogue and
> phase order. The shape is `docs/ARCHITECTURE.md`; choices are `DECISIONS.md`; status is `TODO.md`.

**Status:** planned. Nothing is built. P0 is the next phase.

---

## 1. Summary

Omniscribe is a local-first web app that holds every tabletop RPG character a player owns in one place. A
character is a **record**, not a file: it carries an uploaded PDF sheet for reading, a value-based sheet
the program can compute with, an inventory, familiars, relations and journals, and it can be assigned to
campaigns. A dice table rolls using the character's own values, so `1d20 + @str.mod + @prof` means that
character's numbers.

It should feel like Loreweaver: a quiet, fast, dark workspace with no account, no backend and no ceremony
between opening the tool and using a character.

## 2. The one idea

> Make the character's numbers data, so everything else can use them.

A PDF is a picture of a character. A sheet of typed values is the character the program can reason about.
Because a stat is a keyed, typed value, the same value drives the sheet display, derived modifiers, dice
rolls, inventory weight, party overviews and exports. The sheet definition (which fields exist, how they
derive) is a **template**, itself data, so the engine knows no game system and a new system is a new
template, not new code.

This costs a formula engine and a discipline about templates. It buys one source of truth per value and
makes "roll my stealth" a one-click action in any system.

## 3. Pillars

- **One home per character.** Everything about a character is reachable from its page.
- **Values, not blobs.** Stats are typed, keyed and computable; the PDF is kept as a companion.
- **System-agnostic.** A game system is a template. Nothing in the engine names a system.
- **Local by default.** The browser is the database; files in, files out; nothing phones home.
- **Table speed.** Rolling, tracking HP and checking a condition take one or two actions.
- **Recovery.** No destructive step without a confirmation, a snapshot or a backup.
- **Small surface.** Vanilla modules, no build, no framework, every behaviour auditable.

## 4. Constraints

- Static hosting; no server, no account, no runtime dependency (G-4).
- `textContent` rendering only; `innerHTML` is a lint error (G-3).
- Formulas and dice expressions run in an own parser. Never `eval`, never `Function` (A-8).
- Released schema migrations are append-only (P-2).
- Every gate in `PLAN.md` runs in CI on `main` and on every pull request.
- No source file passes the size cap in `PLAN.md`; `main.js` only boots and routes (A-6).
- Pre-1.0 semantic versioning, changelog per release, tagged `vX.Y.Z`.

## 5. Non-goals for v1

- A virtual tabletop: no maps, tokens, fog or live multiplayer.
- Account systems, cloud sync or collaboration (G-12).
- Hosting or reproducing copyrighted rulebook content. Templates ship structure and formulas, not
  rules text; the user brings their own PDFs and item data.
- Automating a whole game system's rules (spell resolution, combat engine). The sheet computes values;
  the player applies the rules.
- Editing arbitrary PDFs. An uploaded PDF is stored and viewed; the app generates its own sheet PDF from
  data (P6), and mapping an uploaded PDF's form fields to values is DEF-020.

## 5.1 Users and jobs

A player or GM keeps many characters across systems and campaigns. Four jobs recur:

1. **Keep.** Store the sheet, the PDF and everything around it without losing any of it.
2. **Play.** At the table, read stats, roll with them, track HP, resources and conditions.
3. **Grow.** Between sessions, level up, change gear, log what happened, update relations.
4. **Run.** For a campaign, see the party at a glance and track sessions.

Phase order follows those jobs: P1-P2 serve keeping, P3 serves playing, P4 serves growing, P5 serves
running, P6 keeps all of it recoverable at size.

## 6. The feature catalogue

Every feature has a phase. The planned ones from the original brief are marked **(brief)**; the rest are
proposed additions and are cheap to drop.

### Per character

| Area | What it holds | Phase |
|---|---|---|
| Identity **(brief)** | Name, player, system, portrait, tags, status (active, retired, dead), summary | P1 |
| PDF sheets **(brief)** | One or more uploaded PDFs per character, an in-app viewer, replace and remove | P1 |
| Generated PDF sheet | A PDF built from the character's data and system; an uploaded PDF overrides it when chosen | P6 |
| Value sheet **(brief)** | Typed fields from a template: numbers, text, flags, choices, lists, derived values, resource pools | P2 |
| Resources and rests | HP, temp HP, spell slots, ki and similar pools, with per-rest reset rules in the template | P2 |
| Conditions | Named conditions with optional durations and notes; shown on the sheet and in party views | P2 |
| Roll presets | Saved rolls such as "Longsword attack" built from `@refs`, grouped and reorderable | P3 |
| Inventory **(brief)** | Items with quantity, weight, equipped and attuned flags, containers, notes; currency wallets; carried weight against a limit from the template | P4 |
| Abilities | Features, spells, powers and techniques as records with tags, uses and roll presets | P4 |
| Familiars **(brief)** | Companions, mounts and summons, each with a compact sheet from a companion template, its own notes and a summoned flag; can be promoted to a full character | P4 |
| Relations **(brief)** | Links to other characters, NPCs and factions with a kind, an attitude, notes and a reciprocal view; a graph view | P4 |
| Journal | Dated entries and session recaps, secrets and goals, searchable | P4 |
| Progression | A log of XP, level and milestone changes, so the sheet's history is visible and undoable | P4 |
| Campaigns **(brief)** | The campaigns this character is assigned to and the role and status in each | P5 |

### Dice table

| Feature | Notes | Phase |
|---|---|---|
| Dice grammar **(brief)** | `NdM`, keep and drop, exploding, rerolls, advantage and disadvantage, fudge and percentile dice, arithmetic, `@refs` | P3 |
| Roll as a character **(brief)** | Pick a character; every `@ref` resolves to that character's current values | P3 |
| Roll from the sheet | Every rollable stat has a roll button using the template's expression | P3 |
| Roll log | Each roll records the resolved expression, every die, the breakdown and the total; bounded and searchable | P3 |
| Dice pools | Count successes against a target (World of Darkness style) | P3 |
| Secret rolls | Rolls a GM keeps out of the shared log | P5 |
| 3D dice scene | An optional animated scene the roll plays back in; the engine decides the result | post-v1 |
| Random tables | Loot and encounter tables with weights, nested rolls and item awards, as data | post-v1 |

### Campaigns

| Feature | Notes | Phase |
|---|---|---|
| Campaign record **(brief)** | Name, system, description, status | P5 |
| Roster | Characters assigned with a role and a status per campaign; a character can be in many | P5 |
| Party view | One row per assigned character: HP, defences and chosen stats, straight from the sheets | P5 |
| Session log | Dated sessions with attendees and notes | P5 |
| Initiative tracker | Rolls initiative for the roster, orders it and steps through turns | P5 |
| Handouts | Images and PDFs attached to a campaign | P5 |

### Across the app

| Feature | Notes | Phase |
|---|---|---|
| Library | Every character and campaign as tiles with search, tag filters and sorts | P0 |
| Undo and redo | Every mutation is one history step | P0 |
| Command palette, shortcuts | Open any character, page or roll from the keyboard | P0 |
| Multi-tab guard, persistent storage | One writer tab; storage is not evicted | P0 |
| Game systems **(brief)** | Create, edit, import, export and derive systems in-app; a generic system, then D&D 5e and 3.5e as built-in read-only bases | P2 |
| Search everywhere | Characters, items, journal, relations in one query | P6 |
| Zip backup with PDFs | One file restores everything, blobs included | P6 |
| Character export and import | A single character as a bundle, with its PDFs | P6 |
| Revisions and integrity repair | Bounded snapshots, restore, orphan cleanup | P6 |
| Print view | A clean printable sheet from the values | P6 |
| Releases | GitHub Pages web app, an installable offline PWA, a Windows build and an Android APK from each tag | P7 |

## 7. Phase order

Each phase in `TODO.md` has a gate in `PLAN.md`. A regression blocks the next phase.

- **P0 - Foundation.** Tooling, shell, design system, schema, store, persistence with a blob store,
  tab guard, library, character stub, command palette.
- **P1 - Characters and PDFs.** The full identity record, portrait, PDF attachments and viewer, tags,
  status.
- **P2 - The sheet engine and game systems.** Templates, the formula language, the value sheet, pools,
  conditions, rests, the in-app system editor, derived systems, import and export, the generic system,
  then built-in D&D 5e and 3.5e.
- **P3 - The dice table.** The dice grammar, the roller, `@ref` resolution, presets, the log.
- **P4 - Character pages.** Inventory, abilities, familiars, relations, journal, progression.
- **P5 - Campaigns.** Records, roster, party view, sessions, initiative, handouts.
- **P6 - Durability and exchange.** Zip backup, character bundles, revisions, integrity, search, the
  generated PDF sheet with the upload override.
- **P7 - Release.** UI evaluation and redesign, PWA, GitHub Pages, the Windows and Android builds,
  accessibility, the v1 tag.
- **P8 - Expansion (post-v1).** Random tables, the 3D dice scene, PDF form mapping, a Loreweaver tie-in,
  other importers (DEF-012, DEF-014, DEF-020, DEF-050, DEF-051). Tracks v1; it does not gate it, and it
  is expected to grow (G-20).

## 8. Success criteria

- A character is created, given a PDF and a sheet, and survives a reload and a tab crash.
- Two open tabs never silently overwrite each other.
- A new system is created in the app, derived from 5e or 3.5e, exported, and imported on another
  device, with no code change.
- A character's generated PDF matches its sheet values, and an uploaded PDF overrides it and can be
  switched back.
- Each tag publishes the Pages site, a Windows build and an Android APK that open the same app.
- A roll resolves from a character's values and its log entry explains every number.
- A 200-character library with 5,000 items in total stays responsive (benchmark gate).
- A backup restores every character, PDF and campaign on an empty browser.
- Every gate is green on `main`; `npm run a11y` reports zero serious violations.
- The pure modules still import no DOM, storage or `main.js`.

## 9. Measurement

Gates measure the product, not effort. Formula and dice fixtures, round-trip fidelity, unit and browser
test counts, a11y violations and benchmark timings are recorded in `CHANGELOG.md` per release. A claim in
these docs without a gate is a claim to remove or instrument.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Templates become a programming language | The formula language stays small and total: no loops, no user functions, a step budget (A-8) |
| A PDF is active content | The app renders pages to a canvas with a vendored reader after a `%PDF-` check, so PDF scripts never run (U-8); recorded in `docs/PDF.md` |
| Vendored PDF libraries are large and age | Lazy-loaded on PDF pages only, pinned with `SOURCE.md`, versions reviewed at each release (P-14) |
| Derived systems drift from their base | Overlays store operations, not copies, and a base change shows a diff (S-9, S-10) |
| Each shell has separate storage | A backup file is the bridge, and the Data page says so (P-16) |
| Scope grows without bound | New ideas enter the backlog, then a phase or a ledger row (G-20) |
| Many characters make saves heavy | Persistence is per record with dirty tracking (P-10) |
| `main.js` grows past reason again | Controllers per surface from day one and a file size gate (A-6) |
| Template edits strand stored values | Values are kept when a field disappears and shown as orphans (S-4) |
| Copyright | No rules text ships; the app holds structure and the user's own data (non-goals) |

## 11. Backlog (untriaged)

Ideas with no phase step and no `DEFERRALS.md` row yet. The ledger is the source of truth once a row
exists, so this list stays short.

- A compare view for two characters of the same system.
- A level-ahead preview that shows a sheet at the next level without committing it.
- Shared item and ability libraries across characters, with "give to" actions.
