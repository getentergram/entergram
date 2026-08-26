import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDecisionEmbeddingText,
  embedLocalDense,
  cosineSimilarity,
  serializeVector,
  deserializeVector,
  embedQuery,
  embedCell,
} from "../src/embeddings.js";

test("buildDecisionEmbeddingText: augments decision with polarity and constraints", () => {
  const cell = {
    id: "B-0042",
    type: "decision",
    hook: "Use PostgreSQL for ACID transactions in payments",
    what: "Adopted Postgres for payments service",
    why: "Need reliable transactions and ACID guarantees",
    outcome: "Migrated from MongoDB cleanly",
    tags: ["payments", "db", "postgres"],
    scope: "backend",
    confidence: 0.9,
  };

  const edges = [
    { edge_type: "rejected", to_id: "MongoDB", metadata: { reason: "lacks strict multi-doc ACID" } },
    { edge_type: "constrained_by", to_id: "SOC2" },
  ];

  const text = buildDecisionEmbeddingText(cell, edges);
  assert.match(text, /DECISION_CHOSEN: Use PostgreSQL/);
  assert.match(text, /REJECTED_ALTERNATIVES: MongoDB \(lacks strict multi-doc ACID\)/);
  assert.match(text, /CONSTRAINED_BY: SOC2/);
  assert.match(text, /DOMAINS: payments, db, postgres/);
});

test("embedLocalDense: generates normalized fixed-dimension vector", () => {
  const vec = embedLocalDense("PostgreSQL ACID transaction database");
  assert.equal(vec.length, 64);

  // Verify L2 normalization: sum(v_i^2) ≈ 1.0
  let normSq = 0;
  for (let i = 0; i < vec.length; i++) normSq += vec[i] * vec[i];
  assert.ok(Math.abs(Math.sqrt(normSq) - 1.0) < 1e-4);
});

test("cosineSimilarity: computes high similarity for semantically related texts", () => {
  const v1 = embedQuery("PostgreSQL database migrations");
  const v2 = embedQuery("Postgres db schema migration");
  const v3 = embedQuery("CSS flexbox alignment styling UI");

  const simRel = cosineSimilarity(v1, v2);
  const simUnrel = cosineSimilarity(v1, v3);

  assert.ok(simRel > simUnrel, `Expected related similarity (${simRel}) > unrelated similarity (${simUnrel})`);
});

test("serializeVector and deserializeVector: preserves float values", () => {
  const vec = new Float64Array([0.12345, -0.67891, 0.99999]);
  const str = serializeVector(vec);
  const recovered = deserializeVector(str);

  assert.equal(recovered.length, 3);
  assert.ok(Math.abs(recovered[0] - 0.12345) < 1e-4);
  assert.ok(Math.abs(recovered[1] - -0.67891) < 1e-4);
  assert.ok(Math.abs(recovered[2] - 0.99999) < 1e-4);
});
