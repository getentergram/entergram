// LinUCB Contextual Bandit for Entergram Memory Recall & Reranking.
// Re-ranks candidate memory cells using a 12-dimensional decision-context feature vector.
// Balances exploitation (known high-resolution cells) with exploration (UCB bonus).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../lib.js";

export const FEATURE_DIM = 12;

// Matrix helpers for d=12
function createIdentity(dim) {
  const m = [];
  for (let i = 0; i < dim; i++) {
    const row = new Float64Array(dim);
    row[i] = 1.0;
    m.push(row);
  }
  return m;
}

function createZeroVector(dim) {
  return new Float64Array(dim);
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Gauss-Jordan matrix inversion for d=12
function invertMatrix(matrix) {
  const n = matrix.length;
  const A = matrix.map((row) => Array.from(row));
  const I = createIdentity(n).map((row) => Array.from(row));

  for (let i = 0; i < n; i++) {
    let pivot = A[i][i];
    let pivotRow = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(A[r][i]) > Math.abs(pivot)) {
        pivot = A[r][i];
        pivotRow = r;
      }
    }

    if (Math.abs(pivot) < 1e-12) {
      pivot = 1e-6; // regularization for singularity safety
    }

    if (pivotRow !== i) {
      [A[i], A[pivotRow]] = [A[pivotRow], A[i]];
      [I[i], I[pivotRow]] = [I[pivotRow], I[i]];
    }

    const scale = 1.0 / A[i][i];
    for (let j = 0; j < n; j++) {
      A[i][j] *= scale;
      I[i][j] *= scale;
    }

    for (let r = 0; r < n; r++) {
      if (r !== i) {
        const factor = A[r][i];
        for (let j = 0; j < n; j++) {
          A[r][j] -= factor * A[i][j];
          I[r][j] -= factor * I[i][j];
        }
      }
    }
  }

  return I.map((row) => new Float64Array(row));
}

function matVecMul(M, v) {
  const out = new Float64Array(M.length);
  for (let i = 0; i < M.length; i++) {
    out[i] = dot(M[i], v);
  }
  return out;
}

/**
 * Extracts a 12-dimensional context feature vector for a candidate cell.
 *
 * @param {object} cell - Candidate cell
 * @param {object} context - Query context { query, bm25Score, cosineSim, dynamicConfidence, inDegree, citedCount, sessionSeen }
 * @returns {Float64Array} 12-dimensional feature vector
 */
export function extractFeatures(cell, context = {}) {
  const x = new Float64Array(FEATURE_DIM);

  // 1. BM25 score (normalized roughly 0..1)
  const rawBm25 = context.bm25Score ?? 0.5;
  x[0] = Math.max(0, Math.min(1.0, rawBm25 > 0 ? 1.0 / (1.0 + rawBm25 * 0.1) : 0.5));

  // 2. Cosine semantic similarity
  x[1] = Math.max(0, Math.min(1.0, context.cosineSim ?? 0.5));

  // 3. Temporal validity dynamic confidence (Engine 3)
  x[2] = Math.max(0, Math.min(1.0, context.dynamicConfidence ?? (cell.confidence ?? 1.0)));

  // 4. Recency score (days decay)
  const ageDays = context.ageDays ?? 30;
  x[3] = Math.exp(-ageDays / 365.0);

  // 5. Historical citation count (log normalized)
  const cites = context.citedCount ?? 0;
  x[4] = Math.min(1.0, Math.log(1 + cites) / 4.0);

  // 6. Resolution rate (fraction of successful outcomes when cited)
  x[5] = Math.max(0, Math.min(1.0, context.resolutionRate ?? 0.8));

  // 7. Type match score
  const qLower = (context.query || "").toLowerCase();
  const isGotchaIntent = /bug|error|fail|break|avoid|warn|revert|why.*not/i.test(qLower);
  const isProcIntent = /how|setup|deploy|run|script|step|create|migrate/i.test(qLower);
  if (cell.type === "gotcha" && isGotchaIntent) x[6] = 1.0;
  else if (cell.type === "procedure" && isProcIntent) x[6] = 1.0;
  else if (cell.type === "decision") x[6] = 0.8;
  else x[6] = 0.5;

  // 8. Scope match
  const scope = (cell.scope || "global").toLowerCase();
  const contextScope = (context.scope || "").toLowerCase();
  x[7] = (contextScope && scope === contextScope) ? 1.0 : (scope === "global" ? 0.6 : 0.4);

  // 9. Gotcha amygdala boost
  x[8] = cell.type === "gotcha" ? 1.0 : 0.0;

  // 10. Provenance graph centrality / in-degree
  const inDegree = context.inDegree ?? 0;
  x[9] = Math.min(1.0, Math.log(1 + inDegree) / 3.0);

  // 11. Session redundancy penalty (-1 if already served in this session)
  x[10] = context.sessionSeen ? -1.0 : 0.0;

  // 12. Constant bias
  x[11] = 1.0;

  return x;
}

export class LinUCBBandit {
  constructor(dim = FEATURE_DIM, alpha = 0.8) {
    this.dim = dim;
    this.alpha = alpha; // Exploration coefficient
    this.A = createIdentity(dim);
    this.b = createZeroVector(dim);
  }

  /**
   * Scores a context feature vector using exploitation + exploration bonus.
   *
   * UCB = x^T θ̂ + α √(x^T A^{-1} x)
   *
   * @param {Float64Array} x
   * @returns {number}
   */
  score(x) {
    const A_inv = invertMatrix(this.A);
    const theta_hat = matVecMul(A_inv, this.b);
    const exploitation = dot(theta_hat, x);
    const varTerm = dot(x, matVecMul(A_inv, x));
    const exploration = this.alpha * Math.sqrt(Math.max(0, varTerm));
    return exploitation + exploration;
  }

  /**
   * Update bandit model with observed reward.
   *
   * @param {Float64Array} x
   * @param {number} reward
   */
  update(x, reward) {
    for (let i = 0; i < this.dim; i++) {
      for (let j = 0; j < this.dim; j++) {
        this.A[i][j] += x[i] * x[j];
      }
      this.b[i] += reward * x[i];
    }
  }

  /** Persist bandit state */
  save(root) {
    const { base } = paths(root);
    const p = join(base, "rl", "bandit_state.json");
    const payload = {
      dim: this.dim,
      alpha: this.alpha,
      A: this.A.map((r) => Array.from(r)),
      b: Array.from(this.b),
      updated: new Date().toISOString(),
    };
    writeFileSync(p, JSON.stringify(payload, null, 2), "utf8");
  }

  /** Load or instantiate bandit */
  static load(root, alpha = 0.8) {
    const { base } = paths(root);
    const p = join(base, "rl", "bandit_state.json");
    const bandit = new LinUCBBandit(FEATURE_DIM, alpha);
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, "utf8"));
        if (raw.dim === FEATURE_DIM && raw.A && raw.b) {
          bandit.alpha = raw.alpha ?? alpha;
          bandit.A = raw.A.map((r) => new Float64Array(r));
          bandit.b = new Float64Array(raw.b);
        }
      } catch {
        // Fall back to fresh bandit
      }
    }
    return bandit;
  }
}
