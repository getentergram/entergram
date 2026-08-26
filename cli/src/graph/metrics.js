// Graph algorithms over the cell/edge index. Pure functions on a normalized graph —
// no SQLite, no I/O — so they stay unit-testable and reusable from the viz server.
//
// The graph is small by construction (a brain is hundreds of cells, not millions), so
// exact algorithms beat approximations here: Brandes betweenness on 208 nodes is
// microseconds. Don't reach for a graph database until that stops being true.

/**
 * Normalize {nodes, edges} into adjacency structures used by every algorithm below.
 * Edges are stored directed but most measures read the undirected view, because a
 * `[[B-044]]` citation means "these two ideas are related", not "044 depends on me".
 */
export function buildAdjacency(nodes, edges) {
  const ids = nodes.map((n) => n.id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const out = ids.map(() => []);
  const inc = ids.map(() => []);
  const undirected = ids.map(() => new Map());

  for (const e of edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a == null || b == null || a === b) continue; // drop dangling refs + self-loops
    const w = e.weight == null ? 1 : e.weight;
    out[a].push(b);
    inc[b].push(a);
    undirected[a].set(b, (undirected[a].get(b) || 0) + w);
    undirected[b].set(a, (undirected[b].get(a) || 0) + w);
  }
  return { ids, index, out, inc, undirected };
}

/**
 * PageRank over the directed citation graph — "which cells does the rest of the brain
 * lean on?". Dangling nodes (cells that cite nothing) redistribute uniformly rather
 * than leaking rank, which otherwise starves a brain full of leaf cells.
 */
export function pageRank(adj, { damping = 0.85, iterations = 100, tolerance = 1e-8 } = {}) {
  const n = adj.ids.length;
  if (n === 0) return new Map();
  let rank = new Array(n).fill(1 / n);
  const outDeg = adj.out.map((o) => o.length);

  for (let it = 0; it < iterations; it++) {
    const next = new Array(n).fill(0);
    let dangling = 0;
    for (let i = 0; i < n; i++) {
      if (outDeg[i] === 0) { dangling += rank[i]; continue; }
      const share = rank[i] / outDeg[i];
      for (const j of adj.out[i]) next[j] += share;
    }
    const base = (1 - damping) / n + (damping * dangling) / n;
    let delta = 0;
    for (let i = 0; i < n; i++) {
      const v = base + damping * next[i];
      delta += Math.abs(v - rank[i]);
      next[i] = v;
    }
    rank = next;
    if (delta < tolerance) break;
  }
  return new Map(adj.ids.map((id, i) => [id, rank[i]]));
}

/** Degree centrality on the undirected view, plus the raw directed in/out split. */
export function degreeCentrality(adj) {
  const n = adj.ids.length;
  const denom = n > 1 ? n - 1 : 1;
  const result = new Map();
  for (let i = 0; i < n; i++) {
    result.set(adj.ids[i], {
      degree: adj.undirected[i].size,
      inDegree: adj.inc[i].length,
      outDegree: adj.out[i].length,
      centrality: adj.undirected[i].size / denom,
    });
  }
  return result;
}

/**
 * Betweenness centrality (Brandes, unweighted). Surfaces the *bridges* — cells that
 * are not hubs themselves but are the only path between two regions of the brain.
 * Losing one of these fragments recall, so they matter more than raw degree.
 */
export function betweennessCentrality(adj) {
  const n = adj.ids.length;
  const score = new Array(n).fill(0);

  for (let s = 0; s < n; s++) {
    const stack = [];
    const preds = Array.from({ length: n }, () => []);
    const sigma = new Array(n).fill(0);
    const dist = new Array(n).fill(-1);
    sigma[s] = 1;
    dist[s] = 0;
    const queue = [s];

    for (let qi = 0; qi < queue.length; qi++) {
      const v = queue[qi];
      stack.push(v);
      for (const w of adj.undirected[v].keys()) {
        if (dist[w] < 0) { dist[w] = dist[v] + 1; queue.push(w); }
        if (dist[w] === dist[v] + 1) { sigma[w] += sigma[v]; preds[w].push(v); }
      }
    }

    const delta = new Array(n).fill(0);
    while (stack.length) {
      const w = stack.pop();
      for (const v of preds[w]) delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      if (w !== s) score[w] += delta[w];
    }
  }

  // Undirected Brandes counts each pair twice; normalize to [0,1].
  const norm = n > 2 ? 2 / ((n - 1) * (n - 2)) : 1;
  return new Map(adj.ids.map((id, i) => [id, score[i] * norm]));
}

