import test from "node:test";
import assert from "node:assert/strict";
import { isStageError, isTimeoutError, parseAIJson, stageError, timedStage } from "../lib/timing";

test("stageError attaches stage and status code, and is recognised by isStageError", () => {
  const err = stageError("room-detection", "Room detection failed.", 502);
  assert.equal(err.stage, "room-detection");
  assert.equal(err.statusCode, 502);
  assert.equal(isStageError(err), true);
  assert.equal(isStageError(new Error("plain")), false);
});

test("parseAIJson rejects an empty AI response with a controlled stage error", () => {
  assert.throws(() => parseAIJson("ai-hmo-strategy", ""), (e: unknown) => isStageError(e) && /incomplete/i.test((e as Error).message));
  assert.throws(() => parseAIJson("ai-hmo-strategy", null), (e: unknown) => isStageError(e));
  assert.throws(() => parseAIJson("ai-hmo-strategy", "   "), (e: unknown) => isStageError(e));
});

test("parseAIJson rejects a truncated AI response distinctly from a malformed one", () => {
  // Truncated: missing closing brace/bracket.
  assert.throws(() => parseAIJson("ai-hmo-strategy", '{"bedrooms": [{"id": "room-1"'), (e: unknown) => isStageError(e) && /truncated/i.test((e as Error).message));
  // Malformed: syntactically broken but "closed" - e.g. the reported
  // "Expected ',' or ']' after array element" style error.
  assert.throws(() => parseAIJson("ai-hmo-strategy", '{"bedrooms": [1, 2 3]}'), (e: unknown) => isStageError(e) && /malformed/i.test((e as Error).message));
});

test("parseAIJson accepts valid JSON, including fenced code blocks and surrounding prose", () => {
  assert.deepEqual(parseAIJson("ai-hmo-strategy", '{"a":1}'), { a: 1 });
  assert.deepEqual(parseAIJson("ai-hmo-strategy", '```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseAIJson("ai-hmo-strategy", 'Sure, here is the JSON: {"a":1} Hope that helps!'), { a: 1 });
});

test("isTimeoutError recognises OpenAI SDK abort/timeout errors", () => {
  assert.equal(isTimeoutError({ name: "APIConnectionTimeoutError", message: "Request timed out." }), true);
  assert.equal(isTimeoutError({ name: "AbortError", message: "This operation was aborted" }), true);
  assert.equal(isTimeoutError(new Error("some other failure")), false);
  assert.equal(isTimeoutError(null), false);
});

test("timedStage converts a raw timeout error into a controlled 504 stage error", async () => {
  const timeoutLike = Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" });
  await assert.rejects(
    timedStage("ai-hmo-strategy", async () => { throw timeoutLike; }, "AI request timed out."),
    (e: unknown) => isStageError(e) && (e as any).statusCode === 504 && /timed out/i.test((e as Error).message),
  );
});

test("timedStage passes through an already-tagged stage error unchanged", async () => {
  const original = stageError("room-detection", "Room detection failed.", 502);
  await assert.rejects(
    timedStage("room-detection", async () => { throw original; }),
    (e: unknown) => e === original,
  );
});

test("timedStage wraps an unexpected raw error into a controlled 500 stage error instead of crashing", async () => {
  await assert.rejects(
    timedStage("geometry-pipeline", async () => { throw new Error("boom"); }, "Geometry validation failed."),
    (e: unknown) => isStageError(e) && (e as any).statusCode === 500 && (e as Error).message === "Geometry validation failed.",
  );
});

test("timedStage resolves normally and does not alter a successful result", async () => {
  const value = await timedStage("rendering", async () => 42);
  assert.equal(value, 42);
});
