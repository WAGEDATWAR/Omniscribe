import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Contrast gate (DEF-112). Parses the token blocks out of styles.css and asserts WCAG AA for the text
 * pairs that matter in both themes. Pure hex math, no dependency.
 */
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const css = readFileSync(resolve(root, "src", "styles.css"), "utf8");

function block(selector) {
  const index = css.indexOf(selector);

  if (index === -1) {
    return {};
  }

  const open = css.indexOf("{", index);
  const close = css.indexOf("}", open);
  const tokens = {};

  for (const line of css.slice(open + 1, close).split(/\r?\n/)) {
    const match = /--([\w-]+):\s*(#[0-9a-fA-F]{3,8})/.exec(line);

    if (match) {
      tokens[match[1]] = match[2];
    }
  }

  return tokens;
}

function expand(hex) {
  const value = hex.replace("#", "");

  if (value.length === 3) {
    return value.split("").map((char) => parseInt(char + char, 16));
  }

  return [value.slice(0, 2), value.slice(2, 4), value.slice(4, 6)].map((part) => parseInt(part, 16));
}

function luminance(hex) {
  const [r, g, b] = expand(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const themes = [
  { name: "dark", tokens: block(":root {") },
  { name: "light", tokens: block(':root[data-theme="light"]') }
];

const pairs = [
  ["text", "bg", 4.5],
  ["text", "surface", 4.5],
  ["text-soft", "surface", 4.5],
  ["muted", "surface", 4.5],
  ["faint", "surface", 4.5],
  ["accent", "surface", 3],
  ["danger", "surface", 3],
  ["success", "surface", 3]
];

let failed = false;

for (const theme of themes) {
  if (!Object.keys(theme.tokens).length) {
    console.error(`contrast: no tokens found for the ${theme.name} theme`);
    failed = true;
    continue;
  }

  for (const [foreground, background, minimum] of pairs) {
    const fg = theme.tokens[foreground];
    const bg = theme.tokens[background];

    if (!fg || !bg) {
      console.error(`contrast: ${theme.name} is missing --${fg ? background : foreground}`);
      failed = true;
      continue;
    }

    const value = ratio(fg, bg);

    if (value < minimum) {
      console.error(`contrast: ${theme.name} --${foreground} on --${background} is ${value.toFixed(2)} (needs ${minimum})`);
      failed = true;
    }
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`contrast: all ${themes.length} themes pass`);
}
