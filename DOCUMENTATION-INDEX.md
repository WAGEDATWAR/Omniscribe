# Omniscribe - Documentation Index

**The live document set for Omniscribe.** One topic, one document, one owner. A question about storage
has exactly one place to be answered, and a UI note cannot overrule it.

**Rule 0:** a document under `docs/reference/` never wins over one at the root. Reference material is
prior art and research; it explains where an idea came from and has no authority here.

---

## 1. Why the set is shaped this way

Omniscribe has one hard problem wrapped in several surfaces: **a character's numbers must be one typed,
computable source of truth that the sheet, the dice, the inventory and the campaigns all read, without
the engine ever knowing a game system.**

Every topic below protects that property or spends it. Splitting by owner (rather than by screen) keeps
each answer single-sourced: the dice rules cannot be edited away by a convenience note in the UI doc.

## 2. The document set

### Product

| Doc | Job | Status |
|---|---|---|
| `README.md` | What Omniscribe is and how to read the set | active |
| `docs/OMNISCRIBE.md` | **The charter.** Pillars, constraints, non-goals, feature catalogue, phases | active |
| `TODO.md` | Live phase status and what is next | active |
| `PLAN.md` | Workflow, gates, phase gates, the deferral rule | active |
| `DECISIONS.md` | Locked choices, by series (G, A, S, D, P, U) and open questions | active |
| `CHANGELOG.md` | What each revision changed | active |
| `DEFERRALS.md` | The deferral ledger; every "later" has a row | active |

### Design (one owner per topic)

| Doc | Owns | Status |
|---|---|---|
| `docs/ARCHITECTURE.md` | Application shape, data flow, canonical model, storage layout, module map | designed |
| `docs/SHEET.md` | Game systems, derivation, the formula language, evaluation, pools, conditions, orphans | designed (P2 in progress) |
| `docs/reference/SHEET-REFERENCE.md` | What real derived-system sheets need; structure only, no private content | reference |
| `docs/TABLES.md` | Random tables: loot and encounters as data on the dice engine (DEF-014) | planned (P8) |
| `docs/DISTRIBUTION.md` | Pages, the Windows build, the APK, the release workflow | planned (P7) |
| `docs/DICE.md` | The dice grammar, `@ref` resolution, limits, the roll record | planned (P3) |
| `docs/PDF.md` | PDF attachments, portraits, the vendored reader, the viewer, the upload override; the generated sheet arrives in P6 | built |
| `docs/CHARACTER.md` | Character pages: inventory, abilities, familiars, relations, journal, progression | planned (P4) |
| `docs/CAMPAIGNS.md` | Campaigns, roster, party view, sessions, initiative, handouts | planned (P5) |
| `docs/PERSISTENCE.md` | Storage backends, autosave, the tab guard, migration; backups and revisions arrive in P6 | built |
| `docs/UI.md` | Layout, tokens, page anatomy, interaction, accessibility, responsive | built |

A "planned" document is written **before** the code in its phase (spec first) and is listed as built
once the phase's gate holds.

## 3. Precedence (highest wins)

1. `DECISIONS.md`
2. `docs/OMNISCRIBE.md`
3. the owning topic document
4. `README.md` and `PLAN.md`
5. `docs/reference/`

A decision beats a design. If they disagree, the design has a bug, not the decision.

## 4. Topic ownership (one owner each)

| Topic | Owner |
|---|---|
| Product intent, pillars, constraints, feature catalogue, phase order | `docs/OMNISCRIBE.md` |
| Shape, data flow, canonical model, module boundaries | `docs/ARCHITECTURE.md` |
| Templates, formulas, sheet evaluation | `docs/SHEET.md` |
| Dice grammar and rolls | `docs/DICE.md` |
| PDFs and other files | `docs/PDF.md` |
| Inventory, abilities, familiars, relations, journal, progression | `docs/CHARACTER.md` |
| Campaigns | `docs/CAMPAIGNS.md` |
| Storage, migration, integrity, backup, revision, recovery | `docs/PERSISTENCE.md` |
| Layout, tokens, interaction, accessibility, responsive | `docs/UI.md` |
| Phase status | `TODO.md` |
| Every choice | `DECISIONS.md` |
| Every deferral | `DEFERRALS.md` |

## 5. Reading order

**New here:** `README.md` -> `docs/OMNISCRIBE.md` 1-5 -> `docs/ARCHITECTURE.md` 1-5 -> `TODO.md`.

**Touching a sheet or a formula:** `docs/SHEET.md`, then `DECISIONS.md` S and A-8.
**Touching dice:** `docs/DICE.md`, then `DECISIONS.md` D.
**Touching files:** `docs/PDF.md`, then `DECISIONS.md` P-13 and U-8.
**Touching storage:** `docs/PERSISTENCE.md`, then `DECISIONS.md` P.
**Touching the surface:** `docs/UI.md`, then `DECISIONS.md` U.

## 6. Change process

| Change | Goes to | Then |
|---|---|---|
| New idea | `docs/OMNISCRIBE.md` 11 backlog | triage into a phase or a deferral row |
| Accepted choice | `DECISIONS.md` (owning series) | update the owning doc in the same change |
| Phase progress | `TODO.md` and `CHANGELOG.md` | - |
| Something put off | `DEFERRALS.md` row with an owner | - |
| A storage or template seam | `DECISIONS.md` P- or S-series | record before designing around it |

**Revision convention:** every pass records itself in `CHANGELOG.md`, however small.

**The stale-doc rule:** a doc that no longer matches the decision log is a bug of the same severity as
broken code.
