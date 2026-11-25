import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Page, launchBrowser } from "../e2e/harness.mjs";

/**
 * Renders the PNG icons from the SVG sources with the local Chrome (no image library is installed). The PNGs are
 * committed; run `node scripts/icons.mjs` again only when an SVG changes.
 */
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const JOBS = [
  ["icons/icon.svg", "icons/icon-192.png", 192],
  ["icons/icon.svg", "icons/icon-512.png", 512],
  ["icons/icon-maskable.svg", "icons/icon-maskable-512.png", 512]
];

const browser = await launchBrowser();

try {
  const page = await Page.open(browser.port);

  for (const [source, target, size] of JOBS) {
    const svg = await readFile(resolve(root, source), "utf8");
    const html = `<!doctype html><html><body style="margin:0;background:transparent"><img id="i" width="${size}" height="${size}" style="display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body></html>`;

    await page.client.send("Emulation.setDeviceMetricsOverride", { width: size, height: size, deviceScaleFactor: 1, mobile: false });
    await page.client.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    await page.navigate(`data:text/html;base64,${Buffer.from(html).toString("base64")}`);
    await page.waitFor('document.getElementById("i") && document.getElementById("i").complete');
    const shot = await page.client.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: size, height: size, scale: 1 }, captureBeyondViewport: false });
    await writeFile(resolve(root, target), Buffer.from(shot.data, "base64"));
    console.log(`${target}: ${size}x${size}`);
  }
} finally {
  await browser.close?.();
}
