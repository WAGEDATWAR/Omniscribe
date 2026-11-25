/**
 * Pure square-crop maths for portraits (DEF-022). The crop is described by a zoom (1 shows the largest square the image
 * holds, higher values show less) and a centre as fractions of the image, and comes back as a source square in pixels.
 */
export const CROP_ZOOM = Object.freeze({ min: 1, max: 6 });

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

export function cropSquare({ width, height, zoom = 1, cx = 0.5, cy = 0.5 }) {
  const size = Math.min(width, height) / clamp(Number.isFinite(zoom) ? zoom : 1, CROP_ZOOM.min, CROP_ZOOM.max);
  const x = clamp((Number.isFinite(cx) ? cx : 0.5) * width - size / 2, 0, width - size);
  const y = clamp((Number.isFinite(cy) ? cy : 0.5) * height - size / 2, 0, height - size);

  return { x, y, size };
}

/** The centre after the image is dragged by `dx`, `dy` pixels inside a preview of `previewSize` pixels. */
export function dragCentre({ width, height, zoom, cx, cy, dx, dy, previewSize }) {
  const { size } = cropSquare({ width, height, zoom, cx, cy });
  const scale = size / previewSize;
  const next = cropSquare({ width, height, zoom, cx: cx - (dx * scale) / width, cy: cy - (dy * scale) / height });

  return { cx: (next.x + next.size / 2) / width, cy: (next.y + next.size / 2) / height };
}
