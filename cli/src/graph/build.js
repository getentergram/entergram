// Assemble the connectome the UI renders: cells + typed edges + metrics + history.
//
// Everything here is derived. The Markdown cells stay the source of truth and the
// SQLite index stays a rebuildable cache, so this module never writes — it reads the
// index, computes, and hands back one JSON payload.

import { openDb, ensureIndex } from "../db.js";
import { deserializeVector } from "../embeddings.js";
import {
  buildAdjacency, pageRank, degreeCentrality, betweennessCentrality,
  louvainCommunities, suggestLinks, orphans,
} from "./metrics.js";
import { cellHistory, summarize, timelineStream } from "./timeline.js";

// Typed edges from the provenance graph outrank plain citations: "supersedes" is a
// much stronger claim than "this cell mentions that one".
const EDGE_WEIGHTS = {
  supersedes: 1.6, caused_by: 1.4, constrained_by: 1.3,
  related: 1.1, considered: 0.9, rejected: 0.7, cites: 1.0,
};

/**
 * Build the full graph for a store.
 *
 * @param {string} root      Repository root containing the store.
 * @param {object} [opts]
 * @param {boolean} [opts.history=true]  Walk git history (~850ms on a 737-commit store).
 * @param {boolean} [opts.suggest=true]  Compute suggested missing links.
 */
export function buildGraph(root, { history = true, suggest = true } = {}) {
  ensureIndex(root);
  const db = openDb(root);

  // A row without an id isn't a cell. Stores that double as a docs folder (the brain
  // keeps INDEX.md, PROTOCOL.md, README.md beside its cells) would otherwise inject
  // id-less junk nodes into the graph.
  const rows = db.prepare(`
    SELECT id, type, scope, hook, body, tags_str, source, confidence, created, file, effector, status
    FROM cells WHERE id IS NOT NULL AND TRIM(id) != '' ORDER BY id
  `).all();
  const known = new Set(rows.map((r) => r.id));

  const edges = collectEdges(db, known);
  const adj = buildAdjacency(rows, edges);

  const rank = pageRank(adj);
  const degree = degreeCentrality(adj);
  const between = betweennessCentrality(adj);
  const community = louvainCommunities(adj);
  const activation = collectActivation(db, known);
  const synaptic = collectSynaptic(db, known);

  const temporal = history ? cellHistory(root) : { source: "none", events: {} };
  const summary = summarize(temporal.events);

  const maxRank = Math.max(...rank.values(), 1e-9);
  const maxCites = Math.max(...[...activation.values()].map((a) => a.count), 1);

  const nodes = rows.map((r) => {
    const deg = degree.get(r.id);
    const act = activation.get(r.id) || { count: 0, last: null, queries: [] };
    const time = summary[r.id] || null;
    return {
      id: r.id,
      hook: r.hook || "",
      body: r.body || "",
      tags: (r.tags_str || "").split(/\s+/).filter(Boolean),
      type: r.type || "reference",
      scope: r.scope || "global",
      source: r.source || "",
      status: r.status || "active",
      file: r.file,
      effector: r.effector || "",
      confidence: r.confidence == null ? 1 : r.confidence,

      // Graph intelligence
      pagerank: rank.get(r.id) || 0,
      importance: (rank.get(r.id) || 0) / maxRank, // 0..1, drives node size
      degree: deg.degree,
      inDegree: deg.inDegree,
      outDegree: deg.outDegree,
      betweenness: between.get(r.id) || 0,
      community: community.get(r.id) ?? -1,

      // Connectome metadata
      activations: act.count,
      heat: act.count / maxCites, // 0..1, drives the heatmap
      lastActivated: act.last,
      recentQueries: act.queries,
      synapse: synaptic.get(r.id) || null,

      // Temporal
      created: time?.created || r.created || null,
      updated: time?.updated || null,
      revisions: time?.revisions || 0,
      authors: time?.authors || [],
      ageDays: time?.ageDays ?? null,
      recency: time?.recency ?? 1, // 1 = fresh, decays by 90-day half-life
    };
  });

  const vectors = collectVectors(db, known);
  const suggestions = suggest ? suggestLinks(adj, vectors) : [];

  return {
    generated: new Date().toISOString(),
    root,
    historySource: temporal.source,
    nodes,
    edges,
    suggestions,
    orphans: orphans(adj),
    communities: describeCommunities(nodes),
    stats: {
      cells: nodes.length,
      edges: edges.length,
      communities: new Set(nodes.map((n) => n.community)).size,
      orphans: orphans(adj).length,
      activations: [...activation.values()].reduce((a, b) => a + b.count, 0),
      span: spanOf(nodes),
    },
  };
}

