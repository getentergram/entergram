// Entergram core — cell store + recall. Markdown is the source of truth; the JSON
// index is a rebuildable cache. No native deps (SQLite/FTS is a Day-4 upgrade).
import {
  existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";

const DIR = ".entergram";

/** Walk up from `start` to find the repo root containing `.entergram/` or a brain root with INDEX.md/brain.sh. */
export function findRoot(start = process.cwd()) {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, DIR))) return dir;
    if (existsSync(join(dir, "INDEX.md")) && (existsSync(join(dir, "brain.sh")) || existsSync(join(dir, "PROTOCOL.md")))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function paths(root) {
  const isDirectBrain = existsSync(join(root, "INDEX.md")) && (existsSync(join(root, "brain.sh")) || existsSync(join(root, "PROTOCOL.md")));
  const base = isDirectBrain ? join(root, ".entergram") : join(root, DIR);
  const cells = isDirectBrain ? root : join(base, "cells");
  return {
    base,
    cells,
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
      `# "docs" is the common case, but plenty of repos keep their docs under a`,
      `# differently-named directory -- "doc" and "documentation" are the other two`,
      `# names seen often enough to ship by default (unmatched entries are simply`,
      `# skipped, so listing names that don't exist in a given repo is harmless).`,
      `doc_paths = [`,
      `  "README.md",`,
      `  "docs/**/*.md",`,
      `  "doc/**/*.md",`,
      `  "documentation/**/*.md",`,
      `  "ARCHITECTURE.md",`,
      `  "DESIGN.md",`,
      `]`,
      ``,
      `[extraction]`,
      `# Min commit message length worth extracting a decision from`,
      `min_commit_len = 20`,
      `# Max PRs to scan in one learn run`,
      `max_prs = 50`,
      ``,
      `[recall]`,
      `default_budget = 2000`,
      `synthesis = true`,
    ].join("\n") + "\n",
  );
  writeFileSync(p.state, JSON.stringify({ seenShas: [], seenDocs: [], seenPRs: [], seenIssues: [], lastLearn: null }, null, 2));
  writeFileSync(
    p.ignore,
    [
      `# Entergram ignores derived artifacts`,
      `index.json`,
      `index.db`,
      `index.db-shm`,
      `index.db-wal`,
      `telemetry.jsonl`,
      `rl/`,
      `*.local`,
    ].join("\n") + "\n",
  );
  return { created: true, path: p.base };
}

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "cell";

/**
 * Next free `B-NNNN` id. When `index` (from buildCellIndex) is given, the id is
 * drawn from an in-memory counter instead of re-listing the cell dir -- see
 * issue #27, where ingesting M candidates re-listed the directory M times.
 */
