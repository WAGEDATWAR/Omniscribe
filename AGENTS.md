# AGENTS.md - working notes for automated agents

Project: **Omniscribe** - a local-first web app that holds every tabletop RPG character in one place: an
uploaded PDF sheet, a value-based sheet the program computes with, inventory, familiars, relations,
journals, campaigns and a dice table that rolls with a character's own values. A sheet template is the
hub, a game system is data, and the browser's own storage is the database.

Built on the same foundations as Loreweaver (`C:\Dev\Web Projects\Loreweaver`).

## Read first

1. `DOCUMENTATION-INDEX.md` - ownership and precedence.
2. `docs/OMNISCRIBE.md` - the charter, pillars, constraints, feature catalogue and phases.
3. `TODO.md` - the current phase. Do not work outside it without a reason.
4. `PLAN.md` - workflow and gate discipline.
5. The owning doc for whatever you touch (`ARCHITECTURE`, and `SHEET`, `DICE`, `PDF`, `PERSISTENCE`, `UI`
   as they are written).

## Golden rules

- **Spec first.** Code and spec disagree: stop and fix one, or record a decision.
- **One writer.** The store mutates; controllers wire events; the UI renders and holds no state.
- **Render as text.** `textContent` only; `innerHTML` is a lint error.
- **The template is the hub.** No game system is named in engine code; systems are user content and can
  derive from a base.
- **Pure core.** The pure modules never import the DOM, storage or `main.js`.
- **No `eval`, no `Function`.** Formulas and dice run in the own parser.
- **Everything is data**, validated.
- **`main.js` boots and routes only.** One controller per surface; no file over 1,500 lines.
- **Tests and a browser scenario ship with every component.**
- **Destructive is guarded** by a confirmation and, for imports, a backup.

## Stack

- Native ES modules, no package-manager runtime dependencies, no build step. The only exceptions are
  vendored files with a `SOURCE.md` under `src/vendor/` (PDF libraries, P-14).
- Node tests for the pure modules; headless Chrome scenarios for the surface.
- IndexedDB primary (records and blobs) behind `src/storage.js`, per-record saves.
- `ui/` renders; it never derives state and never imports `main.js`.

## Commands

`npm run check`, `npm run lint`, `npm run format`, `npm test`, `npm run test:e2e`, `npm run a11y`,
`npm run contrast`, `npm run deferrals`, `npm run deferral-scan`, `npm run release:check`.

`npm test` is the fast tier; a filename always runs that file. `npm start` serves the app locally.
`npm run a11y` and `npm run test:e2e` need Chrome or Edge (set `CHROME_PATH` to override).

## Conventions

- Do not commit unless asked. No comments unless asked.
- LF endings; 2-space JS/JSON/CSS.
- Ids are strings with `char_`, `camp_`, `item_`, `blob_`, `roll_` prefixes and are never reused.
- Values are typed; a bad value is rejected with a reason, never coerced.
- A new dialog joins `e2e/a11y.mjs` in the same change.
- A new system is a template file plus a fixture; never a code branch.

## Workflow for a request

Follow `PLAN.md`. Record choices in `DECISIONS.md` (owning series), progress in `TODO.md`, runs in
`CHANGELOG.md`, and the design in the owning doc. A "later" is a `DEFERRALS.md` row in the same change.

## Definition of done

The gate holds twice, the tests and scenario ship, the owning doc is updated, the deferrals are closed
or re-owned, and `TODO.md` says true.

## Prior art

`C:\Dev\Web Projects\Loreweaver` is the reference implementation of the process, the tooling and the
patterns (store, storage, tab guard, palette, e2e harness). Copy and adapt; do not link. Its own review
list (`TODO.md` review findings) records what not to repeat.
