// The `entergram viz` runtime: a loopback HTTP server that serves the prebuilt UI and
// a JSON API over the local store.
//
// Deliberately dependency-free (node:http, not a framework). The CLI is installed
// globally onto other people's machines, so every dependency added here is a
// dependency added to `entergram` itself. The UI ships as a static export, which also
// means no Next.js runtime in the published package.
//
// SECURITY: binds 127.0.0.1 by design. This serves the full text of private memory —
// decisions, credentials-adjacent notes, customer names. It must never listen on 0.0.0.0.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { watch, existsSync, realpathSync } from "node:fs";
import { join, extname, normalize, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildGraph } from "../graph/build.js";
import { applyPersona, resolvePersonas } from "../graph/personas.js";
import { buildAdjacency, shortestPath } from "../graph/metrics.js";
import { cellHistory, timelineStream } from "../graph/timeline.js";
import { paths, readCells, updateCell, writeCell, deleteCell, readConfig } from "../lib.js";
import { search } from "../db.js";
import { loadPlugins } from "./plugins.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// Published layout: cli/src/viz/server.js -> cli/ui. Dev layout: apps/viz/out.
const UI_CANDIDATES = [
  resolve(HERE, "../../ui"),
  resolve(HERE, "../../../apps/viz/out"),
];

/**
 * Explicit envelope for non-200 responses.
 *
 * Do NOT duck-type this as `{status, body}`: a cell object has its own `body` field
 * (its Markdown), so testing for `.body` would return the cell's prose instead of
 * the cell. An instanceof check can't collide with payload shape.
 */
class HttpResponse {
  constructor(status, body) { this.status = status; this.body = body; }
}
const httpError = (status, body) => new HttpResponse(status, body);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".map": "application/json",
};

/**
 * Graph computation is ~2.7s on a 208-cell store (embeddings + git walk + Brandes),
 * far too slow per request. Cache it and invalidate on a cell-file change instead.
 */
function createCache(root) {
  let graph = null;
  let building = null;
  let generation = 0;

  return {
    get generation() { return generation; },
    invalidate() { graph = null; generation++; },
    async get() {
      if (graph) return graph;
      // Collapse concurrent cold requests onto one build.
      if (!building) {
        building = Promise.resolve().then(() => buildGraph(root)).finally(() => { building = null; });
      }
      graph = await building;
      return graph;
    },
  };
}

export async function startVizServer(root, { port = 4700, host = "127.0.0.1" } = {}) {
  const cache = createCache(root);
  const config = readConfig(root) || {};
  const personas = resolvePersonas(config);
  const plugins = await loadPlugins(root);
  const uiDir = UI_CANDIDATES.find((d) => existsSync(join(d, "index.html"))) || null;
  const clients = new Set(); // active SSE connections

  const watcher = watchCells(root, () => {
    cache.invalidate();
    broadcast(clients, "graph:changed", { generation: cache.generation });
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const path = url.pathname;

    // Same-origin only; no CORS headers. A page on another origin has no business
    // reading this store, and the UI is served from here anyway.
    try {
      if (path === "/api/events") return sseHandler(req, res, clients, cache);
      if (path.startsWith("/api/")) {
        const body = await readBody(req);
        const out = await handleApi(path, req.method, url, body, {
          root, cache, personas, plugins, config,
        });
        if (out === undefined) return send(res, 404, { error: "unknown endpoint", path });
        if (out instanceof HttpResponse) return send(res, out.status, out.body);
        return send(res, 200, out);
      }
      if (!uiDir) {
        return send(res, 503, {
          error: "UI bundle not found",
          hint: "Run `pnpm --dir apps/viz build` to produce apps/viz/out, or reinstall entergram.",
          searched: UI_CANDIDATES,
        });
      }
      return serveStatic(uiDir, path, res);
    } catch (err) {
      return send(res, 500, { error: err.message, stack: err.stack?.split("\n").slice(0, 4) });
    }
  });

  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, host, ok);
  });

  return {
    url: `http://${host}:${server.address().port}`,
    port: server.address().port,
    plugins: plugins.map((p) => p.name),
    uiDir,
    async close() {
      watcher?.close();
      for (const c of clients) c.res.end();
      await new Promise((ok) => server.close(ok));
    },
  };
}

