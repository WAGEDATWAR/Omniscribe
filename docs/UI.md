# UI - layout, tokens, interaction, accessibility

> **Scope.** This document owns the visual system: layout, tokens, the page anatomy, interaction patterns,
> accessibility and responsive rules. Behaviour belongs to the topic docs.

**Status:** built through P1.

---

## 1. Layout and navigation

Two modes (U-4). **Hub pages** have no side menu: the **Library** (home), **Data** and **Settings**.
**A character** opens its own page with a back link to the Library and a **link bar** under the header
(U-11): Overview and PDF sheets today, and later Sheet, Inventory and the rest. The current page carries
`aria-current`, and the bar scrolls sideways on a phone.

The **sidebar** on the left holds the app's pages (Library, Game systems, Data, Settings, each with its
shortcut), the command palette and the shortcuts. The button at the top left shows or hides it and the
choice is remembered. Below 900 px it becomes a drawer over the page with a scrim that closes after you pick
a page or press `Esc`. The current page carries `aria-current`. The brand links to the Library. The top
bar also holds the save state, Undo, Redo and the palette button.

Routes are the location hash and the only view state (U-5, `src/views.js`):

| Route | Shows | Shortcut |
|---|---|---|
| `#/library` (default) | character tiles, search, sort, New | `Alt+1` |
| `#/data` | storage, protection, files | `Alt+2` |
| `#/settings` | theme, shortcuts, about | `Alt+3` |
| `#/character/<id>` | the character overview | palette |
| `#/character/<id>/pdf` | the character's PDF sheets and viewer | link bar |

An unknown route is the Library. A character that no longer exists sends you to the Library with a
message. The window title names the page or the character. After navigation, focus moves to the page
heading.

## 2. Page anatomy (U-6)

Every page is built from the same components in `src/ui/dom.js`: `pageHeader` (back link, title,
subtitle, actions), `section` (a titled panel), `field` (label, control, hint) and `emptyState`.
A new page uses these and invents no layout; parity between pages is a checklist, not a review.

### 2.1 Portraits and PDF sheets

- A **portrait** shows on the tile (a 40 px round avatar, or the initials when there is none) and on the
  Overview, where it can be chosen or removed. Removing offers Undo.
- The **PDF sheets** page lists documents as rows you can edit in place: rename, view, mark as the sheet,
  download, remove (with confirmation and Undo). Files can be dropped anywhere on the page. A refused
  file is explained in a toast and nothing is stored.
- The **viewer** sits under the list with zoom out, zoom in, fit width and a page count. Pages draw as
  you scroll to them. A damaged or password-protected PDF shows a message in place of the pages and its
  Download button still works. Details are in `docs/PDF.md`.

## 3. Tokens

Dark is the default and light is opt-in (G-7), chosen in Settings or the palette and remembered in
`localStorage`. The tokens are CSS custom properties in `src/styles.css` and `npm run contrast` checks
both sets for WCAG AA.

| Token | Dark | Use |
|---|---|---|
| `--bg` | `#0b0d12` | App background |
| `--surface` | `#11151c` | Panels, top bar |
| `--surface-raised` | `#161b24` | Dialogs, menus, toasts |
| `--surface-sunken` | `#0e1118` | Inputs |
| `--border` | `#232936` | Separators |
| `--text` / `--text-soft` | `#e9edf4` / `#c8d0dd` | Primary and secondary text |
| `--muted` / `--faint` | `#99a3b5` / `#7c8799` | Hints and labels |
| `--accent` | `#8fa8ff` | Focus, primary actions, selection |
| `--danger` / `--success` / `--warning` | `#ff8795` / `#7ee2b8` / `#e6c27a` | Status |

Type is the system UI stack at 14 px; titles are 24 px; monospace only for keys. Spacing is a 4 px
rhythm; radius is 8 px for controls, 12 px for panels, 16 px for dialogs.

## 4. Interaction

- **Autosave, no Save button.** Typing writes straight to the store; the header shows the save state.
- **Destructive actions confirm**, then offer **Undo** in a toast (G-6). Undo restores that exact
  character even if you have done other things since.
- **Undo and redo** are bounded and session-only; `Ctrl+Z` and `Ctrl+Shift+Z` work outside text fields
  so the browser's own text undo is never hijacked.
- **The command palette** (`Ctrl+K`) is a native dialog with a combobox and listbox. It lists every
  page, New character, Undo and Redo when available, the theme switch, the shortcuts, and one Open
  command per character.
- **Chips** for tags: Enter or comma adds, paste splits, Backspace removes the last.
- **Toasts** announce in a polite live region; one may carry an action.

## 5. Accessibility

- Native `<dialog>` for every dialog (U-2) and `popover` for the menu, so focus containment and `Esc`
  come from the platform.
- Every page has one `h1`, landmarks, a skip link and a visible focus ring.
- Icon-only buttons carry `aria-label` and `title` (U-7). Tile actions name their character.
- `prefers-reduced-motion` disables animation (U-7).
- **`npm run a11y`** runs axe-core over 26 states (every page, every dialog, the menu, the palette,
  the PDF page empty, rendered, damaged and with the sheet marked, portraits, light theme and a phone
  width) and fails on any critical, serious or moderate violation. A button's accessible name must
  contain its visible text, so labels read "Use as the sheet: Sheet.pdf", not the reverse. A new dialog
  or page joins `e2e/a11y.mjs` in the same change (U-3).

## 6. Responsive

The layout is a single centred column up to 1,080 px. Below 640 px the form grid and toolbar stack, the
brand shows only its mark and the facts lists stack. Tiles reflow with `auto-fill`.

## 7. Content security

`index.html` sets a Content Security Policy: scripts, styles and connections from the app only (scripts
may also compile WebAssembly for the PDF decoders, P-18), images from the app, `blob:` and `data:`, no
objects and no inline script or style. A policy violation is a
console error, which the browser scenarios treat as a failure.

## 8. The Sheet page and Game systems (P2)

- **Sheet** (`#/character/<id>/sheet`): with no sheet the page shows a system picker. Once started it shows
  the sections the system defines. Authored values are typed inputs; a value the system refuses is
  explained under the field and not stored. Derived values and modifiers are read-outs, a marker such as a
  dagger is shown beside them, and a formula that fails shows its message in place of the value while the
  rest of the sheet keeps working. Pools show a number with a maximum or tickable boxes, rows live in
  tables (grouped, with use counters), conditions are toggle buttons, and each rest the system defines is a
  button with Undo. Values that no field matches are listed as kept aside. Change system asks first and
  can be undone.
- **Game systems** (`#/systems`, `Alt+4`): every system with its version, what it derives from and how many
  characters use it. Built-ins can be viewed, derived and exported. Your own can also be edited and deleted
  (never while a character follows that version).
- **System editor** (`#/systems/<id>`): a Visual view and a JSON view of the same system. Visual has tabs
  for Details, Fields, Pools, Collections (with their columns), Tables, Conditions, Rests, Rolls and Sections;
  each tab lists entries beside a form for the one you pick, with add (key checked) and remove (confirmed).
  Forms commit when a control changes. The JSON view is the whole file. Both are checked as you type, with
  problems listed by path, a summary and a test evaluation. Saving never alters a version in use; it adds
  a new one. Built-in systems are read-only.
- Button names contain their visible text, and every control in a table carries the row name.
