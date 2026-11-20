# PERSISTENCE - storage, migration, safety

> **Scope.** This document owns how data is stored, saved, migrated and protected. The record shapes are
> `docs/ARCHITECTURE.md` 5; the choices are `DECISIONS.md` P-1 to P-16.

**Status:** built for P0. Backups, revisions and integrity repair are P6 (DEF-030, DEF-032).

---

## 1. Layout

IndexedDB database `omniscribe`, version 1, with one object store per record kind: `meta`,
`characters`, `campaigns`, `templates`, `rolls`, `blobs`, `revisions`. All are created on first open so a
later phase adds records, not stores. Only `meta`, `characters` and `blobs` are written in P0.

| Store | Key | Value |
|---|---|---|
| `meta` | `schemaVersion`, `savedAt` | the schema version that wrote the data, the last save time |
| `characters` | `char_*` | one character aggregate |
| `blobs` | `blob_*` | `{ id, type, size, addedAt, data: Blob }` |

## 2. The storage contract

`src/storage/idb.js` (IndexedDB) and `src/storage/memory.js` (in memory) implement one contract:
`get`, `getAll`, `keys`, `apply`, `clear`. `apply` takes `[{ store, put: [[key, value]], delete: [key] }]` and
commits every operation in **one transaction**, so a save is atomic across stores. `src/storage.js`
builds the application API on a backend: `load`, `save`, `putBlob`, `getBlob`, `deleteBlob`,
`blobUsage`, `meta`, `clear`.

- **Serialized writes.** Every write runs through one promise queue, so two saves never interleave and the
  last one wins (P-1).
- **Per-record saves.** A save names the changed records and the deleted ids. Editing one character
  never rewrites the others (P-10). The store tracks the dirty set by reference comparison.
- **Degraded mode.** If IndexedDB cannot open, `openStorage` returns an in-memory store flagged
  `degraded`, and the app shows a persistent warning that nothing will be kept. A `localStorage` copy
  was rejected because it would be a second source of truth (it narrows P-1).

## 3. Autosave

`src/autosave.js` debounces 400 ms after a change and saves the dirty set. The header shows one of
`Saved`, `Unsaved changes`, `Saving…`, `Save failed, retrying` or `Saving paused`. A failed save puts its
batch back and retries after 3 s; nothing is dropped. The page flushes when it is hidden or closing, and
the browser's leave-page prompt appears while anything is unsaved.

## 4. One writer tab (P-11)

`src/tabGuard.js` uses a `BroadcastChannel`. Tabs tell each other when they save. A tab that learns its
data is out of date does one of two things (`peerSaveAction`):

- **Nothing unsaved:** it reloads from storage quietly and says so.
- **Unsaved edits:** it pauses saving and asks: *Load the other tab's changes* (discarding its own) or
  *Keep my changes* (saving them, then merging in the rest). It never overwrites silently.

Because saves are per record, "keep" overwrites only the records the tab actually edited.

## 5. Migrations (P-2)

`src/migrations.js` holds an append-only list. The schema version is `1 + migrations.length`. On load,
data older than the current version is migrated in memory and every record is marked dirty so it is
written back. Data from a **newer** version is refused: the app shows a message and changes nothing.
A released migration is never edited.

## 6. Protection (P-12, P-16)

At boot the app asks the browser for persistent storage and the Data page shows the result and a button
to ask again. The Data page also states that each shell (browser, installed app, Windows build, Android)
has its own storage and a backup file is the only bridge.

## 7. Limits

`src/limits.js` is the one place for limits (DEF-072 for the import side): 5,000 characters, field
length caps, 100 undo steps, 25 MB per PDF and 8 MB per portrait (declared now, enforced from P1).

## 8. Not yet built

Backups and restore (DEF-030), revisions (DEF-032), integrity repair, quota warnings (DEF-033) and the
zip reader caps (DEF-071) belong to P6.