export function nextId(root, index) {
  if (index) {
    index.nextIdNum += 1;
    return "B-" + String(index.nextIdNum).padStart(4, "0");
  }
  const { cells } = paths(root);
  _diskStats.dirListings++;
  const ids = readdirSync(cells)
    .map((f) => /^B-(\d+)/.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const n = (ids.length ? Math.max(...ids) : 0) + 1;
  return "B-" + String(n).padStart(4, "0");
}

/**
 * Build an in-memory snapshot of all cells once, for reuse across many
 * writeCellDeduped calls in a single ingestion run. Without this, findDuplicate
 * re-read every cell file and nextId re-listed the cell dir for every single
 * candidate, making a `learn` run over M candidates against N existing cells
 * cost O(N*M) disk operations instead of O(N+M) (issue #27).
 */
export function buildCellIndex(root) {
  const cells = readCells(root);
  let maxId = 0;
  for (const c of cells) {
    // Match the original nextId()'s behavior exactly: parse the id out of the
    // filename, not the frontmatter id field, in case the two ever disagree.
    const m = /^B-(\d+)/.exec(c.file || "");
    if (m) maxId = Math.max(maxId, Number(m[1]));
  }
  return { cells, nextIdNum: maxId };
}

/** Serialize + write one cell. Returns { id, file }. Pass `index` (from
 * buildCellIndex) to avoid a directory relist for the id and to keep the
 * in-memory cell list current for subsequent dedup checks in the same run. */
export function writeCell(root, c, index) {
  const { cells } = paths(root);
  const id = c.id || nextId(root, index);
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
  const name = `${id}-${slug(c.hook || c.what)}.md`;
  const file = join(cells, name);
  const text = fm + "\n" + body;
  writeFileSync(file, text);
  if (index) {
    index.cells.push({
      file: name, id, tags, hook: c.hook || c.what || "", type: c.type || "reference",
      scope: c.scope || "global", confidence: c.confidence ?? 1.0,
      created: c.created || new Date().toISOString().slice(0, 10),
      // Match the shape readCells() would produce on a re-read: source is the
      // raw frontmatter string, not the live object, so any later consumer of
      // this cached cell sees the same thing it would see after a disk reload.
      source: c.source != null ? JSON.stringify(c.source) : undefined,
      effector: undefined, body, text,
    });
  }
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

// Test-only counters for the two disk operations issue #27 made quadratic:
// reading every cell file for dedup, and listing the cell dir for the next id.
// Tests assert these stay ~constant across a `learn` run instead of timing
// wall-clock, which is reliable but flakier under CI load. Production code
// never reads this export.
export const _diskStats = { cellFileReads: 0, dirListings: 0 };

/** Load every cell as a structured object. */
export function readCells(root) {
  const { cells } = paths(root);
  if (!existsSync(cells)) return [];
  _diskStats.dirListings++;
  return readdirSync(cells)
    .filter((f) => f.endsWith(".md") && /^B-\d+/.test(f))
    .map((f) => {
      _diskStats.cellFileReads++;
      const text = readFileSync(join(cells, f), "utf8");
      const { fm, body } = parseFrontmatter(text);
      if (!fm.id) return null;
      return {
        file: f, id: fm.id, tags: fm.tags || [], hook: fm.hook || "", type: fm.type || "reference",
        scope: fm.scope || "global", confidence: fm.confidence != null ? Number(fm.confidence) : 1.0, created: fm.created, source: fm.source,
        effector: fm.effector,
        body, text,
      };
    })
    .filter(Boolean);
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

/** Find an existing cell that looks like the same fact as `candidate` (tag overlap + hook similarity).
 * Pass `index` (from buildCellIndex) to check against an in-memory cell list instead
 * of re-reading every cell file from disk -- see issue #27. */
export function findDuplicate(root, candidate, index) {
  const candTags = candidate.tags || [];
  const candWords = words(candidate.hook || candidate.what);
  let best = null, bestScore = 0, bestHookScore = 0;
  for (const c of index ? index.cells : readCells(root)) {
    const tagScore = jaccard(candTags, c.tags || []);
    if (tagScore === 0) continue; // require at least some shared tag before comparing text
    const hookScore = jaccard(candWords, words(c.hook));
    const score = tagScore * 0.5 + hookScore * 0.5;
    if (score > bestScore) { bestScore = score; best = c; bestHookScore = hookScore; }
  }
  // A high blended score can come almost entirely from tag overlap while the hooks
  // describe different subjects: tags are extracted with a 4+ char word filter, so
  // a short distinguishing entity ("foo" vs "bar" in "Remove <flag> feature flag")
  // never makes it into the tag set and the two commits look tag-identical even
  // though they're about different flags. The hook text still carries that word,
  // so also require the hooks themselves to be strongly similar -- not just the
  // blend -- before two commits are treated as the same fact.
  return bestScore >= 0.5 && bestHookScore >= 0.75 ? best : null;
}

/**
 * Write a cell, but dedup/reconcile against existing cells first (ingestion §4.4-4.5):
 * same fact found → merge into it (stronger/more-recent confidence wins) instead of
 * creating a duplicate; return { merged: true } so callers can tally it separately.
 *
 * Pass `index` (from buildCellIndex) when calling this in a loop over many candidates
 * (git/doc/PR ingestion) -- it reuses one in-memory cell list and next-id counter
 * across the whole run instead of re-reading every cell file and re-listing the cell
 * dir per candidate (issue #27).
 */
export function writeCellDeduped(root, candidate, index) {
  const dup = findDuplicate(root, candidate, index);
  if (!dup) return { ...writeCell(root, candidate, index), merged: false };
  const dupConf = Number(dup.confidence ?? 0);
  const candConf = Number(candidate.confidence ?? 0);
  const patch = { confidence: Math.max(candConf, dupConf) };
  // Only replace the incumbent's Why when the candidate is strictly more confident.
  // Every git-sourced commit defaults to the same 0.4 confidence, so a tie is the
  // common case, not the exception -- treating ">=" as license to overwrite let
  // whichever commit got deduped second silently clobber the first cell's rationale.
  if (candConf > dupConf && candidate.why) patch.why = candidate.why;
  updateCell(root, dup.id, patch);
  // Keep the cached snapshot in sync so a later candidate in this same run that
  // also dedups against `dup` sees its updated confidence, not a stale value.
  if (index) dup.confidence = patch.confidence;
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
// Build a claim-shaped hook for a doc section.
//
// Using the heading alone produced hooks like "Stack", "TL;DR" and "The Atlas":
// measured across two unrelated repos, ~86% of doc hooks contained no verb at
// all. Recall matches against the hook, so near-identical topic words gave the
// ranker nothing to separate -- every query came back "50 of 50 matches" and
// let the budget do the truncating.
//
// Appending the section's first sentence gives the ranker real terms to match
// while keeping the heading's context.
// Trailing periods after these are not sentence ends ("e.g." / "Dr." / "etc.").
// Checked against the text immediately before a candidate '.', so only the
// abbreviation itself needs listing, not every sentence that might contain one.
const ABBREVIATIONS = new Set([
  "e.g", "i.e", "etc", "mr", "mrs", "ms", "dr", "prof", "sr", "jr",
  "vs", "inc", "ltd", "co", "st", "fig", "approx", "no", "u.s", "u.k",
]);

function endsWithAbbreviation(prefix) {
  const m = /[a-z]+(?:\.[a-z]+)*$/i.exec(prefix);
  return !!m && ABBREVIATIONS.has(m[0].toLowerCase());
}

/** Find the first complete sentence in `text` within the first `max` chars.
 * Returns the sentence (including its ending punctuation) or null if none
 * qualifies -- e.g. the text has no sentence-ending punctuation in range, or
 * every candidate is an abbreviation like "e.g." rather than a real sentence end. */
function firstSentence(text, max) {
  const re = /[.!?](?=\s|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const end = m.index + 1;
    if (end > max) break;
    if (end < 15) continue; // too short to be a real sentence
    if (endsWithAbbreviation(text.slice(0, m.index))) continue;
    return text.slice(0, end).trim();
  }
  return null;
}

/** Break `text` to at most `max` chars without severing a word: cut at the
 * nearest whitespace at or before the limit (stripping a trailing clause mark
 * like a comma, so it doesn't dangle) instead of a raw character slice. Only a
 * single token longer than `max` itself falls back to a hard slice -- there is
 * no boundary to honor. Deliberately not "nearest comma anywhere in range":
 * an early comma can sit far before `max` (e.g. "Born in 1990, ...") and
 * jumping back to it would throw away most of the available length for no
 * benefit over just stopping at the last whole word. */
function breakAtBoundary(text, max) {
  if (text.length <= max) return text.trim();
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  if (lastSpace <= 15) return slice.trim(); // one long unbroken token -- nothing to break at
  return slice.slice(0, lastSpace).replace(/[,;:]$/, "").trim();
}

function docHook(title, body) {
  const flat = body.trim().replace(/\s+/g, " ");
  // Skip boilerplate the first line often is: a bare link, an image, a badge.
  const prose = flat.replace(/^(!\[[^\]]*\]\([^)]*\)|\[[^\]]*\]\([^)]*\)|[|>#*`-]+)\s*/, "").trim();
  // Prefer a real sentence boundary; if none exists within range (no terminal
  // punctuation at all, or only abbreviations), fall back to a clause/word
  // boundary rather than an arbitrary character cutoff that can land mid-word.
  const sentence = firstSentence(prose, 170) || breakAtBoundary(prose, 140);
  if (!sentence) return title;
  // Only rescue headings that carry almost no signal on their own: short AND
  // verbless, the "Stack" / "TL;DR" / "The Atlas" shape. Appending a sentence to
  // every heading inflated recall cost ~2.5x (533 -> 1357 tokens on one query)
  // without improving which cell ranked first, so the cost is spent only where
  // the hook would otherwise be near-useless.
  const hasVerb = /\b(is|are|was|were|use[sd]?|add(ed|s)?|fix(ed|es)?|must|should|never|always|requires?|needs?|because)\b/i.test(title);
  const words = title.trim().split(/\s+/).length;
  if (hasVerb || words > 4) return title;
  const prefix = `${title} — `;
  const budget = 120 - prefix.length;
  // The sentence/clause already respects a boundary; re-apply the same
  // boundary-aware trim (not a raw slice) if the 120-char hook cap still
  // requires shortening it further.
  const fitted = sentence.length <= budget ? sentence : breakAtBoundary(sentence, budget);
  return prefix + fitted;
}

export function learnDocs(root) {
  const p = paths(root);
  const state = JSON.parse(readFileSync(p.state, "utf8"));
  const seen = new Set(state.seenDocs || []);
  const files = docFiles(root);
  let added = 0, skipped = 0, merged = 0;
  // Load cells once and reuse across every section in this run (issue #27) instead
  // of re-reading all cell files and re-listing the cell dir per section.
  const index = buildCellIndex(root);
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
        hook: docHook(sec.title, sec.body),
        what: sec.body.trim().slice(0, 500),
        source: { kind: "doc", path: rel, heading: sec.title },
      }, index);
      seen.add(key);
      wasMerged ? merged++ : added++;
    }
  }
  state.seenDocs = [...seen];
  writeFileSync(p.state, JSON.stringify(state, null, 2));
  return { added, skipped, merged };
}

