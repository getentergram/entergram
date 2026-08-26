import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FEATURE_DIM, LinUCBBandit, extractFeatures } from "../src/rl/bandit.js";
import { computeReward } from "../src/rl/rewards.js";
import { logTelemetryEvent, readTelemetryEvents, getTelemetryStats } from "../src/rl/telemetry.js";

test("extractFeatures: produces 12-dimensional normalized feature vector", () => {
  const cell = {
    id: "B-0001",
    type: "gotcha",
    scope: "auth",
    confidence: 0.9,
  };

  const context = {
    query: "Avoid auth token leak bug",
    bm25Score: 0.2,
    cosineSim: 0.85,
    dynamicConfidence: 0.88,
    ageDays: 45,
    citedCount: 5,
    resolutionRate: 0.9,
    scope: "auth",
    inDegree: 3,
    sessionSeen: false,
  };

  const x = extractFeatures(cell, context);
  assert.equal(x.length, FEATURE_DIM);
  assert.equal(x.length, 12);
  assert.equal(x[8], 1.0); // gotcha boost
  assert.equal(x[7], 1.0); // scope match
  assert.equal(x[11], 1.0); // bias
});

test("LinUCBBandit: initializes, scores, and updates correctly", () => {
  const bandit = new LinUCBBandit(FEATURE_DIM, 0.5);
  const x1 = new Float64Array(FEATURE_DIM).fill(0.5);
  const initialScore = bandit.score(x1);

  assert.ok(typeof initialScore === "number" && !isNaN(initialScore));

  // Positive reward update
  bandit.update(x1, 5.0);
  const updatedScore = bandit.score(x1);
  assert.ok(updatedScore > initialScore, `Updated score (${updatedScore}) should be higher than initial (${initialScore})`);
});

test("computeReward: calculates engineering outcome reward correctly", () => {
  const goodSignals = {
    cited: true,
    commitLanded: true,
    prMerged: true,
    buildPassed: true,
    preventedRegression: true,
  };

  const reward = computeReward(goodSignals);
  assert.equal(reward, 1.0 + 3.0 + 5.0 + 2.0 + 4.0); // 15.0

  const badSignals = {
    dismissed: true,
    staleServed: true,
    unnecessaryTokens: 500,
  };
  const penalty = computeReward(badSignals);
  assert.equal(penalty, -1.5 - 2.0 - 0.5); // -4.0
});

test("telemetry: logs and reads events in temporary root", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "entergram-rl-test-"));
  try {
    const eventId = logTelemetryEvent(tempDir, {
      event_type: "recall",
      query: "How does JWT auth work?",
      tokens_used: 450,
      cells_returned: ["B-0001", "B-0005"],
      rewards: { total: 4.0 },
    });

    assert.ok(eventId);
    const events = readTelemetryEvents(tempDir, 10);
    assert.equal(events.length, 1);
    assert.equal(events[0].query, "How does JWT auth work?");

    const stats = getTelemetryStats(tempDir);
    assert.equal(stats.totalEvents, 1);
    assert.equal(stats.totalTokens, 450);
    assert.equal(stats.rewardedEvents, 1);
    assert.equal(stats.avgReward, 4.0);
  } finally {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  }
});
