// Vector embedding module for Entergram.
// Provides decision-augmented text preprocessing, local deterministic dense embedding,
// and optional cloud embedding (Gemini) with cosine similarity ranking.

import { createHash } from "node:crypto";

const EMBEDDING_DIM = 64; // Compact, fast dense vector for local semantic hashing & TF-IDF

/**
 * Builds decision-augmented text before embedding.
 * Embeds polarity, constraints, trade-offs, scope, and status to ensure
 * decision semantics are captured beyond naive keyword matching.
 *
 * @param {object} cell - The cell object (frontmatter + body)
 * @param {Array<object>} [provenanceEdges] - Optional provenance graph edges
 * @returns {string} Augmented text representation
 */
export function buildDecisionEmbeddingText(cell, provenanceEdges = []) {
  const parts = [];
  const type = cell.type || "reference";
  const status = cell.status || (cell.confidence < 0.6 ? "draft" : "active");

  if (type === "decision") {
    parts.push(`DECISION_CHOSEN: ${cell.hook || cell.what || ""}`);
    const rejected = provenanceEdges.filter((e) => e.edge_type === "rejected");
    if (rejected.length > 0) {
      parts.push(`REJECTED_ALTERNATIVES: ${rejected.map((r) => `${r.to_id} (${r.metadata?.reason || "unspecified"})`).join(", ")}`);
    }
    const constraints = provenanceEdges.filter((e) => e.edge_type === "constrained_by");
    if (constraints.length > 0) {
      parts.push(`CONSTRAINED_BY: ${constraints.map((c) => c.to_id).join(", ")}`);
    }
  } else if (type === "gotcha") {
    parts.push(`GOTCHA_WARNING: ${cell.hook || cell.what || ""}`);
    parts.push(`AVOID_REGRESSION: true`);
  } else if (type === "procedure") {
    parts.push(`PROCEDURE_ACTION: ${cell.hook || cell.what || ""}`);
    if (cell.effector) parts.push(`EFFECTOR_SCRIPT: ${cell.effector}`);
  } else {
    parts.push(`FACT_SPEC: ${cell.hook || cell.what || ""}`);
  }

  if (cell.tags && cell.tags.length) {
    const tags = Array.isArray(cell.tags) ? cell.tags : String(cell.tags).split(" ");
    parts.push(`DOMAINS: ${tags.join(", ")}`);
  }

  parts.push(`SCOPE: ${cell.scope || "global"}`);
  parts.push(`STATUS: ${status}`);
  if (cell.confidence != null) parts.push(`CONFIDENCE: ${cell.confidence}`);
  if (cell.what) parts.push(`WHAT: ${cell.what}`);
  if (cell.why) parts.push(`WHY: ${cell.why}`);
  if (cell.outcome) parts.push(`OUTCOME: ${cell.outcome}`);
  if (cell.body && !cell.what) parts.push(cell.body);

  return parts.join("\n");
}

/**
 * Deterministic local dense embedding using hashing-trick subword n-grams and term weighting.
 * Produces an L2-normalized float array of fixed dimension.
 *
 * @param {string} text - Input text
 * @param {number} [dim=EMBEDDING_DIM] - Embedding dimension
 * @returns {Float64Array} Normalized embedding vector
 */
export function embedLocalDense(text, dim = EMBEDDING_DIM) {
  const vec = new Float64Array(dim);
  if (!text || typeof text !== "string") return vec;

  const normalized = text.toLowerCase().replace(/[^a-z0-9_\-\s]/g, " ");
  const tokens = normalized.split(/\s+/).filter((t) => t.length > 1);

  // Extract word tokens and character 3-grams
  const terms = [];
  for (const t of tokens) {
    terms.push(t);
    if (t.length >= 4) {
      for (let i = 0; i <= t.length - 3; i++) {
        terms.push(t.slice(i, i + 3));
      }
    }
  }

  // Weight decision keywords
  const KEYWORD_BOOSTS = {
    decision_chosen: 3.0,
    gotcha_warning: 3.5,
    procedure_action: 3.0,
    rejected_alternatives: 2.5,
    avoid_regression: 3.0,
    constrained_by: 2.0,
    status: 1.5,
    why: 2.0,
    outcome: 1.5,
  };

  for (const term of terms) {
    const hash = createHash("md5").update(term).digest();
    const bucket = hash.readUInt32LE(0) % dim;
    const sign = (hash.readUInt8(4) % 2 === 0) ? 1 : -1;
    const weight = KEYWORD_BOOSTS[term] || 1.0;
    vec[bucket] += sign * weight;
  }

  // L2 normalization
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) vec[i] /= norm;
  }

  return vec;
}

/**
 * Computes cosine similarity between two L2-normalized or arbitrary vectors.
 *
 * @param {Array<number>|Float64Array} vecA
 * @param {Array<number>|Float64Array} vecB
 * @returns {number} Cosine similarity in range [-1.0, 1.0] (typically 0.0..1.0)
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return Math.max(0, dot / denom);
}

/**
 * Embed a query or text string into a vector.
 *
 * @param {string} text - Query or text to embed
 * @returns {Float64Array} Embedding vector
 */
export function embedQuery(text) {
  return embedLocalDense(text, EMBEDDING_DIM);
}

/**
 * Embed a memory cell into a vector using decision-augmented representation.
 *
 * @param {object} cell - Cell object
 * @param {Array<object>} [edges] - Optional provenance edges
 * @returns {Float64Array} Embedding vector
 */
export function embedCell(cell, edges = []) {
  const augmented = buildDecisionEmbeddingText(cell, edges);
  return embedLocalDense(augmented, EMBEDDING_DIM);
}

/**
 * Convert a float vector into a compact JSON string for SQLite storage.
 *
 * @param {Float64Array|Array<number>} vec
 * @returns {string} JSON array string
 */
export function serializeVector(vec) {
  return JSON.stringify(Array.from(vec).map((v) => Number(v.toFixed(5))));
}

/**
 * Parse a vector from SQLite storage.
 *
 * @param {string} str - JSON string
 * @returns {Float64Array}
 */
export function deserializeVector(str) {
  try {
    const arr = JSON.parse(str);
    return new Float64Array(arr);
  } catch {
    return new Float64Array(EMBEDDING_DIM);
  }
}
