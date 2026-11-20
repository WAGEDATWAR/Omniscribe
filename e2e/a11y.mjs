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

/* Every new dialog or page joins this list in the same change (U-3). */
const states = [
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
  { name: "app menu", setup: async (page) => {
    await page.click("#brand-btn");
    await page.waitFor('document.querySelector("#app-menu").matches(":popover-open")');
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
