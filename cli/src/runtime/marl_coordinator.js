// Multi-Agent Reinforcement Learning (MARL) Cellular Coordinator for Entergram.
// Implements Lateral Inhibition (Winner-Take-All suppression of conflicting decisions),
// Hebbian co-activation wiring across complementary cells, and local value factorization.

/**
 * Applies lateral inhibition across active candidate cells.
 * When two cells compete for the same architectural scope or problem space,
 * the higher-potential winner exerts negative potential on the rival:
 * a_rival = max(0, a_rival - β * a_winner)
 *
 * @param {Array<{ cell: import("./cell_agent.js").BrainCell, potential: number }>} candidates
 * @param {number} [beta=0.7] - Inhibition coefficient
 * @returns {Array<{ cell: import("./cell_agent.js").BrainCell, potential: number, inhibitedBy?: string }>}
 */
export function applyLateralInhibition(candidates, beta = 0.7) {
  if (!candidates || candidates.length <= 1) return candidates;

  const adjusted = candidates.map((c) => ({ ...c }));
  const scopeWinners = new Map(); // scope -> winner candidate

  for (let i = 0; i < adjusted.length; i++) {
    const current = adjusted[i];
    if (current.potential <= 0) continue;

    const scope = (current.cell.scope || "global").toLowerCase();

    // Check if this scope already has a dominant decision winner
    if (scope !== "global" && current.cell.type === "decision") {
      if (scopeWinners.has(scope)) {
        const winner = scopeWinners.get(scope);
        // Suppress this rival candidate
        const suppression = beta * winner.potential;
        current.potential = Math.max(0.0, Number((current.potential - suppression).toFixed(4)));
        current.inhibitedBy = winner.cell.id;
      } else {
        scopeWinners.set(scope, current);
      }
    }
  }

  // Filter out fully suppressed candidates and sort by remaining potential
  return adjusted
    .filter((c) => c.potential > 0.05)
    .sort((a, b) => b.potential - a.potential);
}

/**
 * Hebbian Assembly Reinforcement:
 * "Cells that fire together, wire together."
 * When multiple cells are co-active during a successful task outcome (reward > 0),
 * their lateral connection strengths are reinforced proportionally to co-activation potential.
 *
 * @param {Array<{ cell: import("./cell_agent.js").BrainCell, potential: number }>} coActiveCells
 * @param {number} reward - Positive outcome reward
 * @param {import("./synaptic_network.js").SynapticNetwork} network
 * @returns {number} Number of reinforced lateral links
 */
export function applyHebbianCoactivation(coActiveCells, reward, network) {
  if (!coActiveCells || coActiveCells.length < 2 || reward <= 0) return 0;
  let reinforcedCount = 0;

  for (let i = 0; i < coActiveCells.length; i++) {
    for (let j = 0; j < coActiveCells.length; j++) {
      if (i !== j) {
        const cellA = coActiveCells[i].cell;
        const cellB = coActiveCells[j].cell;
        const potentialA = coActiveCells[i].potential;
        const potentialB = coActiveCells[j].potential;

        // Effective co-activation reward scaled by joint firing potential
        const jointReward = reward * potentialA * potentialB;
        cellA.reinforceDendrite(cellB.id, jointReward);
        reinforcedCount++;
      }
    }
  }

  return reinforcedCount;
}

/**
 * Local Monotonic Value Mixer (QMIX approximation for in-process MARL).
 * Computes joint value Q_tot ensuring monotonicity: ∂Q_tot / ∂Q_i >= 0
 *
 * @param {Array<number>} agentValues - Array of individual agent Q-values [q_ingest, q_recall, q_dispatch, q_compliance]
 * @param {Float64Array|Array<number>} globalStateVector - High-level system state vector
 * @returns {number} Joint Q-total value
 */
export function computeQMIXJointValue(agentValues, globalStateVector = null) {
  if (!agentValues || agentValues.length === 0) return 0;

  // Compute non-negative hypernetwork weights from state vector
  let stateEnergy = 1.0;
  if (globalStateVector && globalStateVector.length > 0) {
    let sum = 0;
    for (let i = 0; i < globalStateVector.length; i++) sum += Math.abs(globalStateVector[i]);
    stateEnergy = 1.0 + (sum / globalStateVector.length);
  }

  // Weighted monotonic sum: Q_tot = Σ |w_i| * q_i
  let qTotal = 0;
  for (let i = 0; i < agentValues.length; i++) {
    const weight = Math.abs(Math.sin((i + 1) * stateEnergy)) + 0.5; // Strictly positive weight
    qTotal += weight * agentValues[i];
  }

  return Number(qTotal.toFixed(4));
}
