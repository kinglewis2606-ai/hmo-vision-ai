import assert from "node:assert/strict";
import test from "node:test";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Real end-to-end test of the actual /api/analyse pipeline:
 *   upload -> floor detection -> room detection -> classification ->
 *   deterministic geometry -> ensuite carving -> validation ->
 *   bedroom count -> rendering -> report -> API response.
 *
 * This deliberately does NOT mock OpenAI. It builds and starts the real
 * production server and drives it with the reference floor plan fixture
 * committed at tests/fixtures/reference-floor-plan.jpg.
 *
 * Skipped when OPENAI_API_KEY is not configured (e.g. local sandboxes with
 * no network access to OpenAI) so the rest of the suite still runs.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const FIXTURE = path.join(ROOT, "tests", "fixtures", "reference-floor-plan.jpg");
const PORT = 3457;
// When E2E_BASE_URL is provided (e.g. CI already has a built production
// server running), reuse it instead of building/starting a second copy.
const EXTERNAL_BASE_URL = process.env.E2E_BASE_URL;
const BASE_URL = EXTERNAL_BASE_URL || `http://127.0.0.1:${PORT}`;
const HAS_KEY = !!process.env.OPENAI_API_KEY;

function waitForServer(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      try {
        const res = await fetch(`${BASE_URL}/`);
        if (res.ok) return resolve();
      } catch {}
      if (Date.now() > deadline) return reject(new Error("Server did not become ready in time."));
      setTimeout(attempt, 1000);
    };
    attempt();
  });
}

test("real /api/analyse pipeline processes the reference floor plan end-to-end", { timeout: 10 * 60 * 1000, skip: !HAS_KEY && "OPENAI_API_KEY is not configured; skipping the real end-to-end test." }, async (t) => {
  assert.ok(fs.existsSync(FIXTURE), `Reference floor plan fixture is missing at ${FIXTURE}`);

  let server: ReturnType<typeof spawn> | undefined;
  let serverOutput = "";

  if (!EXTERNAL_BASE_URL) {
    await t.test("build the production server", () => {
      const build = spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit", env: process.env });
      assert.equal(build.status, 0, "npm run build must succeed before the E2E test can run");
    });

    server = spawn("npm", ["run", "start", "--", "-H", "127.0.0.1", "-p", String(PORT)], { cwd: ROOT, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    server.stdout?.on("data", (chunk) => { serverOutput += String(chunk); });
    server.stderr?.on("data", (chunk) => { serverOutput += String(chunk); });
  }

  try {
    await waitForServer(60_000);

    await t.test("upload the reference floor plan", async (t) => {
      const buffer = fs.readFileSync(FIXTURE);
      const formData = new FormData();
      formData.append("file", new Blob([buffer], { type: "image/jpeg" }), "reference-floor-plan.jpg");
      const uploadRes = await fetch(`${BASE_URL}/api/upload`, { method: "POST", body: formData });
      const uploadJson: any = await uploadRes.json();
      assert.equal(uploadRes.status, 200, `Upload failed: ${JSON.stringify(uploadJson)}`);
      assert.equal(uploadJson.success, true);
      assert.ok(uploadJson.filename, "Upload response must include a stored filename");

      await t.test("analyse the uploaded floor plan through the real pipeline", async () => {
        const start = Date.now();
        const analyseRes = await fetch(`${BASE_URL}/api/analyse`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: uploadJson.filename, address: "1 Test Street", propertyType: "Terraced house" }),
        });
        const elapsedMs = Date.now() - start;
        const analyseJson: any = await analyseRes.json();

        // Must never hang: the whole request should resolve well before the
        // platform's own hard ceiling, and typically inside ~60s.
        assert.ok(elapsedMs < 120_000, `Analysis took ${elapsedMs}ms, which is too close to the platform's request ceiling`);
        assert.equal(analyseRes.status, 200, `Analyse failed (stage=${analyseJson.stage}): ${analyseJson.error}`);
        assert.equal(analyseJson.success, true, analyseJson.error);

        const report = analyseJson.result;
        assert.ok(report, "Analyse response must include a result report");

        // Floors + rooms were genuinely detected from the source image, not fabricated.
        assert.ok(Array.isArray(report.originalFloorPlan?.floors) && report.originalFloorPlan.floors.length > 0, "At least one floor must be detected");
        const originalRooms = report.originalFloorPlan.floors.flatMap((f: any) => f.rooms);
        assert.ok(originalRooms.length > 0, "At least one room must be detected from the uploaded image");
        for (const room of originalRooms) {
          assert.ok(Array.isArray(room.polygon) && room.polygon.length >= 3, `Room ${room.id} must have a real polygon`);
          assert.ok(Number(room.approxAreaSqm) > 0, `Room ${room.id} must have a calculated area`);
        }

        // Room IDs must be globally unique across the whole property.
        const allIds = originalRooms.map((r: any) => r.id);
        assert.equal(new Set(allIds).size, allIds.length, "Detected room IDs must be globally unique across floors");

        // Gross floor area must be preserved between original and proposed plans.
        const originalArea = originalRooms.reduce((sum: number, r: any) => sum + Number(r.approxAreaSqm || 0), 0);
        const proposedRooms = report.proposedFloorPlan.floors.flatMap((f: any) => f.rooms);
        const proposedArea = proposedRooms.reduce((sum: number, r: any) => sum + Number(r.approxAreaSqm || 0), 0);
        assert.ok(Math.abs(proposedArea - originalArea) / originalArea <= 0.05, `Gross floor area must be preserved: original=${originalArea}, proposed=${proposedArea}`);

        // The maximum bedroom count must equal what the deterministic geometry validator actually produced.
        const proposedBedrooms = proposedRooms.filter((r: any) => /bedroom/i.test(`${r.type} ${r.name}`));
        const proposedEnsuites = proposedRooms.filter((r: any) => /ensuite/i.test(`${r.type} ${r.name}`));
        assert.equal(report.geometryFeasibility.proposedBedrooms, proposedBedrooms.length, "Reported bedroom count must equal validated bedroom rooms actually present in the proposed plan");
        assert.equal(report.highestPossibleHMO.bedrooms, proposedBedrooms.length);
        assert.equal(report.highestPossibleHMO.ensuites, proposedEnsuites.length);

        // Every ensuite must have a positive carved area (subtracted from its bedroom, not double-counted).
        for (const ensuite of proposedEnsuites) {
          assert.ok(Number(ensuite.approxAreaSqm) > 0, `Ensuite ${ensuite.id} must have a positive carved area`);
        }

        // Rendering must have actually produced an image tied to this run's validated geometry.
        assert.ok(typeof report.generatedLayoutImage === "string" && report.generatedLayoutImage.length > 100, "Renderer must return a real generated layout image");

        // A report must be returned to the browser.
        assert.ok(typeof report.verdict === "string" && report.verdict.length > 0);
        assert.ok(typeof report.investorSummary === "string" && report.investorSummary.length > 0);

        console.log(`E2E result: floors=${report.originalFloorPlan.floors.length}, detectedRooms=${originalRooms.length}, bedrooms=${proposedBedrooms.length}, ensuites=${proposedEnsuites.length}, elapsedMs=${elapsedMs}`);
      });
    });
  } finally {
    server?.kill();
    if (process.env.E2E_DEBUG) console.log(serverOutput);
  }
});
