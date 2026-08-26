import test from "node:test";
import assert from "node:assert/strict";
import { BrainCell } from "../../src/runtime/cell_agent.js";
import { SynapticNetwork } from "../../src/runtime/synaptic_network.js";
import { applySupervisorMutation, propagateMutationWave } from "../../src/runtime/mutation_tracker.js";

test("applySupervisorMutation: shifts trigger vector and elevates activation barrier", () => {
  const cell = new BrainCell({ id: "B-0010", hook: "Timeout 5s", threshold: 0.45, plasticity: 0.2 });
  const result = applySupervisorMutation(
    cell,
    { hook: "Timeout 30s", reason: "Avoid gateway drops" },
    "Database timeout settings for heavy load",
    1.0
  );

  assert.equal(result.cellId, "B-0010");
  assert.ok(result.thresholdShift > 0);
  assert.ok(result.plasticityShift < 0);
  assert.equal(cell.hook, "Timeout 30s");
});

test("propagateMutationWave: alerts upstream parent cells", () => {
  const network = new SynapticNetwork();
  const parent = new BrainCell({ id: "B-0001", hook: "Deploy Service", threshold: 0.5 });
  parent.dendrites.set("B-0010", 0.9);
  const child = new BrainCell({ id: "B-0010", hook: "Config Timeout" });

  network.cells.set("B-0001", parent);
  network.cells.set("B-0010", child);

  const notified = propagateMutationWave("B-0010", network);
  assert.equal(notified.length, 1);
  assert.equal(notified[0], "B-0001");
  assert.ok(parent.threshold > 0.5, "Parent activation barrier should be raised for verification");
});
