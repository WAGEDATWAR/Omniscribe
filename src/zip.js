import { LIMITS } from "./limits.js";

/**
 * A minimal zip container (X-1): stored and deflate-raw entries, our own CRC-32, no vendored code. The reader checks
 * the central directory against caps before it inflates anything (X-2, DEF-071) and refuses what it does not read.
 */
export class ZipError extends Error {
  constructor(message) {
    super(message);
    this.name = "ZipError";
  }
}

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const STORED = 0;
const DEFLATE = 8;
const UNPACKED_TYPES = /\.(pdf|png|jpe?g|webp|gif|zip)$/i;

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;

  for (let index = 0; index < bytes.length; index += 1) {
    crc = TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

export function safePath(path) {
  if (typeof path !== "string" || !path || path.length > 500) {
    return false;
  }

  if (path.startsWith("/") || path.includes("\\") || /^[a-zA-Z]:/.test(path) || path.includes("\0")) {
    return false;
  }

  return !path.split("/").some((part) => part === ".." || part === ".");
}

async function collect(stream, limit) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    total += value.length;

    if (total > limit) {
      await reader.cancel();
      throw new ZipError("An entry inflates past its declared size.");
    }

    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
}

async function deflate(bytes) {
  return collect(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw")), Number.MAX_SAFE_INTEGER);
}

async function inflate(bytes, limit) {
  try {
    return await collect(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")), limit);
  } catch (error) {
    throw error instanceof ZipError ? error : new ZipError("An entry could not be inflated.");
  }
}

function dosTime(date) {
  return {
    time: ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff,
    day: ((Math.max(date.getFullYear() - 1980, 0) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff
  };
}

/**
 * Writes entries `{ path, data: Uint8Array }` to a zip. Text and other compressible data is deflated when that is
 * smaller; files that are already compressed are stored.
 */
export async function writeZip(entries, { now = new Date() } = {}) {
  const stamp = dosTime(now);
  const parts = [];
  const central = [];
  const seen = new Set();
  let offset = 0;

  if (entries.length > 0xfffe) {
    throw new ZipError("Too many entries for one zip.");
  }

  for (const entry of entries) {
    if (!safePath(entry.path) || seen.has(entry.path)) {
      throw new ZipError(`The path ${JSON.stringify(entry.path)} cannot be written.`);
    }

    seen.add(entry.path);

    const name = encoder.encode(entry.path);
    const data = entry.data;

    if (data.length >= 0xffffffff || offset >= 0xffffffff) {
      throw new ZipError("The archive is too large for this container.");
    }

    let method = STORED;
    let body = data;

    if (data.length > 64 && !UNPACKED_TYPES.test(entry.path)) {
      const packed = await deflate(data);

      if (packed.length < data.length) {
        method = DEFLATE;
        body = packed;
      }
    }

    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, LOCAL, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(8, method, true);
    view.setUint16(10, stamp.time, true);
    view.setUint16(12, stamp.day, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, body.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);

    const header = new Uint8Array(46 + name.length);
    const record = new DataView(header.buffer);
    record.setUint32(0, CENTRAL, true);
    record.setUint16(4, 20, true);
    record.setUint16(6, 20, true);
    record.setUint16(8, 0x0800, true);
    record.setUint16(10, method, true);
    record.setUint16(12, stamp.time, true);
    record.setUint16(14, stamp.day, true);
    record.setUint32(16, crc, true);
    record.setUint32(20, body.length, true);
    record.setUint32(24, data.length, true);
    record.setUint16(28, name.length, true);
    record.setUint32(42, offset, true);
    header.set(name, 46);

    parts.push(local, body);
    central.push(header);
    offset += local.length + body.length;
  }

  const directory = central.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const tail = new DataView(end.buffer);
  tail.setUint32(0, END, true);
  tail.setUint16(8, entries.length, true);
  tail.setUint16(10, entries.length, true);
  tail.setUint32(12, directory, true);
  tail.setUint32(16, offset, true);

  const all = [...parts, ...central, end];
  const out = new Uint8Array(offset + directory + 22);
  let position = 0;

  for (const part of all) {
    out.set(part, position);
    position += part.length;
  }

  return out;
}

function findEnd(bytes, view) {
  const earliest = Math.max(0, bytes.length - 22 - 0xffff);

  for (let index = bytes.length - 22; index >= earliest; index -= 1) {
    if (view.getUint32(index, true) === END) {
      return index;
    }
  }

  return -1;
}

/**
 * Reads the central directory and checks every cap, without inflating anything. Returns the entries; `readEntry`
 * inflates one and verifies its CRC. Throws a `ZipError` that says why a file was refused.
 */
export function openZip(bytes, caps = {}) {
  const limits = {
    entries: caps.entries ?? LIMITS.zipEntries,
    inflated: caps.inflated ?? LIMITS.zipInflatedBytes,
    entryBytes: caps.entryBytes ?? LIMITS.zipEntryBytes,
    ratio: caps.ratio ?? LIMITS.zipRatio,
    ratioFloor: caps.ratioFloor ?? LIMITS.zipRatioFloor
  };

  if (!(bytes instanceof Uint8Array) || bytes.length < 22) {
    throw new ZipError("This is not a zip file.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEnd(bytes, view);

  if (end < 0) {
    throw new ZipError("This is not a zip file.");
  }

  const count = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  const start = view.getUint32(end + 16, true);

  if (count === 0xffff || size === 0xffffffff || start === 0xffffffff) {
    throw new ZipError("Zip64 archives are not supported.");
  }

  if (count > limits.entries) {
    throw new ZipError(`The archive has ${count} entries; the limit is ${limits.entries}.`);
  }

  if (start + size > end) {
    throw new ZipError("The archive's directory is damaged.");
  }

  const entries = [];
  const seen = new Set();
  let inflated = 0;
  let position = start;

  for (let index = 0; index < count; index += 1) {
    if (position + 46 > end || view.getUint32(position, true) !== CENTRAL) {
      throw new ZipError("The archive's directory is damaged.");
    }

    const flags = view.getUint16(position + 8, true);
    const method = view.getUint16(position + 10, true);
    const crc = view.getUint32(position + 16, true);
    const packed = view.getUint32(position + 20, true);
    const unpacked = view.getUint32(position + 24, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const offset = view.getUint32(position + 42, true);

    if (position + 46 + nameLength > end) {
      throw new ZipError("The archive's directory is damaged.");
    }

    let path;

    try {
      path = decoder.decode(bytes.subarray(position + 46, position + 46 + nameLength));
    } catch {
      throw new ZipError("An entry has an unreadable name.");
    }

    position += 46 + nameLength + extraLength + commentLength;

    if (path.endsWith("/")) {
      continue;
    }

    if (!safePath(path)) {
      throw new ZipError(`The entry ${JSON.stringify(path)} has an unsafe path.`);
    }

    if (seen.has(path)) {
      throw new ZipError(`The entry ${JSON.stringify(path)} appears twice.`);
    }

    seen.add(path);

    if (flags & 1) {
      throw new ZipError("Encrypted entries are not supported.");
    }

    if (method !== STORED && method !== DEFLATE) {
      throw new ZipError(`The entry ${JSON.stringify(path)} uses an unsupported method.`);
    }

    if (packed === 0xffffffff || unpacked === 0xffffffff) {
      throw new ZipError("Zip64 archives are not supported.");
    }

    if (unpacked > limits.entryBytes) {
      throw new ZipError(`The entry ${JSON.stringify(path)} is larger than the ${limits.entryBytes}-byte limit.`);
    }

    if (method === STORED && packed !== unpacked) {
      throw new ZipError(`The entry ${JSON.stringify(path)} is damaged.`);
    }

    if (unpacked > limits.ratioFloor && unpacked / Math.max(packed, 1) > limits.ratio) {
      throw new ZipError(`The entry ${JSON.stringify(path)} compresses suspiciously well.`);
    }

    inflated += unpacked;

    if (inflated > limits.inflated) {
      throw new ZipError("The archive inflates past the size limit.");
    }

    if (offset + 30 > start || view.getUint32(offset, true) !== LOCAL) {
      throw new ZipError(`The entry ${JSON.stringify(path)} is damaged.`);
    }

    const dataStart = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);

    if (dataStart + packed > start) {
      throw new ZipError(`The entry ${JSON.stringify(path)} is damaged.`);
    }

    entries.push({ path, method, crc, packed, size: unpacked, dataStart });
  }

  return {
    entries,
    has: (path) => seen.has(path),
    async readEntry(path) {
      const entry = entries.find((item) => item.path === path);

      if (!entry) {
        throw new ZipError(`The archive has no ${JSON.stringify(path)}.`);
      }

      const slice = bytes.subarray(entry.dataStart, entry.dataStart + entry.packed);
      const data = entry.method === STORED ? slice : await inflate(slice, entry.size);

      if (data.length !== entry.size || crc32(data) !== entry.crc) {
        throw new ZipError(`The entry ${JSON.stringify(path)} failed its check.`);
      }

      return data;
    },
    async readText(path) {
      try {
        return decoder.decode(await this.readEntry(path));
      } catch (error) {
        throw error instanceof ZipError ? error : new ZipError(`The entry ${JSON.stringify(path)} is not text.`);
      }
    }
  };
}
