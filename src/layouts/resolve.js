import { LAYOUT_LIMITS } from "./limits.js";
import { defaultSections, isSurface } from "./surfaces.js";
import { validateFieldDef } from "./values.js";

/**
 * Resolves a layout (L-1): the generated default of a surface plus the operations of a layout file, in order. Pure and
 * never throws; an operation that names something missing or breaks a rule is dropped and reported in `problems`.
 * Hiding keeps an item in place with `hidden: true`, so nothing is ever lost from a page by a layout.
 */
const SECTION_ID = /^[a-z][a-z0-9_]{0,31}$/;
const isPlain = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isText = (value, max) => typeof value === "string" && value.trim().length > 0 && value.length <= max;

function builtinItem(field) {
  return {
    key: field.key,
    own: false,
    type: field.type,
    label: field.label,
    hint: field.hint ?? "",
    wide: field.wide === true,
    required: field.required === true,
    hidden: false,
    hideWhenEmpty: false,
    showInList: false,
    secret: false
  };
}

function ownItem(def) {
  return {
    key: def.id,
    own: true,
    type: def.type,
    label: def.label,
    hint: def.hint ?? "",
    wide: def.wide === true || def.type === "long",
    required: false,
    hidden: false,
    hideWhenEmpty: def.hideWhenEmpty === true,
    showInList: def.showInList === true,
    secret: def.secret === true,
    ...(def.choices ? { choices: [...def.choices] } : {}),
    def
  };
}

/** Checks the outer shape of a layout file. The operations are judged one by one when it is resolved. */
export function validateLayoutFile(raw) {
  if (!isPlain(raw) || typeof raw.id !== "string" || !/^lay_[a-z0-9_]{3,32}$/.test(raw.id)) {
    return { ok: false, reason: "a layout needs an id that starts with lay_" };
  }

  if (!isText(raw.name, LAYOUT_LIMITS.name)) {
    return { ok: false, reason: `a layout needs a name of up to ${LAYOUT_LIMITS.name} characters` };
  }

  if (!isSurface(raw.surface)) {
    return { ok: false, reason: "that page cannot have a layout" };
  }

  if (raw.base !== undefined && raw.base !== "default") {
    return { ok: false, reason: "a layout can only start from the default" };
  }

  if (!Array.isArray(raw.ops) || raw.ops.length > LAYOUT_LIMITS.ops || raw.ops.some((operation) => !isPlain(operation))) {
    return { ok: false, reason: `a layout holds up to ${LAYOUT_LIMITS.ops} operations` };
  }

  return { ok: true, file: { id: raw.id, name: raw.name.trim(), surface: raw.surface, base: "default", ops: raw.ops } };
}

function locate(sections, key) {
  for (const section of sections) {
    const index = section.items.findIndex((item) => item.key === key);

    if (index >= 0) {
      return { section, index, item: section.items[index] };
    }
  }

  return null;
}

const clampIndex = (index, length) => (Number.isInteger(index) ? Math.min(Math.max(index, 0), length) : length);

