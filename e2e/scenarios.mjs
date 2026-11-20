import assert from "node:assert/strict";
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

      assert.equal(stored.value, 3);
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
      await page.waitFor('location.hash === "#/systems/test-d20"');
      await go(page, "#/systems", "#systems-title");
      assert.match(await page.evaluate('document.querySelector("[data-id=test-d20]").textContent'), /Test d20/);

      await page.setFileInput("#system-import-input", [context.fixture("systems/d20-core.json")]);
      await page.waitFor('[...document.querySelectorAll(".toast-error")].some((t) => t.textContent.includes("already exists"))');

      await page.setFileInput("#system-import-input", [context.fixture("not-a-pdf.pdf")]);
      await page.waitFor('[...document.querySelectorAll(".toast-error")].some((t) => t.textContent.includes("not valid JSON"))');

      await page.setFileInput("#system-import-input", [context.fixture("systems/d20-custom.json")]);
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
  }
];
