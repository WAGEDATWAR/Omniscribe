@AGENTS.md

## Claude Code notes

- `AGENTS.md` is the shared, harness-neutral source of truth; this file only adds Claude Code specifics.
  Do not duplicate rules here.
- Baseline before any change once P0 has landed: `npm run check`, `npm run lint`, `npm run format`,
  `npm test`. Before calling work done also run `npm run test:e2e`, `npm run a11y`, `npm run contrast`,
  `npm run deferrals`, `npm run deferral-scan` and `npm run release:check` (see the gates table in
  `PLAN.md`).
- Scratch files (`dbg-*.mjs`, `a11y-out.txt`) are gitignored; keep throwaway scripts in the scratchpad.
- `www/` and `android/` build output are generated; never edit them by hand.
- Never commit, tag or push unless asked. Record work in `TODO.md`, `DEFERRALS.md`, `CHANGELOG.md` and the
  owning doc in the same change.