/** Merge plain `[[B-NNN]]` citations with typed provenance edges; typed wins on conflict. */
function collectEdges(db, known) {
  const map = new Map();
  const key = (f, t, ty) => `${f}>${t}:${ty}`;

  for (const e of db.prepare("SELECT from_id, to_id FROM edges").all()) {
    if (!known.has(e.from_id) || !known.has(e.to_id) || e.from_id === e.to_id) continue;
    map.set(key(e.from_id, e.to_id, "cites"), {
      from: e.from_id, to: e.to_id, type: "cites",
      weight: EDGE_WEIGHTS.cites, confidence: 1,
    });
  }

  // decision_graph is optional — a store that has never run provenance extraction
  // still produces a valid citation-only graph.
  try {
    for (const e of db.prepare("SELECT from_id, to_id, edge_type, created FROM decision_graph").all()) {
      if (!known.has(e.from_id) || !known.has(e.to_id) || e.from_id === e.to_id) continue;
      map.delete(key(e.from_id, e.to_id, "cites")); // the typed edge supersedes the bare citation
      map.set(key(e.from_id, e.to_id, e.edge_type), {
        from: e.from_id, to: e.to_id, type: e.edge_type,
        weight: EDGE_WEIGHTS[e.edge_type] ?? 1, confidence: 1, created: e.created,
      });
    }
  } catch { /* table absent on older stores */ }

  return [...map.values()];
}

/** Recall history per cell — which cells actually fire, and for what queries. */
function collectActivation(db, known) {
  const out = new Map();
  try {
    const rows = db.prepare(`
      SELECT cell_id, COUNT(*) n, MAX(timestamp) last
      FROM cell_citations WHERE success = 1 GROUP BY cell_id
    `).all();
    const recent = db.prepare(
      "SELECT query FROM cell_citations WHERE cell_id = ? AND query != '' ORDER BY timestamp DESC LIMIT 5",
    );
    for (const r of rows) {
      if (!known.has(r.cell_id)) continue;
      out.set(r.cell_id, {
        count: r.n, last: r.last,
        queries: recent.all(r.cell_id).map((q) => q.query),
      });
    }
  } catch { /* no citations recorded yet */ }
  return out;
}

/** Live synaptic state (threshold/plasticity) where the runtime has produced it. */
function collectSynaptic(db, known) {
  const out = new Map();
  try {
    for (const r of db.prepare(
      "SELECT cell_id, threshold, plasticity, resolutions, failures, status FROM synaptic_state",
    ).all()) {
      if (!known.has(r.cell_id)) continue;
      out.set(r.cell_id, {
        threshold: r.threshold, plasticity: r.plasticity,
        resolutions: r.resolutions, failures: r.failures, status: r.status,
      });
    }
  } catch { /* synaptic runtime not initialized */ }
  return out;
}

function collectVectors(db, known) {
  const out = new Map();
  try {
    for (const r of db.prepare("SELECT cell_id, vector FROM embeddings").all()) {
      if (!known.has(r.cell_id)) continue;
      out.set(r.cell_id, deserializeVector(r.vector));
    }
  } catch { /* embeddings not computed */ }
  return out;
}

/**
 * Name each detected community by the tags its members share, so the Cluster View
 * shows "infra · arch:lplane" rather than "Community 7".
 */
function describeCommunities(nodes) {
  const groups = new Map();
  for (const n of nodes) {
    if (!groups.has(n.community)) groups.set(n.community, []);
    groups.get(n.community).push(n);
  }

  return [...groups.entries()].map(([id, members]) => {
    const freq = new Map();
    for (const m of members) for (const t of m.tags) freq.set(t, (freq.get(t) || 0) + 1);
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const anchor = members.slice().sort((a, b) => b.pagerank - a.pagerank)[0];
    return {
      id,
      size: members.length,
      label: top.map(([t]) => t).join(" · ") || "untagged",
      tags: top.map(([tag, count]) => ({ tag, count })),
      anchor: anchor ? { id: anchor.id, hook: anchor.hook } : null,
      members: members.map((m) => m.id),
    };
  }).sort((a, b) => b.size - a.size);
}

function spanOf(nodes) {
  const dates = nodes.map((n) => n.created).filter(Boolean).sort();
  return dates.length ? { first: dates[0], last: dates[dates.length - 1] } : null;
}
