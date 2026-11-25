# DISTRIBUTION - the PWA, Pages, the Windows build, the APK and the release workflow

> **Scope.** How the same app reaches a browser, an installed web app, Windows and Android, how a tag
> publishes all of them, and how the UI is evaluated before v1. Product intent is `docs/OMNISCRIBE.md`;
> choices are `DECISIONS.md` G-18, P-15, P-16, U-10 and R-1 to R-8. The reference implementation is Loreweaver
> (`C:\Dev\Web Projects\Loreweaver`): its `sw.js`, `scripts/bundle.mjs`, `scripts/build*.mjs` and
> `.github/workflows/deploy.yml` are copied and adapted, not linked.
>
> **Status:** designed (P7); slice R-A (the bundle and the PWA shell) is built.

## 1. One bundle, four shells

The app is native ES modules with no build step, so a *bundle* is a copy of the shipped files, not a
compilation. `npm run bundle` writes `www/` (generated, never edited by hand):

```
www/  index.html  favicon.svg  favicon.ico  manifest.webmanifest  sw.js  icons/  src/  .nojekyll
```

Excluded: `test/`, `e2e/`, `scripts/`, `docs/`, `node_modules/`, every `SOURCE.md`. Every shell loads this
directory unchanged, so a fix reaches all of them from one tag:

| Shell | How it gets `www/` | Storage origin (P-16) |
|---|---|---|
| Browser, GitHub Pages | The Pages artifact is `www/` | the Pages origin |
| Installed web app (PWA) | The same site, installed from the browser | the Pages origin (shared with the browser tab) |
| Windows | Electron loads `www/` from disk through a custom `app://` protocol | its own |
| Android | Capacitor packs `www/` into the APK (`https://localhost` scheme) | its own |

A backup file (`docs/EXCHANGE.md`) is the only bridge between origins, and the Data page says so (P-16).

## 2. The PWA shell (DEF-065)

- **Manifest.** `manifest.webmanifest`: name, short name, `start_url "./"`, `scope "./"`, `display standalone`,
  theme and background colours from the dark tokens, icons: an SVG, a maskable SVG and PNGs at 192 and 512
  (maskable and any), because installability checks want PNGs.
- **Service worker.** `sw.js`, network-first for same-origin GETs with a cache fallback, so an online load always
  gets fresh files and never a mix of two versions, and an offline load works. The bundle stamps `VERSION` with a
  hash of every shipped file and `PRECACHE` with the list, so a new build gets a new cache and the old one is
  deleted on activate. It never touches non-GET requests or other origins, and never caches a failed response.
- **Offline PDF viewer.** PDF.js (core, worker, wasm, cMaps that ship, standard fonts) is in `PRECACHE`; an
  uncached optional file fails soft with the viewer's own message (U-8).
- **Registration.** `main.js` registers `./sw.js` only on `http(s)` and ignores failure. The wrapped shells
  register it too and are unaffected (Electron and Capacitor serve from a fixed origin).
- **Update.** A new service worker takes over on the next load (`skipWaiting`, `clients.claim`). The tab guard
  (P-8) already protects two open tabs of different versions; the app shows no update prompt in v1.
- **Content-Security-Policy.** Unchanged: `default-src 'self'` already covers the manifest and the worker, and the service worker needs no `unsafe-*`.

**As built (R-A).** `scripts/bundle.mjs` exports `buildBundle({ source, out })` (the CLI writes `www/`), `scripts/icons.mjs` renders the PNG icons from the SVGs with the local Chrome (the PNGs are committed), and the offline scenario serves a built bundle, lets the worker install, stops the server and reloads. There is no `favicon.ico`; the SVG favicon is the only one.

## 3. GitHub Pages and the release workflow (DEF-067)

Today a push to `main` publishes the site through GitHub's branch deploy. G-18 says a *tag* publishes, so
the Pages source moves to **GitHub Actions** (a repository setting the owner changes once).

`.github/workflows/release.yml`, on tags `v*` and manual dispatch:

1. **verify** - `npm ci`, then check, lint, format, test, e2e, a11y, contrast, deferrals, deferral-scan and
   release:check. A red gate stops the release.
2. **pages** - `npm run bundle`, upload `www/`, deploy to Pages.
3. **windows** - on `windows-latest`: bundle, build the Electron app, zip it as `Omniscribe-<version>-win-x64.zip`.
4. **android** - on `ubuntu-latest`: Java 21 and the Android SDK, bundle, sync Capacitor, assemble the APK,
   named `Omniscribe-<version>.apk`.
5. **release** - create the GitHub release for the tag with the CHANGELOG section as its notes and attach the
   zip and the APK, with SHA-256 sums.

