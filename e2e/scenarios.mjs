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
    name: "the app menu opens from the brand and navigates",
    async run(page, context) {
      await boot(page, context);
      await page.click("#brand-btn");
      await page.waitFor('document.querySelector("#app-menu").matches(":popover-open")');
      await page.click('#app-menu a[href="#/data"]');
      await page.waitFor('location.hash === "#/data"');
      await page.waitFor('!document.querySelector("#app-menu").matches(":popover-open")');
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
  }
];