/**
 * Minimal entergram.toml reader — flat string/array keys, plus one level of
 * `[section]` nesting (no TOML dep needed).
 *
 * `[extraction]`/`[recall]` headers used to be silently skipped (they have no
 * "=", so the old key=value regex never matched them) and every key that
 * followed landed on the flat top-level object as a raw string -- so
 * `cfg.extraction.min_commit_len` was always undefined, and what little did
 * show up (`cfg.min_commit_len`) was the string "20", not the number 20.
 * Tracking the current section and coercing scalars fixes both.
 */
export function readConfig(root) {
  const out = {
    name: root.split("/").pop(), sources: ["git", "docs", "github"],
    doc_paths: ["docs", "adr", "decisions", "README.md", "CHANGELOG.md", "ARCHITECTURE.md"],
    exclude: ["node_modules", ".env", "secrets"],
  };
  const { config } = paths(root);
  if (!existsSync(config)) return out;

  const parseList = (body) =>
    body.split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean);

  // Bare scalars (unquoted) come back typed -- number/boolean -- rather than as
  // raw TOML text, so `extraction.min_commit_len` etc. are usable directly.
  // Quoted strings still come back as plain (unquoted) strings, as before.
  const coerceScalar = (raw) => {
    const unquoted = raw.replace(/^"|"$/g, "");
    if (raw === unquoted) {
      if (unquoted === "true") return true;
      if (unquoted === "false") return false;
      if (/^-?\d+(\.\d+)?$/.test(unquoted)) return Number(unquoted);
    }
    return unquoted;
  };

  let section = null; // null = top-level; otherwise the current [section] name
  const lines = readFileSync(config, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    const header = /^\[(\w+)\]$/.exec(trimmed);
    if (header) {
      section = header[1];
      out[section] ??= {};
      continue;
    }

    const m = /^(\w+)\s*=\s*(.*)$/.exec(trimmed);
    if (!m) continue;
    const [, key] = m;
    let raw = m[2];
    const target = section ? out[section] : out;

    if (raw.startsWith("[")) {
      // An array may span lines. `init` writes doc_paths that way, and reading
      // only the first line yielded "[" -> [""] -> [] -- an empty list that
      // overrode the default above and silently disabled doc ingestion.
      while (!raw.includes("]") && i + 1 < lines.length) raw += " " + lines[++i].trim();
      target[key] = parseList(raw.slice(raw.indexOf("[") + 1, raw.lastIndexOf("]") === -1 ? undefined : raw.lastIndexOf("]")));
    } else {
      target[key] = coerceScalar(raw);
    }
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
  // A doc_path may be a glob. The default config ships "docs/**/*.md", which was
  // passed to existsSync() verbatim -- a path containing ** never exists, so the
  // entry was skipped and whole docs trees went uningested.
  const expandGlob = (pattern) => {
    const parts = pattern.split("/");
    const firstGlob = parts.findIndex((p) => p.includes("*") || p.includes("?"));
    const base = parts.slice(0, firstGlob).join("/");
    const baseAbs = base ? join(root, base) : root;
    if (!existsSync(baseAbs) || !statSync(baseAbs).isDirectory()) return [];
    // Translate the glob in ONE pass. Doing it as a chain of .replace() calls
    // corrupts itself: the rule for "*" rewrites the "*" inside the replacement
    // that the "**/" rule just inserted.
    const rx = new RegExp(
      "^" + pattern.replace(/\*\*\/|\*\*|\*|\?|[.+^${}()|[\]\\]/g, (tok) => {
        if (tok === "**/") return "(?:[^/]+/)*";   // zero or more directories
        if (tok === "**") return ".*";
        if (tok === "*") return "[^/]*";
        if (tok === "?") return "[^/]";
        return "\\" + tok;                        // literal regex metacharacter
      }) + "$",
    );
    const found = [];
    const descend = (rel) => {
      for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
        if (e.name.startsWith(".")) continue;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (isExcluded(r)) continue;
        if (e.isDirectory()) descend(r);
        else if (rx.test(r)) found.push(r);
      }
    };
    descend(base);
    return found;
  };

  for (const entry of cfg.doc_paths) {
    if (isExcluded(entry)) continue;
    if (entry.includes("*") || entry.includes("?")) { out.push(...expandGlob(entry)); continue; }
    const abs = join(root, entry);
    if (!existsSync(abs)) continue;
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
  if (existsSync(join(root, "PROTOCOL.md"))) ids.add("B-006");
  const problems = [];
  for (const c of cells) {
    if (!c.id) problems.push(`${c.file}: missing id`);
    if (!c.hook) problems.push(`${c.file}: missing hook`);
    // A [[B-NNN]] inside a doc-harvested cell is the doc talking ABOUT cells --
    // often ids belonging to another store -- not a link this store owns. Flagging
    // those made doctor fail on entergram's own repo, whose docs cite illustrative
    // ids like [[B-1204]] that were never meant to resolve here.
    const fromDoc = /"kind"\s*:\s*"doc"/.test(c.source || "");
    for (const m of fromDoc ? [] : c.text.matchAll(/\[\[(B-\d+)\]\]/g)) {
      if (!ids.has(m[1])) problems.push(`${c.file}: dangling link ${m[1]}`);
    }
  }
  return { count: cells.length, problems };
}

