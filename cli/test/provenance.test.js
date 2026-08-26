import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  initProvenanceSchema,
  addProvenanceEdge,
  getProvenanceEdges,
  traceDecisionProvenance,
  formatProvenanceTree,
} from "../src/provenance.js";

function setupTestDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE cells(
      id TEXT PRIMARY KEY, type TEXT, scope TEXT, hook TEXT, body TEXT,
      tags_str TEXT, source TEXT, confidence REAL, created TEXT, file TEXT, effector TEXT
    );
  `);
  initProvenanceSchema(db);
  return db;
}

test("addProvenanceEdge & getProvenanceEdges: persists and queries typed edges", () => {
  const db = setupTestDb();
  addProvenanceEdge(db, "B-0042", "MongoDB", "rejected", { reason: "lacks strict multi-doc ACID transactions" });
  addProvenanceEdge(db, "B-0042", "SOC2-Compliance", "constrained_by", {});

  const edges = getProvenanceEdges(db, "B-0042", "outgoing");
  assert.equal(edges.length, 2);

  const rejected = edges.find((e) => e.edge_type === "rejected");
  assert.equal(rejected.to_id, "MongoDB");
  assert.equal(rejected.metadata.reason, "lacks strict multi-doc ACID transactions");
});

test("traceDecisionProvenance: builds complete causal provenance tree", () => {
  const db = setupTestDb();
  db.prepare(`
    INSERT INTO cells(id, type, scope, hook, body, confidence, created)
    VALUES ('B-0042', 'decision', 'payments', 'Adopt PostgreSQL for ACID compliance in payments', '...', 0.95, '2024-01-15')
  `).run();
  db.prepare(`
    INSERT INTO cells(id, type, scope, hook, body, confidence, created)
    VALUES ('B-0010', 'decision', 'payments', 'Initial Mongo setup', '...', 0.7, '2022-01-01')
  `).run();

  addProvenanceEdge(db, "B-0042", "MongoDB", "rejected", { reason: "insufficient consistency guarantees" });
  addProvenanceEdge(db, "B-0042", "B-0010", "supersedes", { note: "Replaced MongoDB collection with Postgres relational schema" });

  const trace = traceDecisionProvenance(db, "B-0042");
  assert.equal(trace.found, true);
  assert.equal(trace.cell.id, "B-0042");
  assert.equal(trace.cell.status, "active");
  assert.equal(trace.provenance.rejected.length, 1);
  assert.equal(trace.provenance.rejected[0].reason, "insufficient consistency guarantees");
  assert.equal(trace.provenance.supersedes.length, 1);
  assert.equal(trace.provenance.supersedes[0].target.id, "B-0010");

  const formatted = formatProvenanceTree(trace);
  assert.match(formatted, /Decision Provenance Tree for B-0042/);
  assert.match(formatted, /Rejected Alternatives:/);
  assert.match(formatted, /insufficient consistency guarantees/);
  assert.match(formatted, /Replaces Older Decisions/);
});
