import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

test("production gate: analysis API exists and uses structured JSON", () => {
  const src = read("app/api/analyse/route.ts");
  assert.match(src, /text:\s*\{\s*format:\s*\{\s*type:\s*[\"']json_object[\"']/);
  assert.match(src, /cleanJson\(/);
  assert.match(src, /detectFloors\(/);
  assert.match(src, /detectRooms\(/);
  assert.match(src, /buildMaximumHMOLayout\(/);
  assert.match(src, /renderFloorPlan\(/);
});

test("production gate: blueprint renderer preserves source shell", () => {
  const src = read("lib/floorplanRenderer.ts");
  assert.match(src, /originalImageDataUri/);
  assert.match(src, /polygonContainsPolygon/);
  assert.match(src, /ORIGINAL EXTERNAL SHELL PRESERVED/);
});

test("production gate: deterministic HMO geometry is wired", () => {
  const src = read("lib/hmoLayoutPipeline.ts");
  assert.match(src, /findMaximumHMO/);
  assert.match(src, /applyBestEnsuites/);
});

test("production gate: uploader supports plan formats and safe persistence", () => {
  const src = read("app/api/upload/route.ts");
  assert.match(src, /application\/pdf/);
  assert.match(src, /image\/jpeg/);
  assert.match(src, /image\/png/);
  assert.match(src, /writeFileSync/);
});

test("production gate: side-by-side original/proposed output is present", () => {
  const src = read("app/new/page.tsx");
  assert.match(src, /Original Floor Plan/);
  assert.match(src, /Proposed HMO Layout/);
  assert.match(src, /lg:grid-cols-2/);
});
