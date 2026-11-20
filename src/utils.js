const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidId(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function randomBytes(count) {
  const bytes = new Uint8Array(count);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

export function createId(prefix, bytes = randomBytes) {
  let hex = "";

  for (const byte of bytes(8)) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return `${prefix}_${hex}`;
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function cleanText(value, max) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export function finiteNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeTags(value, { max, maxLength }) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const tags = [];

  for (const item of value) {
    const tag = typeof item === "string" ? item.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
    const key = tag.toLowerCase();

    if (!tag || seen.has(key)) {
      continue;
    }

    seen.add(key);
    tags.push(tag);

    if (tags.length >= max) {
      break;
    }
  }

  return tags;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "unknown";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${unit === 0 ? value : value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}