async function handleApi(path, method, url, body, ctx) {
  const { root, cache, personas, plugins, config } = ctx;

  // --- read ---------------------------------------------------------------
  if (path === "/api/meta" && method === "GET") {
    const graph = await cache.get();
    return {
      root, generation: cache.generation, historySource: graph.historySource,
      stats: graph.stats, personas, plugins: plugins.map((p) => p.manifest),
      config: { name: config.name || null },
    };
  }

  if (path === "/api/graph" && method === "GET") {
    const graph = await cache.get();
    const personaId = url.searchParams.get("persona");
    const persona = personas.find((p) => p.id === personaId);
    let out = applyPersona(graph, persona);
    for (const p of plugins) if (p.decorateGraph) out = p.decorateGraph(out) || out;
    return out;
  }

  if (path === "/api/personas" && method === "GET") return personas;

  if (path === "/api/timeline" && method === "GET") {
    const { events, source } = cellHistory(root);
    return { source, events: timelineStream(events) };
  }

  if (path === "/api/suggestions" && method === "GET") {
    const graph = await cache.get();
    return graph.suggestions;
  }

  if (path === "/api/search" && method === "GET") {
    const q = url.searchParams.get("q") || "";
    if (!q.trim()) return [];
    // Reuse the store's own FTS5 + embedding recall so the palette ranks results the
    // same way the agent's `recall` does. One retrieval implementation, not two.
    // `search` takes a TOKEN budget (not a row limit) and returns {hits, total, ...}.
    try {
      const limit = Number(url.searchParams.get("limit")) || 20;
      // The budget exists to cap what an AGENT pulls into context; a palette has no
      // such constraint. Pass an effectively-infinite budget so ranking is preserved
      // but packing never truncates (a real budget returned 1 hit of 29 here, because
      // one 4KB cell exhausted it), then cut to the row limit.
      const { hits, total } = search(root, q, Number.MAX_SAFE_INTEGER);
      return { total, hits: (hits || []).slice(0, limit) };
    } catch {
      // FTS unavailable (index not built, or a query it can't tokenize) — degrade to
      // a substring scan rather than failing the palette outright.
      const graph = await cache.get();
      const needle = q.toLowerCase();
      const hits = graph.nodes
        .filter((n) => n.hook.toLowerCase().includes(needle) || n.id.toLowerCase().includes(needle))
        .slice(0, 20);
      return { total: hits.length, hits, degraded: true };
    }
  }

  if (path === "/api/path" && method === "GET") {
    const graph = await cache.get();
    const adj = buildAdjacency(graph.nodes, graph.edges);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const ids = shortestPath(adj, from, to);
    if (!ids) return httpError(404, { error: "no path", from, to });
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    return { path: ids, nodes: ids.map((id) => byId.get(id)) };
  }

  const cellMatch = path.match(/^\/api\/cell\/([^/]+)$/);
  if (cellMatch) {
    const id = decodeURIComponent(cellMatch[1]);

    if (method === "GET") {
      const cell = readCells(root).find((c) => c.id === id);
      if (!cell) return httpError(404, { error: "no such cell", id });
      const graph = await cache.get();
      const node = graph.nodes.find((n) => n.id === id);
      return {
        ...cell,
        metrics: node || null,
        incoming: graph.edges.filter((e) => e.to === id),
        outgoing: graph.edges.filter((e) => e.from === id),
        suggested: graph.suggestions.filter((s) => s.from === id || s.to === id),
      };
    }

    // --- write (Phase 4 editing) ------------------------------------------
    // updateCell patches frontmatter confidence/tags and the `## Why` section only —
    // it is not a general body editor. Reject unsupported fields loudly rather than
    // silently accepting an edit that never lands on disk.
    if (method === "PATCH") {
      const allowed = ["confidence", "tags", "why"];
      const unknown = Object.keys(body || {}).filter((k) => !allowed.includes(k));
      if (unknown.length) {
        return httpError(400, { error: "unsupported fields", unknown, allowed });
      }
      if (!updateCell(root, id, body)) return httpError(404, { error: "no such cell", id });
      cache.invalidate();
      return { ok: true, id, generation: cache.generation };
    }
    if (method === "DELETE") {
      if (!deleteCell(root, id)) return httpError(404, { error: "no such cell", id });
      cache.invalidate();
      return { ok: true, id, deleted: true };
    }
  }

  if (path === "/api/cell" && method === "POST") {
    const created = writeCell(root, body);
    cache.invalidate();
    return httpError(201, { ok: true, cell: created });
  }

  // --- plugin routes ------------------------------------------------------
  const pluginMatch = path.match(/^\/api\/plugin\/([^/]+)(\/.*)?$/);
  if (pluginMatch) {
    const plugin = plugins.find((p) => p.name === pluginMatch[1]);
    if (!plugin?.handle) return httpError(404, { error: "no such plugin" });
    return plugin.handle({ path: pluginMatch[2] || "/", method, url, body, root, cache });
  }

  return undefined;
}

