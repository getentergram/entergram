// SQLite/FTS index — a rebuildable cache over the Markdown cells (source of truth).
import Database from "better-sqlite3";
import { join } from "node:path";
import { readCells, paths } from "./lib.js";

export function openDb(root) {
  const db = new Database(join(paths(root).base, "index.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cells(
      id TEXT PRIMARY KEY, type TEXT, scope TEXT, hook TEXT, body TEXT,
      tags_str TEXT, source TEXT, confidence REAL, created TEXT, file TEXT
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS cells_fts USING fts5(id UNINDEXED, hook, body, tags);
  `);
  return db;
}

/** Rebuild the index from the Markdown cells. Returns the cell count. */
export function reindex(root) {
  const db = openDb(root);
  const cells = readCells(root);
  const wipe = db.transaction(() => {
    db.exec("DELETE FROM cells; DELETE FROM cells_fts;");
    const ins = db.prepare(
      "INSERT INTO cells(id,type,scope,hook,body,tags_str,source,confidence,created,file) VALUES (@id,@type,@scope,@hook,@body,@tags_str,@source,@confidence,@created,@file)",
    );
    const fts = db.prepare("INSERT INTO cells_fts(id,hook,body,tags) VALUES (?,?,?,?)");
    for (const c of cells) {
      const tags = (c.tags || []).join(" ");
      ins.run({
        id: c.id, type: c.type || "reference", scope: c.scope || "global",
        hook: c.hook || "", body: c.body || "", tags_str: tags,
        source: c.source || "", confidence: c.confidence == null ? 1 : Number(c.confidence),
        created: c.created || "", file: c.file,
      });
      fts.run(c.id, c.hook || "", c.body || "", tags);
    }
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

/** FTS/bm25 recall, packed under a token budget. */
export function search(root, query, budget = 2000) {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  if (!terms.length) return { hits: [], tokens: 0, total: 0 };
  const match = terms.map((t) => `"${t}"`).join(" OR ");
  const db = openDb(root);
  let rows;
  try {
    rows = db.prepare(`
      SELECT c.id, c.hook, c.tags_str, c.type, c.confidence, c.body
      FROM cells_fts JOIN cells c ON c.id = cells_fts.id
      WHERE cells_fts MATCH ? ORDER BY bm25(cells_fts) LIMIT 50
    `).all(match);
  } finally {
    db.close();
  }
  const hits = [];
  let used = 0;
  for (const r of rows) {
    const cost = est(r.hook + r.body);
    if (used + cost > budget && hits.length) break;
    hits.push({ id: r.id, hook: r.hook, tags: r.tags_str ? r.tags_str.split(" ") : [], type: r.type, confidence: r.confidence });
    used += cost;
  }
  return { hits, tokens: used, total: rows.length };
}

export function indexStats(root) {
  const db = openDb(root);
  const byType = db.prepare("SELECT type, COUNT(*) n FROM cells GROUP BY type").all();
  const total = db.prepare("SELECT COUNT(*) n FROM cells").get().n;
  db.close();
  return { total, byType };
}
