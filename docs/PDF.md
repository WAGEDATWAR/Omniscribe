# PDF - attachments, the viewer, portraits

> **Scope.** This document owns uploaded PDFs and portraits: limits, validation, storage, the vendored
> library, the viewer, and what is deliberately not done. The record shapes are `docs/ARCHITECTURE.md` 5;
> storage is `docs/PERSISTENCE.md`; the choices are `DECISIONS.md` G-15, G-19, P-13, P-14, P-17, U-8.

**Status:** built for P1. The generated sheet and the form-field mapping are P6 and P8 (DEF-064, DEF-020).

---

## 1. What a PDF is here

A character keeps any number of uploaded PDFs as **documents**. A PDF is a view of the character, not
its source (G-15): the values live in the sheet. One document can be marked **the sheet**, which makes
it the override that stands in for the generated PDF once that exists (G-19). Until then, "the sheet" is
only a marker that the Library and the character page can show.

## 2. The library

The viewer is **PDF.js** (`pdfjs-dist` 6.5.438, Apache-2.0), vendored under `src/vendor/pdfjs/` with a
`SOURCE.md` that records the version, the tarball hash and the hash of every file (P-14). It is loaded
**only** when a PDF page is opened, by dynamic `import()`, so the rest of the app never pays for it.

| Vendored | Why |
|---|---|
| `build/pdf.min.mjs`, `build/pdf.worker.min.mjs` | the reader and its worker |
| `standard_fonts/` | the standard 14 fonts that character sheets often leave unembedded |
| `wasm/` (JBIG2, OpenJPEG, colour management) | image formats and colour accuracy |
| `iccs/` | the colour profile |
| `LICENSE` and the wasm and font licences | Apache-2.0 and the third-party notices |

**Left out on purpose:** the scripting sandbox (`pdf.sandbox`, `quickjs`), so PDF JavaScript cannot run
even by mistake; source maps; the web viewer UI; and the CJK character maps (DEF-076).

**Updating.** Download with `npm pack pdfjs-dist@<version>` into an empty directory, copy the listed
files over `src/vendor/pdfjs/`, recompute every hash in `SOURCE.md`, record the version here and in
`DECISIONS.md`, and run all gates. A vendor update is its own change.

## 3. Accepting a file

A file is judged by its **bytes**, never its name or its reported type (P-13). `src/files.js` is pure.

| Kind | Rule | Limit |
|---|---|---|
| PDF | the first 1,024 bytes contain `%PDF-` | 25 MB, at most 20 documents per character |
| Portrait | PNG, JPEG, WebP or GIF by magic bytes | 8 MB |

An empty file, an oversize file, a wrong type and a full document list are each refused with a plain
reason in a toast; nothing is stored. A name is cut to 200 characters and a path is dropped.

## 4. Storage

The file is stored once in the `blobs` store; the character holds a **document** that points at it:

```text
documents: [{ id: "doc_...", blobId: "blob_...", name, size, kind: "pdf", addedAt }]
pdf: { preference: "generated" | "uploaded", uploadedId: "doc_..." | null }
portraitBlobId: "blob_..." | null
```

- **Blobs are immutable and shared by reference (P-17).** Duplicating a character gives the copy its own
  document records pointing at the same blobs. Removing a document or a portrait only drops the
  reference.
- **Unused files are collected by reachability.** A blob no character points at is an orphan. At start-up
  the app deletes orphans older than ten minutes (the grace covers an upload in another tab that has not
  been saved yet and Undo within a session). The Data page lists the unused files and can remove them at
  once.
- A document whose blob is missing shows "file missing" and can still be removed.
- `pdf.uploadedId` must name an existing document; normalisation clears it otherwise.

## 5. Portraits

An image is decoded in the browser, **scaled so its longer side is at most 512 px** and stored as WebP
(PNG where WebP is unavailable). The original is not kept, which keeps the library light; cropping is
DEF-022. The portrait shows on the Library tile and the character page. Without one, a tile shows the
character's initials.

## 6. The viewer

`src/pdf/view.js` opens a document from its blob and renders pages to canvases.

- **Lazy.** PDF.js is imported on first use. Pages render as they scroll into view and are released when
  far away, so a long PDF does not hold every page in memory.
- **Controls:** zoom out and in, fit to width (the default), page count. Each canvas has an accessible
  name ("Page 2 of 5").
- **Options:** `isEvalSupported: false`, `enableScripting` off, fonts, wasm and profiles from the
  vendored folders. Form fields and annotations draw as part of the page; they are not interactive.
- **Errors** are shown in the page: a password-protected PDF, a damaged one, or a file that PDF.js
  cannot read, each with its own message and the Download button still working.
- **Download** saves the original bytes under the document's name.

## 7. Active content

A PDF can carry JavaScript, links, embedded files and form actions. Here:

- the scripting sandbox is not vendored and scripting is off, so no PDF script runs;
- pages are drawn to a canvas, so there is no live document for a script or link to act on;
- the Content Security Policy allows connections to the app only, so a PDF cannot call out;
- embedded files are never extracted and links are not followed.

The one relaxation is `'wasm-unsafe-eval'` in `script-src`, which lets PDF.js compile its WebAssembly
decoders. It permits WebAssembly only, not `eval` or `Function`. The test fixtures contain no JPEG 2000,
JBIG2 or ICC-profiled images, so no scenario exercises the decoders themselves; a real sheet with such
images is the first thing to try on any vendor update.

## 8. Tests

- `test/files.test.js`: every kind, every refusal, name cleaning.
- `test/documents.test.js`: normalisation, migration, the store actions, duplication and orphan finding.
- Browser: upload, view (a check that the canvas holds real black and white pixels), reload, refusal of
  a fake PDF and of a fake image, a damaged PDF, rename, mark as the sheet, remove with Undo, portrait
  scaling to 512 px, shared files across a duplicate, unused-file cleanup, migration of version 1 data
  and the link bar. Download is not driven by a browser scenario.
- Accessibility: the PDF page empty, rendered, damaged, with the sheet marked, on a phone and in the
  light theme; the character page and a tile with a portrait; the Data page with unused files.

## 9. Not built

Text selection and search in the viewer (DEF-075), the CJK character maps (DEF-076), portrait cropping
(DEF-022), the generated sheet (DEF-064) and mapping an uploaded PDF's form fields to values (DEF-020).
