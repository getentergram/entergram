// RLM Recursive Cascade & Execution DAG Planner for Entergram.
// Decomposes high-level procedures into ordered dependency DAGs via dendritic citation links [[B-NNNN]],
// executes Arthur Kahn (1962) topological sorting, and autonomously prunes failing pathways.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../lib.js";

/**
 * Topologically resolves an RLM execution plan from a root procedure cell.
 *
 * @param {string} rootCellId - Root procedure ID (e.g. "B-0025")
 * @param {import("./synaptic_network.js").SynapticNetwork} network - Living synaptic network
 * @param {Float64Array} [contextVector] - Context trigger vector
 * @param {string} [rootPath] - Repository root
 * @param {number} [maxDepth=5] - Maximum recursion depth
 * @returns {object} Execution plan with topologically ordered steps
 */
export function resolveCascade(rootCellId, network, contextVector = null, rootPath = process.cwd(), maxDepth = 5) {
  const rootCell = network.getCell(rootCellId);
  if (!rootCell) {
    throw new Error(`Root procedure cell "${rootCellId}" not found in synaptic network.`);
  }

  const visited = new Set();
  const recursionStack = new Set();
  const depGraph = new Map(); // cellId -> Set<childDependencyId>
  const activeCells = new Map(); // cellId -> BrainCell
  const effectivePotentials = new Map(); // cellId -> number

  // Initial root potential
  const rootPotential = contextVector ? rootCell.evaluateActivation(contextVector) : 1.0;
  effectivePotentials.set(rootCellId, rootPotential);

  // DFS to build dependency graph and compute dendritic potential propagation
  function dfs(cellId, depth) {
    if (depth > maxDepth) return;
    if (recursionStack.has(cellId)) {
      throw new Error(`Circular procedure dependency detected involving cell ${cellId}`);
    }
    if (visited.has(cellId)) return;

    visited.add(cellId);
    recursionStack.add(cellId);

    const cell = network.getCell(cellId);
    if (!cell) {
      recursionStack.delete(cellId);
      return;
    }
    activeCells.set(cellId, cell);

    const parentPotential = effectivePotentials.get(cellId) || 0.5;
    const deps = new Set();

    for (const [targetId, couplingStrength] of cell.dendrites.entries()) {
      const targetCell = network.getCell(targetId);
      if (targetCell) {
        deps.add(targetId);

        // Propagate dendritic potential: a_j_eff = a_j + γ_ij * a_i
        const targetBase = contextVector ? targetCell.evaluateActivation(contextVector) : 0.5;
        const currentEff = effectivePotentials.get(targetId) || targetBase;
        effectivePotentials.set(targetId, Math.min(1.0, currentEff + couplingStrength * parentPotential));

        dfs(targetId, depth + 1);
      }
    }

    depGraph.set(cellId, deps);
    recursionStack.delete(cellId);
  }

  dfs(rootCellId, 0);

  // Arthur Kahn's Topological Sort (1962)
  const inDegree = new Map();
  for (const cellId of activeCells.keys()) inDegree.set(cellId, 0);
  for (const deps of depGraph.values()) {
    for (const d of deps) {
      inDegree.set(d, (inDegree.get(d) || 0) + 1);
    }
  }

  // Queue nodes with zero in-degree (root dependencies that must execute first)
  const queue = [];
  for (const [cellId, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(cellId);
  }

  const sortedOrder = [];
  while (queue.length > 0) {
    const u = queue.shift();
    sortedOrder.push(u);

    const neighbors = depGraph.get(u) || new Set();
    for (const v of neighbors) {
      inDegree.set(v, inDegree.get(v) - 1);
      if (inDegree.get(v) === 0) {
        queue.push(v);
      }
    }
  }

  // Reverse so leaf dependencies execute before parent procedures
  const executionOrder = [...sortedOrder].reverse();

  // Construct step descriptors and verify physical effectors
  const steps = executionOrder.map((cellId, index) => {
    const c = activeCells.get(cellId);
    let effectorPath = null;
    let effectorExists = false;

    if (c.effector) {
      effectorPath = join(paths(rootPath).base, c.effector);
      effectorExists = existsSync(effectorPath);
    }

    return {
      step: index + 1,
      id: c.id,
      hook: c.hook,
      type: c.type,
      effector: c.effector || null,
      effectorPath,
      effectorExists,
      dependencies: Array.from(depGraph.get(c.id) || []),
      effectivePotential: Number((effectivePotentials.get(c.id) || 0.5).toFixed(4)),
      isRoot: c.id === rootCellId,
    };
  });

  return {
    rootCellId,
    totalSteps: steps.length,
    steps,
    isFullyExecutable: steps.every((s) => !s.effector || s.effectorExists),
  };
}

/**
 * Autonomous Synaptic Pruning upon runtime failure.
 * Weakens coupling strength along the path that caused execution error.
 *
 * @param {string} parentId
 * @param {string} failedChildId
 * @param {import("./synaptic_network.js").SynapticNetwork} network
 * @returns {boolean} True if link was pruned completely
 */
export function pruneFailedLink(parentId, failedChildId, network) {
  const parent = network.getCell(parentId);
  if (!parent) return false;
  return parent.pruneDendrite(failedChildId, 0.6);
}
