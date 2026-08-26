import test from "node:test";
import assert from "node:assert/strict";
import { BrainCell } from "../../src/runtime/cell_agent.js";
import { SynapticNetwork } from "../../src/runtime/synaptic_network.js";
import {
  applyLateralInhibition,
  applyHebbianCoactivation,
  computeQMIXJointValue,
} from "../../src/runtime/marl_coordinator.js";

test("applyLateralInhibition: suppresses competing decisions in the same scope", () => {
  const winner = new BrainCell({ id: "B-0042", type: "decision", scope: "payments", hook: "PostgreSQL chosen" });
  const rival = new BrainCell({ id: "B-0010", type: "decision", scope: "payments", hook: "MongoDB legacy" });

  const candidates = [
    { cell: winner, potential: 0.95 },
    { cell: rival, potential: 0.70 },
  ];

  // Partial suppression with beta = 0.5: rival potential drops from 0.70 to 0.225
  const adjusted = applyLateralInhibition(candidates, 0.5);
  assert.equal(adjusted.length, 2);
  assert.equal(adjusted[0].cell.id, "B-0042");
  assert.ok(adjusted[1].potential < 0.70, "Rival potential should be suppressed by winner");
  assert.equal(adjusted[1].inhibitedBy, "B-0042");

  // Full suppression with beta = 1.0: rival potential drops to 0 and is pruned from active assembly
  const fullySuppressed = applyLateralInhibition(candidates, 1.0);
  assert.equal(fullySuppressed.length, 1);
  assert.equal(fullySuppressed[0].cell.id, "B-0042");
});

test("applyHebbianCoactivation: reinforces lateral weights between co-active cells", () => {
  const network = new SynapticNetwork();
  const c1 = new BrainCell({ id: "B-0001", hook: "Decision A" });
  const c2 = new BrainCell({ id: "B-0002", hook: "Gotcha B" });
  network.cells.set("B-0001", c1);
  network.cells.set("B-0002", c2);

  const active = [
    { cell: c1, potential: 0.9 },
    { cell: c2, potential: 0.8 },
  ];

  const count = applyHebbianCoactivation(active, 3.0, network);
  assert.equal(count, 2);
  assert.ok(c1.dendrites.has("B-0002"));
  assert.ok(c2.dendrites.has("B-0001"));
});

test("computeQMIXJointValue: computes monotonic value", () => {
  const qValues = [0.8, 0.9, 0.4, 0.7];
  const qTot = computeQMIXJointValue(qValues);
  assert.ok(qTot > 0);
  assert.ok(typeof qTot === "number");
});