`ci.yml` stays as the gate for `main` and pull requests and gains `npm run bundle` plus a bundle test, so a
broken bundle is found before a tag.

## 4. The Windows build (DEF-066)

`desktop/` holds a minimal Electron main file and its `package.json`; Electron and its packager are dev
dependencies (P-15), installed only in the build job and `desktop/`. The main process:

- registers a privileged `app://` scheme that serves files from `www/` (so IndexedDB and the service worker get
  a stable secure origin, and no file is read outside `www/`);
- opens one window, remembers its size, disables `nodeIntegration`, enables `contextIsolation` and the sandbox,
  denies new windows and navigations away from `app://`, and opens external links in the system browser;
- has no preload script, no IPC and no auto-update in v1.

The output is a portable unpacked folder zipped for download. An installer and code signing are out of v1.

## 5. The Android build (DEF-061)

Capacitor 6 as in Loreweaver: `capacitor.config.json` with `webDir "www"`, `androidScheme "https"`, and an
`android/` platform project that is tracked (build output is ignored). `scripts/build.mjs` runs the bundle, `cap
sync` and Gradle, and prints the APK path; `--variant debug` and `--dry-run` as in Loreweaver. Releases attach a
**debug-signed** APK until the owner provides a keystore (DEF-061 stays scheduled): the file installs by
sideloading and says so in the release notes. The app id is `sh.omniscribe.app`.

Android file access: backup download uses an anchor click with a blob URL, which Capacitor's WebView supports
as a download; if a device refuses, the Data page offers *Share* through the Web Share API when present.
This is verified on a device before v1, and the result is recorded in `TODO.md`.

## 6. The UI evaluation (DEF-060, U-10)

U-10 allows layout and style changes, not changes to the model, the engines or the pure core. The method is
Loreweaver's, adapted:

1. **Capture.** `npm run ui:review` drives every page and dialog at 360, 768, 1280 and 1920 px in both themes
   and writes screenshots, console errors, horizontal overflow, targets under 44 px and heading outline to
   `test-results/ui-review/`.
2. **Keyboard.** `npm run ui:keyboard` tabs through every page, recording focus order, visible focus, traps and
   unreachable controls.
3. **Rank.** Findings are ranked in `docs/UI-REVIEW.md` by severity (blocks a task, slows a task, looks wrong,
   polish) with the page and a screenshot.
4. **Act.** Everything that blocks or slows a task is fixed, and each fix has a scenario or an a11y state.
   What is left is a `DEFERRALS.md` row.
5. **Screen reader (DEF-062).** A manual pass with NVDA on Windows or TalkBack on Android is a checklist the
   owner runs; the findings go into the same document.

## 7. Other P7 items

- **Benchmark gate.** A script builds a 200-character, 5,000-item library in a memory store and times load,
  save, search and render of the heaviest page against budgets; `npm run benchmark` is part of the release
  checklist (charter success criterion).
- **PDF text layer (DEF-075) and CJK maps (DEF-076).** Text selection needs PDF.js's text layer in the canvas
  viewer; CJK maps are about 1.5 MB. Each is built if the slice has room and otherwise moves to P8 with its
  reason, as slice F did.
- **v1 tag.** After P7's gate holds twice: `v1.0.0`, which is the first release with a Windows build and an APK
  attached.

## 8. Slices

| Slice | Deliverable | Rows |
|---|---|---|
| R-A | Manifest, icons (SVG and PNG), `sw.js`, `npm run bundle`, registration, offline scenario | DEF-065 |
| R-B | `release.yml`, Pages from Actions, `ci.yml` gains the bundle step | DEF-067 (part) |
| R-C | `desktop/` Electron wrapper, local build script, Windows job | DEF-066 |
| R-D | Capacitor project, APK build script, Android job, device check of downloads | DEF-061 (debug) |
| R-E | UI review scripts, `docs/UI-REVIEW.md`, fixes | DEF-060, DEF-062 |
| R-F | Benchmark gate, PDF text layer or its move to P8, v1 phase gate and tag | DEF-075, DEF-076 |

## 9. Tests

- Unit: the bundle's file list excludes tests and docs; `sw.js` is stamped with a version that changes when a
  file changes; every entry in `PRECACHE` exists in `www/`; the manifest is valid and its icons exist; the
  Electron protocol handler refuses paths outside `www/` (pure function, tested in Node).
- Scenario: the bundle served from a directory installs the service worker, goes offline, reloads and still
  opens the Library and a character; a second build version replaces the cache.
- Accessibility: no new page; the UI evaluation adds states it finds missing.
- CI: the release workflow runs on a throwaway tag in a fork or by manual dispatch before the first real tag.
