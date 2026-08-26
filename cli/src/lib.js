// Entergram core — cell store + recall. Markdown is the source of truth; the JSON
// index is a rebuildable cache. No native deps (SQLite/FTS is a Day-4 upgrade).
import {
  existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const DIR = ".entergram";

/** Walk up from `start` to find the repo root containing `.entergram/`. */
export function findRoot(start = process.cwd()) {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, DIR))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function paths(root) {
  const base = join(root, DIR);
  return {
    base,
    cells: join(base, "cells"),
    config: join(base, "entergram.toml"),
    state: join(base, "state.json"),
    ignore: join(base, ".gitignore"),
  };
}

export function initRepo(root) {
  const p = paths(root);
  if (existsSync(p.base)) return { created: false, path: p.base };
  mkdirSync(p.cells, { recursive: true });
  writeFileSync(
    p.config,
    [
      `# Entergram config`,
      `name = "${root.split("/").pop()}"`,
      `sources = ["git", "docs", "github"]`,
      ``,
      `# Doc harvesting is scoped to these dirs/files (never .env, secrets, node_modules).`,
      `doc_paths = ["docs", "adr", "decisions", "README.md", "CHANGELOG.md", "ARCHITECTURE.md"]`,
      `exclude = [".env", "node_modules", "secrets"]`,
      ``,
    ].join("\n"),
  );
  writeFileSync(p.state, JSON.stringify({ seenShas: [], seenDocs: [], seenPRs: [], seenIssues: [], lastLearn: null }, null, 2));
  // The derived SQLite index is rebuildable — never commit it. Cells + state DO commit.
  writeFileSync(p.ignore, "index.db\nindex.db-shm\nindex.db-wal\nindex.json\ntelemetry.jsonl\nrl/\n*.local\n");
  return { created: true, path: p.base };
}

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "cell";

export function nextId(root) {
  const { cells } = paths(root);
  const ids = readdirSync(cells)
    .map((f) => /^B-(\d+)/.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const n = (ids.length ? Math.max(...ids) : 0) + 1;
  return "B-" + String(n).padStart(4, "0");
}

/** Serialize + write one cell. Returns { id, file }. */
export function writeCell(root, c) {
  const { cells } = paths(root);
  const id = c.id || nextId(root);
  const tags = c.tags?.length ? c.tags : ["untagged"];
  const fm = [
    "---",
    `id: ${id}`,
    `type: ${c.type || "reference"}`,
    `tags: [${tags.join(", ")}]`,
    `scope: ${c.scope || "global"}`,
    c.source ? `source: ${JSON.stringify(c.source)}` : null,
    `confidence: ${c.confidence ?? 1.0}`,
    `created: ${c.created || new Date().toISOString().slice(0, 10)}`,
    `hook: ${c.hook || c.what}`,
    "---",
  ].filter(Boolean).join("\n");
  const body = [
    "",
    `# ${c.hook || c.what}`,
    "",
    "## What",
    c.what || c.hook,
    c.why ? "\n## Why\n" + c.why : "",
    c.outcome ? "\n## Outcome\n" + c.outcome : "",
    c.related?.length ? "\nRelated: " + c.related.map((r) => `[[${r}]]`).join(", ") : "",
    "",
  ].join("\n");
  const file = join(cells, `${id}-${slug(c.hook || c.what)}.md`);
  writeFileSync(file, fm + "\n" + body);
  return { id, file };
}

function parseFrontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) return { fm: {}, body: text };
  const fm = {};
  for (const line of m[1].split("\n")) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let [, k, v] = kv;
    if (k === "tags") v = v.replace(/[[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
    fm[k] = v;
  }
  return { fm, body: m[2] };
}

/** Load every cell as a structured object. */
export function readCells(root) {
  const { cells } = paths(root);
  return readdirSync(cells)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const text = readFileSync(join(cells, f), "utf8");
      const { fm, body } = parseFrontmatter(text);
      return {
        file: f, id: fm.id, tags: fm.tags || [], hook: fm.hook || "", type: fm.type,
        scope: fm.scope, confidence: fm.confidence, created: fm.created, source: fm.source,
        effector: fm.effector,
        body, text,
      };
    });
}

