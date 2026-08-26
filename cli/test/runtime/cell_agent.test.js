import test from "node:test";
import assert from "node:assert/strict";
import { BrainCell } from "../../src/runtime/cell_agent.js";
import { embedQuery } from "../../src/embeddings.js";

test("BrainCell: evaluates activation potential in sub-millisecond time", () => {
  const cell = new BrainCell({
    id: "B-0042",
    type: "decision",
    hook: "Use PostgreSQL for payment transactions",
    scope: "payments",
    threshold: 0.45,
  });

  const matchingVec = embedQuery("Postgres database payment transactions");
  const unmatchingVec = embedQuery("Frontend React button alignment CSS");

  const potMatch = cell.evaluateActivation(matchingVec);
  const potUnmatch = cell.evaluateActivation(unmatchingVec);

  assert.ok(potMatch > potUnmatch, `Matching potential (${potMatch}) should exceed unmatching (${potUnmatch})`);
  assert.ok(potMatch > 0.5);
});

test("BrainCell: applies supervisor gradient and stabilizes plasticity", () => {
  const cell = new BrainCell({
    id: "B-0010",
    hook: "Initial timeout 5s",
    plasticity: 0.20,
    threshold: 0.50,
  });

  const correctionVec = embedQuery("Database connection timeout 30s for heavy workloads");
  cell.applySupervisorGradient(
    { hook: "Database connection timeout increased to 30s", reason: "Prevent 504 Gateway Timeouts under load" },
    correctionVec,
    1.0
  );

  assert.equal(cell.hook, "Database connection timeout increased to 30s");
  assert.ok(cell.plasticity < 0.20, "Plasticity should decrease after supervisor validation");
  assert.ok(cell.threshold > 0.50, "Threshold barrier should elevate");
  assert.equal(cell.mutationHistory.length, 1);
});

test("BrainCell: reinforces and prunes dendrites", () => {
  const cell = new BrainCell({ id: "B-0025", hook: "Setup payments" });
  cell.reinforceDendrite("B-0012", 2.0);

  assert.ok((cell.dendrites.get("B-0012") || 0) > 0.5);
  assert.equal(cell.resolutions, 1);

  // Prune
  cell.pruneDendrite("B-0012", 0.1);
  assert.equal(cell.dendrites.has("B-0012"), false, "Low coupling strength should be pruned completely");
});
