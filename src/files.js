import { LIMITS } from "./limits.js";
import { formatBytes } from "./utils.js";

export const HEAD_BYTES = 1024;

const IMAGE_KINDS = ["png", "jpeg", "webp", "gif"];

function startsWith(head, bytes, offset = 0) {
  return bytes.every((byte, index) => head[offset + index] === byte);
}

/** Judges a file by its first bytes, never by its name or reported type (P-13). */
export function detectKind(head) {
  if (!head || !head.length) {
    return null;
  }

  const limit = Math.min(head.length, HEAD_BYTES - 4);

  for (let index = 0; index <= limit; index += 1) {
    if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d], index)) {
      return "pdf";
    }
  }

  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }

  if (startsWith(head, [0xff, 0xd8, 0xff])) {
    return "jpeg";
  }

  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "webp";
  }

  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) {
    return "gif";
  }

  return null;
}

export function isImageKind(kind) {
  return IMAGE_KINDS.includes(kind);
}

export function cleanFileName(name, max = LIMITS.documentNameLength) {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return cleaned || "Untitled";
}

export function checkPdf({ size, head }, { count = 0 } = {}) {
  if (count >= LIMITS.documents) {
    return { ok: false, reason: `This character already has ${LIMITS.documents} documents. Remove one first.` };
  }

  if (!size) {
    return { ok: false, reason: "This file is empty." };
  }

  if (size > LIMITS.pdfBytes) {
    return { ok: false, reason: `This file is larger than the ${formatBytes(LIMITS.pdfBytes)} limit for a PDF.` };
  }

  if (detectKind(head) !== "pdf") {
    return { ok: false, reason: "This does not look like a PDF file." };
  }

  return { ok: true };
}

export function checkImage({ size, head }) {
  if (!size) {
    return { ok: false, reason: "This file is empty." };
  }

  if (size > LIMITS.portraitBytes) {
    return { ok: false, reason: `This image is larger than the ${formatBytes(LIMITS.portraitBytes)} limit.` };
  }

  if (!isImageKind(detectKind(head))) {
    return { ok: false, reason: "This is not a PNG, JPEG, WebP or GIF image." };
  }

  return { ok: true };
}

/** Scales `width` by `height` so the longer side is at most `max`, never enlarging. */
export function fitWithin(width, height, max = LIMITS.portraitPixels) {
  const longest = Math.max(width, height);

  if (!longest || longest <= max) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }

  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** An image or a PDF for a campaign handout, judged by its bytes. Returns `{ ok, kind }` or `{ ok: false, reason }`. */
export function checkHandout({ size, head }, { count = 0 } = {}) {
  if (count >= LIMITS.handouts) {
    return { ok: false, reason: `This campaign already has ${LIMITS.handouts} handouts. Remove one first.` };
  }

  if (!size) {
    return { ok: false, reason: "This file is empty." };
  }

  if (size > LIMITS.pdfBytes) {
    return { ok: false, reason: `This file is larger than the ${formatBytes(LIMITS.pdfBytes)} limit.` };
  }

  const kind = detectKind(head);

  if (kind !== "pdf" && !isImageKind(kind)) {
    return { ok: false, reason: "Handouts are images (PNG, JPEG, WebP, GIF) or PDFs." };
  }

  return { ok: true, kind };
}
