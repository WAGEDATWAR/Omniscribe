# Omniscribe

A local-first web app that keeps every tabletop RPG character in one place: the uploaded PDF sheet, a
value-based sheet the program can compute with, inventory, familiars, relations, journals, campaigns and a
dice table that rolls with a character's own values. No account, no backend; your browser is the
database.

**Status:** planned. See `TODO.md`.

## The one idea

> Make the character's numbers data, so everything else can use them.

A sheet template defines the fields and how they derive; a game system is a template, not code. A roll
like `1d20 + @str.mod + @prof` resolves against whichever character you pick.

## How to read this repository

Start with `DOCUMENTATION-INDEX.md`. The charter is `docs/OMNISCRIBE.md`, the design is
`docs/ARCHITECTURE.md`, choices are `DECISIONS.md`, and the live status is `TODO.md`.

Built on the foundations of Loreweaver: vanilla ES modules with no runtime dependencies, a pure core, one
writer, text-only rendering, topic-owned docs, a deferral ledger and gates that block the next phase.
