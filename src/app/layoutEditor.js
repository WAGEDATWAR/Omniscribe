import { compactOps } from "../layouts/compact.js";
import { resolveLayout } from "../layouts/resolve.js";
import { SURFACE_IDS } from "../layouts/surfaces.js";
import { createLayoutEditor } from "../ui/layoutEditor.js";

const SURFACE_NAMES = {
  character: "character",
  campaign: "campaign",
  inventory: "inventory item",
  abilities: "ability",
  journal: "journal entry",
  relations: "relation",
  progression: "progression entry",
  familiars: "familiar",
  roster: "roster member",
  sessions: "session",
  handouts: "handout"
};

/** The page a route shows the fields of, or null when it shows none. */
export function surfaceOfRoute(route) {
  if (route.view === "character") {
    return route.sub === "overview" ? "character" : SURFACE_IDS.includes(route.sub) ? route.sub : null;
  }

  if (route.view === "campaign") {
    return route.sub === "overview" ? "campaign" : ["roster", "sessions", "handouts"].includes(route.sub) ? route.sub : null;
  }

  return null;
}

/**
 * Edits the layout of one page at a time (L-5). Each change appends operations to the active layout and compacts them;
 * the previous operations are kept on an undo stack for as long as the editor is open.
 */
export function createLayoutEditorController(ctx) {
  const { layouts, bus, confirm, toast } = ctx;
  let surface = null;
  let undo = [];
  let redo = [];
  let problem = "";

  const view = createLayoutEditor({
    onOps: (ops) => change(ops),
    onUndo: () => step(undo, redo),
    onRedo: () => step(redo, undo),
    async onReset() {
      if (await confirm({ heading: "Reset this layout?", body: "Every change to this page's layout is removed and the default returns. Values in fields of your own are kept and come back if you add the field again. You can undo this.", confirmLabel: "Reset" })) {
        await commit([]);
      }
    },
    async onRemoveField(item) {
      if (await confirm({ heading: `Remove ${item.label}?`, body: "The field leaves this page. Values already entered are kept aside, not deleted. You can undo this.", confirmLabel: "Remove", danger: true })) {
        await change([{ op: "remove", target: "field", key: item.key }]);
      }
    },
    async onRemoveSection(section) {
      if (await confirm({ heading: `Remove the section ${section.title}?`, body: "Built-in fields in it move to the section before. Fields of your own in it are removed; their values are kept aside. You can undo this.", confirmLabel: "Remove", danger: true })) {
        await change([{ op: "remove", target: "section", id: section.id }]);
      }
    },
    onDone: () => end()
  });

  function draw() {
    if (surface) {
      view.render(layouts.resolved(surface), { canUndo: undo.length > 0, canRedo: redo.length > 0, problem, surfaceLabel: SURFACE_NAMES[surface] ?? "this page" });
    }
  }

  async function commit(ops) {
    undo.push(layouts.active(surface)?.ops ?? []);
    redo = [];
    problem = "";
    await layouts.setOps(surface, ops);
  }

  async function change(ops) {
    const current = layouts.active(surface)?.ops ?? [];
    const attempt = resolveLayout(surface, { surface, ops: [...current, ...ops] });

    if (attempt.problems.length) {
      problem = attempt.problems[0].message;
      draw();
      return;
    }

    const next = compactOps(surface, [...current, ...ops]);

    if (JSON.stringify(next) === JSON.stringify(current)) {
      problem = "";
      draw();
      return;
    }

    await commit(next);
  }

  async function step(from, to) {
    const ops = from.pop();

    if (!ops) {
      return;
    }

    to.push(layouts.active(surface)?.ops ?? []);
    problem = "";
    await layouts.setOps(surface, ops);
  }

  function end() {
    surface = null;
    undo = [];
    redo = [];
    problem = "";
    bus.emit("layout:editing");
  }

  bus.on("layouts:changed", draw);

  return {
    element: view.element,
    active: (name) => surface === name,
    any: () => surface !== null,
    begin(name) {
      if (!SURFACE_IDS.includes(name)) {
        toast("This page has no layout to edit.");
        return;
      }

      surface = name;
      undo = [];
      redo = [];
      problem = "";
      draw();
      bus.emit("layout:editing");
      queueMicrotask(() => view.element.querySelector("input")?.focus());
    },
    end
  };
}