export function resolveLayout(surface, file = null) {
  const sections = defaultSections(surface).map((section) => ({ id: section.id, title: section.title, own: false, items: section.fields.map(builtinItem) }));
  const problems = [];
  const ops = file && file.surface === surface && Array.isArray(file.ops) ? file.ops.slice(0, LAYOUT_LIMITS.ops) : [];

  const ownCount = () => sections.reduce((sum, section) => sum + section.items.filter((item) => item.own).length, 0);

  ops.forEach((operation, index) => {
    const fail = (message) => problems.push({ index, message });
    const { op, target } = operation;

    if (target === "section") {
      applySection(operation, fail);
    } else if (target === "field") {
      applyField(operation, fail);
    } else {
      fail(`"${String(op)} ${String(target)}" is not something a layout can do`);
    }
  });

  function applySection(operation, fail) {
    const { op, id } = operation;
    const position = sections.findIndex((section) => section.id === id);

    if (op === "add") {
      if (!SECTION_ID.test(String(id)) || position >= 0) {
        return fail(`a section needs a new id of lowercase letters, digits and underscores, not "${String(id)}"`);
      }

      if (!isText(operation.title, LAYOUT_LIMITS.label)) {
        return fail("a section needs a title");
      }

      if (sections.length >= LAYOUT_LIMITS.sections) {
        return fail(`a page holds up to ${LAYOUT_LIMITS.sections} sections`);
      }

      const after = sections.findIndex((section) => section.id === operation.after);
      sections.splice(after >= 0 ? after + 1 : sections.length, 0, { id, title: operation.title.trim(), own: true, items: [] });
      return undefined;
    }

    if (position < 0) {
      return fail(`there is no section "${String(id)}"`);
    }

    if (op === "move") {
      const [section] = sections.splice(position, 1);
      sections.splice(clampIndex(operation.index, sections.length), 0, section);
    } else if (op === "override") {
      if (!isPlain(operation.value) || !isText(operation.value.title, LAYOUT_LIMITS.label)) {
        return fail("a section can only be given a new title");
      }

      sections[position].title = operation.value.title.trim();
    } else if (op === "remove") {
      if (!sections[position].own) {
        return fail("a built-in section cannot be removed; hide its fields instead");
      }

      if (sections.length === 1) {
        return fail("a page needs at least one section");
      }

      const [removed] = sections.splice(position, 1);
      const home = sections[Math.max(0, position - 1)];
      home.items.push(...removed.items.filter((item) => !item.own));
    } else {
      return fail(`a section cannot be "${String(op)}"`);
    }

    return undefined;
  }

  function applyField(operation, fail) {
    const { op } = operation;

    if (op === "add") {
      const checked = validateFieldDef(operation.field);

      if (!checked.ok) {
        return fail(checked.reason);
      }

      if (locate(sections, checked.def.id)) {
        return fail(`the field ${checked.def.id} already exists`);
      }

      if (ownCount() >= LAYOUT_LIMITS.ownFields) {
        return fail(`a page holds up to ${LAYOUT_LIMITS.ownFields} fields of your own`);
      }

      const section = sections.find((entry) => entry.id === operation.section);

      if (!section) {
        return fail(`there is no section "${String(operation.section)}"`);
      }

      section.items.splice(clampIndex(operation.index, section.items.length), 0, ownItem(checked.def));
      return undefined;
    }

    const found = locate(sections, operation.key);

    if (!found) {
      return fail(`there is no field "${String(operation.key)}"`);
    }

    const { item } = found;

    if (op === "move") {
      const section = sections.find((entry) => entry.id === (operation.section ?? found.section.id));

      if (!section) {
        return fail(`there is no section "${String(operation.section)}"`);
      }

      found.section.items.splice(found.index, 1);
      section.items.splice(clampIndex(operation.index, section.items.length), 0, item);
    } else if (op === "hide") {
      if (item.required) {
        return fail(`${item.label} cannot be hidden`);
      }

      item.hidden = true;
    } else if (op === "show") {
      item.hidden = false;
    } else if (op === "override") {
      return overrideField(item, operation.value, fail);
    } else if (op === "remove") {
      if (!item.own) {
        return fail("a built-in field cannot be removed; hide it instead");
      }

      found.section.items.splice(found.index, 1);
    } else {
      return fail(`a field cannot be "${String(op)}"`);
    }

    return undefined;
  }

  function overrideField(item, value, fail) {
    if (!isPlain(value)) {
      return fail("an override needs a value");
    }

    const allowed = item.own ? ["label", "hint", "wide", "hideWhenEmpty", "showInList", "secret", "choices"] : ["label", "hint", "wide", "hideWhenEmpty"];
    const unknown = Object.keys(value).find((key) => !allowed.includes(key));

    if (unknown) {
      return fail(`${item.label}: "${unknown}" cannot be changed`);
    }

    if (item.own) {
      const checked = validateFieldDef({ ...item.def, ...value });

      if (!checked.ok) {
        return fail(checked.reason);
      }

      Object.assign(item, ownItem(checked.def), { hidden: item.hidden });
      return undefined;
    }

    if (value.label !== undefined && !isText(value.label, LAYOUT_LIMITS.label)) {
      return fail("a label needs 1 to 60 characters");
    }

    if (value.hint !== undefined && (typeof value.hint !== "string" || value.hint.length > LAYOUT_LIMITS.hint)) {
      return fail("that hint is too long");
    }

    if (["wide", "hideWhenEmpty"].some((flag) => value[flag] !== undefined && typeof value[flag] !== "boolean")) {
      return fail("wide and hideWhenEmpty are true or false");
    }

    if (value.hideWhenEmpty === true && item.required) {
      return fail(`${item.label} cannot be hidden when empty`);
    }

    Object.assign(item, value, value.label ? { label: value.label.trim() } : {});
    return undefined;
  }

  return { surface, sections, problems };
}

/** Every item of a resolved layout, in page order. */
export function itemsOf(resolved, { hidden = true } = {}) {
  return resolved.sections.flatMap((section) => section.items).filter((item) => hidden || !item.hidden);
}

/** The definitions of the fields of your own that a resolved layout holds, by id. */
export function ownDefinitions(resolved) {
  return new Map(itemsOf(resolved).filter((item) => item.own).map((item) => [item.key, item.def]));
}

/** Ids stored on records that no field of the resolved layout claims (L-4: kept aside, listed, purgeable). */
export function orphanedFieldIds(resolved, records) {
  const known = ownDefinitions(resolved);
  const orphans = new Set();

  for (const record of records) {
    for (const key of Object.keys(record.fields ?? {})) {
      if (!known.has(key)) {
        orphans.add(key);
      }
    }
  }

  return [...orphans];
}