/** Patch a cell's frontmatter/body in place (used by `review`). */
export function updateCell(root, id, patch) {
  const { cells } = paths(root);
  const f = readdirSync(cells).find((n) => n.startsWith(id + "-"));
  if (!f) return false;
  const p = join(cells, f);
  let text = readFileSync(p, "utf8");
  if (patch.confidence != null) text = text.replace(/^confidence: .*/m, `confidence: ${patch.confidence}`);
  if (patch.tags) text = text.replace(/^tags: .*/m, `tags: [${patch.tags.join(", ")}]`);
  if (patch.why != null) {
    text = /## Why\n[\s\S]*?(?=\n## |\nRelated:|\n*$)/.test(text)
      ? text.replace(/## Why\n[\s\S]*?(?=\n## |\nRelated:|\n*$)/, `## Why\n${patch.why}\n`)
      : text.replace(/(## What\n[\s\S]*?)(\n## |\nRelated:|\n*$)/, `$1\n## Why\n${patch.why}\n$2`);
  }
  writeFileSync(p, text);
  return true;
}

export function deleteCell(root, id) {
  const { cells } = paths(root);
  const f = readdirSync(cells).find((n) => n.startsWith(id + "-"));
  if (!f) return false;
  rmSync(join(cells, f));
  return true;
}

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

const words = (s) => (s || "").toLowerCase().match(/[a-z0-9]{3,}/g) || [];

/** Find an existing cell that looks like the same fact as `candidate` (tag overlap + hook similarity). */
export function findDuplicate(root, candidate) {
  const candTags = candidate.tags || [];
  const candWords = words(candidate.hook || candidate.what);
  let best = null, bestScore = 0;
  for (const c of readCells(root)) {
    const tagScore = jaccard(candTags, c.tags || []);
    if (tagScore === 0) continue; // require at least some shared tag before comparing text
    const hookScore = jaccard(candWords, words(c.hook));
    const score = tagScore * 0.5 + hookScore * 0.5;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return bestScore >= 0.5 ? best : null;
}

/**
 * Write a cell, but dedup/reconcile against existing cells first (ingestion §4.4-4.5):
 * same fact found → merge into it (stronger/more-recent confidence wins) instead of
 * creating a duplicate; return { merged: true } so callers can tally it separately.
 */
export function writeCellDeduped(root, candidate) {
  const dup = findDuplicate(root, candidate);
  if (!dup) return { ...writeCell(root, candidate), merged: false };
  const dupConf = Number(dup.confidence ?? 0);
  const candConf = Number(candidate.confidence ?? 0);
  if (candConf >= dupConf) {
    updateCell(root, dup.id, {
      confidence: Math.max(candConf, dupConf),
      why: candidate.why || undefined,
    });
  }
  const { cells } = paths(root);
  return { id: dup.id, file: join(cells, dup.file), merged: true };
}

/** Cells still awaiting human review (low extractor confidence). */
export function reviewQueue(root, threshold = 0.6) {
  return readCells(root)
    .filter((c) => Number(c.confidence) < threshold)
    .sort((a, b) => Number(a.confidence) - Number(b.confidence));
}

/** Ingest docs/README/ADRs into cells, one per meaningful section (heuristic v1). */
export function learnDocs(root) {
  const p = paths(root);
  const state = JSON.parse(readFileSync(p.state, "utf8"));
  const seen = new Set(state.seenDocs || []);
  const files = docFiles(root);
  let added = 0, skipped = 0, merged = 0;
  for (const rel of files) {
    const text = readFileSync(join(root, rel), "utf8");
    for (const sec of splitSections(text)) {
      if (sec.body.trim().length < 40) { skipped++; continue; }
      const key = createHash("sha1").update(rel + "::" + sec.title).digest("hex").slice(0, 12);
      if (seen.has(key)) { skipped++; continue; }
      const isAdr = /adr|decision/i.test(rel);
      const { merged: wasMerged } = writeCellDeduped(root, {
        type: isAdr ? "decision" : "reference",
        tags: [...new Set((sec.title + " " + rel).toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || [])].slice(0, 4),
        scope: "docs",
        confidence: isAdr ? 0.7 : 0.5,
        hook: sec.title,
        what: sec.body.trim().slice(0, 500),
        source: { kind: "doc", path: rel, heading: sec.title },
      });
      seen.add(key);
      wasMerged ? merged++ : added++;
    }
  }
  state.seenDocs = [...seen];
  writeFileSync(p.state, JSON.stringify(state, null, 2));
  return { added, skipped, merged };
}

/** Minimal entergram.toml reader — just enough for flat string/array keys (no TOML dep needed). */
export function readConfig(root) {
  const out = {
    name: root.split("/").pop(), sources: ["git", "docs", "github"],
    doc_paths: ["docs", "adr", "decisions", "README.md", "CHANGELOG.md", "ARCHITECTURE.md"],
    exclude: ["node_modules", ".env", "secrets"],
  };
  const { config } = paths(root);
  if (!existsSync(config)) return out;
  for (const line of readFileSync(config, "utf8").split("\n")) {
    const m = /^(\w+)\s*=\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    const [, key, raw] = m;
    out[key] = raw.startsWith("[")
      ? raw.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean)
      : raw.replace(/^"|"$/g, "");
  }
  return out;
}

/** Doc/README/ADR files in scope per entergram.toml's doc_paths, honoring exclude (§8 privacy). */
function docFiles(root) {
  const cfg = readConfig(root);
  const isExcluded = (rel) => cfg.exclude.some((x) => rel.includes(x));
  const out = [];
  const walk = (rel) => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const r = `${rel}/${e.name}`;
      if (isExcluded(r)) continue;
      if (e.isDirectory()) walk(r);
      else if (/\.mdx?$/i.test(e.name)) out.push(r);
    }
  };
  for (const entry of cfg.doc_paths) {
    const abs = join(root, entry);
    if (!existsSync(abs) || isExcluded(entry)) continue;
    if (statSync(abs).isDirectory()) walk(entry);
    else out.push(entry);
  }
  return [...new Set(out)];
}

function splitSections(text) {
  const lines = text.split("\n");
  const secs = [];
  let title = null, buf = [], inFence = false;
  const flush = () => { if (title) secs.push({ title, body: buf.join("\n") }); };
  for (const ln of lines) {
    if (/^\s*(```|~~~)/.test(ln)) { inFence = !inFence; buf.push(ln); continue; }
    // Headings inside a fenced code block are illustrative content, not real doc structure.
    const h = !inFence && /^#{1,3}\s+(.*)/.exec(ln);
    if (h) { flush(); title = h[1].trim().replace(/[#*`]/g, ""); buf = []; }
    else buf.push(ln);
  }
  flush();
  return secs.filter((s) => s.title);
}

