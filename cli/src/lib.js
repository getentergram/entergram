// Engram core — cell store + recall. Markdown is the source of truth; the JSON
// index is a rebuildable cache. No native deps (SQLite/FTS is a Day-4 upgrade).
import {
  existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const DIR = ".engram";

/** Walk up from `start` to find the repo root containing `.engram/`. */
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
    config: join(base, "engram.toml"),
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
    `# Engram config\nname = "${root.split("/").pop()}"\nsources = ["git", "docs"]\n`,
  );
  writeFileSync(p.state, JSON.stringify({ seenShas: [], seenDocs: [], lastLearn: null }, null, 2));
  // The derived SQLite index is rebuildable — never commit it. Cells + state DO commit.
  writeFileSync(p.ignore, "index.db\nindex.db-shm\nindex.db-wal\nindex.json\n*.local\n");
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
  let added = 0, skipped = 0;
  for (const rel of files) {
    const text = readFileSync(join(root, rel), "utf8");
    for (const sec of splitSections(text)) {
      if (sec.body.trim().length < 40) { skipped++; continue; }
      const key = createHash("sha1").update(rel + "::" + sec.title).digest("hex").slice(0, 12);
      if (seen.has(key)) { skipped++; continue; }
      const isAdr = /adr|decision/i.test(rel);
      writeCell(root, {
        type: isAdr ? "decision" : "reference",
        tags: [...new Set((sec.title + " " + rel).toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || [])].slice(0, 4),
        scope: "docs",
        confidence: isAdr ? 0.7 : 0.5,
        hook: sec.title,
        what: sec.body.trim().slice(0, 500),
        source: { kind: "doc", path: rel, heading: sec.title },
      });
      seen.add(key);
      added++;
    }
  }
  state.seenDocs = [...seen];
  writeFileSync(p.state, JSON.stringify(state, null, 2));
  return { added, skipped };
}

function docFiles(root) {
  const out = [];
  const walk = (dir, rel) => {
    for (const e of readdirSync(join(root, dir === "" ? "." : dir), { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (/docs|adr|decisions/i.test(e.name) || rel) walk(r, r);
      } else if (/\.mdx?$/i.test(e.name) && /readme|changelog|adr|decision|architecture|docs\//i.test(r) || (rel && /\.mdx?$/i.test(e.name))) {
        out.push(r);
      }
    }
  };
  // top-level README/CHANGELOG/ARCHITECTURE + anything under docs/ or adr/
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.isFile() && /^(readme|changelog|architecture)/i.test(e.name) && /\.mdx?$/i.test(e.name)) out.push(e.name);
    if (e.isDirectory() && /^(docs|adr|decisions)$/i.test(e.name)) walk(e.name, e.name);
  }
  return [...new Set(out)];
}

function splitSections(text) {
  const lines = text.split("\n");
  const secs = [];
  let title = null, buf = [];
  const flush = () => { if (title) secs.push({ title, body: buf.join("\n") }); };
  for (const ln of lines) {
    const h = /^#{1,3}\s+(.*)/.exec(ln);
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

/** Ingest recent git commits into cells (heuristic v1 — LLM extraction lands Day 6). */
export function learnGit(root, { limit = 50 } = {}) {
  const p = paths(root);
  const state = JSON.parse(readFileSync(p.state, "utf8"));
  const seen = new Set(state.seenShas);
  const US = "\x1f", RS = "\x1e";
  const raw = execSync(
    `git -C "${root}" log --no-merges -n ${limit} --date=short --pretty=format:%H${US}%an${US}%ad${US}%s${US}%b${RS}`,
    { encoding: "utf8", maxBuffer: 1 << 24 },
  );
  let added = 0, skipped = 0;
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
    writeCell(root, {
      type,
      tags: tags.length ? tags : ["git"],
      scope: "repo",
      confidence: 0.4,
      created: date,
      hook: subject.trim(),
      what: subject.trim(),
      why: bodyText.trim() || "(rationale not in commit message — refine with `engram review`)",
      source: { kind: "commit", sha: sha.slice(0, 9), author, date },
    });
    seen.add(sha);
    added++;
  }
  state.seenShas = [...seen];
  state.lastLearn = new Date().toISOString();
  writeFileSync(p.state, JSON.stringify(state, null, 2));
  return { added, skipped };
}
