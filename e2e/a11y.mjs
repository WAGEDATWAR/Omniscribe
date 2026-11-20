import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startStaticServer } from "../scripts/serve.mjs";
import { launchBrowser, Page, sleep } from "./harness.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const BLOCKING = ["critical", "serious", "moderate"];

async function openPage(page, hash, titleId) {
  await page.evaluate(`location.hash = ${JSON.stringify(hash)}; true`);
  await page.waitFor(`document.querySelector("${titleId}") && !document.querySelector("${titleId}").closest(".page").hidden`);
}

async function addSample(page) {
  await page.click("#sample-btn");
  await page.waitFor('document.querySelectorAll(".tile").length === 1');
}

const fixture = (name) => resolve(root, "test", "fixtures", name);

async function openPdfPage(page) {
  await addSample(page);
  await page.evaluate('document.querySelector(".tile-link").click(); true');
  await page.waitFor('document.querySelector(".subnav-link[data-page=pdf]")');
  await page.click('.subnav-link[data-page="pdf"]');
  await page.waitFor('!document.querySelector("#character-pdf").hidden && document.querySelector("#pdf-empty")?.textContent.includes("No PDF sheets yet")');
}

async function uploadSample(page) {
  await page.setFileInput("#pdf-input", [fixture("sample.pdf")]);
  await page.waitFor('document.querySelectorAll(".doc").length === 1');
  await page.waitFor('document.querySelector(".pdf-page[data-rendered=true]")', { timeout: 20000 });
}

async function openSheetPicker(page) {
  await addSample(page);
  await page.evaluate('document.querySelector(".tile-link").click(); true');
  await page.waitFor('document.querySelector(".subnav-link[data-page=sheet]")');
  await page.click('.subnav-link[data-page="sheet"]');
  await page.waitFor('document.querySelector("#sheet-picker")');
}

async function startSheet(page) {
  await openSheetPicker(page);
  await page.click("#system-generic");
  await page.click("#sheet-picker-confirm");
  await page.waitFor('document.querySelector("#sheet-f-might")');
}

async function fillSheet(page) {
  await page.click("#sheet-add-abilities");
  await page.waitFor('document.querySelectorAll("[data-collection=abilities] .sheet-row").length === 1');
  await page.click("#sheet-add-attacks");
  await page.waitFor('document.querySelectorAll("[data-collection=attacks] .sheet-row").length === 1');
  await page.click(".cond:not(.is-on)");
  await page.waitFor('document.querySelectorAll(".cond.is-on").length === 1');
  await page.evaluate('document.querySelectorAll("[data-key=energy] .box")[3].click(); true');
  await page.waitFor('document.querySelectorAll("[data-key=energy] .box[aria-pressed=true]").length === 4');
}

