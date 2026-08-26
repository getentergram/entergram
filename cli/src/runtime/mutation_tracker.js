// Supervisor Mutation Tracker for Entergram.
// Analyzes human/supervisor diffs on memory cells, computes modification gradients,
// shifts receptive field boundaries, and stabilizes cell plasticity.

import { embedQuery } from "../embeddings.js";

/**
 * Applies a supervisor mutation to a living brain cell.
 *
 * @param {import("./cell_agent.js").BrainCell} cell - Target cell to mutate
 * @param {object} updatedFields - Fields edited by the supervisor { hook, why, what, outcome, reason }
 * @param {string|Float64Array} [contextOrQuery] - Query or context that triggered the correction
 * @param {number} [authorAuthority=1.0] - Supervisor reputation weight (e.g. 1.0 for senior dev)
 * @returns {object} Mutation summary with shifted parameters
 */
export function applySupervisorMutation(cell, updatedFields, contextOrQuery = null, authorAuthority = 1.0) {
  const contextVector = typeof contextOrQuery === "string" ? embedQuery(contextOrQuery) : contextOrQuery;
  const initialThreshold = cell.threshold;
  const initialPlasticity = cell.plasticity;

  cell.applySupervisorGradient(updatedFields, contextVector, authorAuthority);

  return {
    cellId: cell.id,
    authorAuthority,
    thresholdShift: Number((cell.threshold - initialThreshold).toFixed(4)),
    plasticityShift: Number((cell.plasticity - initialPlasticity).toFixed(4)),
    newThreshold: cell.threshold,
    newPlasticity: cell.plasticity,
    mutationRecord: cell.mutationHistory[cell.mutationHistory.length - 1],
  };
}

/**
 * Propagates a mutation wave through connected parent cells in the synaptic network.
 * Notifies upstream procedures that a dependent cell's rationale or contract has shifted.
 *
 * @param {string} mutatedCellId
 * @param {import("./synaptic_network.js").SynapticNetwork} network
 * @returns {Array<string>} List of notified parent cell IDs
 */
export function propagateMutationWave(mutatedCellId, network) {
  const notifiedParents = [];

  for (const [cellId, cell] of network.cells.entries()) {
    if (cell.dendrites.has(mutatedCellId)) {
      // Upstream parent depends on the mutated cell: temporarily elevate activation threshold for verification
      cell.threshold = Math.min(0.85, cell.threshold + 0.05);
      notifiedParents.push(cellId);
    }
  }

  return notifiedParents;
}
