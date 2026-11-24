# EXCHANGE - backup, bundles, revisions, integrity, search, the generated sheet

> **Scope.** This document owns everything that keeps data recoverable and moves it in and out of the app: the
> zip container, the backup, the character bundle, per-character revisions, integrity repair, quota warnings,
> search, and the generated PDF sheet. Storage layout is `docs/PERSISTENCE.md`; record shapes are
> `docs/ARCHITECTURE.md` 5; the PDF viewer is `docs/PDF.md`. Choices are `DECISIONS.md` X-1 to X-12 and P-6, P-7, P-9, G-19.

**Status:** P6 slices A to C built (zip, backup, restore, quota); slices B to F designed. Slice B imports a bundle through the same review as a backup on the Data page, in Add mode only (a bundle is never a Replace); the dedicated per-collision list in section 7 is the review's counts plus the `(imported)` marking. Slice C keeps the last saved state of each character in memory and writes it as a revision when a new editing session (a 30 minute gap) first saves, so a revision is always the state before the session; a relation to a deleted character is unlinked by clearing its target, keeping the row; the check runs on demand only. Deviations in slice A: a Replace restore is not one Undo step, because the store's history is cleared when the library is swapped; instead a safety copy of the old library is kept and the Data page offers *Restore the previous library*. A restore that adds game systems reloads the page. Backups hold characters, campaigns, systems and files; settings and the roll log are DEF-091.

---

## 1. The one idea

> Every byte the user owns can leave the app in one file and come back from it, and a mistake is never final.

Two promises follow. **Export is complete:** a backup holds records and files, so restoring it on an empty browser
gives the same library. **Change is reversible:** a restore, an import and a revision restore each take a snapshot
first (P-7), so each is one undo away.

## 2. Slices

P6 ships in slices, each with its own gate and release note. A slice can land alone.

| Slice | Delivers | Deferrals |
|---|---|---|
| A. Zip and backup | Zip writer and capped reader, whole-library backup and restore, quota warnings | DEF-030, DEF-071, DEF-033 |
| B. Bundles | One character, or one campaign, as a bundle; import with a review step | DEF-052 |
| C. Revisions and integrity | Bounded per-character snapshots, restore, dangling-reference and orphan repair | DEF-032 |
| D. Search | One query across characters, items, journal, relations, sessions | none (catalogue) |
| E. Generated sheet | A PDF built from the character and system; the uploaded PDF overrides it; print | DEF-064 |
| F. Loose ends | Portrait cropping, handout PDFs in the app viewer, a familiar's sheet editor, translation maps | DEF-022, DEF-090, DEF-087, DEF-080 |

## 3. The zip container (X-1, X-2)

`src/zip.js` is pure over `Uint8Array`. It writes and reads the zip format with two methods only: **stored** (0) and
**deflate** (8). Deflate runs through the platform's `CompressionStream("deflate-raw")` and
`DecompressionStream("deflate-raw")`, so nothing is vendored. The writer stores files already compressed (PDF,
PNG, JPEG, WebP) and deflates text. It computes CRC-32 itself.

**Reader caps (DEF-071).** Before inflating anything the reader checks the central directory against
`LIMITS`: at most `zipEntries` (6,000) entries, at most `zipInflatedBytes` (512 MB) in total, each entry at most
`zipEntryBytes` (64 MB), a compression ratio no higher than 200:1, no path with `..`, a leading `/`, a drive
letter or a backslash, and no duplicate path. A zip64 archive, an encrypted entry or an unknown method is refused
with a reason. Inflation stops the moment an entry passes its declared size. A refused file changes nothing.

## 4. The project file (X-3)

```text
backup.omniscribe.zip
  manifest.json          { format: "omniscribe-backup", formatVersion, schemaVersion, appVersion, createdAt,
                           counts: { characters, campaigns, systems, blobs }, kind: "backup" | "character" | "campaign" }
  project.json           { characters: [...], campaigns: [...], systems: [...], settings? }
  files/<blobId>         the blob bytes, named by id
  files.json             [{ id, type, size, hash, addedAt }]   (metadata the id cannot carry)
```

