import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBundle } from "../scripts/bundle.mjs";
import { startStaticServer } from "../scripts/serve.mjs";
import { buildArchive } from "../src/backup.js";
import { createCampaign } from "../src/campaigns.js";
import { createCharacter, createDocument } from "../src/schema.js";
import { Page, sleep } from "./harness.mjs";

const q = (selector) => JSON.stringify(selector);

async function boot(page, { baseUrl }) {
  await page.navigate(baseUrl);
  await page.setViewport(1440, 900);
  await page.resetStorage();
  await page.evaluate('location.hash = ""; true');
  await page.waitFor('document.querySelector("#library-title")');
  await page.waitFor('!document.querySelector("#page-library").hidden');
  page.clearErrors();
}

async function type(page, selector, value) {
  await page.evaluate(`(() => {
    const element = document.querySelector(${q(selector)});
    element.focus();
    element.value = ${JSON.stringify(value)};
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
}

const SCHOOL_LAYOUT = { id: "lay_abilities", name: "My layout", surface: "abilities", base: "default", ops: [
  { op: "add", target: "section", id: "magic", title: "Magic", after: "main" },
  { op: "add", target: "field", field: { id: "cf_school", label: "School", type: "text", showInList: true }, section: "magic" }
] };

async function seedLayouts(page, layouts) {
  await page.evaluate(`new Promise((resolve, reject) => {
    const open = indexedDB.open("omniscribe", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const transaction = open.result.transaction("meta", "readwrite");
      transaction.objectStore("meta").put(${JSON.stringify(layouts)}, "layouts");
      transaction.oncomplete = () => { open.result.close(); resolve(true); };
      transaction.onerror = () => reject(transaction.error);
    };
  })`);
  await page.reload();
  await page.waitFor('document.querySelector("#library-title") && !document.querySelector("#page-library").hidden');
}

const saved = (page) => page.waitFor('document.querySelector("#save-state").dataset.state === "saved"');
const tileCount = (page) => page.evaluate('document.querySelectorAll(".tile").length');
const route = (page) => page.evaluate("location.hash");

async function go(page, hash, titleId) {
  await page.evaluate(`location.hash = ${JSON.stringify(hash)}; true`);
  await page.waitFor(`document.querySelector(${q(titleId)}) && !document.querySelector(${q(titleId)}).closest(".page").hidden`);
}

async function newCharacter(page, name) {
  await page.click("#new-character-btn");
  await page.waitFor('location.hash.startsWith("#/character/")');
  await page.waitFor('document.querySelector("#character-name")');

  if (name) {
    await type(page, "#character-name", name);
  }
}

function key(page, init) {
  return page.evaluate(`(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", Object.assign({ bubbles: true, cancelable: true }, ${JSON.stringify(init)})));
    return true;
  })()`);
}

function hide(page) {
  return page.evaluate(`(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    return true;
  })()`);
}

async function sampleToPdfPage(page) {
  await page.click("#sample-btn");
  await page.waitFor('document.querySelectorAll(".tile").length === 1');
  await page.evaluate('document.querySelector(".tile-link").click(); true');
  await page.waitFor('document.querySelector(".subnav-link[data-page=pdf]")');
  await page.click('.subnav-link[data-page="pdf"]');
  await page.waitFor('!document.querySelector("#character-pdf").hidden && document.querySelector("#pdf-empty")?.textContent.includes("No PDF sheets yet")');
}

function samplePixels(page) {
  return page.evaluate(`(() => {
    const canvas = document.querySelector(".pdf-page canvas");
    const context = canvas.getContext("2d");
    const at = (x, y) => context.getImageData(Math.floor(canvas.width * x), Math.floor(canvas.height * y), 1, 1).data;
    const dark = at(0.5, 0.75);
    const light = at(0.04, 0.04);
    return {
      dark: dark[0] < 40 && dark[1] < 40 && dark[2] < 40 && dark[3] === 255,
      light: light[0] > 235 && light[1] > 235 && light[2] > 235
    };
  })()`);
}

async function sampleToSheet(page) {
  await page.click("#sample-btn");
  await page.waitFor('document.querySelectorAll(".tile").length === 1');
  await page.evaluate('document.querySelector(".tile-link").click(); true');
  await page.waitFor('document.querySelector(".subnav-link[data-page=sheet]")');
  await page.click('.subnav-link[data-page="sheet"]');
  await page.waitFor('!document.querySelector("#character-sheet").hidden && document.querySelector("#sheet-picker")');
}

async function sheetPage(page) {
  await page.click("#sample-btn");
  await page.waitFor('document.querySelectorAll(".tile").length === 1');
  await page.evaluate('document.querySelector(".tile-link").click(); true');
  await page.waitFor('document.querySelector(".subnav-link[data-page=sheet]")');
  await page.click('.subnav-link[data-page="sheet"]');
  await page.waitFor('!document.querySelector("#character-sheet").hidden && document.querySelector("#sheet-picker")');
}

async function startGeneric(page) {
  await sheetPage(page);
  await page.click("#system-generic");
  await page.click("#sheet-picker-confirm");
  await page.waitFor('document.querySelector("#sheet-f-might")');
}

async function openNewSystem(page, name) {
  await go(page, "#/systems", "#systems-title");
  await page.click("#new-system-btn");
  await page.waitFor('document.querySelector("#new-system-dialog").open');
  await type(page, "#new-system-name", name);
  await page.click("#new-system-create");
  await page.waitFor('document.querySelector("#system-status")?.textContent === "Valid"');
}

function tab(page, name) {
  return page.evaluate(`[...document.querySelectorAll(".tab")].find((button) => button.textContent === ${JSON.stringify(name)}).click(); true`);
}

async function addEntry(page, inputId, key) {
  await type(page, `#${inputId}`, key);
  await page.evaluate(`document.querySelector("#${inputId}").closest(".add-row").querySelector("button").click(); true`);
}

function selectEntry(page, text) {
  return page.evaluate(`[...document.querySelectorAll("#visual-panel .entry-btn")].find((button) => button.textContent === ${JSON.stringify(text)}).click(); true`);
}

