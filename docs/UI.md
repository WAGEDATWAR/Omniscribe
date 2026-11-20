# UI - layout, tokens, interaction, accessibility

> **Scope.** This document owns the visual system: layout, tokens, the page anatomy, interaction patterns,
> accessibility and responsive rules. Behaviour belongs to the topic docs.

**Status:** built for P0. The editor menu arrives with the first sub-pages in P1 and later.

---

## 1. Layout and navigation

Two modes (U-4). **Hub pages** have no side menu: the **Library** (home), **Data** and **Settings**.
**A character** opens its own page with a back link to the Library; when characters get sub-pages
(sheet, PDF, inventory and so on) the editor menu appears there and carries only that character's pages.

The **brand** (logo and name, top left) opens the app menu: Library, Data, Settings, the command palette
and the shortcuts. It is a native `popover`, so it closes on outside click and `Esc`. The top bar also
holds the save state, Undo, Redo and the palette button.

Routes are the location hash and the only view state (U-5, `src/views.js`):

| Route | Shows | Shortcut |
|---|---|---|
| `#/library` (default) | character tiles, search, sort, New | `Alt+1` |
| `#/data` | storage, protection, files | `Alt+2` |
| `#/settings` | theme, shortcuts, about | `Alt+3` |
| `#/character/<id>` | the character page | palette |

An unknown route is the Library. A character that no longer exists sends you to the Library with a
message. The window title names the page or the character. After navigation, focus moves to the page
heading.

## 2. Page anatomy (U-6)

Every page is built from the same components in `src/ui/dom.js`: `pageHeader` (back link, title,
subtitle, actions), `section` (a titled panel), `field` (label, control, hint) and `emptyState`.
A new page uses these and invents no layout; parity between pages is a checklist, not a review.

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
- **`npm run a11y`** runs axe-core over 17 states (every page, every dialog, the menu, the palette,
  light theme and a phone width) and fails on any critical, serious or moderate violation. A new dialog
  or page joins `e2e/a11y.mjs` in the same change (U-3).

## 6. Responsive

The layout is a single centred column up to 1,080 px. Below 640 px the form grid and toolbar stack, the
brand shows only its mark and the facts lists stack. Tiles reflow with `auto-fill`.

## 7. Content security

`index.html` sets a Content Security Policy: scripts, styles and connections from the app only, images
from the app, `blob:` and `data:`, no objects and no inline script or style. A policy violation is a
console error, which the browser scenarios treat as a failure.