- `schemaVersion` is the version that wrote the records. Import migrates older data through `MIGRATIONS` exactly as a
  load does and **refuses a newer one** with the message the load uses.
- Records go through `normalizeProject` and the kind descriptors; unknown keys survive in `extensions.unknown`.
- `hash` is SHA-256 of the bytes (`crypto.subtle`). A blob whose bytes do not match is reported and skipped, and the
  records that pointed at it show "file missing" rather than a wrong file.
- The roll log is **not** in a backup by default (it is bounded, disposable); the Data page offers it as a checkbox.
- Secret session notes and secret rolls are included in a **backup** (it is the user's own data) and left out of a
  **shared** campaign bundle (K-9, X-8).
- JSON without files is still offered, for scripting, and says in one line that PDFs and images are not in it.

## 5. Backup and restore (slice A)

**Backup** is on the Data page: *Download a backup* builds the zip from storage (not from memory, so it matches
what is saved), shows progress for large libraries, and names the file `omniscribe-backup-YYYY-MM-DD.zip`. The
page shows when the last backup was made and, if the library changed since, how many characters (X-9). The app
never uploads anything.

**Restore** is two steps, never one:

1. Choose a file. The app reads the manifest and **reviews** it: counts, date, version, files present and any
   problem found (missing or mismatched blobs, newer schema, over-limit counts).
2. Choose a mode: **Replace everything** or **Add to what is here** (X-4).
   - *Replace* writes a safety backup first (a zip kept in storage as `revisions`, one step, replaced by the next),
     then swaps the library in one transaction (`replaceAll`), so a failure leaves the old data.
   - *Add* never overwrites. A record whose id already exists keeps both: the incoming one gets a new id and
     `"(imported)"` in its name; links inside the import (roster rows, relation targets, container ids, session
     attendees) are rewritten to the new ids in one pass (X-5). Blobs are matched by hash and reused.
   Add is one Undo step. Replace is not undoable by Undo; the safety copy is its way back (see Status).

A restore the user abandons changes nothing. The confirmation names what will be replaced and says it can be undone.

## 6. Quota (slice A, DEF-033)

The Data page lists files by size (largest first, with the character that owns each), the library total, the
browser's estimate and quota, and the share used. At 80% it warns; at 95% it refuses a new upload with a message
that names the biggest files and offers the backup button. A failed write from a full disk is reported as that,
not as "save failed" (P-3).

## 7. Bundles (slice B, X-6)

A **character bundle** is the same container with `kind: "character"`: one character, its blobs, and the systems it
needs that are not built in. A **campaign bundle** adds the roster's characters, the campaign's handouts and its
sessions; it asks first whether to include secrets (default no, X-8).

**Import is a review, then a commit.** The dialog lists what it found and what it will do: new characters, ids that
collide (always remapped, as in Add mode), a missing system (offered: include from the bundle, or open without the
sheet and say so), over-limit values (rejected with a reason, never coerced). Nothing is written until the user
confirms; the result is one Undo step. A bundle is the exchange format between two people, so it carries no
settings, no roll log and no other characters.

## 8. Revisions (slice C, P-6, P-7, X-7)

A revision is a snapshot of **one character** stored in `revisions` as `rev_<n>` with `{ characterId, at, label,
signature, size, data }`.

- **When:** before a restore or import touches the character, before a system change rewrites its sheet, and once
  per editing session after the first change (a session is a gap of 30 minutes). The user can also *Save a
  revision* with a label.
- **Bounded:** at most 20 per character and 50 MB in all (`revisionsPerCharacter`, `revisionBytes`); the oldest
  unlabelled one goes first, labelled ones last. A revision with the same signature as the previous one is not
  stored (P-6).
- **Restore** snapshots the current state first, then replaces the character's record and keeps the rest of the
  library (P-7). Blobs a revision points at are kept by reference, so a revision holds its files alive; the orphan
  sweep counts them as referenced.
- A deleted character keeps its revisions for 30 days, so "I deleted the wrong one" has an answer.
- The Revisions panel on the character's Overview lists them (time, label, size), shows what changed in a line
  ("sheet, 3 inventory items, journal"), and restores one after a confirmation.

## 9. Integrity (slice C, P-9)

`src/integrity.js` grows from "find orphans" to a full check, still pure. It reports:

| Finding | Repair |
|---|---|
| Orphan blob (not referenced by a character, campaign handout or revision) | Delete (already built) |
| Dangling blob reference (a document, portrait or handout whose file is missing) | Clear the reference, keep the record, say which |
| Roster row, attendee or initiative entry for a deleted character | Remove it |
| Relation target that no longer exists | Keep the row, mark it `Unlinked` |
| Container cycle or a container that is not a container | `repairContainers` (built) |
| A record over its limit or of an unknown kind | Report only; never coerced |

The Data page runs the check on demand and after a restore, lists findings with counts, and offers *Repair all* or
one at a time. Repair is one Undo step and writes a revision for each character it touches.

## 10. Search (slice D, X-10)

`src/search.js` is pure: it builds a flat index from the records (character names, players, tags, summary, item
names and notes, ability names, journal titles and text, relation names, familiar names, campaign names, session
titles and recaps, handout names) and answers a query with ranked hits. Matching is case- and accent-insensitive,
prefix-friendly and multi-word (every word must match). A hit says what it is and where it lives and opens that
page. The index is rebuilt on a record change, lazily, and never stores secret session notes in a result a shared
view would show (K-9). The palette gets a *Search everything* command and a `?` prefix; the Library keeps its own
filter. Results are capped (50) and the cap is said.

## 11. The generated sheet (slice E, G-19, X-11)

A character always has a **generated sheet**: a PDF built from the character and the resolved system, in the order
the system's template lists its sections. An uploaded PDF **overrides** it only when the user marks it as the main
sheet (a `main` flag on a document; the generated one stays one click away). The PDF page and the print view show
the main sheet.

**Writer.** `src/pdf/generate.js` is an own minimal PDF writer, no library: the page tree, the built-in
Helvetica and Courier fonts (WinAnsi), lines, rectangles, text with wrapping, a table helper and page breaks. It
needs no vendored code and no font files. Text outside WinAnsi is replaced by `?` and the sheet says so on its last
page. It runs in the page (no worker) and handles a long inventory by paging.

**Content.** Identity, the evaluated sheet values and their sections, conditions and pools, inventory with weight
and money, abilities, familiars, relations, and the journal titles. Journal bodies and secret fields are omitted
unless the user ticks *Include journal text*. The same layout drives the print view (`@media print` styles), so
print and PDF agree.

## 12. Loose ends (slice F)

- **Portrait cropping (DEF-022):** a dialog with a square crop and zoom over the existing 512 px scaler.
- **Handout PDFs in the app viewer (DEF-090):** `src/pdf/view.js` takes a blob id and a title instead of a character.
- **A familiar's sheet editor (DEF-087):** the Sheet builder takes a target (the character or one familiar).
- **Translation (DEF-080):** from a file, propose field, row and column maps between two systems with conversion
  formulas, show them in a review dialog, apply on confirmation as one Undo step. Authored maps ship per pair (the
  generic system to 5e and 3.5e first). If the slice runs long, it moves to P8 and its row says why.

## 13. Limits added

`zipEntries` 6,000; `zipInflatedBytes` 512 MB; `zipEntryBytes` 64 MB; `zipRatio` 200; `revisionsPerCharacter` 20;
`revisionBytes` 50 MB; `searchResults` 50; `backupWarnAt` 0.8; `quotaRefuseAt` 0.95.

## 14. Tests and scenarios

- Unit: zip round trip and every refusal (bomb ratio, entry count, path traversal, bad CRC, zip64, encrypted),
  manifest validation, id remapping with links intact, blob hash mismatch, revision bounds and dedupe, every integrity
  finding and repair, search ranking and the secret rule, the PDF writer's structure (xref offsets, page count,
  text escaping).
- Scenarios: back up, wipe, restore and compare; add-mode import keeping both records; a character bundle between
  two profiles; a newer-schema file refused; an abandoned restore changes nothing; a revision restore and its undo;
  repair after seeding dangling data; search opens a journal entry; the generated sheet downloads and the override
  switches the shown PDF; a phone-width fit for every new dialog and panel.
- Accessibility: every new dialog and panel joins `e2e/a11y.mjs` in the change that adds it.
