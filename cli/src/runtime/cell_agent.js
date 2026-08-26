// Cognitive Brain Cell Micro-Agent for Entergram.
// Each cell acts as an active synaptic unit that evaluates context stimulation,
// maintains plasticity rates, tracks supervisor mutations, and fires recursive dendritic links.

import { embedCell, deserializeVector, serializeVector } from "../embeddings.js";

export class BrainCell {
  constructor(data = {}) {
    this.id = data.id || "B-0000";
    this.type = data.type || "reference";
    this.hook = data.hook || data.what || "";
    this.body = data.body || "";
    this.what = data.what || data.hook || "";
    this.why = data.why || "";
    this.outcome = data.outcome || "";
    this.scope = data.scope || "global";
    this.tags = Array.isArray(data.tags) ? data.tags : (data.tags_str ? data.tags_str.split(" ") : []);
    this.status = data.status || (Number(data.confidence) < 0.6 ? "draft" : "active");
    this.confidence = data.confidence == null ? 1.0 : Number(data.confidence);
    this.created = data.created || new Date().toISOString().slice(0, 10);
    this.file = data.file || "";
    this.effector = data.effector || "";

    // Synaptic parameters
    this.threshold = data.threshold != null ? Number(data.threshold) : (this.status === "draft" ? 0.65 : 0.45);
    this.plasticity = data.plasticity != null ? Number(data.plasticity) : 0.15; // η
    this.resolutions = data.resolutions ? Number(data.resolutions) : 0;
    this.failures = data.failures ? Number(data.failures) : 0;

    // Trigger weight vector
    if (data.weights) {
      this.weights = typeof data.weights === "string" ? deserializeVector(data.weights) : new Float64Array(data.weights);
    } else {
      this.weights = embedCell(this);
    }

    // RLM Dendritic connections: targetCellId -> couplingStrength (γ_ij)
    this.dendrites = new Map();
    if (data.dendrites) {
      const dendriteEntries = typeof data.dendrites === "string" ? JSON.parse(data.dendrites) : data.dendrites;
      for (const [k, v] of Object.entries(dendriteEntries)) {
        this.dendrites.set(k, Number(v));
      }
    }

    // Supervisor Mutation History
    this.mutationHistory = Array.isArray(data.mutationHistory) ? data.mutationHistory : [];
  }

  /**
   * Evaluates sensory activation potential in sub-millisecond time.
   * a_i = σ(w_i · x - θ_i)
   *
   * @param {Float64Array|Array<number>} contextVector - Query / AST context vector
   * @returns {number} Activation potential in range [0.0, 1.0]
   */
  evaluateActivation(contextVector) {
    if (this.status === "superseded" || this.status === "deprecated") {
      return 0.0;
    }
    if (!this.weights || !contextVector || this.weights.length !== contextVector.length) {
      return 0.5;
    }

    let dot = 0;
    for (let i = 0; i < this.weights.length; i++) {
      dot += this.weights[i] * contextVector[i];
    }

    // Amygdala boost for gotcha cells when encountering negative/warning triggers
    const typeBias = this.type === "gotcha" ? 0.15 : 0.0;
    const z = (dot + typeBias) - this.threshold;
    const potential = 1.0 / (1.0 + Math.exp(-4.0 * z)); // Steeper sigmoid slope
    return Number(Math.max(0.0, Math.min(1.0, potential)).toFixed(4));
  }

  /**
   * Apply supervisor difference gradient when an engineer or reviewer updates the cell.
   *
   * @param {object} newContent - Updated cell fields { hook, why, what, outcome }
   * @param {Float64Array} [contextVector] - Context vector that prompted the modification
   * @param {number} [authorAuthority=1.0] - Supervisor reputation weight
   */
  applySupervisorGradient(newContent, contextVector = null, authorAuthority = 1.0) {
    const delta = {
      timestamp: new Date().toISOString(),
      authorAuthority,
      previousHook: this.hook,
      newHook: newContent.hook || this.hook,
      previousWhy: this.why,
      newWhy: newContent.why || this.why,
      reason: newContent.reason || "Supervisor override",
    };
    this.mutationHistory.push(delta);

    if (newContent.hook) this.hook = newContent.hook;
    if (newContent.what) this.what = newContent.what;
    if (newContent.why) this.why = newContent.why;
    if (newContent.outcome) this.outcome = newContent.outcome;

    // Shift trigger vector towards the context vector that prompted correction
    if (contextVector && this.weights.length === contextVector.length) {
      const shiftRate = this.plasticity * authorAuthority;
      for (let i = 0; i < this.weights.length; i++) {
        this.weights[i] += shiftRate * (contextVector[i] - this.weights[i]);
      }
      // Re-normalize vector
      let norm = 0;
      for (let i = 0; i < this.weights.length; i++) norm += this.weights[i] * this.weights[i];
      norm = Math.sqrt(norm);
      if (norm > 0) {
        for (let i = 0; i < this.weights.length; i++) this.weights[i] /= norm;
      }
    }

    // Metaplasticity stabilization: supervisor validation increases stability and raises threshold
    this.plasticity = Math.max(0.01, this.plasticity * 0.85);
    this.threshold = Math.min(0.80, this.threshold + 0.05 * authorAuthority);
    this.confidence = Math.min(1.0, Math.max(this.confidence, 0.9));
    this.status = "active";
  }

  /**
   * Reinforce connection to child/co-active cell upon runtime success.
   * Δγ_ij = η · reward
   *
   * @param {string} targetId - Child cell ID
   * @param {number} reward - Positive outcome reward
   */
  reinforceDendrite(targetId, reward = 1.0) {
    const current = this.dendrites.get(targetId) ?? 0.5;
    const delta = this.plasticity * Math.max(0, reward);
    const updated = Math.min(1.0, current + delta);
    this.dendrites.set(targetId, Number(updated.toFixed(4)));
    this.resolutions++;
  }

  /**
   * Weaken or prune dendritic connection upon runtime execution failure.
   *
   * @param {string} targetId
   * @param {number} [decayFactor=0.7]
   * @returns {boolean} True if pruned/severed
   */
  pruneDendrite(targetId, decayFactor = 0.7) {
    const current = this.dendrites.get(targetId);
    if (current == null) return false;
    this.failures++;
    const updated = current * decayFactor;
    if (updated < 0.15) {
      this.dendrites.delete(targetId);
      return true; // Link pruned completely
    }
    this.dendrites.set(targetId, Number(updated.toFixed(4)));
    return false;
  }

  /**
   * Serialize cell state for SQLite persistence
   */
  toStateRecord() {
    const dendritesObj = {};
    for (const [k, v] of this.dendrites.entries()) dendritesObj[k] = v;
    return {
      cell_id: this.id,
      threshold: this.threshold,
      plasticity: this.plasticity,
      resolutions: this.resolutions,
      failures: this.failures,
      weights: serializeVector(this.weights),
      dendrites: JSON.stringify(dendritesObj),
      mutation_history: JSON.stringify(this.mutationHistory),
      status: this.status,
      updated: new Date().toISOString(),
    };
  }
}
