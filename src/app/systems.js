import { createSheet, evaluateSheet } from "../sheet/evaluate.js";
import { makeOverlay } from "../sheet/overlay.js";
import { ID_PATTERN, KEY_PATTERN, TEMPLATE_FORMAT, TEMPLATE_FORMAT_VERSION } from "../sheet/template.js";
import { mountSystemEditor } from "../ui/systemEditor.js";
import { mountSystemsPage } from "../ui/systems.js";
import { routeHref } from "../views.js";

const MAX_FILE = 1024 * 1024;

export function slugify(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return /^[a-z0-9]/.test(slug) ? slug : "";
}

function download(file, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");

  link.href = url;
  link.download = file;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** The Game systems page, the new-system dialog and the system editor. */
export function initSystems(ctx) {
  const { store, storage, systems, router, bus, toast, confirm } = ctx;
  const dialog = document.querySelector("#new-system-dialog");
  const nameInput = document.querySelector("#new-system-name");
  const idInput = document.querySelector("#new-system-id");
  const baseSelect = document.querySelector("#new-system-base");
  const dialogError = document.querySelector("#new-system-error");
  let idTouched = false;
  let timer = null;
  let editing = { file: null, original: "" };
  let draft = { flat: null, invalid: false };
  let mode = "visual";

  function usage() {
    const counts = new Map();

    for (const character of store.getState().characters) {
      if (character.sheet) {
        counts.set(character.sheet.template.id, (counts.get(character.sheet.template.id) ?? 0) + 1);
      }
    }

    return counts;
  }

  function usersOfVersion(id, version) {
    return store.getState().characters.filter((character) => character.sheet?.template.id === id && character.sheet.template.version === version).length;
  }

  async function saveFile(raw) {
    const added = systems.add(raw);

    if (!added.ok) {
      return added;
    }

    await storage.putSystem(added.file);
    bus.emit("systems:changed");
    return added;
  }

  const listView = mountSystemsPage(document.querySelector("#page-systems"), {
    onNew: (base) => openDialog(base),
    onImport: importFile,
    onExport: (entry) => exportEntry(entry),
    onDelete: removeEntry
  });

  function exportEntry(entry) {
    const file = systems.lookup(entry.id, entry.version);

    if (file) {
      download(`${file.id}-v${file.version}.omniscribe-system.json`, JSON.stringify(file, null, 2));
    }
  }

  async function removeEntry(entry) {
    const users = usersOfVersion(entry.id, entry.version);

    if (users) {
      toast(`${users} character${users === 1 ? " follows" : "s follow"} version ${entry.version} of ${entry.name}. Move them to another system first.`, { tone: "error" });
      return;
    }

    if (!await confirm({ heading: `Delete ${entry.name} version ${entry.version}?`, body: "This removes that version from this device. Export it first if you may want it again.", confirmLabel: "Delete", danger: true })) {
      return;
    }

    if (!systems.remove(entry.id, entry.version)) {
      toast("Another system is derived from this version, so it cannot be deleted.", { tone: "error" });
      return;
    }

    await storage.deleteSystem(entry.id, entry.version);
    bus.emit("systems:changed");
    toast(`Deleted ${entry.name} version ${entry.version}.`);
  }

  async function importFile(file) {
    if (file.size > MAX_FILE) {
      toast("That file is larger than 1 MB, the limit for a system file.", { tone: "error" });
      return;
    }

    let raw;

    try {
      raw = JSON.parse(await file.text());
    } catch {
      toast("That file is not valid JSON.", { tone: "error" });
      return;
    }

    const added = await saveFile(raw);

    if (!added.ok) {
      toast(`Could not import: ${added.errors[0]?.path ? `${added.errors[0].path}: ` : ""}${added.errors[0]?.message ?? "the file is not a valid system"}${added.errors.length > 1 ? ` (and ${added.errors.length - 1} more)` : ""}`, { tone: "error" });
      return;
    }

    toast(`Imported ${added.file.name}, version ${added.file.version}.`);
    router.navigate(routeHref("system", added.file.id));
  }

  function openDialog(base) {
    idTouched = false;
    nameInput.value = base ? `My ${base.name}` : "";
    idInput.value = slugify(nameInput.value);
    dialogError.hidden = true;

    baseSelect.replaceChildren();
    baseSelect.append(new Option("Nothing (an empty system)", ""));

    for (const entry of systems.list().filter((item) => item.ok)) {
      baseSelect.append(new Option(`${entry.name} (version ${entry.version})`, entry.id));
    }

    baseSelect.value = base?.id ?? "generic";

    if (baseSelect.value !== (base?.id ?? "generic")) {
      baseSelect.value = "";
    }

    dialog.showModal();
    nameInput.focus();
    nameInput.select();
  }

  nameInput.addEventListener("input", () => {
    if (!idTouched) {
      idInput.value = slugify(nameInput.value);
    }
  });

  idInput.addEventListener("input", () => {
    idTouched = true;
  });

  document.querySelector("#new-system-create").addEventListener("click", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const id = idInput.value.trim();
    const problem = !name
      ? "Give the system a name."
      : !ID_PATTERN.test(id)
        ? "The id must be lowercase letters, digits, dots, dashes or underscores, starting with a letter or digit."
        : systems.latest(id) !== null
          ? `"${id}" is already used by a system on this device.`
          : "";

    if (problem) {
      dialogError.textContent = problem;
      dialogError.hidden = false;
      return;
    }

    const base = baseSelect.value ? { id: baseSelect.value, version: systems.latest(baseSelect.value) } : null;
    const added = await saveFile({
      format: TEMPLATE_FORMAT,
      formatVersion: TEMPLATE_FORMAT_VERSION,
      id,
      version: 1,
      name,
      system: name,
      description: "",
      base,
      overlay: []
    });

    if (!added.ok) {
      dialogError.textContent = added.errors[0]?.message ?? "That system could not be created.";
      dialogError.hidden = false;
      return;
    }

    dialog.close("create");
    toast(`Created ${name}.`);
    router.navigate(routeHref("system", id));
  });

  document.querySelector("#new-system-cancel").addEventListener("click", () => dialog.close("cancel"));

  /* ----- the editor ----- */

  function nextVersion() {
    return (editing.file?.version ?? 0) + 1;
  }

  function candidateFrom(text) {
    let raw;

    try {
      raw = JSON.parse(text);
    } catch (error) {
      return { ok: false, errors: [{ path: "", message: `Not valid JSON: ${error.message}` }], warnings: [] };
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, errors: [{ path: "", message: "The file must be a JSON object" }], warnings: [] };
    }

    if (raw.id !== editing.file.id) {
      return { ok: false, errors: [{ path: "id", message: `The id cannot change; it must stay "${editing.file.id}"` }], warnings: [] };
    }

    const candidate = { ...raw, version: nextVersion() };
    const result = systems.check(candidate);
    return { ...result, candidate };
  }

  function validate() {
    if (!editing.file) {
      return;
    }

    const text = editorView.getText();
    const result = candidateFrom(text);
    const dirty = text !== editing.original;
    let summary = "";

    if (result.ok && result.template) {
      const template = result.template;
      const computed = evaluateSheet(template, createSheet(template));
      summary = `${template.fields.length} fields, ${template.pools.length} pools, ${template.collections.length} collections, ${Object.keys(template.tables).length} tables. A new sheet evaluates with ${computed.errors.length ? `${computed.errors.length} error${computed.errors.length === 1 ? "" : "s"}` : "no errors"}.`;
    }

    if (result.ok && result.template) {
      draft = { flat: structuredClone(result.template), invalid: false };
    } else {
      draft.invalid = true;
    }

    renderVisual();
    editorView.showReport({ status: result.ok ? "valid" : "invalid", errors: result.errors, warnings: result.warnings, summary });
    editorView.setSaveState({ canSave: result.ok && dirty && !systems.isBuiltin(editing.file.id), dirty, nextVersion: nextVersion() });
    editing.candidate = result.ok ? result.candidate : null;
  }

  const PART_KEYS = ["fields", "pools", "collections", "tables", "conditions", "rests", "rolls", "sections"];
  const KINDS = { field: "fields", pool: "pools", collection: "collections", roll: "rolls", rest: "rests", section: "sections" };
  const IDENTITY = { field: "key", pool: "key", collection: "key", roll: "key", rest: "id", section: "id" };

  function renderVisual() {
    if (!editing.file || !draft.flat) {
      return;
    }

    editorView.visual.render({
      flat: draft.flat,
      readOnly: systems.isBuiltin(editing.file.id),
      note: draft.invalid ? "The file has problems, listed below. These forms still show your latest edits." : ""
    });
  }

  function fileFromDraft() {
    let file;

    try {
      file = JSON.parse(editorView.getText());
    } catch {
      file = structuredClone(editing.file);
    }

    const flat = draft.flat;
    file.name = flat.name;
    file.system = flat.system;
    file.description = flat.description;

    if (file.base) {
      const baseFlat = systems.resolve(file.base).template;
      file.overlay = baseFlat ? makeOverlay(baseFlat, flat) : file.overlay;
    } else {
      for (const part of PART_KEYS) {
        file[part] = structuredClone(flat[part]);
      }
    }

    return file;
  }

  function edit(change) {
    const next = structuredClone(draft.flat);
    change(next);
    draft.flat = next;
    editorView.setText(JSON.stringify(fileFromDraft(), null, 2));
    validate();
  }

  const FIELD_PROPS = {
    number: ["default", "min", "max", "integer"],
    text: ["default"],
    longtext: ["default"],
    flag: ["default"],
    choice: ["choices", "default"],
    list: ["default"],
    derived: ["formula", "format"],
    uses: ["max", "resetOn"],
    roll: ["default"]
  };
  const COMMON = ["key", "label", "type", "hint", "marker", "subs", "subFormats"];

  function retype(entry, inCollection) {
    const keep = new Set([...COMMON, ...(FIELD_PROPS[entry.type] ?? [])]);

    for (const prop of Object.keys(entry)) {
      if (!keep.has(prop)) {
        delete entry[prop];
      }
    }

    if (inCollection) {
      delete entry.subs;
      delete entry.subFormats;
    }

    if (entry.type === "choice" && !entry.choices) {
      entry.choices = [{ value: "a", label: "A" }];
    } else if (entry.type === "derived" && !entry.formula) {
      entry.formula = "0";
    } else if (entry.type === "uses" && entry.max === undefined) {
      entry.max = 1;
    }
  }

  function setProp(entry, prop, value) {
    if (value === null) {
      delete entry[prop];
    } else {
      entry[prop] = value;
    }
  }

  const visualHandlers = {
    onCommit(kind, key, prop, value) {
      edit((flat) => {
        if (kind === "details") {
          flat[prop] = value ?? "";
        } else if (kind === "condition") {
          flat.conditions = value;
        } else if (kind === "table") {
          flat.tables[key] = value;
        } else if (kind === "item") {
          const [collectionKey, fieldKey] = key.split(".");
          const entry = flat.collections.find((item) => item.key === collectionKey)?.fields.find((item) => item.key === fieldKey);

          if (entry) {
            setProp(entry, prop, value);

            if (prop === "type") {
              retype(entry, true);
            }
          }
        } else {
          const entry = flat[KINDS[kind]].find((item) => item[IDENTITY[kind]] === key);

          if (entry) {
            setProp(entry, prop, value);

            if (kind === "field" && prop === "type") {
              retype(entry, false);
            }
          }
        }
      });
    },
    onAdd(kind, key, parent) {
      const flat = draft.flat;

      if (!KEY_PATTERN.test(key)) {
        return { ok: false, reason: "Use lowercase letters, digits and underscores, starting with a letter (up to 32)." };
      }

      const taken = kind === "table"
        ? key in flat.tables
        : kind === "item"
          ? flat.collections.find((item) => item.key === parent)?.fields.some((item) => item.key === key)
          : ["field", "pool", "collection"].includes(kind)
            ? [...flat.fields, ...flat.pools, ...flat.collections].some((item) => item.key === key)
            : (flat[KINDS[kind]] ?? []).some((item) => item[IDENTITY[kind]] === key);

      if (taken) {
        return { ok: false, reason: `"${key}" is already used here.` };
      }

      edit((next) => {
        const title = key.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());

        if (kind === "field") {
          next.fields.push({ key, label: title, type: "number", default: 0 });
        } else if (kind === "pool") {
          next.pools.push({ key, label: title, max: "10", display: "number", temp: false });
        } else if (kind === "collection") {
          next.collections.push({ key, label: title, fields: [{ key: "name", label: "Name", type: "text" }] });
        } else if (kind === "item") {
          next.collections.find((item) => item.key === parent).fields.push({ key, label: title, type: "text" });
        } else if (kind === "table") {
          next.tables[key] = { 0: 0 };
        } else if (kind === "roll") {
          next.rolls.push({ key, label: title, expression: "1d20", group: "Rolls" });
        } else if (kind === "rest") {
          next.rests.push({ id: key, label: title });
        } else if (kind === "section") {
          next.sections.push({ id: key, title, layout: "fields", items: [] });
        }
      });

      return { ok: true, key: kind === "item" ? key : key };
    },
    async onRemove(kind, key) {
      const name = kind === "item" ? key.split(".")[1] : key;

      if (!await confirm({ heading: `Remove ${name}?`, body: "It is removed from this system's draft. Characters on a saved version are not affected, and nothing is saved until you press Save.", confirmLabel: "Remove", danger: true })) {
        return;
      }

      edit((flat) => {
        if (kind === "table") {
          delete flat.tables[key];
        } else if (kind === "item") {
          const [collectionKey, fieldKey] = key.split(".");
          const collection = flat.collections.find((item) => item.key === collectionKey);

          collection.fields = collection.fields.filter((item) => item.key !== fieldKey);

          for (const part of ["groupBy", "sortBy"]) {
            if (collection[part] === fieldKey) {
              delete collection[part];
            }
          }

          if (collection.columns) {
            collection.columns = collection.columns.filter((item) => item !== fieldKey);
          }
        } else {
          flat[KINDS[kind]] = flat[KINDS[kind]].filter((item) => item[IDENTITY[kind]] !== key);

          if (["field", "pool", "collection"].includes(kind)) {
            for (const entry of flat.sections) {
              entry.items = entry.items.filter((item) => item !== key);
            }
          }
        }
      });
    }
  };

  const editorView = mountSystemEditor(document.querySelector("#page-system"), {
    visual: visualHandlers,
    onMode(next) {
      mode = next;
      editorView.setMode(mode);
    },
    onInput() {
      clearTimeout(timer);
      timer = setTimeout(validate, 250);
    },
    async onSave() {
      validate();

      if (!editing.candidate) {
        return;
      }

      const added = await saveFile(editing.candidate);

      if (!added.ok) {
        toast(added.errors[0]?.message ?? "Could not save.", { tone: "error" });
        return;
      }

      toast(`Saved ${added.file.name} as version ${added.file.version}. Characters keep the version they use until you move them.`);
      load(true);
    },
    onRevert() {
      editorView.setText(editing.original);
      validate();
    },
    onExport: () => editing.file && exportEntry({ id: editing.file.id, version: editing.file.version }),
    onDerive() {
      const entry = editing.file && systems.list().find((item) => item.id === editing.file.id);

      if (entry) {
        openDialog(entry);
      }
    }
  });

  function load(reset) {
    const route = router.current();

    if (route.view !== "system") {
      return;
    }

    const file = systems.latestFile(route.id);

    if (!file) {
      toast("That game system is not on this device.");
      router.navigate(routeHref("systems"));
      return;
    }

    const changed = !editing.file || editing.file.id !== file.id || editing.file.version !== file.version;
    editing = { file, original: JSON.stringify(file, null, 2), candidate: null };

    if (changed || reset) {
      clearTimeout(timer);
    }

    editorView.render({ file, readOnly: systems.isBuiltin(file.id), nextVersion: file.version + 1, users: usersOfVersion(file.id, file.version) });
    editorView.setMode(mode);

    if (changed || reset) {
      editorView.setText(editing.original);
    }

    validate();
  }

  function showList() {
    if (router.current().view === "systems") {
      listView.render({ systems: systems.list(), usage: usage() });
    }
  }

  router.onRoute(() => {
    showList();
    load(false);
  });
  store.subscribe(() => showList());
  bus.on("systems:changed", () => {
    showList();

    if (router.current().view === "system") {
      load(false);
    }
  });
}
