import { fitWithin } from "../files.js";
import { LIMITS } from "../limits.js";

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Decodes an image, scales its longer side to at most the portrait size and re-encodes it as WebP
 * (PNG where the browser cannot encode WebP). The original is not kept (`docs/PDF.md` 5).
 */
export async function scalePortrait(file, max = LIMITS.portraitPixels) {
  const bitmap = await createImageBitmap(file);

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);

    const webp = await toBlob(canvas, "image/webp", 0.85);
    return webp && webp.type === "image/webp" ? webp : await toBlob(canvas, "image/png");
  } finally {
    bitmap.close?.();
  }
}