async function setControl(page, labelText, value, { last = false } = {}) {
  await page.waitFor(`[...document.querySelectorAll("#visual-panel label")].some((label) => label.textContent === ${JSON.stringify(labelText)})`);
  await page.evaluate(`(() => {
    const labels = [...document.querySelectorAll("#visual-panel label")].filter((label) => label.textContent === ${JSON.stringify(labelText)});
    const label = ${last ? "labels.at(-1)" : "labels[0]"};
    const control = document.querySelector("#" + label.htmlFor);
    control.value = ${JSON.stringify(value)};
    control.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
}

async function installTestSystem(page, context) {
  await page.evaluate(`(async () => {
    const file = await (await fetch("/test/fixtures/systems/d20-core.json")).json();
    const { openStorage } = await import("/src/storage.js");
    const storage = await openStorage();
    await storage.putSystem(file);
    storage.close();
    return true;
  })()`);
  await page.reload();
  await page.waitFor('document.querySelector("#library-title")');
}

function assertClean(page) {
  assert.deepEqual(page.errors, [], `uncaught errors: ${page.errors.join("; ")}`);
  assert.deepEqual(page.consoleErrors, [], `console errors: ${page.consoleErrors.join("; ")}`);
}

async function withSecondTab(page, context, work) {
  const other = await Page.openNew(context.port, context.baseUrl);

  try {
    await other.waitFor('document.querySelector("#library-title")');
    await other.setViewport(1440, 900);
    await work(other);
  } finally {
    await other.closeTarget();
  }
}

async function pick(page, selector, value) {
  await page.evaluate(`(() => {
    const element = document.querySelector(${q(selector)});
    element.value = ${JSON.stringify(value)};
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`);
}

async function openRecords(page, sub) {
  await page.click(`.subnav-link[data-page="${sub}"]`);
  await page.waitFor(`!document.querySelector("#character-${sub}").hidden && document.querySelector("#rec-${sub}-form")`);
}

async function addRecord(page, kind, fields) {
  for (const [key, value] of Object.entries(fields)) {
    const selector = `#rec-${kind}-${key}`;

    if (typeof value === "boolean") {
      await page.evaluate(`document.querySelector(${q(selector)}).checked = ${value}; true`);
    } else if (await page.evaluate(`document.querySelector(${q(selector)}).tagName === "SELECT"`)) {
      await pick(page, selector, value);
    } else {
      await type(page, selector, value);
    }
  }

  await page.click(`#rec-${kind}-save`);
}

export const scenarios = [
  {
    name: "boots to an empty library without errors",
    async run(page, context) {
      await boot(page, context);

      assert.equal(await page.evaluate("document.title"), "Library · Omniscribe");
      assert.match(await page.evaluate('document.querySelector("#library-empty").textContent'), /No characters yet/);
      assert.equal(await page.evaluate('document.querySelector("#save-state").dataset.state'), "saved");
      assert.equal(await page.evaluate('document.querySelector("#storage-notice").hidden'), true);
      assertClean(page);
    }
  },
  {
    name: "creates a character, focuses the name and shows it in the library",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page);

      assert.equal(await page.evaluate('document.activeElement.id'), "character-name");

      await type(page, "#character-name", "Mira Vale");
      await page.waitFor('document.querySelector("#character-title").textContent === "Mira Vale"');
      assert.equal(await page.evaluate("document.title"), "Mira Vale · Omniscribe");

      await go(page, "#/library", "#library-title");
      assert.equal(await tileCount(page), 1);
      assert.match(await page.evaluate('document.querySelector(".tile-title").textContent'), /Mira Vale/);
      assertClean(page);
    }
  },
  {
    name: "a character survives a reload",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Bram Stoneback");
      await type(page, "#character-player", "Sam");
      await type(page, "#character-notes", "Owes a debt to the harbour guild.");
      await page.evaluate(`(() => {
        const input = document.querySelector("#character-tags");
        input.value = "dwarf, fighter";
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        return true;
      })()`);
      await page.evaluate('document.querySelector("#character-status").value = "retired"; document.querySelector("#character-status").dispatchEvent(new Event("change", { bubbles: true })); true');
      await saved(page);

      const url = await route(page);
      await page.reload();
      await page.waitFor('document.querySelector("#character-name")?.value');

      assert.equal(await route(page), url);
      assert.equal(await page.evaluate('document.querySelector("#character-name").value'), "Bram Stoneback");
      assert.equal(await page.evaluate('document.querySelector("#character-player").value'), "Sam");
      assert.equal(await page.evaluate('document.querySelector("#character-notes").value'), "Owes a debt to the harbour guild.");
      assert.equal(await page.evaluate('document.querySelector("#character-status").value'), "retired");
      assert.deepEqual(
        await page.evaluate('[...document.querySelectorAll("#page-character .chip span")].map((node) => node.textContent)'),
        ["dwarf", "fighter"]
      );
      assertClean(page);
    }
  },
  {
    name: "a sample character can be added and removed again with undo",
    async run(page, context) {
      await boot(page, context);
      await page.click("#sample-btn");
      await page.waitFor('document.querySelectorAll(".tile").length === 1');
      assert.match(await page.evaluate('document.querySelector(".tile-title").textContent'), /Mira Vale/);

      await page.click(".toast .btn");
      await page.waitFor('document.querySelectorAll(".tile").length === 0');
      assertClean(page);
    }
  },
  {
    name: "duplicating and deleting are guarded and undoable",
    async run(page, context) {
      await boot(page, context);
      await page.click("#sample-btn");
      await page.waitFor('document.querySelectorAll(".tile").length === 1');

      await page.click('.tile [aria-label^="Duplicate"]');
      await page.waitFor('document.querySelectorAll(".tile").length === 2');
      assert.match(await page.evaluate('document.body.textContent'), /Mira Vale \(copy\)/);

      await page.click('.tile [aria-label^="Delete"]');
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      assert.equal(await tileCount(page), 2);
      await page.click("#confirm-cancel");
      await page.waitFor('!document.querySelector("#confirm-dialog").open');
      assert.equal(await tileCount(page), 2);

      await page.click('.tile [aria-label^="Delete"]');
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('document.querySelectorAll(".tile").length === 1');

      await page.evaluate('[...document.querySelectorAll(".toast .btn")].at(-1).click(); true');
      await page.waitFor('document.querySelectorAll(".tile").length === 2');
      await saved(page);
      assertClean(page);
    }
  },
  {
    name: "a confirmation reopened in the same tick is not resolved by the previous close",
    async run(page, context) {
      await boot(page, context);
      await page.click("#sample-btn");
      await page.waitFor('document.querySelectorAll(".tile").length === 1');

      await page.evaluate(`(() => {
        const remove = () => document.querySelector('.tile [aria-label^="Delete"]').click();
        remove();
        document.querySelector("#confirm-cancel").click();
        remove();
        return true;
      })()`);

      await sleep(150);
      assert.equal(await page.evaluate('document.querySelector("#confirm-dialog").open'), true);

      await page.click("#confirm-ok");
      await page.waitFor('document.querySelectorAll(".tile").length === 0');
      assertClean(page);
    }
  },
  {
    name: "deleting from the character page returns to the library",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Temp");
      await page.click("#character-delete");
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('location.hash === "#/library"');
      await page.waitFor('document.querySelector("#library-empty").textContent.includes("No characters yet")');
      assertClean(page);
    }
  },
  {
    name: "search and sort filter the library",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Zed");
      await go(page, "#/library", "#library-title");
      await newCharacter(page, "Alma");
      await go(page, "#/library", "#library-title");
      assert.equal(await tileCount(page), 2);

      await page.evaluate('(() => { const s = document.querySelector("#library-sort"); s.value = "name"; s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()');
      await page.waitFor('document.querySelector(".tile-title").textContent.startsWith("Alma")');

      await type(page, "#library-search", "zed");
      await page.waitFor('document.querySelectorAll(".tile").length === 1');
      assert.match(await page.evaluate('document.querySelector("#library-count").textContent'), /1 character of 2/);

      await type(page, "#library-search", "nobody");
      await page.waitFor('document.querySelector("#library-empty").textContent.includes("No matches")');
      assertClean(page);
    }
  },
  {
    name: "undo and redo work from the toolbar and the keyboard",
    async run(page, context) {
      await boot(page, context);
      await page.click("#sample-btn");
      await page.waitFor('document.querySelectorAll(".tile").length === 1');
      assert.equal(await page.evaluate('document.querySelector("#undo-btn").disabled'), false);

      await page.click("#undo-btn");
      await page.waitFor('document.querySelectorAll(".tile").length === 0');
      assert.equal(await page.evaluate('document.querySelector("#redo-btn").disabled'), false);

      await key(page, { key: "z", ctrlKey: true, shiftKey: true });
      await page.waitFor('document.querySelectorAll(".tile").length === 1');

      await key(page, { key: "z", ctrlKey: true });
      await page.waitFor('document.querySelectorAll(".tile").length === 0');
      assertClean(page);
    }
  },
  {
    name: "the command palette filters and navigates",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Ilsa");
      await go(page, "#/library", "#library-title");

      await key(page, { key: "k", ctrlKey: true });
      await page.waitFor('document.querySelector("#palette-dialog").open');
      assert.equal(await page.evaluate('document.activeElement.id'), "palette-input");

      await type(page, "#palette-input", "ilsa");
      await page.waitFor('document.querySelectorAll(".palette-option").length === 1');
      await key(page, { key: "k", ctrlKey: true });
      await page.evaluate(`document.querySelector("#palette-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); true`);
      await page.waitFor('location.hash.startsWith("#/character/")');
      assert.equal(await page.evaluate('document.querySelector("#palette-dialog").open'), false);

      await key(page, { key: "k", ctrlKey: true });
      await type(page, "#palette-input", "settings");
      await page.evaluate(`document.querySelector("#palette-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); true`);
      await page.waitFor('location.hash === "#/settings"');
      assertClean(page);
    }
  },
  {
    name: "hub shortcuts and the shortcuts dialog work",
    async run(page, context) {
      await boot(page, context);

      await key(page, { key: "2", code: "Digit2", altKey: true });
      await page.waitFor('location.hash === "#/data"');
      await key(page, { key: "3", code: "Digit3", altKey: true });
      await page.waitFor('location.hash === "#/settings"');
      await key(page, { key: "1", code: "Digit1", altKey: true });
      await page.waitFor('location.hash === "#/library"');

      await key(page, { key: "?" });
      await page.waitFor('document.querySelector("#shortcuts-dialog").open');
      assert.ok(await page.evaluate('document.querySelectorAll("#shortcuts-body tr").length > 3'));
      assertClean(page);
    }
  },
  {
    name: "the navigation sidebar is open by default, hides, remembers and navigates",
    async run(page, context) {
      await boot(page, context);

      assert.equal(await page.evaluate('document.querySelector("#sidebar").hidden'), false);
      assert.equal(await page.evaluate('document.querySelector("#sidebar-toggle").getAttribute("aria-expanded")'), "true");
      assert.equal(await page.evaluate('document.querySelector("#sidebar a[aria-current=page]").textContent.startsWith("Library")'), true);

      await page.click("#sidebar-toggle");
      await page.waitFor('document.querySelector("#sidebar").hidden');
      assert.equal(await page.evaluate('document.querySelector("#sidebar-toggle").getAttribute("aria-label")'), "Show navigation");

      await page.reload();
      await page.waitFor('document.querySelector("#library-title")');
      assert.equal(await page.evaluate('document.querySelector("#sidebar").hidden'), true);

      await page.click("#sidebar-toggle");
      await page.waitFor('!document.querySelector("#sidebar").hidden');
      await page.click('#sidebar a[href="#/data"]');
      await page.waitFor('location.hash === "#/data"');
      assert.equal(await page.evaluate('document.querySelector("#sidebar a[aria-current=page]").textContent.startsWith("Data")'), true);

      await page.click("#brand-link");
      await page.waitFor('location.hash === "#/library"');
      assertClean(page);
    }
  },
  {
    name: "on a phone the sidebar is a drawer that closes after navigating",
    async run(page, context) {
      await boot(page, context);
      await page.setViewport(390, 844);
      await page.reload();
      await page.waitFor('document.querySelector("#library-title")');

      assert.equal(await page.evaluate('document.querySelector("#sidebar").hidden'), true);
      await page.click("#sidebar-toggle");
      await page.waitFor('!document.querySelector("#sidebar").hidden');
      assert.equal(await page.evaluate('document.querySelector("#sidebar-scrim").hidden'), false);

      const hit = await page.evaluate(`(() => {
        const link = document.querySelector('#sidebar a[href="#/settings"]');
        const box = link.getBoundingClientRect();
        const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return { atPoint: top === link || link.contains(top), sidebarOnTop: Boolean(top?.closest("#sidebar")) };
      })()`);
      assert.deepEqual(hit, { atPoint: true, sidebarOnTop: true });

      await page.click('#sidebar a[href="#/settings"]');
      await page.waitFor('location.hash === "#/settings"');
      await page.waitFor('document.querySelector("#sidebar").hidden');
      assert.equal(await page.evaluate('document.querySelector("#sidebar-scrim").hidden'), true);
      await page.setViewport(1440, 900);
      assertClean(page);
    }
  },
  {
    name: "the theme choice persists across a reload",
    async run(page, context) {
      await boot(page, context);
      assert.equal(await page.evaluate("document.documentElement.dataset.theme"), "dark");

      await go(page, "#/settings", "#settings-title");
      await page.click('input[name="theme"][value="light"]');
      await page.waitFor('document.documentElement.dataset.theme === "light"');

      await page.reload();
      await page.waitFor('document.querySelector("#library-title")');
      assert.equal(await page.evaluate("document.documentElement.dataset.theme"), "light");

      await page.evaluate('localStorage.removeItem("omniscribe:prefs"); true');
      assertClean(page);
    }
  },
  {
    name: "the data page reports real storage and the blob store works in the browser",
    async run(page, context) {
      await boot(page, context);
      await go(page, "#/data", "#data-title");
      await page.waitFor('document.querySelector("#storage-backend")');

      assert.equal(await page.evaluate('document.querySelector("#storage-backend").textContent'), "indexeddb");
      assert.match(await page.evaluate('document.querySelector("#storage-files").textContent'), /^0 files/);

      const result = await page.evaluate(`(async () => {
        const { openStorage } = await import("/src/storage.js");
        const storage = await openStorage();
        const data = new Blob([new Uint8Array([37, 80, 68, 70, 45, 49])], { type: "application/pdf" });
        const meta = await storage.putBlob({ type: "application/pdf", data });
        const record = await storage.getBlob(meta.id);
        const bytes = Array.from(new Uint8Array(await record.data.arrayBuffer()));
        const usage = await storage.blobUsage();
        await storage.deleteBlob(meta.id);
        const after = await storage.blobUsage();
        storage.close();
        return { name: storage.name, size: meta.size, type: record.type, bytes, usage, after };
      })()`);

      assert.equal(result.name, "indexeddb");
      assert.equal(result.size, 6);
      assert.equal(result.type, "application/pdf");
      assert.deepEqual(result.bytes, [37, 80, 68, 70, 45, 49]);
      assert.deepEqual(result.usage, { count: 1, bytes: 6 });
      assert.deepEqual(result.after, { count: 0, bytes: 0 });
      assertClean(page);
    }
  },
  {
    name: "a quiet tab picks up another tab's changes",
    async run(page, context) {
      await boot(page, context);

      await withSecondTab(page, context, async (other) => {
        await page.click("#sample-btn");
        await page.waitFor('document.querySelectorAll(".tile").length === 1');
        await saved(page);

        await other.waitFor('document.querySelectorAll(".tile").length === 1', { timeout: 6000 });
        assert.match(await other.evaluate('document.querySelector(".tile-title").textContent'), /Mira Vale/);
        assert.equal(await other.evaluate('document.querySelector("#stale-dialog").open'), false);
      });

      assertClean(page);
    }
  },
  {
    name: "a tab with unsaved edits pauses and can load the other tab's changes",
    async run(page, context) {
      await boot(page, context);
      await page.click("#sample-btn");
      await page.waitFor('document.querySelectorAll(".tile").length === 1');
      await saved(page);

      await withSecondTab(page, context, async (other) => {
        await other.waitFor('document.querySelectorAll(".tile").length === 1');
        await other.evaluate('document.querySelector(".tile-link").click(); true');
        await other.waitFor('document.querySelector("#character-name")?.value');
        await page.evaluate('document.querySelector(".tile-link").click(); true');
        await page.waitFor('document.querySelector("#character-name")?.value');

        await type(page, "#character-notes", "typed in tab one");
        await type(other, "#character-notes", "typed in tab two");
        await hide(other);

        await page.waitFor('document.querySelector("#stale-dialog").open', { timeout: 6000 });
        assert.equal(await page.evaluate('document.querySelector("#save-state").dataset.state'), "paused");

        await page.client.send("Page.bringToFront");
        await page.click("#stale-reload");
        await page.waitFor('!document.querySelector("#stale-dialog").open');
        await page.waitFor('document.querySelector("#character-notes").value === "typed in tab two"');
        await saved(page);
      });

      assertClean(page);
    }
  },
  {
    name: "a tab with unsaved edits can keep them and they win",
    async run(page, context) {
      await boot(page, context);
      await page.click("#sample-btn");
      await page.waitFor('document.querySelectorAll(".tile").length === 1');
      await saved(page);

      await withSecondTab(page, context, async (other) => {
        await other.waitFor('document.querySelectorAll(".tile").length === 1');
        await other.evaluate('document.querySelector(".tile-link").click(); true');
        await other.waitFor('document.querySelector("#character-name")?.value');
        await page.evaluate('document.querySelector(".tile-link").click(); true');
        await page.waitFor('document.querySelector("#character-name")?.value');

        await type(page, "#character-notes", "mine should win");
        await type(other, "#character-notes", "theirs");
        await hide(other);

        await page.waitFor('document.querySelector("#stale-dialog").open', { timeout: 6000 });
        await page.client.send("Page.bringToFront");
        await page.click("#stale-keep");
        await page.waitFor('!document.querySelector("#stale-dialog").open');
        await saved(page);
        await sleep(200);
        assert.equal(await page.evaluate('document.querySelector("#character-notes").value'), "mine should win");
      });

      await page.reload();
      await page.waitFor('document.querySelector("#character-notes")?.value');
      assert.equal(await page.evaluate('document.querySelector("#character-notes").value'), "mine should win");
      assertClean(page);
    }
  },
  {
    name: "a PDF uploads, renders real pixels and survives a reload",
    timeout: 60000,
    async run(page, context) {
      await boot(page, context);
      await sampleToPdfPage(page);
      assert.match(await page.evaluate('document.querySelector("#pdf-empty").textContent'), /No PDF sheets yet/);

      await page.setFileInput("#pdf-input", [context.fixture("sample.pdf")]);
      await page.waitFor('document.querySelectorAll(".doc").length === 1');
      await page.waitFor('document.querySelectorAll(".pdf-page").length === 2', { timeout: 20000 });
      await page.waitFor('document.querySelector(".pdf-page[data-rendered=true]")', { timeout: 20000 });

      assert.equal(await page.evaluate('document.querySelector(".pdf-count").textContent'), "2 pages");
      assert.deepEqual(await samplePixels(page), { dark: true, light: true });
      await saved(page);

      await page.reload();
      await page.waitFor('document.querySelectorAll(".doc").length === 1');
      await page.click('.doc button[aria-label^="View"]');
      await page.waitFor('document.querySelector("#pdf-viewer-title").textContent.startsWith("Viewing")');
      await page.waitFor('document.querySelector(".pdf-page[data-rendered=true]")', { timeout: 20000 });
      assert.match(await route(page), /\/pdf$/);
      assert.deepEqual(await samplePixels(page), { dark: true, light: true });
      assertClean(page);
    }
  },
  {
    name: "a file that is not a PDF is refused with a reason and nothing is stored",
    async run(page, context) {
      await boot(page, context);
      await sampleToPdfPage(page);

      await page.setFileInput("#pdf-input", [context.fixture("not-a-pdf.pdf")]);
      await page.waitFor('document.querySelector(".toast-error")');

      assert.match(await page.evaluate('document.querySelector(".toast-error").textContent'), /not-a-pdf\.pdf: This does not look like a PDF/);
      assert.equal(await page.evaluate('document.querySelectorAll(".doc").length'), 0);
      assertClean(page);
    }
  },
  {
    name: "a damaged PDF is listed and explained without breaking the page",
    timeout: 60000,
    async run(page, context) {
      await boot(page, context);
      await sampleToPdfPage(page);

      await page.setFileInput("#pdf-input", [context.fixture("damaged.pdf")]);
      await page.waitFor('document.querySelectorAll(".doc").length === 1');
      await page.waitFor('document.querySelector(".pdf-status") && !document.querySelector(".pdf-status").hidden && /damaged|could not be displayed/.test(document.querySelector(".pdf-status").textContent)', { timeout: 20000 });

      assert.equal(await page.evaluate('document.querySelectorAll(".pdf-page").length'), 0);
      assert.equal(await page.evaluate('document.querySelector(".doc button[aria-label^=Download]").disabled'), false);
    }
  },
  {
    name: "a PDF can be renamed and marked as the sheet, and both persist",
    timeout: 60000,
    async run(page, context) {
      await boot(page, context);
      await sampleToPdfPage(page);
      await page.setFileInput("#pdf-input", [context.fixture("sample.pdf")]);
      await page.waitFor('document.querySelectorAll(".doc").length === 1');

      await type(page, ".doc-name", "Mira level 3");
      await page.click('.doc button[aria-label^="Use"]');
      await page.waitFor('document.querySelector(".doc-meta").textContent.includes("This is the sheet")');
      await saved(page);

      await page.reload();
      await page.waitFor('document.querySelectorAll(".doc").length === 1');

      assert.equal(await page.evaluate('document.querySelector(".doc-name").value'), "Mira level 3");
      assert.match(await page.evaluate('document.querySelector(".doc-meta").textContent'), /This is the sheet/);
      assert.match(await page.evaluate('document.querySelector(".doc button[aria-label^=Stop]").textContent'), /Stop using as the sheet/);
      assertClean(page);
    }
  },
  {
    name: "removing a PDF is guarded and undoable",
    timeout: 60000,
    async run(page, context) {
      await boot(page, context);
      await sampleToPdfPage(page);
      await page.setFileInput("#pdf-input", [context.fixture("sample.pdf")]);
      await page.waitFor('document.querySelectorAll(".doc").length === 1');

      await page.click('.doc button[aria-label^="Remove"]');
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-cancel");
      await page.waitFor('!document.querySelector("#confirm-dialog").open');
      assert.equal(await page.evaluate('document.querySelectorAll(".doc").length'), 1);

      await page.click('.doc button[aria-label^="Remove"]');
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('document.querySelectorAll(".doc").length === 0');
      await page.waitFor('document.querySelector("#pdf-empty").textContent.includes("No PDF sheets yet")');

      await page.evaluate('[...document.querySelectorAll(".toast .btn")].at(-1).click(); true');
      await page.waitFor('document.querySelectorAll(".doc").length === 1');
      await page.waitFor('document.querySelector(".pdf-page[data-rendered=true]")', { timeout: 20000 });
      assertClean(page);
    }
  },
  {
    name: "a portrait is scaled to 512 px, stored, shown on the tile and removable",
    async run(page, context) {
      await boot(page, context);
      await page.click("#sample-btn");
      await page.waitFor('document.querySelectorAll(".tile").length === 1');
      await page.evaluate('document.querySelector(".tile-link").click(); true');
      await page.waitFor('document.querySelector("#portrait-input")');

      await page.setFileInput("#portrait-input", [context.fixture("portrait.png")]);
      await page.waitFor('document.querySelector("#crop-whole")');
      await page.click("#crop-whole");
      await page.waitFor('document.querySelector("#portrait-img")?.complete && document.querySelector("#portrait-img").naturalWidth > 0');

      assert.equal(await page.evaluate('document.querySelector("#portrait-img").naturalWidth'), 512);
      assert.equal(await page.evaluate('document.querySelector("#portrait-img").naturalHeight'), 341);
      assert.equal(await page.evaluate('document.querySelector("#portrait-remove").hidden'), false);
      await saved(page);

      await go(page, "#/library", "#library-title");
      await page.waitFor('document.querySelector(".tile img.avatar")');

      await page.reload();
      await page.waitFor('document.querySelector(".tile img.avatar")');

      await page.evaluate('document.querySelector(".tile-link").click(); true');
      await page.waitFor('document.querySelector("#portrait-remove")');
      await page.click("#portrait-remove");
      await page.waitFor('!document.querySelector("#portrait-img")');
      assert.equal(await page.evaluate('document.querySelector("#portrait-frame").textContent'), "MV");
      assertClean(page);
    }
  },
  {
    name: "a file that is not an image is refused as a portrait",
    async run(page, context) {
      await boot(page, context);
      await page.click("#sample-btn");
      await page.waitFor('document.querySelectorAll(".tile").length === 1');
      await page.evaluate('document.querySelector(".tile-link").click(); true');
      await page.waitFor('document.querySelector("#portrait-input")');

      await page.setFileInput("#portrait-input", [context.fixture("sample.pdf")]);
      await page.waitFor('document.querySelector(".toast-error")');

      assert.match(await page.evaluate('document.querySelector(".toast-error").textContent'), /not a PNG, JPEG, WebP or GIF/);
      assert.equal(await page.evaluate('document.querySelector("#portrait-img")'), null);
      assertClean(page);
    }
  },
  {
    name: "duplicating shares the files, and unused files are listed and cleaned up on request",
    timeout: 90000,
    async run(page, context) {
      await boot(page, context);
      await sampleToPdfPage(page);
      await page.setFileInput("#pdf-input", [context.fixture("sample.pdf")]);
      await page.waitFor('document.querySelectorAll(".doc").length === 1');
      await saved(page);

      await go(page, "#/library", "#library-title");
      await page.click('.tile [aria-label^="Duplicate"]');
      await page.waitFor('document.querySelectorAll(".tile").length === 2');
      await saved(page);

      await go(page, "#/data", "#data-title");
      await page.waitFor('document.querySelector("#storage-files")');
      assert.match(await page.evaluate('document.querySelector("#storage-files").textContent'), /^1 file,/);
      assert.equal(await page.evaluate('document.querySelector("#storage-unused").textContent'), "None");

      const removeFirstPdf = async (which) => {
        await go(page, "#/library", "#library-title");
        await page.evaluate(`[...document.querySelectorAll(".tile-link")].find((link) => link.textContent.includes("(copy)") === ${which}).click(); true`);
        await page.waitFor('document.querySelector(".subnav-link[data-page=pdf]")');
        await page.click('.subnav-link[data-page="pdf"]');
        await page.waitFor('document.querySelectorAll(".doc").length === 1');
        await page.click('.doc button[aria-label^="Remove"]');
        await page.waitFor('document.querySelector("#confirm-dialog").open');
        await page.click("#confirm-ok");
        await page.waitFor('document.querySelectorAll(".doc").length === 0');
        await saved(page);
      };

      await removeFirstPdf(true);
      await go(page, "#/data", "#data-title");
      await page.waitFor('document.querySelector("#storage-unused")');
      assert.equal(await page.evaluate('document.querySelector("#storage-unused").textContent'), "None");

      await removeFirstPdf(false);
      await go(page, "#/data", "#data-title");
      await page.waitFor('document.querySelector("#cleanup-btn")');
      assert.match(await page.evaluate('document.querySelector("#storage-unused").textContent'), /^1 file,/);

      await page.click("#cleanup-btn");
      await page.waitFor('document.querySelector("#storage-unused").textContent === "None"');
      assert.match(await page.evaluate('document.querySelector("#storage-files").textContent'), /^0 files/);
      assertClean(page);
    }
  },
  {
    name: "the layout editor adds a section and a field, moves and hides, undoes, and the page and a saved item follow",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Packrat");
      await openRecords(page, "inventory");
      assert.equal(await page.evaluate('document.querySelectorAll("#rec-inventory-form .layout-section").length'), 1);

      await page.click("#rec-inventory-edit-layout");
      await page.waitFor('document.querySelector("#layout-editor")');
      await type(page, 'input[aria-label="Name of the new section"]', "Magic");
      await page.click("#layout-add-section");
      await page.waitFor('document.querySelectorAll("#layout-editor .layout-section-edit").length === 2');
      const magic = await page.evaluate('[...document.querySelectorAll("#layout-editor .layout-section-edit")].at(-1).dataset.section');

      await page.evaluate(`(() => {
        const group = document.querySelector("#layout-editor [data-section=" + ${JSON.stringify(magic)} + "]");
        group.querySelector("details summary").click();
        const form = group.querySelector("details form");
        const name = form.querySelector("input");
        name.value = "Rarity";
        const type = form.querySelector("select");
        type.value = "choice";
        type.dispatchEvent(new Event("change", { bubbles: true }));
        form.querySelectorAll("input")[1].value = "Common, Rare";
        form.requestSubmit();
        return true;
      })()`);
      await page.waitFor('document.querySelector("#layout-editor [data-key^=cf_]")');

      await pick(page, 'select[aria-label="Move Notes to a section"]', magic);
      await page.waitFor(`document.querySelector('#layout-editor [data-section="${magic}"] [data-key=notes]')`);
      await page.click('button[aria-label="Hide Weight each"]');
      await page.waitFor('document.querySelector("#layout-editor [data-key=weight].is-hidden")');

      await page.click("#layout-undo");
      await page.waitFor('!document.querySelector("#layout-editor [data-key=weight].is-hidden")');
      await page.click("#layout-redo");
      await page.waitFor('document.querySelector("#layout-editor [data-key=weight].is-hidden")');
      assert.equal(await page.evaluate('document.querySelector("#layout-editor button[aria-label=\\"Hide Name\\"]")'), null);

      await page.click("#layout-done");
      await page.waitFor('!document.querySelector("#layout-editor") || !document.querySelector("#layout-editor").isConnected');
      assert.equal(await page.evaluate('document.querySelectorAll("#rec-inventory-form .layout-section").length'), 2);
      assert.equal(await page.evaluate('document.querySelector("#rec-inventory-weight")'), null);
      assert.equal(await page.evaluate('[...document.querySelectorAll("#rec-inventory-form .subsection-title")].map((node) => node.textContent).join()'), "Magic");
      assert.equal(await page.evaluate('[...document.querySelectorAll("#rec-inventory-form select[id^=rec-inventory-cf_] option")].map((node) => node.text).join()'), ",Common,Rare");

      await type(page, "#rec-inventory-name", "Wand");
      await pick(page, "#rec-inventory-form select[id^=rec-inventory-cf_]", "Rare");
      await page.click("#rec-inventory-save");
      await page.waitFor('document.querySelectorAll("#rec-inventory-list [data-record]").length === 1');
      await saved(page);

      await page.reload();
      await page.waitFor('document.querySelector("#rec-inventory-form [data-section]")');
      await page.evaluate('document.querySelector("button[aria-label=\\"Edit Wand\\"]").click(); true');
      assert.equal(await page.evaluate('document.querySelector("#rec-inventory-form select[id^=rec-inventory-cf_]").value'), "Rare");
      assert.equal(await page.evaluate('document.querySelectorAll("#rec-inventory-form .layout-section").length'), 2);

      await page.click("#rec-inventory-edit-layout");
      await page.waitFor('document.querySelector("#layout-reset")');
      await page.click("#layout-reset");
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('document.querySelectorAll("#layout-editor .layout-section-edit").length === 1');
      await page.click("#layout-done");
      await page.waitFor('document.querySelector("#rec-inventory-weight")');
      assertClean(page);
    }
  },
  {
    name: "a saved roll with a target says success or failure and by how much",
    async run(page, context) {
      await boot(page, context);
      await go(page, "#/systems", "#systems-title");
      await page.setFileInput("#system-import-input", [context.fixture("systems/tolerant.json")]);
      await page.waitFor('document.querySelector("#system-import-confirm")');
      await page.click("#system-import-confirm");
      await page.waitFor('location.hash === "#/systems/tolerant"');
      await go(page, "#/library", "#library-title");
      await sampleToSheet(page);
      await page.click("#system-tolerant");
      await page.click("#sheet-picker-confirm");
      await page.waitFor('document.querySelector("#sheet-rolls")');
      await page.click("#sheet-rolls .toolbar button");
      await page.waitFor('document.querySelector("#sheet-roll-result .roll-verdict")');
      assert.match(await page.evaluate('document.querySelector("#sheet-roll-result .roll-verdict").textContent'), /^(Success|Failure) by \d+ \(target 3\)$/);
      assert.match(await page.evaluate('document.querySelector("#sheet-roll-result .roll-explain").textContent'), /vs 3: (success|failure) by \d+$/);
      assertClean(page);
    }
  },
  {
    name: "a track's boxes cycle through empty, marked and crossed and feed formulas",
    async run(page, context) {
      await boot(page, context);
      await go(page, "#/systems", "#systems-title");
      await page.setFileInput("#system-import-input", [context.fixture("systems/tolerant.json")]);
      await page.waitFor('document.querySelector("#system-import-confirm")');
      await page.click("#system-import-confirm");
      await page.waitFor('location.hash === "#/systems/tolerant"');
      await go(page, "#/library", "#library-title");
      await sampleToSheet(page);
      await page.click("#system-tolerant");
      await page.click("#sheet-picker-confirm");
      await page.waitFor('document.querySelector("[data-key=harm] .track-box")');
      assert.equal(await page.evaluate('document.querySelectorAll("[data-key=harm] .track-box").length'), 3);

      await page.click('[data-key=harm] [data-box="0"]');
      await page.waitFor('document.querySelector("[data-key=harm] [data-box=\\"0\\"]").classList.contains("is-marked")');
      await page.click('[data-key=harm] [data-box="1"]');
      await page.click('[data-key=harm] [data-box="1"]');
      await page.waitFor('document.querySelector("[data-key=harm] [data-box=\\"1\\"]").classList.contains("is-crossed")');
      assert.match(await page.evaluate('document.querySelector("[data-key=harm] .field-hint").textContent'), /1 marked, 1 crossed of 3/);
      assert.match(await page.evaluate('document.querySelector("[data-key=harm_load] .derived-value").textContent'), /^33$/);
      assert.match(await page.evaluate('document.querySelector("[data-key=harm] [data-box=\\"1\\"]").getAttribute("aria-label")'), /Hurt: crossed/);
      await saved(page);

      await page.reload();
      await page.waitFor('document.querySelector("[data-key=harm] [data-box=\\"1\\"]")?.classList.contains("is-crossed")');
      assertClean(page);
    }
  },
  {
    name: "long text shows bold, lists and quotes without ever becoming markup",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Scribe");
      await openRecords(page, "journal");
      await type(page, "#rec-journal-title", "Night one");
      await type(page, "#rec-journal-text", "**Brave** act\n\n- one\n- two\n\n<img src=x onerror=alert(1)>");
      await page.click("#rec-journal-save");
      await page.waitFor('document.querySelector("#rec-journal-list .record-text")');
      assert.equal(await page.evaluate('document.querySelector("#rec-journal-list .record-text strong").textContent'), "Brave");
      assert.equal(await page.evaluate('document.querySelectorAll("#rec-journal-list .record-text li").length'), 2);
      assert.equal(await page.evaluate('document.querySelector("#rec-journal-list .record-text img")'), null);
      assert.match(await page.evaluate('document.querySelector("#rec-journal-list .record-text").textContent'), /<img src=x onerror=alert\(1\)>/);
      assertClean(page);
    }
  },
  {
    name: "a sheet can start with or without the system's suggested rows",
    async run(page, context) {
      await boot(page, context);
      await sheetPage(page);
      await page.click("#system-dnd5e");
      await page.click("#sheet-picker-confirm");
      await page.waitFor('document.querySelector("#sheet-s-skills")');
      const seeded = await page.evaluate('document.querySelectorAll("#sheet-s-skills .sheet-row").length');
      assert.ok(seeded > 0);

      await go(page, "#/library", "#library-title");
      await page.click("#new-character-btn");
      await page.waitFor('location.hash.startsWith("#/character/")');
      await page.click('.subnav-link[data-page="sheet"]');
      await page.waitFor('document.querySelector("#sheet-picker")');
      await page.click("#system-dnd5e");
      await page.click("#sheet-seed");
      await page.click("#sheet-picker-confirm");
      await page.waitFor('document.querySelector("#sheet-s-skills")');
      assert.equal(await page.evaluate('document.querySelectorAll("#sheet-s-skills .sheet-row").length'), 0);
      assertClean(page);
    }
  },
  {
    name: "a system's sections can sit on their own tabs beside the Sheet",
    async run(page, context) {
      await boot(page, context);

      await page.evaluate(`(async () => {
        const { openStorage } = await import("/src/storage.js");
        const storage = await openStorage();
        const table = (key, label) => ({ key, label, columns: ["name"], fields: [{ key: "name", label: "Name", type: "text" }] });
        await storage.putSystem({
          format: "omniscribe-system", formatVersion: 1, id: "tabs", version: 1, name: "Tabbed", base: null, overlay: [],
          fields: [{ key: "a", label: "Aspect", type: "text" }], pools: [], tables: {}, conditions: [], rests: [], rolls: [],
          collections: [table("gear", "Gear"), table("spells", "Spells")],
          sections: [
            { id: "main", title: "Main", layout: "fields", items: ["a"] },
            { id: "gear", title: "Gear", layout: "table", items: ["gear"], page: "Equipment" },
            { id: "spells", title: "Spells", layout: "table", items: ["spells"], page: "Magic" }
          ]
        });
        await storage.backend.apply([
          { store: "characters", put: [["char_tabbed", { id: "char_tabbed", name: "Tabber", createdAt: 1, updatedAt: 1, sheet: { template: { id: "tabs", version: 1 }, values: { a: "x" }, pools: {}, collections: { gear: [], spells: [] }, conditions: [], orphans: {} } }]] },
          { store: "meta", put: [["schemaVersion", 7]] }
        ]);
        storage.close();
        return true;
      })()`);

      await page.reload();
      await page.waitFor('document.querySelector(".tile-link")');
      await page.evaluate('document.querySelector(".tile-link").click(); true');
      await page.waitFor('document.querySelector(".subnav-link[data-page=p-equipment]")');
      assert.equal(await page.evaluate('[...document.querySelectorAll(".subnav-link")].map((link) => link.textContent).slice(0, 5).join()'), "Overview,Sheet,Equipment,Magic,Inventory");

      await page.click('.subnav-link[data-page="sheet"]');
      await page.waitFor('!document.querySelector("#character-sheet").hidden && document.querySelector("#sheet-s-main")');
      assert.equal(await page.evaluate('document.querySelector("#sheet-s-main").hidden'), false);
      assert.equal(await page.evaluate('document.querySelector("#sheet-s-gear").hidden'), true);
      assert.equal(await page.evaluate('document.querySelector("#sheet-s-spells").hidden'), true);

      await page.click('.subnav-link[data-page="p-equipment"]');
      await page.waitFor('location.hash.endsWith("/p-equipment") && !document.querySelector("#sheet-s-gear").hidden');
      assert.equal(await page.evaluate('document.querySelector("#sheet-s-main").hidden'), true);
      assert.equal(await page.evaluate('document.querySelector("#sheet-s-spells").hidden'), true);
      assert.equal(await page.evaluate('document.querySelector(".sheet-bar").classList.contains("is-off-page")'), true);
      assert.equal(await page.evaluate('document.querySelector(".subnav-link[aria-current=page]").dataset.page'), "p-equipment");

      await page.reload();
      await page.waitFor('document.querySelector("#sheet-s-gear") && !document.querySelector("#sheet-s-gear").hidden');
      assertClean(page);
    }
  },
  {
    name: "layouts can be copied, switched between and deleted",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Switcher");
      await openRecords(page, "inventory");
      await page.click("#rec-inventory-edit-layout");
      await page.waitFor('document.querySelector("#layout-editor")');
      await type(page, 'input[aria-label="Name of the new section"]', "Extras");
      await page.click("#layout-add-section");
      await page.waitFor('document.querySelectorAll("#layout-editor .layout-section-edit").length === 2');

      await type(page, "#layout-new-name", "Plain");
      await page.click("#layout-new");
      await page.waitFor('document.querySelector("#layout-choose").selectedOptions[0].text === "Plain"');
      assert.equal(await page.evaluate('document.querySelectorAll("#layout-editor .layout-section-edit").length'), 2);

      await pick(page, "#layout-choose", "default");
      await page.waitFor('document.querySelectorAll("#layout-editor .layout-section-edit").length === 1');
      assert.equal(await page.evaluate('document.querySelectorAll("#layout-choose option").length'), 3);

      const mine = await page.evaluate('[...document.querySelectorAll("#layout-choose option")].find((option) => option.text === "My layout").value');
      await pick(page, "#layout-choose", mine);
      await page.waitFor('document.querySelectorAll("#layout-editor .layout-section-edit").length === 2');

      await pick(page, "#layout-choose", await page.evaluate('[...document.querySelectorAll("#layout-choose option")].find((option) => option.text === "Plain").value'));
      await page.waitFor('document.querySelector("#layout-delete")');
      await page.click("#layout-delete");
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('document.querySelector("#layout-choose").value === "default"');
      assert.equal(await page.evaluate('document.querySelectorAll("#layout-choose option").length'), 2);
      assertClean(page);
    }
  },
  {
    name: "values of a removed field are kept aside and can be removed from the Data page",
    async run(page, context) {
      await boot(page, context);
      await seedLayouts(page, [{ id: "lay_inventory", name: "My layout", surface: "inventory", base: "default", ops: [{ op: "add", target: "field", field: { id: "cf_rarity", label: "Rarity", type: "text" }, section: "main" }] }]);
      await newCharacter(page, "Keeper");
      await openRecords(page, "inventory");
      await type(page, "#rec-inventory-name", "Ring");
      await type(page, "#rec-inventory-cf_rarity", "Rare");
      await page.click("#rec-inventory-save");
      await page.waitFor('document.querySelectorAll("#rec-inventory-list [data-record]").length === 1');

      await page.click("#rec-inventory-edit-layout");
      await page.waitFor('document.querySelector("#layout-editor [data-key=cf_rarity]")');
      await page.click('button[aria-label="Remove Rarity"]');
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('!document.querySelector("#layout-editor [data-key=cf_rarity]")');
      await page.click("#layout-done");
      await saved(page);

      await go(page, "#/data", "#data-title");
      await page.click("#check-btn");
      await page.waitFor('document.querySelector("#check-stale")');
      assert.match(await page.evaluate('document.querySelector("#check-stale").textContent'), /1 value of fields/);
      await page.click("#purge-values-btn");
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('!document.querySelector("#check-stale")');
      assertClean(page);
    }
  },
  {
    name: "anonymous custom fields from before layouts become declared fields, with every value kept",
    async run(page, context) {
      await boot(page, context);

      await page.evaluate(`(async () => {
        const { openStorage } = await import("/src/storage.js");
        const storage = await openStorage();
        const lists = { abilities: [], journal: [], relations: [], progression: [], familiars: [] };
        const item = (id, name, custom) => ({ id, name, quantity: 1, custom });
        await storage.backend.apply([
          { store: "characters", put: [["char_old", { id: "char_old", name: "Old Hero", createdAt: 1, updatedAt: 1, documents: [], pdf: { preference: "generated", uploadedId: null }, sheet: null, rollPresets: [], ...lists,
            inventory: { wallets: {}, items: [
              item("item_a", "Sword", [{ label: "Rarity", type: "text", value: "Rare" }, { label: "Cursed", type: "checkbox", value: true }]),
              item("item_b", "Shield", [{ label: "rarity", type: "text", value: "Common" }])
            ] } }]] },
          { store: "campaigns", put: [["camp_old", { id: "camp_old", name: "Old Saga", custom: [{ label: "Mood", type: "text", value: "Dark" }], roster: [], sessions: [], handouts: [], partyColumns: [] }]] },
          { store: "meta", put: [["schemaVersion", 6]] }
        ]);
        storage.close();
        return true;
      })()`);

      await page.reload();
      await page.waitFor('document.querySelector(".tile-title")');
      await saved(page);
      await page.reload();
      await page.waitFor('document.querySelector(".tile-title")');

      await page.evaluate('document.querySelector(".tile-link").click(); true');
      await page.waitFor('document.querySelector(".subnav-link[data-page=inventory]")');
      await page.click('.subnav-link[data-page="inventory"]');
      await page.waitFor('document.querySelectorAll("#rec-inventory-list [data-record]").length === 2');
      assert.equal(await page.evaluate('document.querySelectorAll("#rec-inventory-form .layout-section").length'), 2);
      assert.equal(await page.evaluate('document.querySelector("#rec-inventory-form [data-section=earlier] .subsection-title").textContent'), "From earlier");
      assert.equal(await page.evaluate('document.querySelectorAll("#rec-inventory-form [data-section=earlier] .field").length'), 2);

      await page.evaluate('document.querySelector("button[aria-label=\\"Edit Sword\\"]").click(); true');
      assert.equal(await page.evaluate('[...document.querySelectorAll("#rec-inventory-form [data-section=earlier] input[type=text]")].map((input) => input.value).join()'), "Rare");
      assert.equal(await page.evaluate('document.querySelector("#rec-inventory-form [data-section=earlier] input[type=checkbox]").checked'), true);

      await go(page, "#/library", "#library-title");
      await page.evaluate('document.querySelectorAll(".tile-link")[1].click(); true');
      await page.waitFor('location.hash.startsWith("#/campaign/")');
      await page.waitFor('document.querySelector("#campaign-s-earlier")');
      assert.equal(await page.evaluate('document.querySelector("#campaign-s-earlier input").value'), "Dark");
      assertClean(page);
    }
  },
  {
    name: "data saved before documents existed is migrated and still opens",
    async run(page, context) {
      await boot(page, context);

      await page.evaluate(`(async () => {
        const { openStorage } = await import("/src/storage.js");
        const storage = await openStorage();
        await storage.backend.apply([
          { store: "characters", put: [["char_legacy", { id: "char_legacy", name: "Legacy Hero", createdAt: 1, updatedAt: 1 }]] },
          { store: "meta", put: [["schemaVersion", 1]] }
        ]);
        storage.close();
        return true;
      })()`);

      await page.reload();
      await page.waitFor('document.querySelector(".tile-title")?.textContent.includes("Legacy Hero")');
      await saved(page);

      const stored = await page.evaluate(`(async () => {
        const { openStorage } = await import("/src/storage.js");
        const storage = await openStorage();
        const value = await storage.meta("schemaVersion");
        const record = (await storage.load()).characters[0];
        storage.close();
        return { value, documents: record.documents, pdf: record.pdf };
      })()`);

      assert.equal(stored.value, 7);
      assert.deepEqual(stored.documents, []);
      assert.deepEqual(stored.pdf, { preference: "generated", uploadedId: null });

      await page.evaluate('document.querySelector(".tile-link").click(); true');
      await page.waitFor('document.querySelector(".subnav-link[data-page=pdf]")');
      await page.click('.subnav-link[data-page="pdf"]');
      await page.waitFor('document.querySelector("#pdf-empty").textContent.includes("No PDF sheets yet")');
      assertClean(page);
    }
  },
  {
    name: "a sheet starts from a chosen system and computes derived values and modifiers",
    async run(page, context) {
      await boot(page, context);
      await startGeneric(page);

      assert.equal(await page.evaluate('document.querySelector("#sheet-f-might").value'), "10");
      await type(page, "#sheet-f-might", "16");
      await type(page, "#sheet-f-agility", "14");
      await page.waitFor('document.querySelector("[data-key=defense] .derived-value").textContent === "12"');

      assert.match(await page.evaluate('document.querySelector("[data-key=might] .subs").textContent'), /mod\s*\+3/);
      assert.equal(await page.evaluate('document.querySelector("input[aria-label=\\"Health current\\"]").value'), "14");
      assert.match(await page.evaluate('document.querySelector(".sheet-system").textContent'), /Following Generic, version 1/);
      assert.equal(await page.evaluate('document.querySelector("#sheet-problems").children.length'), 0);
      assertClean(page);
    }
  },
  {
    name: "a bad sheet value is refused beside its field and never stored",
    async run(page, context) {
      await boot(page, context);
      await startGeneric(page);

      await type(page, "#sheet-f-might", "99");
      await page.waitFor('!document.querySelector("#sheet-f-might-error").hidden');
      assert.match(await page.evaluate('document.querySelector("#sheet-f-might-error").textContent'), /cannot be above 40/);
      assert.equal(await page.evaluate('document.querySelector("#sheet-f-might").getAttribute("aria-invalid")'), "true");

      await type(page, "#sheet-f-might", "18");
      await page.waitFor('document.querySelector("#sheet-f-might-error").hidden');
      await saved(page);

      await page.reload();
      await page.waitFor('document.querySelector("#sheet-f-might")');
      assert.equal(await page.evaluate('document.querySelector("#sheet-f-might").value'), "18");
      assertClean(page);
    }
  },
  {
    name: "pools, rows, uses, conditions and rests work and persist",
    timeout: 60000,
    async run(page, context) {
      await boot(page, context);
      await startGeneric(page);

      await type(page, 'input[aria-label="Health current"]', "5");
      await page.click("#sheet-add-abilities");
      await page.waitFor('document.querySelectorAll("[data-collection=abilities] .sheet-row").length === 1');
      assert.equal(await page.evaluate('document.activeElement.closest(".sheet-row") !== null'), true);

      await page.evaluate(`(() => {
        const row = document.querySelector("[data-collection=abilities] .sheet-row");
        const name = row.querySelector("input[type=text]");
        name.value = "Blink";
        name.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
      await page.click('[data-collection=abilities] button[aria-label^="Use one"]');
      await page.waitFor('document.querySelector("[data-collection=abilities] .uses-count").textContent === "0 of 1 left"');

      await page.click('.cond:not(.is-on)');
      await page.waitFor('document.querySelectorAll(".cond.is-on").length === 1');
      await saved(page);

      await page.reload();
      await page.waitFor('document.querySelector("[data-collection=abilities] .sheet-row")');
      assert.equal(await page.evaluate('document.querySelector("input[aria-label=\\"Health current\\"]").value'), "5");
      assert.equal(await page.evaluate('document.querySelectorAll(".cond.is-on").length'), 1);
      assert.equal(await page.evaluate('document.querySelector("[data-collection=abilities] .uses-count").textContent'), "0 of 1 left");

      await page.click("#sheet-rest-long");
      await page.waitFor('document.querySelector("input[aria-label=\\"Health current\\"]").value === "14"');
      await page.waitFor('document.querySelector("[data-collection=abilities] .uses-count").textContent === "1 of 1 left"');

      await page.evaluate('[...document.querySelectorAll(".toast .btn")].at(-1).click(); true');
      await page.waitFor('document.querySelector("input[aria-label=\\"Health current\\"]").value === "5"');
      assertClean(page);
    }
  },
  {
    name: "boxes pools tick, and removing a row can be undone",
    timeout: 60000,
    async run(page, context) {
      await boot(page, context);
      await startGeneric(page);

      assert.equal(await page.evaluate('document.querySelectorAll("[data-key=energy] .box").length'), 11);
      assert.equal(await page.evaluate('document.querySelectorAll("[data-key=energy] .box[aria-pressed=true]").length'), 11);

      await page.evaluate('document.querySelectorAll("[data-key=energy] .box")[3].click(); true');
      await page.waitFor('document.querySelectorAll("[data-key=energy] .box[aria-pressed=true]").length === 4');
      assert.match(await page.evaluate('document.querySelector("[data-key=energy] .pool-readout").textContent'), /^4 \/ 11/);

      await page.click("#sheet-add-attacks");
      await page.waitFor('document.querySelectorAll("[data-collection=attacks] .sheet-row").length === 1');
      await page.click('[data-collection=attacks] .sheet-row button[aria-label^="Remove"]');
      await page.waitFor('document.querySelectorAll("[data-collection=attacks] .sheet-row").length === 0');
      await page.evaluate('[...document.querySelectorAll(".toast .btn")].at(-1).click(); true');
      await page.waitFor('document.querySelectorAll("[data-collection=attacks] .sheet-row").length === 1');
      assertClean(page);
    }
  },
  {
    name: "changing system keeps unmatched values aside and Undo restores them",
    timeout: 60000,
    async run(page, context) {
      await boot(page, context);
      await installTestSystem(page, context);
      await startGeneric(page);
      await type(page, "#sheet-f-might", "16");
      await saved(page);

      await page.click("#sheet-change");
      await page.waitFor('document.querySelector("#sheet-picker-confirm")');
      await page.click("#system-test-d20");
      await page.click("#sheet-picker-confirm");
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('document.querySelector("#sheet-f-str")');

      assert.match(await page.evaluate('document.querySelector(".sheet-system").textContent'), /Following Test d20/);
      assert.match(await page.evaluate('document.querySelector("#sheet-orphans").textContent'), /values\.might/);
      assert.equal(await page.evaluate('document.querySelector("#sheet-f-might")'), null);

      await page.evaluate('[...document.querySelectorAll(".toast .btn")].at(-1).click(); true');
      await page.waitFor('document.querySelector("#sheet-f-might")');
      assert.equal(await page.evaluate('document.querySelector("#sheet-f-might").value'), "16");
      assertClean(page);
    }
  },
  {
    name: "the built-in 3.5e and 5e systems start prefilled and compute in the browser",
    timeout: 60000,
    async run(page, context) {
      await boot(page, context);
      await sheetPage(page);
      assert.deepEqual(await page.evaluate('[...document.querySelectorAll(".system-card strong")].map((node) => node.textContent)'), ["D&D 3.5e", "D&D 5e", "Generic"]);

      await page.click("#system-dnd35");
      await page.click("#sheet-picker-confirm");
      await page.waitFor('document.querySelector("#sheet-f-str")');
      assert.equal(await page.evaluate('document.querySelectorAll("[data-collection=skills] .sheet-row").length'), 42);
      assert.equal(await page.evaluate('document.querySelectorAll("[data-collection=classes] .sheet-row").length'), 1);

      await type(page, "#sheet-f-str", "16");
      await type(page, "[data-collection=classes] .sheet-row input[type=number]", "5");
      await page.waitFor('document.querySelector("[data-key=bab] .derived-value").textContent === "+3"');
      assert.equal(await page.evaluate('document.querySelector("[data-key=melee_attack] .derived-value").textContent'), "+6");
      assert.equal(await page.evaluate('document.querySelector("[data-key=level] .derived-value").textContent'), "5");
      assert.equal(await page.evaluate('document.querySelector("#sheet-problems").children.length'), 0);

      await page.click("#sheet-change");
      await page.click("#system-dnd5e");
      await page.click("#sheet-picker-confirm");
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('document.querySelector("#sheet-f-save_prof_str")');
      assert.equal(await page.evaluate('document.querySelectorAll("[data-collection=skills] .sheet-row").length'), 42);
      await type(page, "#sheet-f-slots_1", "4");
      await page.waitFor('document.querySelectorAll("[data-key=spell_1] .box").length === 4');
      assert.equal(await page.evaluate('document.querySelector("[data-key=proficiency] .derived-value").textContent'), "+3");
      assertClean(page);
    }
  },
  {
    name: "a newer version of a system is reviewed as a diff before a sheet moves",
    timeout: 60000,
    async run(page, context) {
      await boot(page, context);
      await installTestSystem(page, context);
      await sheetPage(page);
      await page.click("#system-test-d20");
      await page.click("#sheet-picker-confirm");
      await page.waitFor('document.querySelector("#sheet-f-str")');
      await type(page, "#sheet-f-armor_bonus", "4");
      await saved(page);
      assert.equal(await page.evaluate('document.querySelector("#sheet-update").hidden'), true);

      await page.evaluate(`(async () => {
        const file = await (await fetch("/test/fixtures/systems/d20-core.json")).json();
        file.version = 2;
        file.fields = file.fields.filter((field) => field.key !== "touch_ac" && field.key !== "armor_bonus" && field.key !== "ac");
        file.sections[1].items = ["initiative", "hp"];
        file.fields.push({ key: "luck", label: "Luck", type: "number" });
        const { openStorage } = await import("/src/storage.js");
        const storage = await openStorage();
        await storage.putSystem(file);
        storage.close();
        return true;
      })()`);
      await page.reload();
      await page.waitFor('document.querySelector("#sheet-update") && !document.querySelector("#sheet-update").hidden');
      assert.match(await page.evaluate('document.querySelector("#sheet-update").textContent'), /Version 2 of this system is available/);

      await page.click("#sheet-update-review");
      await page.waitFor('document.querySelector("#diff-dialog").open');
      const list = await page.evaluate('document.querySelector("#diff-list").textContent');
      assert.match(list, /Added field\s*Luck/);
      assert.match(list, /Removed field\s*Armor class/);
      assert.match(await page.evaluate('document.querySelector("#diff-moved").textContent'), /1 stored value has no place[\s\S]*values\.armor_bonus/);

      await page.click("#diff-cancel");
      await page.waitFor('!document.querySelector("#diff-dialog").open');
      assert.equal(await page.evaluate('document.querySelector("#sheet-update").hidden'), false);

      await page.click("#sheet-update-review");
      await page.waitFor('document.querySelector("#diff-dialog").open');
      await page.click("#diff-confirm");
      await page.waitFor('document.querySelector("#sheet-update").hidden');
      assert.match(await page.evaluate('document.querySelector(".sheet-system").textContent'), /version 2/);
      assert.match(await page.evaluate('document.querySelector("#sheet-orphans").textContent'), /values\.armor_bonus/);
      assert.ok(await page.evaluate('document.querySelector("#sheet-f-luck")'));
      assertClean(page);
    }
  },
  {
    name: "a sheet whose system is missing explains it and keeps the values",
    timeout: 60000,
    async run(page, context) {
      await boot(page, context);
      await installTestSystem(page, context);
      await startGeneric(page);
      await page.click("#sheet-change");
      await page.click("#system-test-d20");
      await page.click("#sheet-picker-confirm");
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('document.querySelector("#sheet-f-str")');
      await saved(page);

      await page.evaluate(`(async () => {
        const { openStorage } = await import("/src/storage.js");
        const storage = await openStorage();
        await storage.deleteSystem("test-d20", 1);
        storage.close();
        return true;
      })()`);
      await page.reload();
      await page.waitFor('document.querySelector("#sheet-picker")');

      assert.match(await page.evaluate('document.querySelector("#sheet-picker").textContent'), /"test-d20" version 1 is not available/);
      assert.match(await page.evaluate('document.querySelector("#sheet-picker").textContent'), /Your values are safe/);
      await page.click("#system-generic");
      await page.click("#sheet-picker-confirm");
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('document.querySelector("#sheet-f-might")');
      assert.equal(await page.evaluate('document.querySelector("#sheet-orphans").children.length'), 0);
      assert.equal(await page.evaluate('document.querySelector("#sheet-f-might").value'), "10");
      assertClean(page);
    }
  },
  {
    name: "the systems page lists built-ins, which are read-only and can be derived",
    async run(page, context) {
      await boot(page, context);
      await go(page, "#/systems", "#systems-title");

      assert.match(await page.evaluate('document.querySelector("#systems-list").textContent'), /Generic[\s\S]*Built in/);
      assert.equal(await page.evaluate('document.querySelector(".system-item [aria-label^=Delete]")'), null);

      await page.click('[data-id=generic] a[aria-label^="View"]');
      await page.waitFor('document.querySelector("#system-json")');
      assert.equal(await page.evaluate('document.querySelector("#system-json").readOnly'), true);
      assert.equal(await page.evaluate('document.querySelector("#system-save").disabled'), true);
      assert.match(await page.evaluate('document.querySelector("#system-note").textContent'), /built in and read-only/);
      await page.waitFor('document.querySelector("#system-status")?.textContent === "Valid"');

      await page.click("#system-derive");
      await page.waitFor('document.querySelector("#new-system-dialog").open');
      assert.equal(await page.evaluate('document.querySelector("#new-system-base").value'), "generic");
      assertClean(page);
    }
  },
  {
    name: "a derived system is created, edited with live validation and saved as a new version",
    timeout: 60000,
    async run(page, context) {
      await boot(page, context);
      await go(page, "#/systems", "#systems-title");
      await page.click("#new-system-btn");
      await page.waitFor('document.querySelector("#new-system-dialog").open');
      await type(page, "#new-system-name", "House Rules");
      assert.equal(await page.evaluate('document.querySelector("#new-system-id").value'), "house-rules");
      await page.click("#new-system-create");
      await page.waitFor('location.hash === "#/systems/house-rules"');
      await page.waitFor('document.querySelector("#system-status")?.textContent === "Valid"');
      assert.match(await page.evaluate('document.querySelector("#system-json").value'), /"id": "house-rules"/);
      assert.match(await page.evaluate('document.querySelector("#system-note").textContent'), /Saving creates version 2/);

      const edit = (mutation) => page.evaluate(`(() => {
        const area = document.querySelector("#system-json");
        const file = JSON.parse(area.value);
        (${mutation})(file);
        area.value = JSON.stringify(file, null, 2);
        area.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);

      await edit('(file) => file.overlay.push({ op: "add", target: "field", key: "luck", value: { label: "Luck", type: "derived", formula: "@ghost + 1" } })');
      await page.waitFor('document.querySelector("#system-status")?.textContent.includes("problem")', { timeout: 4000 });
      assert.match(await page.evaluate('document.querySelector("#system-errors").textContent'), /fields\.luck\.formula[\s\S]*Unknown reference @ghost/);
      assert.equal(await page.evaluate('document.querySelector("#system-save").disabled'), true);

      await edit('(file) => { file.overlay[0].value.formula = "@might + 1"; }');
      await page.waitFor('document.querySelector("#system-status")?.textContent === "Valid"', { timeout: 4000 });
      assert.equal(await page.evaluate('document.querySelector("#system-save").disabled'), false);
      assert.match(await page.evaluate('document.querySelector("#system-summary").textContent'), /13 fields/);

      await page.click("#system-save");
      await page.waitFor('document.querySelector("#system-note").textContent.includes("Saving creates version 3")');
      assert.match(await page.evaluate('document.querySelector("#system-title").parentElement.textContent'), /version 2/);

      await go(page, "#/systems", "#systems-title");
      assert.match(await page.evaluate('document.querySelector("[data-id=house-rules]").textContent'), /Version 2 · 2 versions · derived from generic v1/);

      await page.reload();
      await page.waitFor('document.querySelector("[data-id=house-rules]")');
      assertClean(page);
    }
  },
  {
    name: "the visual editor adds, edits and removes parts of a derived system and writes an overlay",
    timeout: 90000,
    async run(page, context) {
      await boot(page, context);
      await openNewSystem(page, "Visual House");

      const overlay = () => page.evaluate('JSON.parse(document.querySelector("#system-json").value).overlay');
      const status = () => page.evaluate('document.querySelector("#system-status")?.textContent');

      await tab(page, "Fields");
      assert.ok(await page.evaluate('[...document.querySelectorAll("#visual-panel .entry-btn")].length > 10'));

      await addEntry(page, "ve-add-field", "luck");
      await page.waitFor('document.querySelector("#visual-panel .entry-title")?.textContent.includes("(luck)")');
      await setControl(page, "Label", "Luck score");
      await setControl(page, "Type", "derived");
      await page.waitFor('[...document.querySelectorAll("#visual-panel .field-label")].some((l) => l.textContent === "Formula")');
      await setControl(page, "Formula", "@might + 1");
      await page.waitFor('document.querySelector("#system-status")?.textContent === "Valid"');
      const added = (await overlay()).find((op) => op.op === "add" && op.key === "luck");
      assert.equal(added.value.formula, "@might + 1");
      assert.equal(added.value.label, "Luck score");

      await selectEntry(page, "Defense (defense)");
      await setControl(page, "Formula", "10 + @agility.mod + 1");
      await page.waitFor('document.querySelector("#system-status")?.textContent === "Valid"');
      assert.deepEqual((await overlay()).find((op) => op.op === "override" && op.key === "defense").value, { formula: "10 + @agility.mod + 1" });

      await setControl(page, "Formula", "@ghost + 1");
      await page.waitFor('document.querySelector("#system-status")?.textContent.includes("problem")');
      assert.match(await page.evaluate('document.querySelector("#visual-note").textContent'), /still show your latest edits/);
      assert.match(await page.evaluate('document.querySelector("#system-errors").textContent'), /Unknown reference @ghost/);
      await setControl(page, "Formula", "10 + @agility.mod + 2");
      await page.waitFor('document.querySelector("#system-status")?.textContent === "Valid"');

      await selectEntry(page, "Concept (concept)");
      await page.click('#visual-panel button[aria-label="Remove field concept"]');
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('(JSON.parse(document.querySelector("#system-json").value).overlay).some((op) => op.op === "remove" && op.key === "concept")');
      await page.waitFor('document.querySelector("#system-status")?.textContent === "Valid"');

      await page.click("#system-save");
      await page.waitFor('document.querySelector("#system-note").textContent.includes("Saving creates version 3")');
      assertClean(page);
    }
  },
  {
    name: "the visual editor edits pools, collections, tables, conditions, rolls and rests",
    timeout: 90000,
    async run(page, context) {
      await boot(page, context);
      await openNewSystem(page, "Parts House");
      const valid = () => page.waitFor('document.querySelector("#system-status")?.textContent === "Valid"');
      const overlay = () => page.evaluate('JSON.parse(document.querySelector("#system-json").value).overlay');

      await tab(page, "Pools");
      await addEntry(page, "ve-add-pool", "mana");
      await setControl(page, "Maximum (a formula)", "@intellect * 10");
      await setControl(page, "Shown as", "boxes");
      await setControl(page, "Points per box", "10");
      await setControl(page, "What each rest does, one per line as rest = full, none, add: formula or set: formula (short, long)", "long = full\nshort = add: 5");
      await valid();
      assert.deepEqual((await overlay()).find((op) => op.key === "mana").value.rests, { long: "full", short: { add: "5" } });

      await tab(page, "Collections");
      await addEntry(page, "ve-add-collection", "pets");
      await page.waitFor('document.querySelector("#ve-add-column")');
      await addEntry(page, "ve-add-column", "bond");
      await setControl(page, "Type", "number", { last: true });
      await valid();
      const collection = (await overlay()).find((op) => op.target === "collection" && op.key === "pets");
      assert.deepEqual(collection.value.fields.map((field) => field.key), ["name", "bond"]);
      assert.equal(collection.value.fields[1].type, "number");

      await tab(page, "Tables");
      await addEntry(page, "ve-add-table", "levels");
      await setControl(page, "Entries, one per line as key = value", "1 = 10\n2 = 25\nname = text");
      await valid();
      assert.deepEqual((await overlay()).find((op) => op.target === "table" && op.key === "levels").value, { 1: 10, 2: 25, name: "text" });

      await tab(page, "Conditions");
      await setControl(page, "Conditions, one per line", "Blinded\nCursed");
      await valid();
      assert.ok((await overlay()).some((op) => op.target === "condition" && op.op === "add" && op.value === "Cursed"));
      assert.ok((await overlay()).some((op) => op.target === "condition" && op.op === "remove" && op.value === "Poisoned"));

      await tab(page, "Rests");
      await addEntry(page, "ve-add-rest", "weekly");
      await tab(page, "Rolls");
      await addEntry(page, "ve-add-roll", "luck_roll");
      await setControl(page, "Expression", "1d20 + @might.mod");
      await valid();
      assert.ok((await overlay()).some((op) => op.target === "rest" && op.key === "weekly"));
      assert.equal((await overlay()).find((op) => op.target === "roll" && op.key === "luck_roll").value.expression, "1d20 + @might.mod");

      await tab(page, "Details");
      await setControl(page, "Description", "A house system.");
      await valid();
      assert.equal(await page.evaluate('JSON.parse(document.querySelector("#system-json").value).description'), "A house system.");
      assertClean(page);
    }
  },
  {
    name: "the visual editor refuses bad keys, is read-only for built-ins and stays in step with the JSON",
    timeout: 60000,
    async run(page, context) {
      await boot(page, context);
      await go(page, "#/systems", "#systems-title");
      await page.click('[data-id=generic] a[aria-label^="View"]');
      await page.waitFor('document.querySelector("#visual-panel input, #visual-panel select")');
      assert.equal(await page.evaluate('[...document.querySelectorAll("#visual-panel input, #visual-panel select")].every((control) => control.disabled)'), true);
      assert.equal(await page.evaluate('document.querySelector("#ve-add-field")'), null);

      await go(page, "#/systems", "#systems-title");
      await page.click("#new-system-btn");
      await type(page, "#new-system-name", "Sync House");
      await page.click("#new-system-create");
      await page.waitFor('location.hash === "#/systems/sync-house"');
      await tab(page, "Fields");

      await type(page, "#ve-add-field", "Bad Key");
      await page.evaluate('[...document.querySelectorAll("#visual-panel button")].find((b) => b.textContent.includes("Add field")).click(); true');
      await page.waitFor('document.querySelector("#visual-panel .field-error:not([hidden])")');
      assert.match(await page.evaluate('document.querySelector("#visual-panel .field-error:not([hidden])").textContent'), /lowercase letters/);

      await type(page, "#ve-add-field", "might");
      await page.evaluate('[...document.querySelectorAll("#visual-panel button")].find((b) => b.textContent.includes("Add field")).click(); true');
      await page.waitFor('[...document.querySelectorAll("#visual-panel .field-error:not([hidden])")].some((e) => e.textContent.includes("already used"))');

      await page.click("#mode-json");
      await page.waitFor('!document.querySelector("#json-editor").hidden');
      assert.equal(await page.evaluate('document.querySelector("#visual-editor").hidden'), true);
      await page.evaluate(`(() => {
        const area = document.querySelector("#system-json");
        const file = JSON.parse(area.value);
        file.overlay.push({ op: "add", target: "field", key: "from_json", value: { label: "From JSON", type: "number" } });
        area.value = JSON.stringify(file, null, 2);
        area.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      })()`);
      await page.waitFor('document.querySelector("#system-status")?.textContent === "Valid"');
      await page.click("#mode-visual");
      await page.waitFor('!document.querySelector("#visual-editor").hidden');
      await page.waitFor('[...document.querySelectorAll("#visual-panel .entry-btn")].some((b) => b.textContent.includes("from_json"))');
      assertClean(page);
    }
  },
  {
    name: "a sheet can follow a system made in the app",
    timeout: 60000,
    async run(page, context) {
      await boot(page, context);
      await go(page, "#/systems", "#systems-title");
      await page.click("#new-system-btn");
      await type(page, "#new-system-name", "Mine");
      await page.click("#new-system-create");
      await page.waitFor('location.hash === "#/systems/mine"');
      await go(page, "#/library", "#library-title");
      await page.click("#sample-btn");
      await page.waitFor('document.querySelectorAll(".tile").length === 1');
      await page.evaluate('document.querySelector(".tile-link").click(); true');
      await page.click('.subnav-link[data-page="sheet"]');
      await page.waitFor('document.querySelector("#system-mine")');
      await page.click("#system-mine");
      await page.click("#sheet-picker-confirm");
      await page.waitFor('document.querySelector("#sheet-f-might")');
      assert.match(await page.evaluate('document.querySelector(".sheet-system").textContent'), /Following Mine, version 1/);

      await go(page, "#/systems", "#systems-title");
      assert.match(await page.evaluate('document.querySelector("[data-id=mine]").textContent'), /1 character using it/);
      await page.click('[data-id=mine] [aria-label^="Delete"]');
      await page.waitFor('document.querySelector(".toast-error")');
      assert.match(await page.evaluate('document.querySelector(".toast-error").textContent'), /1 character follows version 1/);
      assertClean(page);
    }
  },
  {
    name: "a system file imports, and bad or repeated files are refused with a reason",
    async run(page, context) {
      await boot(page, context);
      await go(page, "#/systems", "#systems-title");

      await page.setFileInput("#system-import-input", [context.fixture("systems/d20-core.json")]);
      await page.waitFor('document.querySelector("#system-import-confirm")');
      assert.match(await page.evaluate('document.querySelector("#system-import-summary").textContent'), /fields, .* pools, .* A new sheet evaluates with no problems/);
      assert.ok(await page.evaluate('document.querySelectorAll("#system-import-outline li").length') > 0);
      await page.click("#system-import-cancel");
      await page.waitFor('!document.querySelector("#system-import-confirm")');
      assert.equal(await page.evaluate("location.hash"), "#/systems");

      await page.setFileInput("#system-import-input", [context.fixture("systems/d20-core.json")]);
      await page.waitFor('document.querySelector("#system-import-confirm")');
      await page.click("#system-import-confirm");
      await page.waitFor('location.hash === "#/systems/test-d20"');
      await go(page, "#/systems", "#systems-title");
      assert.match(await page.evaluate('document.querySelector("[data-id=test-d20]").textContent'), /Test d20/);

      await page.setFileInput("#system-import-input", [context.fixture("systems/d20-core.json")]);
      await page.waitFor('document.querySelector("#system-import-errors")');
      assert.match(await page.evaluate('document.querySelector("#system-import-errors").textContent'), /already on this device/);
      assert.equal(await page.evaluate('document.querySelector("#system-import-confirm")'), null);
      await page.click("#system-import-cancel");

      await page.setFileInput("#system-import-input", [context.fixture("not-a-pdf.pdf")]);
      await page.waitFor('[...document.querySelectorAll(".toast-error")].some((t) => t.textContent.includes("not valid JSON"))');

      await page.setFileInput("#system-import-input", [context.fixture("systems/tolerant.json")]);
      await page.waitFor('document.querySelector("#system-import-confirm")');
      assert.match(await page.evaluate('document.querySelector("#system-import-warnings").textContent'), /read as the formula "3"/);
      assert.match(await page.evaluate('document.querySelector("#system-import-outline").textContent'), /on the Gear tab/);
      assert.match(await page.evaluate('document.querySelector("#system-import-preview").textContent'), /Level.*3.*Harm.*Bruised \[ \]/);
      await page.click("#system-import-confirm");
      await page.waitFor('location.hash === "#/systems/tolerant"');

      await go(page, "#/systems", "#systems-title");
      await page.setFileInput("#system-import-input", [context.fixture("systems/broken.json")]);
      await page.waitFor('document.querySelector("#system-import-errors")');
      assert.match(await page.evaluate('document.querySelector("#system-import-errors").textContent'), /did you mean floor()/);
      assert.match(await page.evaluate('document.querySelector("#system-import-errors").textContent'), /use && for and/);
      assert.equal(await page.evaluate('document.querySelector("#system-import-errors li:nth-child(1) code")?.textContent.startsWith("fields")'), true);
      await page.click("#system-import-cancel");

      await page.setFileInput("#system-import-input", [context.fixture("systems/d20-custom.json")]);
      await page.waitFor('document.querySelector("#system-import-confirm")');
      await page.click("#system-import-confirm");
      await page.waitFor('location.hash === "#/systems/test-d20-custom"');

      await go(page, "#/systems", "#systems-title");
      await page.click('[data-id=test-d20] [aria-label^="Delete"]');
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('[...document.querySelectorAll(".toast-error")].some((t) => t.textContent.includes("derived from this version"))');
      assertClean(page);
    }
  },
  {
    name: "an unknown system route returns to the list",
    async run(page, context) {
      await boot(page, context);
      await page.evaluate('location.hash = "#/systems/nothing-here"; true');
      await page.waitFor('location.hash === "#/systems"');
      assertClean(page);
    }
  },
  {
    name: "the character link bar switches pages and marks the current one",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Navigator");

      assert.equal(await page.evaluate('document.querySelector(".subnav-link[aria-current=page]").textContent'), "Overview");

      await page.click('.subnav-link[data-page="pdf"]');
      await page.waitFor('!document.querySelector("#character-pdf").hidden');
      assert.equal(await page.evaluate('document.querySelector("#character-overview").hidden'), true);
      assert.equal(await page.evaluate('document.querySelector(".subnav-link[aria-current=page]").textContent'), "PDF sheets");
      assert.match(await route(page), /\/pdf$/);

      await page.click('.subnav-link[data-page="overview"]');
      await page.waitFor('!document.querySelector("#character-overview").hidden');
      assert.equal(await page.evaluate('document.querySelector("#character-name").value'), "Navigator");
      assertClean(page);
    }
  },
  {
    name: "the dice page rolls a typed expression, validates as you type and opens with Alt+5",
    async run(page, context) {
      await boot(page, context);
      await page.evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit5", key: "5", altKey: true, bubbles: true })); true');
      await page.waitFor('location.hash === "#/dice" && !document.querySelector("#page-dice").hidden');
      assert.equal(await page.evaluate('document.querySelector(".side-link[data-view=dice]").getAttribute("aria-current")'), "page");

      await type(page, "#dice-expression", "4d6x");
      await page.waitFor('document.querySelector("#dice-expression-message").classList.contains("field-error")');
      assert.match(await page.evaluate('document.querySelector("#dice-expression-message").textContent'), /Unknown dice modifier/);

      await type(page, "#dice-expression", "2d6 + 3");
      await page.waitFor('document.querySelector("#dice-expression-message").textContent === "Looks good."');
      await page.click("#dice-roll");
      await page.waitFor('document.querySelector("#dice-result .roll-total")');
      const total = Number(await page.evaluate('document.querySelector("#dice-result .roll-total").textContent'));
      assert.ok(total >= 5 && total <= 15);
      assert.match(await page.evaluate('document.querySelector("#dice-result .roll-explain").textContent'), /^2d6 \+ 3 \[\d, \d\]|2d6 \[\d, \d\]/);
      assert.equal(await page.evaluate('document.querySelectorAll("#dice-log .roll-entry").length'), 1);

      await page.click("#dice-roll");
      await page.waitFor('document.querySelectorAll("#dice-log .roll-entry").length === 2');
      assertClean(page);
    }
  },
  {
    name: "a character's values and system rolls feed the dice, and the log persists across a reload",
    async run(page, context) {
      await boot(page, context);
      await startGeneric(page);
      await type(page, "#sheet-f-might", "16");
      await saved(page);

      await go(page, "#/dice", "#dice-title");
      await page.waitFor('document.querySelector("#dice-character").options.length === 2');
      await page.evaluate('(() => { const select = document.querySelector("#dice-character"); select.value = select.options[1].value; select.dispatchEvent(new Event("change", { bubbles: true })); return true; })()');
      await page.waitFor('document.querySelector("#dice-presets").textContent.includes("Might check")');

      await page.evaluate('[...document.querySelectorAll("#dice-presets button")].find((button) => button.textContent === "Might check").click(); true');
      await page.waitFor('document.querySelector("#dice-result .roll-total")');
      const total = Number(await page.evaluate('document.querySelector("#dice-result .roll-total").textContent'));
      assert.ok(total >= 4 && total <= 23, `total ${total}`);
      assert.match(await page.evaluate('document.querySelector("#dice-result .roll-explain").textContent'), /@might\.mod \(3\)/);

      await type(page, "#dice-expression", "1d20 + @nothing");
      await page.click("#dice-roll");
      await page.waitFor('document.querySelector("#dice-result .field-error")');
      assert.match(await page.evaluate('document.querySelector("#dice-result .field-error").textContent'), /@nothing has no value/);

      await page.reload();
      await go(page, "#/dice", "#dice-title");
      await page.waitFor('document.querySelectorAll("#dice-log .roll-entry").length === 1');
      assert.match(await page.evaluate('document.querySelector("#dice-log .roll-entry").textContent'), /Might check/);
      assertClean(page);
    }
  },
  {
    name: "the roll log rolls again, filters by character and clears with an undo",
    async run(page, context) {
      await boot(page, context);
      await go(page, "#/dice", "#dice-title");
      await type(page, "#dice-expression", "d20");
      await page.click("#dice-roll");
      await page.waitFor('document.querySelectorAll("#dice-log .roll-entry").length === 1');
      await page.evaluate('document.querySelector("#dice-log .roll-entry .btn").click(); true');
      await page.waitFor('document.querySelectorAll("#dice-log .roll-entry").length === 2');

      await type(page, "#dice-search", "nomatch");
      await page.waitFor('document.querySelector("#dice-log .roll-empty")');
      await type(page, "#dice-search", "d20");
      await page.waitFor('document.querySelectorAll("#dice-log .roll-entry").length === 2');

      await page.click("#dice-clear");
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('document.querySelector("#dice-log .roll-empty")');
      await page.evaluate('document.querySelector(".toast button").click(); true');
      await page.waitFor('document.querySelectorAll("#dice-log .roll-entry").length === 2');
      assertClean(page);
    }
  },
  {
    name: "the sheet rolls system rolls and a row's roll field, and both are logged",
    async run(page, context) {
      await boot(page, context);
      await startGeneric(page);
      await type(page, "#sheet-f-might", "16");
      await page.click("#sheet-add-attacks");
      await page.waitFor('document.querySelectorAll("[data-collection=attacks] .sheet-row").length === 1');

      await page.evaluate('[...document.querySelectorAll("#sheet-rolls button")].find((button) => button.textContent === "Might check").click(); true');
      await page.waitFor('document.querySelector("#sheet-roll-result .roll-total")');
      assert.match(await page.evaluate('document.querySelector("#sheet-roll-result .roll-explain").textContent'), /@might\.mod \(3\)/);

      await page.evaluate('document.querySelector("[data-collection=attacks] .sheet-row button[aria-label^=\\"Roll Damage\\"]").click(); true');
      await page.waitFor('document.querySelector("#sheet-roll-result .roll-label").textContent.includes("Damage")');
      assert.match(await page.evaluate('document.querySelector("#sheet-roll-result .roll-explain").textContent'), /^1d6 \[\d\] = \d$/);

      await go(page, "#/dice", "#dice-title");
      await page.evaluate('(() => { const select = document.querySelector("#dice-character"); select.value = select.options[1].value; select.dispatchEvent(new Event("change", { bubbles: true })); return true; })()');
      await page.waitFor('document.querySelectorAll("#dice-log .roll-entry").length === 2');
      assertClean(page);
    }
  },
  {
    name: "a character keeps saved rolls and macros that persist, reorder and delete with an undo",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Roller");
      await page.click('.subnav-link[data-page="rolls"]');
      await page.waitFor('!document.querySelector("#character-rolls").hidden && document.querySelector("#preset-form")');

      await type(page, "#preset-label", "Bad");
      await type(page, "#preset-expression", "d20 +");
      await page.click("#preset-save");
      await page.waitFor('!document.querySelector("#preset-error").hidden');
      assert.equal(await page.evaluate('document.querySelectorAll("#preset-list .preset-row").length'), 0);

      await type(page, "#preset-expression", "1d20 + 5");
      await type(page, "#preset-label", "Longsword");
      await page.click("#preset-save");
      await page.waitFor('document.querySelectorAll("#preset-list .preset-row").length === 1');

      await type(page, "#preset-label", "Strike");
      await type(page, "#preset-expression", "");
      await type(page, "#preset-steps", "Hit = 1d20 + 5\nDamage = 1d8 + 3");
      await page.click("#preset-save");
      await page.waitFor('document.querySelectorAll("#preset-list .preset-row").length === 2');

      await page.evaluate('document.querySelector("#preset-list button[aria-label=\\"Roll Strike\\"]").click(); true');
      await page.waitFor('document.querySelectorAll("#rolls-result .roll-result").length === 2');
      assert.match(await page.evaluate('document.querySelector("#rolls-recent").textContent'), /Strike: Damage/);

      await page.evaluate('document.querySelector("#preset-list button[aria-label=\\"Move Strike up\\"]").click(); true');
      await page.waitFor('document.querySelector("#preset-list .preset-row strong").textContent === "Strike"');
      await saved(page);

      await page.reload();
      await page.waitFor('document.querySelectorAll("#preset-list .preset-row").length === 2');
      assert.equal(await page.evaluate('document.querySelector("#preset-list .preset-row strong").textContent'), "Strike");

      await page.evaluate('document.querySelector("#preset-list button[aria-label=\\"Delete Strike\\"]").click(); true');
      await page.waitFor('document.querySelectorAll("#preset-list .preset-row").length === 1');
      await page.evaluate('document.querySelector(".toast button").click(); true');
      await page.waitFor('document.querySelectorAll("#preset-list .preset-row").length === 2');
      assertClean(page);
    }
  }
  ,
  {
    name: "inventory holds containers and weight, refuses a loop, keeps a wallet and survives a reload",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Packrat");
      await openRecords(page, "inventory");

      await addRecord(page, "inventory", { name: "Bag", weight: "2", isContainer: true, weightMultiplier: "0.5" });
      await page.waitFor('document.querySelectorAll("#rec-inventory-list [data-record]").length === 1');
      await addRecord(page, "inventory", { name: "Rope", weight: "10" });
      await page.waitFor('document.querySelectorAll("#rec-inventory-list [data-record]").length === 2');
      await page.evaluate('document.querySelector("button[aria-label=\\"Edit Rope\\"]").click(); true');
      await pick(page, "#rec-inventory-container", await page.evaluate('[...document.querySelector("#rec-inventory-container").options].find((o) => o.text === "Bag").value'));
      await page.click("#rec-inventory-save");
      await page.waitFor('document.querySelector("#inventory-stats").textContent.includes("Carried weight7")');

      await page.evaluate('document.querySelector("button[aria-label=\\"Edit Bag\\"]").click(); true');
      assert.equal(await page.evaluate('[...document.querySelector("#rec-inventory-container").options].some((o) => o.text === "Rope")'), false);

      await page.evaluate('document.querySelector("#rec-inventory-cancel").click(); true');
      await type(page, "#wallet-delta-gp", "+25");
      await page.click('[data-currency="gp"] button');
      await page.waitFor('document.querySelector("#wallet-amount-gp").textContent === "25"');
      await type(page, "#wallet-delta-gp", "-99");
      await page.click('[data-currency="gp"] button');
      await page.waitFor('!document.querySelector("#wallet-error-gp").hidden');
      assert.equal(await page.evaluate('document.querySelector("#wallet-amount-gp").textContent'), "25");
      await saved(page);

      await page.reload();
      await page.waitFor('document.querySelectorAll("#rec-inventory-list [data-record]").length === 2');
      assert.equal(await page.evaluate('document.querySelector("#wallet-amount-gp").textContent'), "25");

      await page.evaluate('document.querySelector("button[aria-label=\\"Delete Bag\\"]").click(); true');
      await page.waitFor('document.querySelector(".toast").textContent.includes("moved out")');
      await page.evaluate('document.querySelector(".toast button").click(); true');
      await page.waitFor('document.querySelectorAll("#rec-inventory-list [data-record]").length === 2');
      assertClean(page);
    }
  },
  {
    name: "abilities count uses, roll their expression and take fields of your own",
    async run(page, context) {
      await boot(page, context);
      await seedLayouts(page, [SCHOOL_LAYOUT]);
      await newCharacter(page, "Caster");
      await openRecords(page, "abilities");

      await addRecord(page, "abilities", { name: "Bad roll", expression: "d20 +" });
      await page.waitFor('!document.querySelector("#rec-abilities-error").hidden');
      assert.equal(await page.evaluate('document.querySelectorAll("#rec-abilities-list [data-record]").length'), 0);

      await type(page, "#rec-abilities-expression", "2d6 + 1");
      await type(page, "#rec-abilities-name", "Fire bolt");
      await type(page, "#rec-abilities-uses-max", "2");
      await type(page, "#rec-abilities-cf_school", "Evocation");
      await page.click("#rec-abilities-save");
      await page.waitFor('document.querySelectorAll("#rec-abilities-list [data-record]").length === 1');
      assert.match(await page.evaluate('document.querySelector("#rec-abilities-list").textContent'), /School: Evocation/);

      await page.evaluate('document.querySelector("button[aria-label=\\"Use Fire bolt\\"]").click(); true');
      await page.waitFor('document.querySelector("#rec-abilities-list").textContent.includes("1 of 2 uses left")');
      await page.evaluate('document.querySelector("button[aria-label=\\"Roll Fire bolt\\"]").click(); true');
      await page.waitFor('document.querySelector("#abilities-result .roll-result")');
      await page.click("#abilities-restore");
      await page.waitFor('document.querySelector("#rec-abilities-list").textContent.includes("2 of 2 uses left")');
      await saved(page);

      await page.reload();
      await page.waitFor('document.querySelector("#rec-abilities-list") && document.querySelector("#rec-abilities-list").textContent.includes("School: Evocation")');
      assertClean(page);
    }
  },
  {
    name: "the journal sorts newest first, filters by kind and checks off goals",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Scribe");
      await openRecords(page, "journal");

      await addRecord(page, "journal", { title: "First night", date: "2026-01-02", text: "Line one\nLine two" });
      await page.waitFor('document.querySelectorAll("#rec-journal-list [data-record]").length === 1');
      await addRecord(page, "journal", { title: "Find the key", date: "2026-03-04", kind: "goal" });
      await page.waitFor('document.querySelectorAll("#rec-journal-list [data-record]").length === 2');
      assert.equal(await page.evaluate('document.querySelector("#rec-journal-list .record-title").textContent'), "Find the key");

      await pick(page, "#rec-journal-filter-kind", "note");
      await page.waitFor('document.querySelectorAll("#rec-journal-list [data-record]").length === 1');
      await pick(page, "#rec-journal-filter-kind", "");
      await page.waitFor('document.querySelectorAll("#rec-journal-list [data-record]").length === 2');

      await page.evaluate('document.querySelector("button[aria-label=\\"Done: Find the key\\"]").click(); true');
      await page.waitFor('document.querySelector("#rec-journal-list").textContent.includes("done")');
      assert.match(await page.evaluate('getComputedStyle(document.querySelector(".record-text")).whiteSpace'), /pre-wrap/);
      assertClean(page);
    }
  },
  {
    name: "relations link characters and show the reverse view without storing it twice",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Alder");
      await go(page, "#/library", "#library-title");
      await newCharacter(page, "Birch");
      await openRecords(page, "relations");

      await type(page, "#rec-relations-kind", "Ally");
      await pick(page, "#rec-relations-targetType", "character");
      await type(page, "#rec-relations-attitude", "3");
      await pick(page, "#rec-relations-character", await page.evaluate('[...document.querySelector("#rec-relations-character").options].find((o) => o.text === "Alder").value'));
      await type(page, "#rec-relations-targetName", "Alder");
      await page.click("#rec-relations-save");
      await page.waitFor('document.querySelectorAll("#rec-relations-list [data-record]").length === 1');
      assert.match(await page.evaluate('document.querySelector("#rec-relations-list").textContent'), /Loyal \(\+3\)/);
      await saved(page);

      await go(page, "#/library", "#library-title");
      await page.waitFor('document.querySelectorAll(".tile").length === 2');
      await page.evaluate('[...document.querySelectorAll(".tile")].find((t) => t.textContent.includes("Alder")).querySelector(".tile-link").click(); true');
      await page.waitFor('location.hash.startsWith("#/character/")');
      await openRecords(page, "relations");
      await page.waitFor('document.querySelector("#relations-reciprocal").textContent.includes("Birch")');
      assertClean(page);
    }
  },
  {
    name: "progression totals experience and a familiar becomes a character",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Veteran");
      await openRecords(page, "progression");
      await addRecord(page, "progression", { label: "Goblin cave", kind: "xp", delta: "300" });
      await page.waitFor('document.querySelectorAll("#rec-progression-list [data-record]").length === 1');
      await addRecord(page, "progression", { label: "Reached level 2", kind: "level", delta: "2" });
      await page.waitFor('document.querySelector("#progression-stats").textContent.includes("300")');
      assert.match(await page.evaluate('document.querySelector("#progression-stats").textContent'), /Last level2/);

      await addRecord(page, "progression", { label: "Bad", delta: "99999999999" });
      await page.waitFor('!document.querySelector("#rec-progression-error").hidden');

      await openRecords(page, "familiars");
      await addRecord(page, "familiars", { name: "Pip", kind: "Familiar" });
      await page.waitFor('document.querySelectorAll("#rec-familiars-list [data-record]").length === 1');
      await page.evaluate('document.querySelector("button[aria-label=\\"Make a character: Pip\\"]").click(); true');
      await page.waitFor('document.querySelector(".toast").textContent.includes("Pip is now a character")');
      await go(page, "#/library", "#library-title");
      await page.waitFor('document.querySelectorAll(".tile").length === 2');
      assertClean(page);
    }
  }
  ,
  {
    name: "a progression entry can be applied to the sheet once, and the overview counts the records",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Climber");
      await page.click('.subnav-link[data-page="sheet"]');
      await page.waitFor('document.querySelector("#sheet-picker")');
      await page.click("#system-generic");
      await page.click("#sheet-picker-confirm");
      await page.waitFor('document.querySelector("#sheet-f-might")');

      await openRecords(page, "progression");
      await addRecord(page, "progression", { label: "Goblin cave", kind: "xp", delta: "300" });
      await page.waitFor('document.querySelector("button[aria-label=\\"Apply to the sheet: Goblin cave\\"]")');
      await page.evaluate('document.querySelector("button[aria-label=\\"Apply to the sheet: Goblin cave\\"]").click(); true');
      await page.waitFor('document.querySelector("#rec-progression-list").textContent.includes("Applied to the sheet")');

      await page.click('.subnav-link[data-page="sheet"]');
      await page.waitFor('document.querySelector("#sheet-f-xp") && document.querySelector("#sheet-f-xp").value === "300"');

      await page.click('.subnav-link[data-page="overview"]');
      await page.waitFor('document.querySelector("#character-glance").textContent.includes("Items0")');
      assertClean(page);
    }
  }
  ,
  {
    name: "on a phone the sheet and the character pages fit the screen without sideways scrolling",
    async run(page, context) {
      await boot(page, context);
      await page.setViewport(390, 844);
      await newCharacter(page, "Narrow");
      await page.click('.subnav-link[data-page="sheet"]');
      await page.waitFor('document.querySelector("#sheet-picker")');
      await page.click("#system-dnd35");
      await page.click("#sheet-picker-confirm");
      await page.waitFor('document.querySelector(".sheet-system")');

      const fits = 'document.documentElement.scrollWidth <= document.documentElement.clientWidth';
      assert.equal(await page.evaluate(fits), true, "the sheet page is wider than the screen");

      for (const sub of ["inventory", "abilities", "rolls", "journal", "relations", "progression", "familiars", "pdf", "overview"]) {
        await page.click(`.subnav-link[data-page="${sub}"]`);
        await page.waitFor(`!document.querySelector("#character-${sub}, #page-character")?.hidden`);
        assert.equal(await page.evaluate(fits), true, `the ${sub} page is wider than the screen`);
      }

      await page.setViewport(1440, 900);
      assertClean(page);
    }
  }
  ,
  {
    name: "a campaign is created from the library, edited, persisted and deleted with an undo",
    async run(page, context) {
      await boot(page, context);
      await page.click("#new-campaign-btn");
      await page.waitFor('location.hash.startsWith("#/campaign/")');
      await page.waitFor('document.querySelector("#campaign-name")');
      await type(page, "#campaign-name", "Curse of the Moor");
      await pick(page, "#campaign-status", "active");
      await type(page, "#campaign-description", "A gloomy tale.");
      await saved(page);

      await go(page, "#/library", "#library-title");
      await page.waitFor('document.querySelectorAll("#library-campaign-grid .campaign-tile").length === 1');
      assert.match(await page.evaluate('document.querySelector("#library-campaign-grid").textContent'), /Curse of the Moor/);
      assert.equal(await tileCount(page), 0);

      await page.reload();
      await page.waitFor('document.querySelectorAll("#library-campaign-grid .campaign-tile").length === 1');
      await page.evaluate('document.querySelector(".campaign-link").click(); true');
      await page.waitFor('document.querySelector("#campaign-name") && document.querySelector("#campaign-name").value === "Curse of the Moor"');

      await page.click("#campaign-delete");
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('location.hash === "#/library"');
      await page.waitFor('document.querySelectorAll(".campaign-tile").length === 0');
      await page.evaluate('document.querySelector(".toast button").click(); true');
      await page.waitFor('document.querySelectorAll(".campaign-tile").length === 1');
      assertClean(page);
    }
  },
  {
    name: "a roster links characters, a character's campaigns are derived, and deleting a character cleans the roster",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Alder");
      await go(page, "#/library", "#library-title");
      await page.click("#new-campaign-btn");
      await page.waitFor('location.hash.startsWith("#/campaign/")');
      await type(page, "#campaign-name", "Saga");
      await page.click('.subnav-link[data-page="roster"]');
      await page.waitFor('!document.querySelector("#campaign-roster").hidden && document.querySelector("#rec-roster-form")');

      await page.click("#rec-roster-save");
      await page.waitFor('!document.querySelector("#rec-roster-error").hidden');
      await pick(page, "#rec-roster-character", await page.evaluate('[...document.querySelector("#rec-roster-character").options].find((o) => o.text === "Alder").value'));
      await type(page, "#rec-roster-role", "Rogue");
      await page.click("#rec-roster-save");
      await page.waitFor('document.querySelectorAll("#rec-roster-list [data-record]").length === 1');
      assert.match(await page.evaluate('document.querySelector("#rec-roster-list").textContent'), /Alder/);
      assert.equal(await page.evaluate('[...document.querySelector("#rec-roster-character").options].some((o) => o.text === "Alder")'), false);
      await saved(page);

      await go(page, "#/library", "#library-title");
      await page.evaluate('document.querySelector(".tile-link").click(); true');
      await page.waitFor('document.querySelector("#character-campaign-list")');
      await page.waitFor('document.querySelector("#character-campaign-list").textContent.includes("Saga")');
      assert.match(await page.evaluate('document.querySelector("#character-campaign-list").textContent'), /Rogue/);

      await page.click("#character-delete");
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      assert.match(await page.evaluate('document.querySelector("#confirm-message").textContent'), /1 campaign/);
      await page.click("#confirm-ok");
      await page.waitFor('location.hash === "#/library"');
      await page.evaluate('document.querySelector(".campaign-link").click(); true');
      await page.click('.subnav-link[data-page="roster"]');
      await page.waitFor('document.querySelectorAll("#rec-roster-list [data-record]").length === 0');
      await page.evaluate('document.querySelector(".toast button").click(); true');
      await page.waitFor('document.querySelectorAll("#rec-roster-list [data-record]").length === 1');
      assertClean(page);
    }
  },
  {
    name: "the party view reads values from each sheet, sorts and says when there is no sheet",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Sheeted");
      await page.click('.subnav-link[data-page="sheet"]');
      await page.waitFor('document.querySelector("#sheet-picker")');
      await page.click("#system-generic");
      await page.click("#sheet-picker-confirm");
      await page.waitFor('document.querySelector("#sheet-f-might")');
      await go(page, "#/library", "#library-title");
      await newCharacter(page, "Plain");
      await go(page, "#/library", "#library-title");
      await page.click("#new-campaign-btn");
      await page.waitFor('location.hash.startsWith("#/campaign/")');
      await type(page, "#campaign-name", "Party");
      await page.click('.subnav-link[data-page="roster"]');
      await page.waitFor('document.querySelector("#rec-roster-form")');

      for (const who of ["Sheeted", "Plain"]) {
        await pick(page, "#rec-roster-character", await page.evaluate(`[...document.querySelector("#rec-roster-character").options].find((o) => o.text === ${JSON.stringify(who)}).value`));
        await page.click("#rec-roster-save");
        await page.waitFor(`document.querySelector("#rec-roster-list").textContent.includes(${JSON.stringify(who)})`);
      }

      await page.click('.subnav-link[data-page="party"]');
      await page.waitFor('!document.querySelector("#campaign-party").hidden && document.querySelector("#party-suggest")');
      await page.click("#party-suggest");
      await page.waitFor('document.querySelector("#party-table table")');
      assert.match(await page.evaluate('document.querySelector("#party-table").textContent'), /Health/);
      assert.match(await page.evaluate('document.querySelector("#party-table").textContent'), /No sheet/);

      await type(page, "#rec-partyColumns-label", "Level");
      await type(page, "#rec-partyColumns-ref", "@level");
      await page.click("#rec-partyColumns-save");
      await page.waitFor('document.querySelector("#party-table").textContent.includes("Level")');
      assert.match(await page.evaluate('document.querySelector("#party-table tbody tr").textContent'), /Sheeted/);

      await type(page, "#rec-partyColumns-label", "Bad");
      await type(page, "#rec-partyColumns-ref", "((");
      await page.click("#rec-partyColumns-save");
      await page.waitFor('!document.querySelector("#rec-partyColumns-error").hidden');
      assertClean(page);
    }
  },
  {
    name: "sessions record attendees and keep secret notes out of the recap, and handouts store images",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Alder");
      await go(page, "#/library", "#library-title");
      await page.click("#new-campaign-btn");
      await page.waitFor('location.hash.startsWith("#/campaign/")');
      await type(page, "#campaign-name", "Saga");
      await page.click('.subnav-link[data-page="roster"]');
      await page.waitFor('document.querySelector("#rec-roster-form")');
      await pick(page, "#rec-roster-character", await page.evaluate('[...document.querySelector("#rec-roster-character").options].find((o) => o.text === "Alder").value'));
      await page.click("#rec-roster-save");
      await page.waitFor('document.querySelectorAll("#rec-roster-list [data-record]").length === 1');

      await page.click('.subnav-link[data-page="sessions"]');
      await page.waitFor('document.querySelector("#rec-sessions-form")');
      await type(page, "#rec-sessions-title", "The tavern");
      await type(page, "#rec-sessions-date", "2026-02-03");
      await type(page, "#rec-sessions-notes", "They met.");
      await type(page, "#rec-sessions-secretNotes", "The butler did it.");
      await page.evaluate('document.querySelector("#rec-sessions-attendees").options[0].selected = true; true');
      await page.click("#rec-sessions-save");
      await page.waitFor('document.querySelectorAll("#rec-sessions-list [data-record]").length === 1');
      assert.match(await page.evaluate('document.querySelector("#rec-sessions-list").textContent'), /Alder/);

      await page.click('.subnav-link[data-page="handouts"]');
      await page.waitFor('document.querySelector("#handout-input")');
      await page.setFileInput("#handout-input", [context.fixture("portrait.png")]);
      await page.waitFor('document.querySelector("#rec-handouts-list .handout-image")');
      await saved(page);
      await page.reload();
      await page.waitFor('document.querySelector("#rec-handouts-list .handout-image")');

      await page.setFileInput("#handout-input", [context.fixture("not-a-pdf.pdf")]);
      await page.waitFor('document.querySelector(".toast-error")');
      assert.equal(await page.evaluate('document.querySelectorAll("#rec-handouts-list [data-record]").length'), 1);
      assertClean(page);
    }
  },
  {
    name: "the initiative tracker rolls the roster, orders, steps turns and rounds, and ends with an undo",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Alder");
      await go(page, "#/library", "#library-title");
      await page.click("#new-campaign-btn");
      await page.waitFor('location.hash.startsWith("#/campaign/")');
      await type(page, "#campaign-name", "Fight");
      await page.click('.subnav-link[data-page="roster"]');
      await page.waitFor('document.querySelector("#rec-roster-form")');
      await pick(page, "#rec-roster-character", await page.evaluate('[...document.querySelector("#rec-roster-character").options].find((o) => o.text === "Alder").value'));
      await page.click("#rec-roster-save");
      await page.waitFor('document.querySelectorAll("#rec-roster-list [data-record]").length === 1');

      await page.click('.subnav-link[data-page="initiative"]');
      await page.waitFor('!document.querySelector("#campaign-initiative").hidden && document.querySelector("#initiative-roster")');
      await page.click("#initiative-roster");
      await page.waitFor('document.querySelectorAll("#initiative-list [data-entry]").length === 1');

      await type(page, "#initiative-name", "Goblin");
      await type(page, "#initiative-value", "99");
      await page.click("#initiative-add");
      await page.waitFor('document.querySelectorAll("#initiative-list [data-entry]").length === 2');
      assert.equal(await page.evaluate('document.querySelector("#initiative-list [data-entry] .record-title").textContent'), "Goblin");
      assert.match(await page.evaluate('document.querySelector("#initiative-status").textContent'), /Round 1 · Current turn: Goblin/);

      await type(page, "#initiative-name", "Bad");
      await type(page, "#initiative-value", "lots");
      await page.click("#initiative-add");
      await page.waitFor('!document.querySelector("#initiative-error").hidden');

      await page.click("#initiative-next");
      await page.waitFor('document.querySelector("#initiative-status").textContent.includes("Current turn: Alder")');
      await page.click("#initiative-next");
      await page.waitFor('document.querySelector("#initiative-status").textContent.includes("Round 2 · Current turn: Goblin")');
      await saved(page);

      await page.reload();
      await page.waitFor('document.querySelector("#initiative-status") && document.querySelector("#initiative-status").textContent.includes("Round 2")');

      await page.click("#initiative-end");
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('document.querySelectorAll("#initiative-list [data-entry]").length === 0');
      await page.evaluate('document.querySelector(".toast button").click(); true');
      await page.waitFor('document.querySelectorAll("#initiative-list [data-entry]").length === 2');
      assertClean(page);
    }
  }
  ,
  {
    name: "a secret roll is marked in the log and left out of the campaign's recent rolls",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Alder");
      await go(page, "#/library", "#library-title");
      await page.click("#new-campaign-btn");
      await page.waitFor('location.hash.startsWith("#/campaign/")');
      await type(page, "#campaign-name", "Fight");
      const overview = await route(page);
      await page.click('.subnav-link[data-page="roster"]');
      await page.waitFor('document.querySelector("#rec-roster-form")');
      await pick(page, "#rec-roster-character", await page.evaluate('[...document.querySelector("#rec-roster-character").options].find((o) => o.text === "Alder").value'));
      await page.click("#rec-roster-save");
      await page.waitFor('document.querySelectorAll("#rec-roster-list [data-record]").length === 1');
      await page.click('.subnav-link[data-page="initiative"]');
      await page.waitFor('document.querySelector("#initiative-roster")');
      await page.click("#initiative-roster");
      await page.waitFor('document.querySelectorAll("#initiative-list [data-entry]").length === 1');

      await go(page, "#/dice", "#dice-title");
      await type(page, "#dice-expression", "1d20");
      await page.evaluate('document.querySelector("#dice-secret").checked = true; true');
      await page.click("#dice-roll");
      await page.waitFor('document.querySelector("#dice-log").textContent.includes("Secret")');

      await page.evaluate(`location.hash = ${JSON.stringify(overview)}; true`);
      await page.waitFor('document.querySelector("#campaign-rolls-list")');
      await page.waitFor('document.querySelector("#campaign-rolls-list").textContent.includes("Initiative: Alder")');
      assert.equal(await page.evaluate('document.querySelectorAll("#campaign-rolls-list .roll-entry").length'), 1);
      assertClean(page);
    }
  },
  {
    name: "on a phone the campaign pages fit the screen",
    async run(page, context) {
      await boot(page, context);
      await page.setViewport(390, 844);
      await page.click("#new-campaign-btn");
      await page.waitFor('location.hash.startsWith("#/campaign/")');

      const fits = "document.documentElement.scrollWidth <= document.documentElement.clientWidth";

      for (const sub of ["overview", "roster", "party", "sessions", "initiative", "handouts"]) {
        await page.click(`.subnav-link[data-page="${sub}"]`);
        await page.waitFor(sub === "overview" ? '!document.querySelector("#campaign-overview").hidden' : `!document.querySelector("#campaign-${sub}").hidden`);
        assert.equal(await page.evaluate(fits), true, `the ${sub} page is wider than the screen`);
      }

      await page.setViewport(1440, 900);
      assertClean(page);
    }
  }
  ,
  {
    name: "a backup file restores in add mode and in replace mode, and replace can be undone",
    async run(page, context) {
      await boot(page, context);
      const pdf = readFileSync(context.fixture("sample.pdf"));
      const mira = { ...createCharacter({ name: "Mira" }), documents: [createDocument({ name: "Sheet", blobId: "blob_fixture", type: "application/pdf", size: pdf.length })] };
      const camp = createCampaign({ name: "Imported fight", roster: [{ id: "r1", characterId: mira.id, note: "" }] });
      const { bytes } = await buildArchive({ characters: [mira], campaigns: [camp], blobs: [{ id: "blob_fixture", type: "application/pdf", bytes: new Uint8Array(pdf) }], now: 1700000000000 });
      const file = join(mkdtempSync(join(tmpdir(), "omniscribe-")), "backup.zip");
      writeFileSync(file, bytes);

      await newCharacter(page, "Alder");
      await saved(page);
      await go(page, "#/data", "#data-title");
      await page.waitFor('document.querySelector("#restore-file")');
      await page.setFileInput("#restore-file", [file]);
      await page.waitFor('document.querySelector("#restore-contents")');
      assert.match(await page.evaluate('document.querySelector("#restore-contents").textContent'), /1 character, 1 campaign, 0 game systems, 1 file/);

      await page.click("#restore-cancel");
      await page.waitFor('document.querySelector("#restore-review").hidden');

      await page.setFileInput("#restore-file", [file]);
      await page.waitFor('document.querySelector("#restore-go")');
      await page.click("#restore-go");
      await page.waitFor('document.querySelector("#restore-review").hidden');
      await saved(page);
      await go(page, "#/library", "#library-title");
      await page.waitFor('document.querySelectorAll(".tile").length === 2');
      assert.equal(await page.evaluate('document.querySelectorAll(".campaign-tile").length'), 1);

      await go(page, "#/data", "#data-title");
      await page.setFileInput("#restore-file", [file]);
      await page.waitFor('document.querySelector("#restore-go")');
      await page.click("#restore-go");
      await page.waitFor('document.querySelector("#restore-review").hidden');
      await saved(page);
      await go(page, "#/library", "#library-title");
      assert.match(await page.evaluate('document.querySelector("#library-grid, .tile-grid, body").textContent'), /Mira \(imported\)/);

      await go(page, "#/data", "#data-title");
      await page.setFileInput("#restore-file", [file]);
      await page.waitFor('document.querySelector("#restore-go")');
      await page.evaluate('document.querySelector("input[name=restore-mode][value=replace]").click(); true');
      await page.click("#restore-go");
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await sleep(1500);
      await page.waitFor('document.querySelector("#library-title")');
      await page.waitFor('document.querySelectorAll(".tile").length >= 1');
      const names = await page.evaluate('[...document.querySelectorAll(".tile-link")].map((link) => link.textContent.trim()).join("|")');
      assert.ok(names.includes("Mira") && !names.includes("Alder"), names);

      await go(page, "#/data", "#data-title");
      await page.waitFor('document.querySelector("#restore-previous-btn")');
      assert.match(await page.evaluate('document.querySelector("#storage-files").textContent'), /^1 file,/);
      await page.click("#restore-previous-btn");
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await sleep(1500);
      await page.waitFor('document.querySelector("#library-title")');
      await page.waitFor('[...document.querySelectorAll(".tile-link")].some((link) => link.textContent.includes("Alder"))');
      assertClean(page);
    }
  },
  {
    name: "a file that is not a backup is refused with a reason and changes nothing",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Alder");
      await saved(page);
      await go(page, "#/data", "#data-title");
      await page.setFileInput("#restore-file", [context.fixture("sample.pdf")]);
      await page.waitFor('!document.querySelector("#restore-message").hidden');
      assert.match(await page.evaluate('document.querySelector("#restore-message").textContent'), /Could not read this file/);
      assert.equal(await page.evaluate('document.querySelector("#restore-review").hidden'), true);
      await go(page, "#/library", "#library-title");
      assert.equal(await tileCount(page), 1);
      assertClean(page);
    }
  }
  ,
  {
    name: "the generated sheet shows by default, downloads as a PDF and gives way to an uploaded sheet",
    timeout: 60000,
    async run(page, context) {
      await boot(page, context);
      await sampleToPdfPage(page);
      await page.waitFor('document.querySelector(".pdf-page[data-rendered=true]")', { timeout: 20000 });
      assert.match(await page.evaluate('document.querySelector("#pdf-viewer-title").textContent'), /generated sheet/);
      assert.match(await page.evaluate('document.querySelector("#generated-meta").textContent'), /This is the sheet · \d+ pages?/);
      assert.equal(
        await page.evaluate(`(() => {
          const canvas = document.querySelector(".pdf-page canvas");
          const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
          for (let index = 0; index < data.length; index += 4) if (data[index] < 60 && data[index + 3] === 255) return true;
          return false;
        })()`),
        true
      );

      await page.evaluate(`(() => {
        window.__blobs = [];
        window.__frames = [];
        const original = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob) => { window.__blobs.push(blob); return original(blob); };
        const click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () { if (!this.download) click.call(this); };
        new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => { if (node.tagName === "IFRAME") window.__frames.push(node.src); }))).observe(document.body, { childList: true });
        return true;
      })()`);

      await page.click("#generated-download");
      await page.waitFor("window.__blobs.length >= 1");
      const head = await page.evaluate(`(async () => {
        const bytes = new Uint8Array(await window.__blobs.at(-1).arrayBuffer());
        return { start: String.fromCharCode(...bytes.subarray(0, 8)), end: String.fromCharCode(...bytes.subarray(bytes.length - 6)), size: bytes.length };
      })()`);
      assert.equal(head.start.slice(0, 5), "%PDF-");
      assert.match(head.end, /%%EOF/);

      await page.setFileInput("#pdf-input", [context.fixture("sample.pdf")]);
      await page.waitFor('document.querySelectorAll(".doc").length === 1');
      await page.click(".doc .doc-actions button:nth-child(2)");
      await page.waitFor('document.querySelector("#generated-meta").textContent.startsWith("Your uploaded PDF is the sheet")');

      await page.click("#generated-print");
      await page.waitFor("window.__frames.length === 1");
      assert.match(await page.evaluate("window.__frames[0]"), /^blob:/);

      await page.click("#generated-view");
      await page.waitFor('document.querySelector("#pdf-viewer-title").textContent.includes("generated sheet")');
      await page.click("#generated-journal");
      await page.waitFor('document.querySelector("#generated-journal").checked');
      assertClean(page);
    }
  },
  {
    name: "a PDF handout opens in the app viewer and closes again",
    timeout: 60000,
    async run(page, context) {
      await boot(page, context);
      await page.click("#sample-btn");
      await page.waitFor('document.querySelectorAll(".tile").length === 1');
      await go(page, "#/library", "#library-title");
      await page.click("#new-campaign-btn");
      await page.waitFor('location.hash.startsWith("#/campaign/")');
      await page.click('.subnav-link[data-page="handouts"]');
      await page.waitFor('document.querySelector("#handout-input")');
      await page.setFileInput("#handout-input", [context.fixture("sample.pdf")]);
      await page.waitFor('document.querySelectorAll("#rec-handouts-list [data-record]").length === 1');
      await page.click('#rec-handouts-list button[aria-label^="Open"]');
      await page.waitFor('document.querySelector("#viewer-dialog-host .pdf-page[data-rendered=true]")', { timeout: 20000 });
      assert.equal(await page.evaluate('document.querySelector("#viewer-dialog-host .pdf-count").textContent'), "2 pages");
      await page.click("#viewer-dialog-close");
      await page.waitFor('!document.querySelector("#viewer-dialog-host")');
      assertClean(page);
    }
  },
  {
    name: "a portrait is cropped to a square, and cancelling changes nothing",
    async run(page, context) {
      await boot(page, context);
      await page.click("#sample-btn");
      await page.waitFor('document.querySelectorAll(".tile").length === 1');
      await page.evaluate('document.querySelector(".tile-link").click(); true');
      await page.waitFor('document.querySelector("#portrait-input")');

      await page.setFileInput("#portrait-input", [context.fixture("portrait.png")]);
      await page.waitFor('document.querySelector("#crop-ok")');
      await page.click("#crop-cancel");
      await page.waitFor('!document.querySelector("#crop-ok")');
      assert.equal(await page.evaluate('document.querySelector("#portrait-img")'), null);

      await page.setFileInput("#portrait-input", [context.fixture("portrait.png")]);
      await page.waitFor('document.querySelector("#crop-ok")');
      await page.evaluate(`(() => {
        const zoom = document.querySelector("#crop-zoom");
        zoom.value = "2";
        zoom.dispatchEvent(new Event("input", { bubbles: true }));
        document.querySelector("#crop-preview").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
        return true;
      })()`);
      await page.click("#crop-ok");
      await page.waitFor('document.querySelector("#portrait-img")?.complete && document.querySelector("#portrait-img").naturalWidth > 0');
      assert.equal(await page.evaluate('document.querySelector("#portrait-img").naturalWidth'), await page.evaluate('document.querySelector("#portrait-img").naturalHeight'));
      await saved(page);
      assertClean(page);
    }
  },
  {
    name: "a character bundle and a campaign bundle export, then import back without overwriting",
    async run(page, context) {
      await boot(page, context);
      await sampleToPdfPage(page);
      await page.setFileInput("#pdf-input", [context.fixture("sample.pdf")]);
      await page.waitFor('document.querySelectorAll(".doc").length === 1');
      await saved(page);

      await page.evaluate(`(() => {
        window.__blobs = [];
        const original = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (blob) => { window.__blobs.push(blob); return original(blob); };
        const click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () { if (!this.download) click.call(this); };
        return true;
      })()`);
      const grab = async () => {
        const encoded = await page.evaluate(`(async () => {
          const blob = window.__blobs.at(-1);
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let text = "";
          for (let index = 0; index < bytes.length; index += 8192) text += String.fromCharCode(...bytes.subarray(index, index + 8192));
          return btoa(text);
        })()`);
        const file = join(mkdtempSync(join(tmpdir(), "omniscribe-")), "bundle.zip");
        writeFileSync(file, Buffer.from(encoded, "base64"));
        return file;
      };

      await page.click("#character-export");
      await page.waitFor("window.__blobs.length === 1");
      const characterFile = await grab();

      await go(page, "#/library", "#library-title");
      await page.click("#new-campaign-btn");
      await page.waitFor('location.hash.startsWith("#/campaign/")');
      await type(page, "#campaign-name", "Fight");
      await page.click('.subnav-link[data-page="roster"]');
      await page.waitFor('document.querySelector("#rec-roster-form")');
      await pick(page, "#rec-roster-character", await page.evaluate('document.querySelector("#rec-roster-character").options[document.querySelector("#rec-roster-character").options.length - 1].value'));
      await page.click("#rec-roster-save");
      await page.waitFor('document.querySelectorAll("#rec-roster-list [data-record]").length === 1');
      await page.click('#page-campaign .subnav-link[data-page="overview"]');
      await page.waitFor('!document.querySelector("#campaign-overview").hidden && document.querySelector("#campaign-export")');
      await page.click("#campaign-export");
      await page.waitFor("window.__blobs.length === 2");
      const campaignFile = await grab();
      await saved(page);

      await go(page, "#/data", "#data-title");
      await page.setFileInput("#restore-file", [characterFile]);
      await page.waitFor('document.querySelector("#restore-bundle-note")');
      assert.equal(await page.evaluate('document.querySelector("input[name=restore-mode]")'), null);
      await page.click("#restore-go");
      await page.waitFor('document.querySelector("#restore-review").hidden');

      await page.setFileInput("#restore-file", [campaignFile]);
      await page.waitFor('document.querySelector("#restore-bundle-note")');
      await page.click("#restore-go");
      await page.waitFor('document.querySelector("#restore-review").hidden');
      await saved(page);

      await go(page, "#/library", "#library-title");
      await page.waitFor('document.querySelectorAll(".tile:not(.campaign-tile)").length === 3');
      assert.equal(await page.evaluate('document.querySelectorAll(".campaign-tile").length'), 2);
      await go(page, "#/data", "#data-title");
      await page.waitFor('document.querySelector("#storage-files")');
      assert.match(await page.evaluate('document.querySelector("#storage-files").textContent'), /^1 file,/);
      assertClean(page);
    }
  }
  ,
  {
    name: "revisions: save one, change the character, restore it, and Undo",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Alder");
      await saved(page);
      await type(page, "#character-revision-label", "Before the boss");
      await page.click("#character-revision-save");
      await page.waitFor('document.querySelectorAll("#character-revision-list [data-revision]").length === 1');
      assert.match(await page.evaluate('document.querySelector("#character-revision-list").textContent'), /Before the boss/);

      await type(page, "#character-name", "Alder the Bold");
      await saved(page);
      await page.waitFor('document.querySelector("#character-revision-list").textContent.includes("name")');
      await page.click('#character-revision-list [data-revision] button');
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('document.querySelector("#character-name").value === "Alder"');
      await page.waitFor('document.querySelectorAll("#character-revision-list [data-revision]").length === 2');

      await page.evaluate("document.activeElement.blur(); true");
      await page.click("#undo-btn");
      await page.waitFor('document.querySelector("#character-name").value === "Alder the Bold"');
      assertClean(page);
    }
  },
  {
    name: "revisions: the state before an editing session is kept after a reload",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Alder");
      await saved(page);
      await page.reload();
      await page.waitFor('document.querySelector("#character-name")?.value === "Alder"');
      await type(page, "#character-name", "Alder Two");
      await saved(page);
      await page.waitFor('document.querySelectorAll("#character-revision-list [data-revision]").length === 1');
      assert.match(await page.evaluate('document.querySelector("#character-revision-list").textContent'), /name/);
      assertClean(page);
    }
  },
  {
    name: "a deleted character can be brought back from the Data page",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Alder");
      await saved(page);
      await page.reload();
      await page.waitFor('document.querySelector("#character-name")?.value === "Alder"');
      await page.click("#character-delete");
      await page.waitFor('document.querySelector("#confirm-dialog").open');
      await page.click("#confirm-ok");
      await page.waitFor('location.hash === "#/library"');
      await saved(page);
      await go(page, "#/data", "#data-title");
      await page.waitFor('document.querySelector("#deleted-list")');
      assert.match(await page.evaluate('document.querySelector("#deleted-list").textContent'), /Alder/);
      await page.click("#deleted-list button");
      await page.waitFor('!document.querySelector("#deleted-list")');
      await go(page, "#/library", "#library-title");
      assert.equal(await tileCount(page), 1);
      assertClean(page);
    }
  },
  {
    name: "the library check finds a missing file and repairs it",
    async run(page, context) {
      await boot(page, context);
      await sampleToPdfPage(page);
      await page.setFileInput("#pdf-input", [context.fixture("sample.pdf")]);
      await page.waitFor('document.querySelectorAll(".doc").length === 1');
      await saved(page);
      await page.evaluate(`new Promise((resolve, reject) => {
        const open = indexedDB.open("omniscribe");
        open.onsuccess = () => {
          const transaction = open.result.transaction("blobs", "readwrite");
          transaction.objectStore("blobs").clear();
          transaction.oncomplete = () => resolve(true);
          transaction.onerror = () => reject(transaction.error);
        };
      })`);
      await go(page, "#/data", "#data-title");
      await page.click("#check-btn");
      await page.waitFor('document.querySelector("#check-results")');
      assert.match(await page.evaluate('document.querySelector("#check-results").textContent'), /missing file/);
      await page.click("#repair-btn");
      await page.waitFor('document.querySelector("#check-clean")');
      await saved(page);
      await page.reload();
      await page.evaluate('document.querySelector(".tile-link") || true');
      await go(page, "#/data", "#data-title");
      await page.click("#check-btn");
      await page.waitFor('document.querySelector("#check-clean")');
      assertClean(page);
    }
  }
  ,
  {
    name: "Import from the Library and the command palette opens the review on the Data page",
    async run(page, context) {
      await boot(page, context);
      const { bytes } = await buildArchive({ kind: "character", characters: [createCharacter({ name: "Mira" })], now: 1700000000000 });
      const file = join(mkdtempSync(join(tmpdir(), "omniscribe-")), "mira.omniscribe-bundle.zip");
      writeFileSync(file, bytes);

      assert.equal(await page.evaluate('!!document.querySelector("#import-btn")'), true);
      await page.setFileInput("#import-input", [file]);
      await page.waitFor('location.hash === "#/data" && document.querySelector("#restore-bundle-note")');
      assert.match(await page.evaluate('document.querySelector("#restore-contents").textContent'), /1 character/);
      await page.click("#restore-go");
      await page.waitFor('document.querySelector("#restore-review").hidden');
      await saved(page);
      await go(page, "#/library", "#library-title");
      assert.equal(await tileCount(page), 1);

      await key(page, { key: "k", ctrlKey: true });
      await page.waitFor('document.querySelector("#palette-dialog").open');
      assert.equal(await page.evaluate('[...document.querySelectorAll("#palette-dialog [role=option], #palette-dialog li")].some((node) => node.textContent.includes("Import a backup or bundle"))'), true);
      assertClean(page);
    }
  }
  ,
  {
    name: "search everything finds journal text and opens the page that holds it",
    async run(page, context) {
      await boot(page, context);
      await newCharacter(page, "Alder");
      const id = (await route(page)).split("/")[2];
      await openRecords(page, "journal");
      await addRecord(page, "journal", { title: "The bridge", text: "We crossed the river at dawn" });
      await page.waitFor('document.querySelectorAll("#rec-journal-list [data-record]").length === 1');
      await saved(page);
      await go(page, "#/library", "#library-title");

      await key(page, { key: "k", ctrlKey: true });
      await page.waitFor('document.querySelector("#palette-dialog").open');
      await type(page, "#palette-input", "?dawn");
      await page.waitFor('document.querySelectorAll("#palette-list .palette-option").length === 1');
      assert.match(await page.evaluate('document.querySelector("#palette-list").textContent'), /The bridge/);
      assert.match(await page.evaluate('document.querySelector("#palette-list").textContent'), /Journal/);
      await page.evaluate(`document.querySelector("#palette-input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); true`);
      await page.waitFor(`location.hash === "#/character/${id}/journal"`);
      assertClean(page);
    }
  },
  {
    name: "the installed bundle opens offline from its cache",
    timeout: 90000,
    async run(page) {
      const out = mkdtempSync(join(tmpdir(), "omniscribe-www-"));
      const { version } = await buildBundle({ out });
      const { server, port } = await startStaticServer({ root: out });
      const address = `http://127.0.0.1:${port}/`;

      await page.navigate(address);
      await page.waitFor('document.querySelector("#library-title")');
      const keys = await page.evaluate("(async () => { await navigator.serviceWorker.ready; return caches.keys(); })()");
      assert.ok(keys.includes(`omniscribe-${version}`));
      assert.equal(await page.evaluate('(async () => Boolean(await caches.match("src/main.js")))()'), true);
      assert.equal(await page.evaluate('(async () => Boolean(await caches.match("src/vendor/pdfjs/build/pdf.worker.min.mjs")))()'), true);
      await page.waitFor("Boolean(navigator.serviceWorker.controller)", { timeout: 10000 }).catch(async () => {
        await page.navigate(address);
        await page.waitFor("Boolean(navigator.serviceWorker.controller)");
      });

      await new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(resolve);
      });

      await page.navigate(address);
      await page.waitFor('document.querySelector("#library-title") && !document.querySelector("#page-library").hidden');
      assert.match(await page.evaluate("document.title"), /Omniscribe/);
      assert.equal(await page.evaluate('document.querySelector("link[rel=manifest]").getAttribute("href")'), "manifest.webmanifest");
      await page.evaluate("(async () => { for (const worker of await navigator.serviceWorker.getRegistrations()) await worker.unregister(); return true; })()");
    }
  }
];
