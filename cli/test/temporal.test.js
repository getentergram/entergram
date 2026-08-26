import test from "node:test";
import assert from "node:assert/strict";
import {
  computeDynamicConfidence,
  checkStaleness,
  transitionLifecycle,
} from "../src/temporal.js";

test("computeDynamicConfidence: decays exponentially over time", () => {
  const cell = {
    confidence: 1.0,
    created: "2024-01-01",
    scope: "infrastructure",
  };

  const nowDay0 = Date.parse("2024-01-01T00:00:00Z") / 1000;
  const nowDay100 = nowDay0 + 100 * 86400;
  const nowDay300 = nowDay0 + 300 * 86400;

  const confDay0 = computeDynamicConfidence(cell, [], nowDay0);
  const confDay100 = computeDynamicConfidence(cell, [], nowDay100);
  const confDay300 = computeDynamicConfidence(cell, [], nowDay300);

  assert.equal(confDay0, 1.0);
  assert.ok(confDay100 < confDay0);
  assert.ok(confDay300 < confDay100);
});

test("computeDynamicConfidence: reconfirmation citation boosts decayed confidence", () => {
  const cell = {
    confidence: 0.8,
    created: "2024-01-01",
    scope: "deployment",
  };

  const nowSec = Date.parse("2024-06-01T00:00:00Z") / 1000; // ~150 days later
  const confWithoutCitations = computeDynamicConfidence(cell, [], nowSec);

  const citations = [
    { timestamp: "2024-05-20T00:00:00Z", success: true },
    { timestamp: "2024-05-28T00:00:00Z", success: true },
  ];
  const confWithCitations = computeDynamicConfidence(cell, citations, nowSec);

  assert.ok(confWithCitations > confWithoutCitations);
});

test("computeDynamicConfidence: superseded and deprecated decisions yield 0 confidence", () => {
  const cellSuperseded = { confidence: 1.0, created: "2024-01-01", status: "superseded" };
  const cellDeprecated = { confidence: 0.9, created: "2024-01-01", status: "deprecated" };

  assert.equal(computeDynamicConfidence(cellSuperseded, []), 0.0);
  assert.equal(computeDynamicConfidence(cellDeprecated, []), 0.0);
});

test("checkStaleness: detects stale decisions whose confidence dropped below threshold", () => {
  const cell = {
    confidence: 0.9,
    created: "2023-01-01", // Old decision
    scope: "deployment",
  };

  const nowSec = Date.parse("2024-06-01T00:00:00Z") / 1000;
  const stale = checkStaleness(cell, [], nowSec);

  assert.equal(stale.isStale, true);
  assert.match(stale.reason, /decayed/i);
});

test("transitionLifecycle: returns valid patch and sets zero confidence on supersession", () => {
  const cell = { id: "B-0010", confidence: 0.9 };
  const patch = transitionLifecycle(cell, "superseded", "Replaced by B-0099 Valkey migration");

  assert.equal(patch.status, "superseded");
  assert.equal(patch.confidence, 0.0);
  assert.match(patch.outcome, /Replaced by B-0099/);
});