/** Server-Sent Events: the UI redraws when a cell changes on disk. */
function sseHandler(req, res, clients, cache) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ generation: cache.generation })}\n\n`);

  const client = { res };
  clients.add(client);
  // Proxies and browsers drop idle event streams; a comment frame keeps it warm.
  const ping = setInterval(() => res.write(": ping\n\n"), 25000);
  req.on("close", () => { clearInterval(ping); clients.delete(client); });
}

function broadcast(clients, event, data) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) { try { c.res.write(frame); } catch { clients.delete(c); } }
}

/**
 * Watch the cells directory. Resolves symlinks first — the brain store is a symlink
 * into dotfiles, and watching the link itself reports nothing.
 */
function watchCells(root, onChange) {
  const dir = paths(root).cells;
  if (!existsSync(dir)) return null;
  const target = realpathSync(dir);
  let timer = null;
  try {
    return watch(target, { recursive: true }, (_event, file) => {
      if (file && !String(file).endsWith(".md")) return;
      // Editors save via rename+write, firing several events per logical change.
      clearTimeout(timer);
      timer = setTimeout(onChange, 120);
    });
  } catch {
    return null; // watching is a convenience, not a requirement
  }
}

async function serveStatic(uiDir, path, res) {
  const rel = path === "/" ? "index.html" : normalize(path).replace(/^(\.\.[/\\])+/, "").replace(/^\//, "");
  let file = join(uiDir, rel);
  if (!file.startsWith(uiDir)) return send(res, 403, { error: "forbidden" });

  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, "index.html");
  } catch {
    // Client-side routing: unknown paths fall through to the SPA shell.
    file = join(uiDir, "index.html");
  }

  try {
    const data = await readFile(file);
    const type = MIME[extname(file)] || "application/octet-stream";
    // Hashed asset filenames are safe to cache hard; the shell must not be.
    const cacheControl = file.includes("/_next/static/")
      ? "public, max-age=31536000, immutable"
      : "no-cache";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": cacheControl });
    res.end(data);
  } catch {
    send(res, 404, { error: "not found", path });
  }
}

function send(res, status, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(data);
}

function readBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return Promise.resolve(null);
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 4 * 1024 * 1024) { fail(new Error("request body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return ok(null);
      try { ok(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { fail(new Error("invalid JSON body")); }
    });
    req.on("error", fail);
  });
}