/**
 * Which `learn` sources should run for a given `--source` value, honoring
 * entergram.toml's top-level `sources` list when `src` is "all" (the default) --
 * that key used to be parsed into an array and then never consulted, so a repo
 * that trimmed its `sources` list still had `learn --source all` touch every
 * source anyway. An explicit, non-"all" `--source` is unaffected: it always
 * meant exactly that one source and still does.
 */
export function resolveSources(root, src) {
  if (src !== "all") {
    return { git: src === "git", docs: src === "docs", pr: src === "pr", issue: src === "issue" };
  }
  const cfg = readConfig(root);
  const list = Array.isArray(cfg.sources) && cfg.sources.length ? cfg.sources : ["git", "docs", "github"];
  const has = (name) => list.includes(name);
  // "all" never implied issues historically (issues only ran via an explicit
  // --source issue), so that stays true regardless of what `sources` lists.
  return { git: has("git"), docs: has("docs"), pr: has("pr") || has("github"), issue: false };
}

/** Ingest recent git commits into cells (heuristic v1 — LLM extraction is the GitHub-source path below). */
export function learnGit(root, { limit = 50, since, minCommitLen } = {}) {
  const p = paths(root);
  const state = JSON.parse(readFileSync(p.state, "utf8"));
  const seen = new Set(state.seenShas);
  // entergram.toml's [extraction].min_commit_len (per its own comment: "Min commit
  // message length worth extracting a decision from") used to be parsed and then
  // dropped on the floor. Absent from config (or from an explicit caller option),
  // this defaults to 0 -- i.e. no length filtering -- so repos whose config predates
  // this wiring keep ingesting exactly what they always did.
  const minLen = minCommitLen ?? readConfig(root).extraction?.min_commit_len ?? 0;
  const US = "\x1f", RS = "\x1e";
  const range = since ? `${since}..HEAD` : "";
  const raw = execSync(
    `git -C "${root}" log --no-merges ${range} -n ${limit} --date=short --pretty=format:%H${US}%an${US}%ad${US}%s${US}%b${RS}`,
    { encoding: "utf8", maxBuffer: 1 << 24 },
  );
  let added = 0, skipped = 0, merged = 0;
  // Load cells once and reuse across every commit in this run (issue #27) instead
  // of re-reading all cell files and re-listing the cell dir per commit.
  const index = buildCellIndex(root);
  for (const rec of raw.split(RS)) {
    const line = rec.replace(/^\n/, "");
    if (!line.trim()) continue;
    const [sha, author, date, subject, bodyText = ""] = line.split(US);
    if (!sha) continue;
    if (seen.has(sha)) { skipped++; continue; }
    // Skip low-signal commits.
    if (/^(wip|fix typo|merge|bump|chore|format)\b/i.test(subject.trim())) { skipped++; seen.add(sha); continue; }
    if (subject.trim().length < minLen) { skipped++; seen.add(sha); continue; }
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
    }, index);
    seen.add(sha);
    wasMerged ? merged++ : added++;
  }
  state.seenShas = [...seen];
  state.lastLearn = new Date().toISOString();
  writeFileSync(p.state, JSON.stringify(state, null, 2));
  return { added, skipped, merged };
}