/**
 * Louvain community detection — modularity optimization with aggregation.
 * Produces the Cluster View's groups without anyone hand-maintaining a taxonomy;
 * tags say what a cell claims to be about, communities say what it actually connects to.
 */
export function louvainCommunities(adj, { resolution = 1.0, maxPasses = 20 } = {}) {
  const n = adj.ids.length;
  if (n === 0) return new Map();

  // Working graph: array of Maps (neighbor -> weight) plus per-node self-loop weight.
  let graph = adj.undirected.map((m) => new Map(m));
  let selfLoops = new Array(n).fill(0);
  let membership = adj.ids.map((_, i) => i); // original node -> current community

  for (let pass = 0; pass < maxPasses; pass++) {
    const size = graph.length;
    const degree = graph.map((m, i) => {
      let d = 0;
      for (const w of m.values()) d += w;
      return d + 2 * selfLoops[i];
    });
    const m2 = degree.reduce((a, b) => a + b, 0); // == 2m
    if (m2 === 0) break;

    const community = graph.map((_, i) => i);
    const commTotal = degree.slice();
    let improvedAny = false;

    let moved = true;
    while (moved) {
      moved = false;
      for (let i = 0; i < size; i++) {
        const own = community[i];
        // Weight from i into each neighboring community.
        const links = new Map();
        for (const [j, w] of graph[i]) {
          const c = community[j];
          links.set(c, (links.get(c) || 0) + w);
        }
        // Detach i from its community before scoring candidates.
        commTotal[own] -= degree[i];
        const ownLink = links.get(own) || 0;

        let bestC = own;
        let bestGain = ownLink - (resolution * commTotal[own] * degree[i]) / m2;
        for (const [c, w] of links) {
          if (c === own) continue;
          const gain = w - (resolution * commTotal[c] * degree[i]) / m2;
          if (gain > bestGain) { bestGain = gain; bestC = c; }
        }

        commTotal[bestC] += degree[i];
        community[i] = bestC;
        if (bestC !== own) { moved = true; improvedAny = true; }
      }
    }

    // Relabel communities to a dense 0..k-1 range.
    const relabel = new Map();
    for (const c of community) if (!relabel.has(c)) relabel.set(c, relabel.size);
    const compact = community.map((c) => relabel.get(c));
    membership = membership.map((c) => compact[c]);
    if (!improvedAny || relabel.size === size) break;

    // Aggregate: each community becomes one node in the next pass's graph.
    const k = relabel.size;
    const nextGraph = Array.from({ length: k }, () => new Map());
    const nextSelf = new Array(k).fill(0);
    for (let i = 0; i < size; i++) {
      const ci = compact[i];
      nextSelf[ci] += selfLoops[i];
      for (const [j, w] of graph[i]) {
        const cj = compact[j];
        if (ci === cj) { nextSelf[ci] += w / 2; continue; } // each internal edge seen twice
        nextGraph[ci].set(cj, (nextGraph[ci].get(cj) || 0) + w);
      }
    }
    graph = nextGraph;
    selfLoops = nextSelf;
  }

  return new Map(adj.ids.map((id, i) => [id, membership[i]]));
}

/**
 * Shortest path on the undirected view — the Journey View's reasoning chain
 * ("how does this problem connect to that implementation?").
 */
export function shortestPath(adj, fromId, toId) {
  const s = adj.index.get(fromId);
  const t = adj.index.get(toId);
  if (s == null || t == null) return null;
  if (s === t) return [fromId];

  const prev = new Map([[s, null]]);
  const queue = [s];
  for (let qi = 0; qi < queue.length; qi++) {
    const v = queue[qi];
    if (v === t) break;
    for (const w of adj.undirected[v].keys()) {
      if (prev.has(w)) continue;
      prev.set(w, v);
      queue.push(w);
    }
  }
  if (!prev.has(t)) return null;

  const path = [];
  for (let cur = t; cur != null; cur = prev.get(cur)) path.push(adj.ids[cur]);
  return path.reverse();
}

/**
 * Rich chronological journey analysis between two cells.
 * Computes step-by-step metadata, edge semantics, and timeline monotonicity.
 */
