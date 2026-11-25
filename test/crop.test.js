import assert from "node:assert/strict";
import test from "node:test";
import { cropSquare, dragCentre } from "../src/crop.js";

test("zoom 1 is the largest centred square", () => {
  assert.deepEqual(cropSquare({ width: 800, height: 400 }), { x: 200, y: 0, size: 400 });
});

test("zooming in shrinks the square and it never leaves the image", () => {
  const crop = cropSquare({ width: 800, height: 400, zoom: 2, cx: 0, cy: 1 });
  assert.deepEqual(crop, { x: 0, y: 200, size: 200 });
  assert.equal(cropSquare({ width: 100, height: 100, zoom: 99 }).size, 100 / 6);
  assert.deepEqual(cropSquare({ width: 100, height: 100, zoom: Number.NaN, cx: Number.NaN }), { x: 0, y: 0, size: 100 });
});

test("dragging moves the image under the crop and clamps at the edge", () => {
  const start = { width: 800, height: 400, zoom: 2, cx: 0.5, cy: 0.5, previewSize: 200 };
  const moved = dragCentre({ ...start, dx: -100, dy: 0 });
  assert.ok(moved.cx > 0.5);
  const far = dragCentre({ ...start, dx: -100000, dy: 0 });
  assert.equal(cropSquare({ ...start, cx: far.cx, cy: far.cy }).x + 200, 800);
});
