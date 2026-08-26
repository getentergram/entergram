// SQLite/FTS index — a rebuildable cache over the Markdown cells (source of truth).
// Upgraded with Vector Embeddings, Temporal Validity, Decision Provenance, and LinUCB RL Reranking.

import Database from "better-sqlite3";
import { join } from "node:path";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { readCells, paths } from "./lib.js";
import { embedQuery, embedCell, serializeVector, deserializeVector, cosineSimilarity } from "./embeddings.js";
import { computeDynamicConfidence, checkStaleness } from "./temporal.js";
import { initProvenanceSchema, traceDecisionProvenance } from "./provenance.js";
import { initSynapticSchema } from "./runtime/synaptic_network.js";
import { LinUCBBandit, extractFeatures } from "./rl/bandit.js";
import { logTelemetryEvent } from "./rl/telemetry.js";

export function openDb(root) {
  const p = paths(root);
  if (!existsSync(p.base)) mkdirSync(p.base, { recursive: true });
  const db = new Database(join(p.base, "index.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cells(
      id TEXT PRIMARY KEY, type TEXT, scope TEXT, hook TEXT, body TEXT,
      tags_str TEXT, source TEXT, confidence REAL, created TEXT, file TEXT, effector TEXT, status TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS cells_fts USING fts5(id UNINDEXED, hook, body, tags);
    CREATE TABLE IF NOT EXISTS edges(from_id TEXT, to_id TEXT, PRIMARY KEY (from_id, to_id));
    CREATE TABLE IF NOT EXISTS ingest_watermark(source_kind TEXT PRIMARY KEY, count INTEGER, last_run TEXT);
    CREATE TABLE IF NOT EXISTS embeddings(cell_id TEXT PRIMARY KEY, vector TEXT, updated TEXT);
    CREATE TABLE IF NOT EXISTS cell_citations(id INTEGER PRIMARY KEY AUTOINCREMENT, cell_id TEXT NOT NULL, query TEXT, timestamp TEXT NOT NULL, success INTEGER DEFAULT 1);
  `);

  // Migrate legacy tables if missing columns
  try {
    const cols = db.prepare("PRAGMA table_info(cells)").all().map((c) => c.name);
    if (!cols.includes("effector")) db.exec("ALTER TABLE cells ADD COLUMN effector TEXT;");
    if (!cols.includes("status")) db.exec("ALTER TABLE cells ADD COLUMN status TEXT;");
  } catch {
    // Ignore migration error if already exists
  }

  initProvenanceSchema(db);
  initSynapticSchema(db);
  return db;
}

/** state.json isn't derivable from cell content, so mirror it into ingest_watermark rather
 *  than treat SQLite as authoritative for it — state.json stays the real incremental cursor. */
function loadWatermarks(root) {
  const { state } = paths(root);
  if (!existsSync(state)) return [];
  const s = JSON.parse(readFileSync(state, "utf8"));
  return [
    { source_kind: "git", count: (s.seenShas || []).length, last_run: s.lastLearn || null },
    { source_kind: "docs", count: (s.seenDocs || []).length, last_run: s.lastLearn || null },
    { source_kind: "pr", count: (s.seenPRs || []).length, last_run: s.lastLearn || null },
    { source_kind: "issue", count: (s.seenIssues || []).length, last_run: s.lastLearn || null },
  ];
}

/** Rebuild the index from the Markdown cells, computing embeddings & provenance. Returns cell count. */
export function reindex(root) {
  const db = openDb(root);
  const cells = readCells(root);
  const wipe = db.transaction(() => {
    db.exec("DELETE FROM cells; DELETE FROM cells_fts; DELETE FROM edges; DELETE FROM ingest_watermark; DELETE FROM embeddings;");
    const ins = db.prepare(
      "INSERT INTO cells(id,type,scope,hook,body,tags_str,source,confidence,created,file,effector,status) VALUES (@id,@type,@scope,@hook,@body,@tags_str,@source,@confidence,@created,@file,@effector,@status)",
    );
    const fts = db.prepare("INSERT INTO cells_fts(id,hook,body,tags) VALUES (?,?,?,?)");
    const edge = db.prepare("INSERT OR IGNORE INTO edges(from_id,to_id) VALUES (?,?)");
    const embedStmt = db.prepare("INSERT INTO embeddings(cell_id,vector,updated) VALUES (?,?,?)");
    const provStmt = db.prepare(`
      INSERT INTO decision_graph(from_id,to_id,edge_type,metadata,created)
      VALUES (?,?,?,?,?)
      ON CONFLICT(from_id,to_id,edge_type) DO UPDATE SET metadata=excluded.metadata
    `);

    const nowIso = new Date().toISOString();

    for (const c of cells) {
      const tags = (c.tags || []).join(" ");
      const conf = c.confidence == null ? 1 : Number(c.confidence);
      const status = c.status || (conf < 0.6 ? "draft" : "active");

      ins.run({
        id: c.id, type: c.type || "reference", scope: c.scope || "global",
        hook: c.hook || "", body: c.body || "", tags_str: tags,
        source: c.source || "", confidence: conf,
        created: c.created || "", file: c.file, effector: c.effector || "",
        status,
      });
      fts.run(c.id, c.hook || "", c.body || "", tags);

      // Compute and store vector embedding
      const vec = embedCell(c);
      embedStmt.run(c.id, serializeVector(vec), nowIso);

      // Process citations and build initial provenance links
      for (const m of (c.text || "").matchAll(/\[\[(B-\d+)\]\]/g)) {
        if (c.id && m[1]) {
          edge.run(c.id, m[1]);
          provStmt.run(c.id, m[1], "related", JSON.stringify({ context: "cited in text" }), nowIso);
        }
      }
    }

    const wm = db.prepare("INSERT INTO ingest_watermark(source_kind,count,last_run) VALUES (@source_kind,@count,@last_run)");
    for (const row of loadWatermarks(root)) wm.run(row);
  });

  wipe();
  db.close();
  return cells.length;
}

/** Keep the index in step with the cells if it's stale (cheap count check). */
export function ensureIndex(root) {
  const db = openDb(root);
  const indexed = db.prepare("SELECT COUNT(*) n FROM cells").get().n;
  db.close();
  const onDisk = readCells(root).length;
  if (indexed !== onDisk) reindex(root);
}

const est = (s) => Math.ceil((s || "").length / 4);

/** Extractive one-paragraph synthesis over the packed hits — no LLM call, works fully offline. */
function synthesize(query, hits) {
  if (!hits.length) return "";
  const top = hits.slice(0, 5);
  const decisions = top.filter((h) => h.type === "decision");
  const lead = (decisions.length ? decisions : top).map((h) => (h.hook || "").replace(/\.$/, ""));
  const unreviewed = top.filter((h) => h.confidence < 0.6).length;
  return `For "${query}": ${lead.join("; ")}.`
    + (unreviewed ? ` (${unreviewed} of these ${unreviewed === 1 ? "is" : "are"} unreviewed extractions — verify with \`get-entergram review\` before relying on it.)` : "");
}

/** Tokenize a query into the same FTS `MATCH` expression search()/dispatch() both run. */
function ftsMatch(query) {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  return terms.length ? terms.map((t) => `"${t}"`).join(" OR ") : null;
}

/** Shared FTS/bm25 query behind search() and dispatch(). */
function rankedRows(db, match, type) {
  const where = type ? "cells_fts MATCH ? AND c.type = ?" : "cells_fts MATCH ?";
  const stmt = db.prepare(`
    SELECT c.id, c.hook, c.tags_str, c.type, c.confidence, c.created, c.scope, c.body, c.effector, c.status, bm25(cells_fts) AS rank
    FROM cells_fts JOIN cells c ON c.id = cells_fts.id
    WHERE ${where} ORDER BY rank LIMIT 50
  `);
  return type ? stmt.all(match, type) : stmt.all(match);
}

/** Fetch stored vector embedding for a cell, or embed on the fly */
function getCellVector(db, cellId) {
  const row = db.prepare("SELECT vector FROM embeddings WHERE cell_id = ?").get(cellId);
  return row ? deserializeVector(row.vector) : null;
}

/** Fetch historical citation events for a cell */
function getCellCitations(db, cellId) {
  return db.prepare("SELECT timestamp, success FROM cell_citations WHERE cell_id = ? ORDER BY id DESC LIMIT 20").all(cellId);
}

/**
 * Hybrid Candidate Retrieval & RL Reranking:
 * 1. Retrieves BM25 lexical candidates
 * 2. Augments with dense vector similarity
 * 3. Incorporates temporal confidence decay
 * 4. Scores using LinUCB Contextual Bandit
 */
function hybridRerank(root, db, rows, query, bandit = null) {
  if (!rows || rows.length === 0) return [];
  const b = bandit || LinUCBBandit.load(root);
  const qVec = embedQuery(query);

  const inDegreeMap = new Map();
  try {
    const degs = db.prepare("SELECT to_id, COUNT(*) n FROM decision_graph GROUP BY to_id").all();
    for (const d of degs) inDegreeMap.set(d.to_id, d.n);
  } catch {
    // optional fallback
  }

  const candidates = [];
  for (const r of rows) {
    const cVec = getCellVector(db, r.id) || embedCell(r);
    const cosSim = cosineSimilarity(qVec, cVec);
    const citations = getCellCitations(db, r.id);
    const dynamicConf = computeDynamicConfidence(r, citations);
    const inDegree = inDegreeMap.get(r.id) || 0;

    const context = {
      query,
      bm25Score: r.rank,
      cosineSim: cosSim,
      dynamicConfidence: dynamicConf,
      inDegree,
      citedCount: citations.length,
      sessionSeen: false,
    };

    const x = extractFeatures(r, context);
    const rlScore = b.score(x);

    candidates.push({
      ...r,
      dynamicConfidence: dynamicConf,
      cosineSimilarity: cosSim,
      rlScore,
      features: x,
    });
  }

  // Sort by LinUCB RL score descending
  candidates.sort((a, b) => b.rlScore - a.rlScore);
  return candidates;
}

/** Pack ranked rows under a token budget into the recall result shape. */
function packHits(rows, query, budget) {
  const hits = [];
  let used = 0;
  for (const r of rows) {
    const cost = est(r.hook);
    if (used + cost > budget) continue;
    hits.push({
      id: r.id,
      hook: r.hook,
      tags: r.tags_str ? r.tags_str.split(" ") : [],
      type: r.type,
      confidence: r.dynamicConfidence ?? r.confidence,
      rlScore: r.rlScore,
    });
    used += cost;
  }
  return { hits, tokens: used, total: rows.length, synthesis: synthesize(query, hits) };
}

/** FTS/bm25 + Vector + Temporal + RL recall, packed under a token budget. */
export function search(root, query, budget = 2000) {
  const match = ftsMatch(query);
  if (!match) return { hits: [], tokens: 0, total: 0, synthesis: "" };
  const db = openDb(root);
  let result;
  try {
    const rawRows = rankedRows(db, match);
    const ranked = hybridRerank(root, db, rawRows, query);
    result = packHits(ranked, query, budget);

    // Record telemetry event
    logTelemetryEvent(root, {
      event_type: "recall",
      query,
      candidates_scored: ranked.map((r) => ({ id: r.id, rlScore: r.rlScore, conf: r.dynamicConfidence })),
      cells_returned: result.hits.map((h) => h.id),
      tokens_used: result.tokens,
    });

    // Record citation entries
    if (result.hits.length > 0) {
      const citeStmt = db.prepare("INSERT INTO cell_citations(cell_id, query, timestamp, success) VALUES (?, ?, ?, 1)");
      const nowIso = new Date().toISOString();
      for (const h of result.hits) {
        citeStmt.run(h.id, query, nowIso);
      }
    }
  } finally {
    db.close();
  }
  return result;
}

/**
 * Basal-ganglia-style action selection with hybrid RL ranking: choose between recall and a procedure.
 */
export function dispatch(root, query, budget = 2000) {
  const match = ftsMatch(query);
  if (!match) return { winner: "recall", hits: [], tokens: 0, total: 0, synthesis: "" };

  const db = openDb(root);
  try {
    const bandit = LinUCBBandit.load(root);
    const allRows = rankedRows(db, match);
    const rankedAll = hybridRerank(root, db, allRows, query, bandit);

    const asRecall = () => {
      const res = { winner: "recall", ...packHits(rankedAll, query, budget) };
      logTelemetryEvent(root, {
        event_type: "dispatch",
        query,
        action_taken: "fallback_recall",
        cells_returned: res.hits.map((h) => h.id),
        tokens_used: res.tokens,
      });
      return res;
    };

    const procRows = rankedRows(db, match, "procedure");
    if (!procRows.length) return asRecall();

    const rankedProcs = hybridRerank(root, db, procRows, query, bandit);
    const bestProc = rankedProcs[0];
    if (!bestProc) return asRecall();

    const bestFact = rankedAll.find((r) => r.type !== "procedure");
    const bestFactRank = bestFact ? bestFact.rank : Infinity;
    if (!(bestProc.rank < bestFactRank)) return asRecall();

    if (!bestProc.effector) return asRecall();
    const effectorPath = join(paths(root).base, bestProc.effector);
    if (!existsSync(effectorPath)) return asRecall();

    const cited = db.prepare(`
      SELECT c.id, c.hook FROM edges e JOIN cells c ON c.id = e.to_id
      WHERE e.from_id = ? AND c.type = 'procedure'
    `).all(bestProc.id);

    const result = {
      winner: "procedure",
      cell: {
        id: bestProc.id, hook: bestProc.hook, type: bestProc.type,
        tags: bestProc.tags_str ? bestProc.tags_str.split(" ") : [],
        confidence: bestProc.dynamicConfidence ?? bestProc.confidence,
      },
      effectorPath,
      why: `"${bestProc.hook}" matched "${query}" more strongly than any fact, and its effector exists on disk.`,
      citedProcedures: cited.map((c) => ({ id: c.id, hook: c.hook })),
    };

    logTelemetryEvent(root, {
      event_type: "dispatch",
      query,
      action_taken: "procedure",
      cells_returned: [bestProc.id],
      tokens_used: est(bestProc.hook + bestProc.body),
    });

    return result;
  } finally {
    db.close();
  }
}

/** Trace full decision provenance causal tree */
export function traceDecision(root, cellId) {
  const db = openDb(root);
  try {
    return traceDecisionProvenance(db, cellId);
  } finally {
    db.close();
  }
}

/** Check health and temporal staleness across the memory base */
export function indexStats(root) {
  const db = openDb(root);
  try {
    const byType = db.prepare("SELECT type, COUNT(*) n FROM cells GROUP BY type").all();
    const total = db.prepare("SELECT COUNT(*) n FROM cells").get().n;
    const watermarks = db.prepare("SELECT source_kind, count, last_run FROM ingest_watermark").all();

    // Check temporal staleness across all cells
    const allCells = db.prepare("SELECT id, type, hook, scope, confidence, created, status FROM cells").all();
    const staleList = [];
    const nowSec = Math.floor(Date.now() / 1000);

    for (const c of allCells) {
      const citations = getCellCitations(db, c.id);
      const staleInfo = checkStaleness(c, citations, nowSec);
      if (staleInfo.isStale) {
        staleList.push({
          id: c.id,
          hook: c.hook,
          reason: staleInfo.reason,
          currentConfidence: staleInfo.currentConfidence,
        });
      }
    }

    return { total, byType, watermarks, staleDecisions: staleList };
  } finally {
    db.close();
  }
}
