# Omniscribe - Build Plan

How work happens here. Short by design: the charter is `docs/OMNISCRIBE.md`, the topics are its
documents, and this file only holds the workflow and the gate discipline.

Status is `TODO.md`. Choices are `DECISIONS.md`. Deferrals are `DEFERRALS.md`, and a deferral without a
row is a bug.

## Workflow ordering

1. Read the current phase in `TODO.md` and the owning doc before touching anything.
2. Run the gates first, so a red baseline is known and not inherited.
3. Write or update the owning doc and its fixtures **before** the code (spec first).
4. Implement inside the phase's files; do not widen reach past what its gate measures.
5. Record the choice in `DECISIONS.md` (owning series), the run in `CHANGELOG.md`.
6. Update `TODO.md` to the truth, including a regression.
7. Update the owning doc; a stale doc is a bug.

## Hard rules

- **Spec first.** If code and spec disagree, stop and fix one, or record a decision.
- **One writer.** The store mutates; controllers wire events; the UI never holds state.
- **Render as text.** `textContent` only; `innerHTML`, `insertAdjacentHTML` and `document.write` are lint
  errors.
- **The template is the hub.** A game system lives in a template, never in engine code.
- **No `eval` or `Function`.** A lint rule enforces it.
- **Everything is data**, validated; no hardcoded special cases.
- **Tests and a browser scenario ship with every component.**
- **Destructive is guarded**: confirmation, and a pre-import backup for imports.
- **Do not commit unless asked.** No comments unless asked. LF, 2-space.
- **Released migrations are never edited.**
- **File size cap:** no source file over 1,500 lines (A-6).

## Gates

Gates are gates, not suggestions. A gate counts only if it re-derives its claim from fixtures and the
real app, not from the code under test.

| Gate | Command | Rule | From |
|---|---|---|---|
| `syntax` | `npm run check` | every module parses | P0 |
| `lint` | `npm run lint` | whitespace, indentation, no `innerHTML`, no `eval`, file size cap | P0 |
| `format` | `npm run format` | clean whitespace | P0 |
| `unit` | `npm test` | all tests pass | P0 |
| `browser` | `npm run test:e2e` | all scenarios pass | P0 |
| `a11y` | `npm run a11y` | zero critical, serious or moderate violations | P0 |
| `contrast` | `npm run contrast` | both themes meet WCAG AA on the token pairs | P0 |
| `deferrals` | `npm run deferrals` | the ledger is well-formed and owned | P0 |
| `benchmark` | `npm run benchmark` | 200 characters and 5,000 items stay within the latency budget | P4 |
| `release` | `npm run release:check` | version, changelog and tag agree | P0 |

A regression in any gate blocks the next phase. `npm test` is the fast tier; a filename always runs that
file.

## Phase gates (what "done" means for each)

| Phase | Gate |
|---|---|
| P0 | The app loads with no build step; a character survives a reload; two tabs never overwrite each other; every gate above is wired in CI |
| P1 | A PDF uploaded to a character survives a reload and renders in the in-app viewer; a wrong file type or an oversize file is refused with a reason; the vendored library has its `SOURCE.md` |
| P2 | The generic, 5e and 3.5e systems evaluate against their fixtures; a custom system is created, derived from a base, exported and imported; a base change shows a diff; a formula cycle and a hostile expression are reported, not hung; a template change keeps orphaned values |
| P3 | Every dice term passes its fixture and distribution test; a roll's log explains every number; `@refs` resolve from a character |
| P4 | Inventory weight, familiars and relations round-trip through a reload and a duplicate; a deleted character leaves no dangling relation target |
| P5 | A character in two campaigns shows in both rosters and the party view reads live sheet values |
| P6 | A backup restores every character, PDF and campaign into an empty browser; a hostile zip is refused; a generated PDF matches the sheet values and an uploaded PDF overrides it |
| P7 | The UI evaluation is done and acted on; the app installs and runs offline; one tag publishes the Pages site, a Windows build and an APK; the full gate set is green twice |

## Deferral discipline

Any time a doc says "later", "for now", "post-v1" or "deferred", the same change adds or cites a
`DEFERRALS.md` row with an owner. An owner phase cannot be called done while its rows are `open`. When a
row lands, mark it `done` and cite the revision; a dropped row says why. `npm run deferrals` fails on a
malformed or ownerless row, and `npm run deferral-scan` reports prose deferrals with no id.

## The template rule

A template change is done only when its fixture still evaluates, every field key it removed is accounted
for as an orphan path, and a character on the old version still opens. A template that silently drops a
stored value is a bug even if its tests are green.

## Committing

Only when asked. A commit is one step, its docs, and its gates.

## Milestone previews

At every milestone completion from P4 on, cut a debug APK and a Windows build for on-device evaluation
and record their filenames and commit in `CHANGELOG.md`. The milestone gate runs first; a preview never
blocks the next milestone. (The build tooling lands with DEF-061 and DEF-066.)

## Releasing

A tag `vX.Y.Z` re-runs the gates, then publishes the GitHub Pages site and attaches the Windows build and
the APK to a GitHub release (G-18, DEF-067). `RELEASING.md` holds the checklist and is created in P0.

## Definition of a phase done

- Its gate holds over the full fixture set, twice.
- Its tools and tests ship.
- Its doc is updated, including a new risk if one appeared.
- Its deferrals are closed or re-owned.
- `TODO.md` says true.