const est = (s) => Math.ceil(s.length / 4); // rough tokens

/** Score cells against a query and pack the best under a token budget. */
export function recall(root, query, budget = 2000) {
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  const scored = readCells(root).map((c) => {
    const hook = c.hook.toLowerCase();
    const tags = c.tags.join(" ").toLowerCase();
    const body = c.body.toLowerCase();
    let s = 0;
    for (const t of terms) {
      if (tags.includes(t)) s += 4;
      if (hook.includes(t)) s += 3;
      if (body.includes(t)) s += 1;
    }
    return { ...c, score: s };
  }).filter((c) => c.score > 0).sort((a, b) => b.score - a.score);

  const out = [];
  let used = 0;
  for (const c of scored) {
    const cost = est(c.hook + c.body);
    if (used + cost > budget && out.length) break;
    out.push(c);
    used += cost;
  }
  return { hits: out, tokens: used, total: scored.length };
}

export function doctor(root) {
  const cells = readCells(root);
  const ids = new Set(cells.map((c) => c.id));
  const problems = [];
  for (const c of cells) {
    if (!c.id) problems.push(`${c.file}: missing id`);
    if (!c.hook) problems.push(`${c.file}: missing hook`);
    for (const m of c.text.matchAll(/\[\[(B-\d+)\]\]/g)) {
      if (!ids.has(m[1])) problems.push(`${c.file}: dangling link ${m[1]}`);
    }
  }
  return { count: cells.length, problems };
}

/** Ingest recent git commits into cells (heuristic v1 — LLM extraction is the GitHub-source path below). */
export function learnGit(root, { limit = 50, since } = {}) {
  const p = paths(root);
  const state = JSON.parse(readFileSync(p.state, "utf8"));
  const seen = new Set(state.seenShas);
  const US = "\x1f", RS = "\x1e";
  const range = since ? `${since}..HEAD` : "";
  const raw = execSync(
    `git -C "${root}" log --no-merges ${range} -n ${limit} --date=short --pretty=format:%H${US}%an${US}%ad${US}%s${US}%b${RS}`,
    { encoding: "utf8", maxBuffer: 1 << 24 },
  );
  let added = 0, skipped = 0, merged = 0;
  for (const rec of raw.split(RS)) {
    const line = rec.replace(/^\n/, "");
    if (!line.trim()) continue;
    const [sha, author, date, subject, bodyText = ""] = line.split(US);
    if (!sha) continue;
    if (seen.has(sha)) { skipped++; continue; }
    // Skip low-signal commits.
    if (/^(wip|fix typo|merge|bump|chore|format)\b/i.test(subject.trim())) { skipped++; seen.add(sha); continue; }
    const type = /\b(add|introduce|migrat|switch|replace|refactor|remov|decid|design)/i.test(subject)
      ? "decision" : "reference";
    const tags = [...new Set(
      subject.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || [],
    )].slice(0, 4);
    const { merged: wasMerged } = writeCellDeduped(root, {
      type,
      tags: tags.length ? tags : ["git"],
      scope: "repo",
      confidence: 0.4,
      created: date,
      hook: subject.trim(),
      what: subject.trim(),
      why: bodyText.trim() || "(rationale not in commit message — refine with `get-entergram review`)",
      source: { kind: "commit", sha: sha.slice(0, 9), author, date },
    });
    seen.add(sha);
    wasMerged ? merged++ : added++;
  }
  state.seenShas = [...seen];
  state.lastLearn = new Date().toISOString();
  writeFileSync(p.state, JSON.stringify(state, null, 2));
  return { added, skipped, merged };
}
