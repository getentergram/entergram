import test from "node:test";
import assert from "node:assert/strict";
import { BrainCell } from "../../src/runtime/cell_agent.js";
import { evaluateGraduation, promoteCell, SCALE_TIERS } from "../../src/runtime/fractal_promoter.js";

test("evaluateGraduation: checks thresholds for Individual -> Team promotion", () => {
  const youngCell = new BrainCell({ id: "B-0001", resolutions: 2, failures: 0, confidence: 0.9 });
  const youngEval = evaluateGraduation(youngCell, SCALE_TIERS.INDIVIDUAL);
  assert.equal(youngEval.eligible, false);

  const matureCell = new BrainCell({ id: "B-0002", resolutions: 6, failures: 0, confidence: 0.9 });
  const matureEval = evaluateGraduation(matureCell, SCALE_TIERS.INDIVIDUAL);
  assert.equal(matureEval.eligible, true);
  assert.equal(matureEval.targetTier, SCALE_TIERS.TEAM);
});

test("promoteCell: adjusts plasticity and elevates thresholds on promotion", () => {
  const cell = new BrainCell({ id: "B-0001", plasticity: 0.20, threshold: 0.45 });
  promoteCell(cell, SCALE_TIERS.TEAM);

  assert.equal(cell.plasticity, 0.05);
  assert.ok(cell.threshold >= 0.55);

  promoteCell(cell, SCALE_TIERS.ORGANIZATION);
  assert.equal(cell.plasticity, 0.001);
  assert.ok(cell.threshold >= 0.75);
});
