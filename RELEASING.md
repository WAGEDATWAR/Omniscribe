# Releasing

Omniscribe uses a simple pre-1.0 semantic versioning convention.

## Versioning

- `package.json` holds the source of truth: `MAJOR.MINOR.PATCH`.
- While pre-1.0, `MINOR` marks a feature release (normally a finished phase) and `PATCH` marks a fix or
  small follow-up.
- Git tags use the `v` prefix and match `package.json` exactly (for example `0.1.0` -> `v0.1.0`).
- `CHANGELOG.md` must contain a `## [<version>]` entry for every release.

## Checklist

1. Update `version` in `package.json`.
2. Update the `app-version` meta tag in `index.html` to match.
3. Add a `## [<version>]` section to `CHANGELOG.md` and move finished entries out of `Unreleased`.
4. Run the full verification suite:
   - `npm ci`
   - `npm run check`
   - `npm run lint`
   - `npm run format` (should report clean)
   - `npm test`
   - `npm run test:e2e`
   - `npm run a11y`
   - `npm run contrast`
   - `npm run deferrals`
   - `npm run deferral-scan`
   - `npm run release:check`
5. Commit the release changes.
6. Push `main`.
7. Create an annotated tag: `git tag -a v<version> -m "v<version> - <summary>"`.
8. Push the tag: `git push origin v<version>`.

Publishing the GitHub Pages site, the Windows build and the Android APK from a tag arrives with the P7
release workflow (DEF-067).

## Verification scripts

- `npm run check` syntax-checks every JavaScript module.
- `npm run lint` enforces whitespace, indentation, no `innerHTML`, no `eval` or `Function`, the file size
  cap and a `SOURCE.md` for every vendored library.
- `npm run format` checks trailing whitespace and final newlines (`format:write` fixes them).
- `npm test` runs the unit tests; `npm run test:e2e` drives the real app in headless Chrome.
- `npm run a11y` runs axe-core over the app's pages and dialogs; `npm run contrast` checks both themes.
- `npm run deferrals` validates the ledger; `npm run deferral-scan` reports prose deferrals without an id.
- `npm run release:check` verifies the version, the changelog entry and the tag agree.
