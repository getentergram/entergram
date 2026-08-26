import test from "node:test";
import assert from "node:assert/strict";
import { BrainCell } from "../../src/runtime/cell_agent.js";
import { SynapticNetwork } from "../../src/runtime/synaptic_network.js";
import { resolveCascade } from "../../src/runtime/rlm_cascade.js";

test("resolveCascade: orders dependencies topologically (Arthur Kahn 1962)", () => {
  const network = new SynapticNetwork();

  // Root: B-0025 (Payment Setup) -> depends on B-0012 (Stripe Config) -> depends on B-0008 (Env Secrets)
  const root = new BrainCell({ id: "B-0025", type: "procedure", hook: "Deploy Payments" });
  root.dendrites.set("B-0012", 0.9);

  const dep1 = new BrainCell({ id: "B-0012", type: "procedure", hook: "Stripe API Setup" });
  dep1.dendrites.set("B-0008", 0.9);

  const leaf = new BrainCell({ id: "B-0008", type: "procedure", hook: "Validate ENV Secrets" });

  network.cells.set("B-0025", root);
  network.cells.set("B-0012", dep1);
  network.cells.set("B-0008", leaf);

  const plan = resolveCascade("B-0025", network);

  assert.equal(plan.totalSteps, 3);
  assert.equal(plan.steps[0].id, "B-0008", "Leaf dependency should execute first");
  assert.equal(plan.steps[1].id, "B-0012", "Intermediate dependency should execute second");
  assert.equal(plan.steps[2].id, "B-0025", "Root procedure should execute last");
});

test("resolveCascade: traps circular dependencies cleanly", () => {
  const network = new SynapticNetwork();
  const c1 = new BrainCell({ id: "B-0001", hook: "Step A" });
  c1.dendrites.set("B-0002", 0.9);
  const c2 = new BrainCell({ id: "B-0002", hook: "Step B" });
  c2.dendrites.set("B-0001", 0.9); // Cycle!

  network.cells.set("B-0001", c1);
  network.cells.set("B-0002", c2);

  assert.throws(() => {
    resolveCascade("B-0001", network);
  }, /circular/i);
});
