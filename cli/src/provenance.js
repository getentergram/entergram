// Decision Provenance Graph for Entergram.
// Tracks causal decision trees: Problem -> Alternatives Evaluated -> Rejected Options (with why)
// -> Chosen Architecture -> Constraints -> Superseded/Superseding Chains.

import { classifyTrust, scanSuspiciousContent, trustFlags, UNTRUSTED_DATA_NOTICE } from "./safety.js";

export const EDGE_TYPES = [
  "considered",
  "rejected",
  "chosen",
  "supersedes",
  "constrained_by",
  "caused_by",
  "related",
  // Auto-ingestion origin edge (issue #23): the `learn` pipeline emits one of these
  // per cell at reindex time, pointing from the cell to the commit/PR/issue/doc
  // section it was learned from. Distinct from "related", which is reserved for a
  // human's hand-written [[B-NNNN]] link between two cells -- the two coexist
  // without conflicting since they're different edge_type values on the same cell.
  "derived_from",
];

/**
 * Derive the provenance-edge target for a cell's origin, from the `source` metadata
 * the learn pipeline (learnGit/learnDocs/learnPRs/learnIssues) stamps onto every
 * auto-learned cell. Returns null for a hand-written cell (no source) or a source
 * shape this doesn't recognize, so callers can skip emitting an edge.
 *
 * @param {string|undefined} sourceStr - raw `source` frontmatter value (a JSON string)
 * @returns {{ toId: string, metadata: object } | null}
 */