async function createSystem(page) {
  await openPage(page, "#/systems", "#systems-title");
  await page.click("#new-system-btn");
  await page.waitFor('document.querySelector("#new-system-dialog").open');
  await page.evaluate(`(() => {
    const input = document.querySelector("#new-system-name");
    input.value = "House Rules";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await page.click("#new-system-create");
  await page.waitFor('location.hash === "#/systems/house-rules"');
  await page.waitFor('document.querySelector("#system-status")?.textContent === "Valid"');
}

/* Every new dialog or page joins this list in the same change (U-3). */
const states = [
  { name: "game systems page", setup: async (page) => openPage(page, "#/systems", "#systems-title") },
  { name: "new game system dialog", setup: async (page) => {
    await openPage(page, "#/systems", "#systems-title");
    await page.click("#new-system-btn");
    await page.waitFor('document.querySelector("#new-system-dialog").open');
  } },
  { name: "new game system dialog with an error", setup: async (page) => {
    await openPage(page, "#/systems", "#systems-title");
    await page.click("#new-system-btn");
    await page.waitFor('document.querySelector("#new-system-dialog").open');
    await page.evaluate('document.querySelector("#new-system-name").value = ""; true');
    await page.click("#new-system-create");
    await page.waitFor('!document.querySelector("#new-system-error").hidden');
  } },
  { name: "game system editor, built in", setup: async (page) => {
    await openPage(page, "#/systems", "#systems-title");
    await page.click('.system-item a[aria-label^="View"]');
    await page.waitFor('document.querySelector("#system-status")?.textContent === "Valid"');
  } },
  { name: "game system editor, valid", setup: async (page) => createSystem(page) },
  { name: "game system editor with errors", setup: async (page) => {
    await createSystem(page);
    await page.evaluate(`(() => {
      const area = document.querySelector("#system-json");
      const file = JSON.parse(area.value);
      file.overlay.push({ op: "add", target: "field", key: "luck", value: { label: "Luck", type: "derived", formula: "@ghost + 1" } });
      area.value = JSON.stringify(file, null, 2);
      area.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    await page.waitFor('document.querySelector("#system-status")?.textContent.includes("problem")');
  } },
  { name: "mobile game systems page", setup: async (page) => {
    await page.setViewport(390, 844);
    await openPage(page, "#/systems", "#systems-title");
  } },
  { name: "mobile game system editor", setup: async (page) => {
    await page.setViewport(390, 844);
    await createSystem(page);
  } },
  { name: "light game system editor", setup: async (page) => {
    await page.evaluate('document.documentElement.dataset.theme = "light"; true');
    await createSystem(page);
  } },
  { name: "sheet, choosing a system", setup: async (page) => openSheetPicker(page) },
  { name: "sheet, started", setup: async (page) => startSheet(page) },
  { name: "sheet with rows, a condition and a ticked pool", setup: async (page) => {
    await startSheet(page);
    await fillSheet(page);
  } },
  { name: "sheet with a refused value", setup: async (page) => {
    await startSheet(page);
    await page.evaluate(`(() => {
      const input = document.querySelector("#sheet-f-might");
      input.value = "99";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    await page.waitFor('!document.querySelector("#sheet-f-might-error").hidden');
  } },
  { name: "sheet with a newer system version and the diff dialog", setup: async (page) => {
    await page.evaluate(`(async () => {
      const core = await (await fetch("/test/fixtures/systems/d20-core.json")).json();
      const { openStorage } = await import("/src/storage.js");
      const storage = await openStorage();
      await storage.putSystem(core);
      storage.close();
      return true;
    })()`);
    await page.reload();
    await page.waitFor('document.querySelector("#library-title")');
    await openSheetPicker(page);
    await page.click("#system-test-d20");
    await page.click("#sheet-picker-confirm");
    await page.waitFor('document.querySelector("#sheet-f-str")');
    await page.waitFor('document.querySelector("#save-state").dataset.state === "saved"');
    await page.evaluate(`(async () => {
      const file = await (await fetch("/test/fixtures/systems/d20-core.json")).json();
      file.version = 2;
      file.fields.push({ key: "luck", label: "Luck", type: "number" });
      const { openStorage } = await import("/src/storage.js");
      const storage = await openStorage();
      await storage.putSystem(file);
      storage.close();
      return true;
    })()`);
    await page.reload();
    await page.waitFor('document.querySelector("#sheet-update") && !document.querySelector("#sheet-update").hidden');
    await page.click("#sheet-update-review");
    await page.waitFor('document.querySelector("#diff-dialog").open');
  } },
  { name: "sheet, D&D 3.5e with the full skill list", setup: async (page) => {
    await openSheetPicker(page);
    await page.click("#system-dnd35");
    await page.click("#sheet-picker-confirm");
    await page.waitFor('document.querySelectorAll("[data-collection=skills] .sheet-row").length === 42');
  } },
  { name: "sheet, D&D 5e", setup: async (page) => {
    await openSheetPicker(page);
    await page.click("#system-dnd5e");
    await page.click("#sheet-picker-confirm");
    await page.waitFor('document.querySelectorAll("[data-collection=skills] .sheet-row").length === 18');
  } },
  { name: "mobile sheet, D&D 3.5e", setup: async (page) => {
    await page.setViewport(390, 844);
    await openSheetPicker(page);
    await page.click("#system-dnd35");
    await page.click("#sheet-picker-confirm");
    await page.waitFor('document.querySelectorAll("[data-collection=skills] .sheet-row").length === 42');
  } },
  { name: "sheet, changing system", setup: async (page) => {
    await startSheet(page);
    await page.click("#sheet-change");
    await page.waitFor('document.querySelector("#sheet-picker-confirm")');
  } },
  { name: "mobile sheet", setup: async (page) => {
    await page.setViewport(390, 844);
    await startSheet(page);
    await fillSheet(page);
  } },
  { name: "light sheet", setup: async (page) => {
    await page.evaluate('document.documentElement.dataset.theme = "light"; true');
    await startSheet(page);
    await fillSheet(page);
  } },
  { name: "character pdf sheets, empty", setup: async (page) => openPdfPage(page) },
  { name: "character pdf sheets with a rendered document", setup: async (page) => {
    await openPdfPage(page);
    await uploadSample(page);
  } },
  { name: "character pdf sheets, the sheet marked", setup: async (page) => {
    await openPdfPage(page);
    await uploadSample(page);
    await page.click('.doc button[aria-label^="Use"]');
    await page.waitFor('document.querySelector(".doc-meta").textContent.includes("This is the sheet")');
  } },
  { name: "character pdf sheets, damaged file", setup: async (page) => {
    await openPdfPage(page);
    await page.setFileInput("#pdf-input", [fixture("damaged.pdf")]);
    await page.waitFor('document.querySelector(".pdf-status") && !document.querySelector(".pdf-status").hidden && document.querySelector(".pdf-status").textContent.length > 0', { timeout: 20000 });
  } },
  { name: "character page with a portrait", setup: async (page) => {
    await addSample(page);
    await page.evaluate('document.querySelector(".tile-link").click(); true');
    await page.waitFor('document.querySelector("#portrait-input")');
    await page.setFileInput("#portrait-input", [fixture("portrait.png")]);
    await page.waitFor('document.querySelector("#portrait-img")?.complete && document.querySelector("#portrait-img").naturalWidth > 0');
  } },
  { name: "library with a portrait tile", setup: async (page) => {
    await addSample(page);
    await page.evaluate('document.querySelector(".tile-link").click(); true');
    await page.waitFor('document.querySelector("#portrait-input")');
    await page.setFileInput("#portrait-input", [fixture("portrait.png")]);
    await page.waitFor('document.querySelector("#portrait-img")?.complete');
    await openPage(page, "#/library", "#library-title");
    await page.waitFor('document.querySelector(".tile img.avatar")');
  } },
  { name: "data page with unused files", setup: async (page) => {
    await openPdfPage(page);
    await uploadSample(page);
    await page.click('.doc button[aria-label^="Remove"]');
    await page.waitFor('document.querySelector("#confirm-dialog").open');
    await page.click("#confirm-ok");
    await page.waitFor('document.querySelectorAll(".doc").length === 0');
    await openPage(page, "#/data", "#data-title");
    await page.waitFor('document.querySelector("#cleanup-btn")');
  } },
  { name: "mobile pdf sheets", setup: async (page) => {
    await page.setViewport(390, 844);
    await openPdfPage(page);
    await uploadSample(page);
  } },
  { name: "light pdf sheets", setup: async (page) => {
    await page.evaluate('document.documentElement.dataset.theme = "light"; true');
    await openPdfPage(page);
    await uploadSample(page);
  } },
  { name: "empty library", setup: async () => {} },
  { name: "library with a character", setup: async (page) => addSample(page) },
  { name: "library with no search match", setup: async (page) => {
    await addSample(page);
    await page.evaluate(`(() => {
      const input = document.querySelector("#library-search");
      input.value = "zzz";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    await page.waitFor('document.querySelector("#library-empty").textContent.includes("No matches")');
  } },
  { name: "character page", setup: async (page) => {
    await page.click("#new-character-btn");
    await page.waitFor('document.querySelector("#character-name")');
  } },
  { name: "character page with tags", setup: async (page) => {
    await addSample(page);
    await page.evaluate('document.querySelector(".tile-link").click(); true');
    await page.waitFor('document.querySelectorAll("#page-character .chip").length > 0');
  } },
  { name: "data page", setup: async (page) => {
    await openPage(page, "#/data", "#data-title");
    await page.waitFor('document.querySelector("#storage-backend")');
  } },
  { name: "settings page", setup: async (page) => {
    await openPage(page, "#/settings", "#settings-title");
    await page.waitFor('document.querySelector("#about-version")');
  } },
  { name: "navigation sidebar hidden", setup: async (page) => {
    await page.click("#sidebar-toggle");
    await page.waitFor('document.querySelector("#sidebar").hidden');
  } },
  { name: "mobile navigation drawer open", setup: async (page) => {
    await page.setViewport(390, 844);
    await sleep(200);
    await page.click("#sidebar-toggle");
    await page.waitFor('!document.querySelector("#sidebar").hidden');
  } },
  { name: "command palette", setup: async (page) => {
    await page.click("#palette-btn");
    await page.waitFor('document.querySelector("#palette-dialog").open');
    await page.waitFor('document.querySelectorAll(".palette-option").length > 0');
  } },
  { name: "shortcuts dialog", setup: async (page) => {
    await openPage(page, "#/settings", "#settings-title");
    await page.click("#shortcuts-btn");
    await page.waitFor('document.querySelector("#shortcuts-dialog").open');
  } },
  { name: "confirm dialog", setup: async (page) => {
    await addSample(page);
    await page.click('.tile [aria-label^="Delete"]');
    await page.waitFor('document.querySelector("#confirm-dialog").open');
  } },
  { name: "changed in another tab dialog", setup: async (page) => {
    await page.evaluate('document.querySelector("#stale-dialog").showModal(); true');
    await page.waitFor('document.querySelector("#stale-dialog").open');
  } },
  { name: "light library", setup: async (page) => {
    await addSample(page);
    await page.evaluate('document.documentElement.dataset.theme = "light"; true');
    await sleep(150);
  } },
  { name: "light character page", setup: async (page) => {
    await addSample(page);
    await page.evaluate('document.documentElement.dataset.theme = "light"; document.querySelector(".tile-link").click(); true');
    await page.waitFor('document.querySelector("#character-name")?.value');
  } },
  { name: "light data page", setup: async (page) => {
    await page.evaluate('document.documentElement.dataset.theme = "light"; true');
    await openPage(page, "#/data", "#data-title");
    await page.waitFor('document.querySelector("#storage-backend")');
  } },
  { name: "mobile library", setup: async (page) => {
    await page.setViewport(390, 844);
    await addSample(page);
  } },
  { name: "mobile character page", setup: async (page) => {
    await page.setViewport(390, 844);
    await page.click("#new-character-btn");
    await page.waitFor('document.querySelector("#character-name")');
  } }
];

const AXE_RUN = `(async () => {
  const results = await window.axe.run(document);
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => node.target.join(" "))
  }));
})()`;

async function loadAxe() {
  try {
    return await readFile(resolve(root, "node_modules", "axe-core", "axe.min.js"), "utf8");
  } catch {
    return null;
  }
}

async function main() {
  const axeSource = await loadAxe();

  if (!axeSource) {
    console.error("axe-core is not installed. Run: npm install");
    process.exitCode = 1;
    return;
  }

  const { server, port } = await startStaticServer({ root });
  const baseUrl = `http://127.0.0.1:${port}/`;
  let browser = null;
  let page = null;
  const found = new Map();

  try {
    browser = await launchBrowser();
    page = await Page.open(browser.port);
    await page.navigate(baseUrl);
    await page.client.send("Page.addScriptToEvaluateOnNewDocument", { source: axeSource });

    for (const state of states) {
      await page.setViewport(1440, 900);
      await page.resetStorage();
      await page.evaluate('location.hash = ""; true');
      await page.waitFor('document.querySelector("#library-title") && !document.querySelector("#page-library").hidden');
      page.clearErrors();

      await state.setup(page);
      await sleep(120);

      const violations = await page.evaluate(AXE_RUN);
      let count = 0;

      for (const violation of violations) {
        for (const target of violation.nodes) {
          count += 1;
          const key = `${violation.id}|${target}`;

          if (!found.has(key)) {
            found.set(key, { id: violation.id, impact: violation.impact ?? "minor", help: violation.help, target, states: new Set() });
          }

          found.get(key).states.add(state.name);
        }
      }

      console.log(`${count === 0 ? "ok" : "!!"} - ${state.name}: ${count} violation${count === 1 ? "" : "s"}`);
    }
  } finally {
    page?.close();
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }

  const order = ["critical", "serious", "moderate", "minor"];
  const unique = [...found.values()].sort((left, right) => order.indexOf(left.impact) - order.indexOf(right.impact));
  const totals = Object.fromEntries(order.map((impact) => [impact, unique.filter((item) => item.impact === impact).length]));

  for (const violation of unique) {
    console.log(`- [${violation.impact}] ${violation.id}: ${violation.help}`);
    console.log(`    ${violation.target}  (${[...violation.states].join(", ")})`);
  }

  console.log(`\nUnique total: ${unique.length} (critical ${totals.critical}, serious ${totals.serious}, moderate ${totals.moderate}, minor ${totals.minor}).`);

  if (BLOCKING.some((impact) => totals[impact] > 0)) {
    console.error("Accessibility audit failed: fix critical, serious and moderate violations.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