export function findJourney(adj, fromId, toId, nodes = [], edges = []) {
  const pathIds = shortestPath(adj, fromId, toId);
  if (!pathIds) return null;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edgeMap = new Map();
  for (const e of edges) {
    edgeMap.set(`${e.from}->${e.to}`, { ...e, direction: "forward" });
    edgeMap.set(`${e.to}->${e.from}`, { ...e, direction: "reverse" });
  }

  const steps = pathIds.map((id, idx) => {
    const node = byId.get(id) || { id, hook: "", type: "reference", created: null };
    const prevId = idx > 0 ? pathIds[idx - 1] : null;
    const edge = prevId ? edgeMap.get(`${prevId}->${id}`) || { type: "cites", direction: "forward" } : null;
    
    // Parse date
    const dateStr = node.created || node.updated || "2026-06-01";
    const ts = new Date(dateStr).getTime() || 0;

    return {
      index: idx + 1,
      id,
      hook: node.hook || "",
      type: node.type || "reference",
      scope: node.scope || "global",
      date: dateStr.slice(0, 10),
      timestamp: ts,
      importance: node.importance ?? 0.5,
      heat: node.heat ?? 0,
      recency: node.recency ?? 1,
      edge: edge ? { type: edge.type, direction: edge.direction } : null,
      node,
    };
  });

  // Check if steps are monotonically non-decreasing in time
  let isChronological = true;
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].timestamp < steps[i - 1].timestamp) {
      isChronological = false;
      break;
    }
  }

  const sortedSteps = [...steps].sort((a, b) => a.timestamp - b.timestamp);
  const dates = steps.map((s) => s.timestamp).filter(Boolean);
  const minDate = dates.length ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : null;
  const maxDate = dates.length ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : null;
  const spanDays = dates.length ? Math.round((Math.max(...dates) - Math.min(...dates)) / (1000 * 60 * 60 * 24)) : 0;

  return {
    path: pathIds,
    steps,
    chronologicalSteps: sortedSteps,
    isChronological,
    timeSpan: { start: minDate, end: maxDate, days: spanDays },
  };
}

/** Cosine similarity between two dense vectors; 0 when either has no magnitude. */
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Suggest links the author hasn't drawn yet.
 *
 * Two cells are candidates when they read alike (embedding cosine) or sit in the same
 * neighborhood (Adamic-Adar, which discounts introductions made by an already-huge hub —
 * being co-cited by a 19-edge hub says much less than by a 2-edge specialist).
 * Pairs that are already linked are excluded; that's the whole point.
 */
export function suggestLinks(adj, vectors, { limit = 40, minScore = 0.35, semanticWeight = 0.6 } = {}) {
  const n = adj.ids.length;
  const linked = (a, b) => adj.undirected[a].has(b);
  const scores = [];

  // Adamic-Adar over 2-hop pairs only — the full n^2 sweep is wasted on a sparse graph.
  const structural = new Map();
  for (let v = 0; v < n; v++) {
    const nbrs = [...adj.undirected[v].keys()];
    const weight = 1 / Math.log(Math.max(nbrs.length, 2));
    for (let i = 0; i < nbrs.length; i++) {
      for (let j = i + 1; j < nbrs.length; j++) {
        const a = Math.min(nbrs[i], nbrs[j]);
        const b = Math.max(nbrs[i], nbrs[j]);
        if (a === b || linked(a, b)) continue;
        const key = a * n + b;
        structural.set(key, (structural.get(key) || 0) + weight);
      }
    }
  }

  const maxStructural = Math.max(1e-9, ...structural.values());
  const seen = new Set();

  for (const [key, raw] of structural) {
    const a = Math.floor(key / n);
    const b = key % n;
    seen.add(key);
    const sim = cosine(vectors.get(adj.ids[a]), vectors.get(adj.ids[b]));
    const struct = raw / maxStructural;
    const score = semanticWeight * sim + (1 - semanticWeight) * struct;
    if (score >= minScore) {
      scores.push({ from: adj.ids[a], to: adj.ids[b], score, semantic: sim, structural: struct });
    }
  }

  // Purely semantic pairs: read alike but share no neighbor at all — often the most
  // interesting suggestions, because nothing structural would ever surface them.
  if (vectors.size) {
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        if (linked(a, b) || seen.has(a * n + b)) continue;
        const sim = cosine(vectors.get(adj.ids[a]), vectors.get(adj.ids[b]));
        const score = semanticWeight * sim;
        if (score >= minScore) {
          scores.push({ from: adj.ids[a], to: adj.ids[b], score, semantic: sim, structural: 0 });
        }
      }
    }
  }

  return scores.sort((x, y) => y.score - x.score).slice(0, limit);
}

/** Cells with no edge in either direction — written once and never wired in. */
export function orphans(adj) {
  return adj.ids.filter((_, i) => adj.undirected[i].size === 0);
}