export function originEdgeFor(sourceStr) {
  if (!sourceStr) return null;
  let src;
  try { src = JSON.parse(sourceStr); } catch { return null; }
  if (!src || typeof src !== "object" || !src.kind) return null;

  switch (src.kind) {
    case "commit":
      if (!src.sha) return null;
      return {
        toId: `commit:${src.sha}`,
        metadata: { kind: "commit", sha: src.sha, author: src.author, date: src.date },
      };
    case "pr":
    case "issue": {
      const num = (src.ref || "").replace(/^#/, "");
      if (!num) return null;
      return {
        toId: `${src.kind}:${num}`,
        metadata: { kind: src.kind, ref: src.ref, author: src.author, date: src.date, url: src.url },
      };
    }
    case "doc":
      if (!src.path) return null;
      return {
        toId: `doc:${src.path}${src.heading ? `#${src.heading}` : ""}`,
        metadata: { kind: "doc", path: src.path, heading: src.heading },
      };
    default:
      return null;
  }
}

/**
 * Ensures decision graph tables exist in the SQLite database.
 *
 * @param {import("better-sqlite3").Database} db
 */
export function initProvenanceSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS decision_graph(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id TEXT NOT NULL,
      to_id TEXT NOT NULL,
      edge_type TEXT NOT NULL,
      metadata TEXT,
      created TEXT NOT NULL,
      UNIQUE(from_id, to_id, edge_type)
    );
    CREATE INDEX IF NOT EXISTS idx_dg_from ON decision_graph(from_id);
    CREATE INDEX IF NOT EXISTS idx_dg_to ON decision_graph(to_id);
    CREATE INDEX IF NOT EXISTS idx_dg_type ON decision_graph(edge_type);
  `);
}

/**
 * Add or update a typed provenance edge.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {string} fromId - Source cell ID
 * @param {string} toId - Target cell ID or external reference
 * @param {string} edgeType - One of EDGE_TYPES
 * @param {object} [metadata={}] - Optional metadata (e.g. rejection reason)
 */
export function addProvenanceEdge(db, fromId, toId, edgeType, metadata = {}) {
  if (!EDGE_TYPES.includes(edgeType)) {
    throw new Error(`Invalid edge type "${edgeType}". Expected one of: ${EDGE_TYPES.join(", ")}`);
  }
  initProvenanceSchema(db);
  const stmt = db.prepare(`
    INSERT INTO decision_graph(from_id, to_id, edge_type, metadata, created)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(from_id, to_id, edge_type) DO UPDATE SET
      metadata = excluded.metadata,
      created = excluded.created
  `);
  stmt.run(fromId, toId, edgeType, JSON.stringify(metadata), new Date().toISOString());
}

/**
 * Query all typed edges for a cell.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {string} cellId
 * @param {"outgoing"|"incoming"|"all"} [direction="all"]
 * @returns {Array<{ from_id: string, to_id: string, edge_type: string, metadata: object, created: string }>}
 */
export function getProvenanceEdges(db, cellId, direction = "all") {
  initProvenanceSchema(db);
  let rows = [];
  if (direction === "outgoing" || direction === "all") {
    const outStmt = db.prepare("SELECT * FROM decision_graph WHERE from_id = ?");
    rows = rows.concat(outStmt.all(cellId));
  }
  if (direction === "incoming" || direction === "all") {
    const inStmt = db.prepare("SELECT * FROM decision_graph WHERE to_id = ?");
    rows = rows.concat(inStmt.all(cellId));
  }
  return rows.map((r) => ({
    ...r,
    metadata: r.metadata ? JSON.parse(r.metadata) : {},
  }));
}

/**
 * Traces the complete causal provenance tree for a decision.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {string} cellId
 * @returns {object} Provenance trace structure
 */
export function traceDecisionProvenance(db, cellId) {
  initProvenanceSchema(db);
  const cell = db.prepare("SELECT * FROM cells WHERE id = ?").get(cellId);
  if (!cell) {
    return { found: false, id: cellId, error: `Cell "${cellId}" not found in database.` };
  }

  const outgoing = db.prepare("SELECT * FROM decision_graph WHERE from_id = ?").all(cellId);
  const incoming = db.prepare("SELECT * FROM decision_graph WHERE to_id = ?").all(cellId);

  const getCellMeta = (id) => {
    const row = db.prepare("SELECT id, hook, type, confidence, scope, source, body FROM cells WHERE id = ?").get(id);
    if (!row) return { id, hook: `[External or uncached ref: ${id}]`, type: "unknown" };
    return {
      ...row,
      trust: classifyTrust(row.source),
      suspicious: scanSuspiciousContent(`${row.hook || ""}\n${row.body || ""}`).length > 0,
    };
  };

  const parseMeta = (m) => {
    try { return m ? JSON.parse(m) : {}; } catch { return {}; }
  };

  const considered = outgoing.filter((e) => e.edge_type === "considered").map((e) => ({
    target: getCellMeta(e.to_id),
    metadata: parseMeta(e.metadata),
  }));

  const rejected = outgoing.filter((e) => e.edge_type === "rejected").map((e) => ({
    target: getCellMeta(e.to_id),
    reason: parseMeta(e.metadata)?.reason || "No explicit reason specified",
  }));

  const constraints = outgoing.filter((e) => e.edge_type === "constrained_by").map((e) => ({
    target: getCellMeta(e.to_id),
    constraint: parseMeta(e.metadata)?.constraint || e.to_id,
  }));

  const supersedes = outgoing.filter((e) => e.edge_type === "supersedes").map((e) => ({
    target: getCellMeta(e.to_id),
    metadata: parseMeta(e.metadata),
  }));

  const supersededBy = incoming.filter((e) => e.edge_type === "supersedes").map((e) => ({
    source: getCellMeta(e.from_id),
    metadata: parseMeta(e.metadata),
  }));

  const causedBy = outgoing.filter((e) => e.edge_type === "caused_by").map((e) => ({
    target: getCellMeta(e.to_id),
    metadata: parseMeta(e.metadata),
  }));

  // Auto-ingestion origin (issue #23): commit/PR/issue/doc the cell was learned from.
  // The target is an external reference (a commit SHA, a doc path), not another cell,
  // so its descriptive fields live directly in the edge's metadata instead of a cells row.
  const derivedFrom = outgoing.filter((e) => e.edge_type === "derived_from").map((e) => ({
    ref: e.to_id,
    ...parseMeta(e.metadata),
  }));

  const isActive = supersededBy.length === 0 && Number(cell.confidence) >= 0.3;

  return {
    found: true,
    cell: {
      id: cell.id,
      hook: cell.hook,
      type: cell.type,
      scope: cell.scope,
      confidence: cell.confidence,
      status: isActive ? "active" : supersededBy.length > 0 ? "superseded" : "decayed",
      created: cell.created,
      effector: cell.effector,
      trust: classifyTrust(cell.source),
      suspicious: scanSuspiciousContent(`${cell.hook || ""}\n${cell.body || ""}`).length > 0,
    },
    provenance: {
      considered,
      rejected,
      constraints,
      supersedes,
      supersededBy,
      causedBy,
      derivedFrom,
    },
  };
}

/** Render one derived_from edge's metadata as a short human-readable origin description. */
function describeOrigin(d) {
  if (d.kind === "commit") return `commit ${d.sha}${d.author ? ` by ${d.author}` : ""}${d.date ? ` (${d.date})` : ""}`;
  if (d.kind === "pr") return `PR ${d.ref}${d.date ? ` (${d.date})` : ""}`;
  if (d.kind === "issue") return `issue ${d.ref}${d.date ? ` (${d.date})` : ""}`;
  if (d.kind === "doc") return `doc ${d.path}${d.heading ? ` § ${d.heading}` : ""}`;
  return d.ref;
}

/**
 * Format a provenance trace into a readable terminal ASCII tree.
 *
 * @param {object} trace - Output of traceDecisionProvenance
 * @returns {string} Formatted tree
 */
export function formatProvenanceTree(trace) {
  if (!trace.found) return `Trace Error: ${trace.error}`;

  const lines = [];
  const c = trace.cell;
  const statusIcon = c.status === "active" ? "🟢 ACTIVE" : c.status === "superseded" ? "🔴 SUPERSEDED" : "🟡 DECAYED";

  lines.push(`Decision Provenance Tree for ${c.id} (${statusIcon})`);
  lines.push(` Hook: "${c.hook}"`);
  lines.push(` Scope: ${c.scope} | Type: ${c.type} | Conf: ${c.confidence} | Trust: ${c.trust}${c.suspicious ? " | ⚠ possible-injection-phrasing" : ""}`);
  lines.push("");

  const p = trace.provenance;

  if (p.supersededBy.length > 0) {
    lines.push("  ⚠️ SUPERSEDED BY:");
    for (const s of p.supersededBy) {
      lines.push(`    └── 🔄 ${s.source.id}: "${s.source.hook}"${trustFlags(s.source)}`);
    }
    lines.push("");
  }

  if (p.supersedes.length > 0) {
    lines.push("  Replaces Older Decisions (Supersedes):");
    for (const s of p.supersedes) {
      lines.push(`    └── ⏳ ${s.target.id}: "${s.target.hook}"${trustFlags(s.target)}`);
    }
  }

  if (p.rejected.length > 0) {
    lines.push("  Rejected Alternatives:");
    for (const r of p.rejected) {
      lines.push(`    └── ❌ ${r.target.id || r.target.hook}: ${r.target.hook}${trustFlags(r.target)}`);
      lines.push(`        Reason: "${r.reason}"`);
    }
  } else if (p.considered.length > 0) {
    lines.push("  Considered Alternatives:");
    for (const alt of p.considered) {
      lines.push(`    └── 🔍 ${alt.target.id}: "${alt.target.hook}"${trustFlags(alt.target)}`);
    }
  }

  if (p.constraints.length > 0) {
    lines.push("  Governing Constraints:");
    for (const cons of p.constraints) {
      lines.push(`    └── 🛡️ ${cons.target.id || cons.constraint}: "${cons.target.hook || cons.constraint}"${trustFlags(cons.target)}`);
    }
  }

  if (p.causedBy.length > 0) {
    lines.push("  Caused By Incidents/Gotchas:");
    for (const cb of p.causedBy) {
      lines.push(`    └── ⚠️ ${cb.target.id}: "${cb.target.hook}"${trustFlags(cb.target)}`);
    }
  }

  if (p.derivedFrom.length > 0) {
    lines.push("  Learned From:");
    for (const d of p.derivedFrom) {
      lines.push(`    └── 📜 ${describeOrigin(d)}`);
    }
  }

  lines.push("", UNTRUSTED_DATA_NOTICE);

  return lines.join("\n");
}
