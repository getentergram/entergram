import test from "node:test";
import assert from "node:assert/strict";
import { BrainCell } from "../../src/runtime/cell_agent.js";
import { SynapticNetwork } from "../../src/runtime/synaptic_network.js";

test("SynapticNetwork: stimulates all cells in parallel", () => {
  const network = new SynapticNetwork();
  network.cells.set("B-0001", new BrainCell({ id: "B-0001", hook: "PostgreSQL setup", type: "decision" }));
  network.cells.set("B-0002", new BrainCell({ id: "B-0002", hook: "CSS flexbox styles", type: "convention" }));

  const activations = network.stimulate("Postgres db connection pool");
  assert.ok(activations.length > 0);
  assert.equal(activations[0].cell.id, "B-0001");
});

test("SynapticNetwork: computes topological stats", () => {
  const network = new SynapticNetwork();
  const c1 = new BrainCell({ id: "B-0001", hook: "Parent proc" });
  c1.dendrites.set("B-0002", 0.8);
  network.cells.set("B-0001", c1);
  network.cells.set("B-0002", new BrainCell({ id: "B-0002", hook: "Child proc" }));

  const stats = network.getStats();
  assert.equal(stats.totalCells, 2);
  assert.equal(stats.totalDendriticLinks, 1);
});
