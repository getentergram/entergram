// In-Memory Synaptic Network for Entergram.
// Holds active BrainCell micro-agents and performs sub-millisecond tensor excitation,
// dendritic link synchronization, and SQLite persistence.

import { BrainCell } from "./cell_agent.js";
import { embedQuery } from "../embeddings.js";
import { openDb } from "../db.js";

/**
 * Ensures synaptic state tables exist in SQLite.
 *
 * @param {import("better-sqlite3").Database} db
 */
export function initSynapticSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS synaptic_state(
      cell_id TEXT PRIMARY KEY,
      threshold REAL NOT NULL,
      plasticity REAL NOT NULL,
      resolutions INTEGER DEFAULT 0,
      failures INTEGER DEFAULT 0,
      weights TEXT NOT NULL,
      dendrites TEXT NOT NULL,
      mutation_history TEXT,
      status TEXT NOT NULL,
      updated TEXT NOT NULL,
      FOREIGN KEY(cell_id) REFERENCES cells(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_syn_status ON synaptic_state(status);
  `);
}

export class SynapticNetwork {
  constructor() {
    this.cells = new Map(); // id -> BrainCell
  }

  /**
   * Initializes network by reading markdown cells & cached synaptic state from SQLite.
   *
   * @param {string} root - Repository root path
   * @returns {SynapticNetwork}
   */
  static load(root) {
    const network = new SynapticNetwork();
    const db = openDb(root);
    initSynapticSchema(db);

    try {
      const rows = db.prepare(`
        SELECT c.*, s.threshold, s.plasticity, s.resolutions, s.failures,
               s.weights AS synaptic_weights, s.dendrites AS synaptic_dendrites,
               s.mutation_history
        FROM cells c
        LEFT JOIN synaptic_state s ON c.id = s.cell_id
      `).all();

      // Read citation edges from edges table to bootstrap dendrites
      const edges = db.prepare("SELECT from_id, to_id FROM edges").all();
      const edgeMap = new Map();
      for (const e of edges) {
        if (!edgeMap.has(e.from_id)) edgeMap.set(e.from_id, new Set());
        edgeMap.get(e.from_id).add(e.to_id);
      }

      for (const r of rows) {
        const cellData = {
          ...r,
          weights: r.synaptic_weights || null,
          threshold: r.threshold,
          plasticity: r.plasticity,
          resolutions: r.resolutions,
          failures: r.failures,
          mutationHistory: r.mutation_history ? JSON.parse(r.mutation_history) : [],
        };

        // Bootstrap dendrites if not already saved in synaptic_state
        if (r.synaptic_dendrites) {
          cellData.dendrites = r.synaptic_dendrites;
        } else if (edgeMap.has(r.id)) {
          const dendrites = {};
          for (const targetId of edgeMap.get(r.id)) {
            dendrites[targetId] = 0.6; // default initial coupling strength
          }
          cellData.dendrites = dendrites;
        }

        const cell = new BrainCell(cellData);
        network.cells.set(cell.id, cell);
      }
    } finally {
      db.close();
    }

    return network;
  }

  /**
   * Commit all active cell synaptic states back to SQLite.
   *
   * @param {string} root
   */
  save(root) {
    const db = openDb(root);
    initSynapticSchema(db);

    try {
      const stmt = db.prepare(`
        INSERT INTO synaptic_state(cell_id, threshold, plasticity, resolutions, failures, weights, dendrites, mutation_history, status, updated)
        VALUES (@cell_id, @threshold, @plasticity, @resolutions, @failures, @weights, @dendrites, @mutation_history, @status, @updated)
        ON CONFLICT(cell_id) DO UPDATE SET
          threshold = excluded.threshold,
          plasticity = excluded.plasticity,
          resolutions = excluded.resolutions,
          failures = excluded.failures,
          weights = excluded.weights,
          dendrites = excluded.dendrites,
          mutation_history = excluded.mutation_history,
          status = excluded.status,
          updated = excluded.updated
      `);

      const tx = db.transaction(() => {
        for (const cell of this.cells.values()) {
          stmt.run(cell.toStateRecord());
        }
      });
      tx();
    } finally {
      db.close();
    }
  }

  /**
   * Stimulate the entire network in parallel in sub-millisecond execution time.
   *
   * @param {string|Float64Array} queryOrVector
   * @returns {Array<{ cell: BrainCell, potential: number }>}
   */
  stimulate(queryOrVector) {
    const contextVector = typeof queryOrVector === "string" ? embedQuery(queryOrVector) : queryOrVector;
    const activations = [];

    for (const cell of this.cells.values()) {
      const potential = cell.evaluateActivation(contextVector);
      if (potential > 0.1) {
        activations.push({ cell, potential });
      }
    }

    // Sort by activation potential descending
    activations.sort((a, b) => b.potential - a.potential);
    return activations;
  }

  /**
   * Look up cell by ID
   *
   * @param {string} id
   * @returns {BrainCell|null}
   */
  getCell(id) {
    return this.cells.get(id) || null;
  }

  /**
   * Generate network topological statistics
   */
  getStats() {
    let totalDendrites = 0;
    let totalResolutions = 0;
    let totalFailures = 0;
    let avgPlasticity = 0;

    for (const c of this.cells.values()) {
      totalDendrites += c.dendrites.size;
      totalResolutions += c.resolutions;
      totalFailures += c.failures;
      avgPlasticity += c.plasticity;
    }

    const n = this.cells.size;
    return {
      totalCells: n,
      totalDendriticLinks: totalDendrites,
      avgLinksPerCell: n > 0 ? Number((totalDendrites / n).toFixed(2)) : 0,
      totalResolutions,
      totalFailures,
      avgPlasticity: n > 0 ? Number((avgPlasticity / n).toFixed(4)) : 0,
    };
  }
}
