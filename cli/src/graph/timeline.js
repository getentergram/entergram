// Per-cell temporal history for the Timeline view.
//
// Cells are Markdown in a git repo, so git *is* the mutation log — richer than any
// `created:` frontmatter field, which records only birth and drifts the moment someone
// edits without touching it. The brain store carries no dates at all (0/208), so this
// is the only real source. Falls back to frontmatter + mtime outside a repo.

import { execFileSync } from "node:child_process";
import { realpathSync, statSync, existsSync } from "node:fs";
import { relative, resolve } from "node:path";
import { paths, readCells } from "../lib.js";

// Unit separator: safe delimiter for a --format string, since commit subjects
// can contain any printable character including | and tabs.
const SEP = "\x1f";

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** Resolve the repo that actually versions the cells (the store may be a symlink into dotfiles). */
export function locateRepo(root) {
  const cellsDir = paths(root).cells;
  if (!existsSync(cellsDir)) return null;
  // realpath matters: ~/.claude/brain is a symlink and git would otherwise resolve the
  // *linking* repo rather than the one holding the files.
  const real = realpathSync(cellsDir);
  try {
    const top = git(real, ["rev-parse", "--show-toplevel"]).trim();
    return { repo: top, cellsDir: real, prefix: relative(top, real) };
  } catch {
    return null; // not versioned — caller falls back
  }
}

/**
 * Walk git history once and bucket every touch by file.
 *
 * One `git log` for the whole cells directory rather than one per cell: on a 737-commit
 * store that is the difference between ~40ms and ~30s.
 */
export function cellHistory(root) {
  const loc = locateRepo(root);
  if (!loc) return { source: "filesystem", events: fsFallback(root) };

  let raw;
  try {
    raw = git(loc.repo, [
      "log", "--date-order", "--no-merges",
      `--format=C${SEP}%H${SEP}%aI${SEP}%an${SEP}%s`,
      "--name-status", "--", loc.prefix || ".",
    ]);
  } catch {
    return { source: "filesystem", events: fsFallback(root) };
  }

  const events = new Map(); // cellId -> event[]
  let commit = null;

  for (const line of raw.split("\n")) {
    if (line.startsWith(`C${SEP}`)) {
      const [, sha, date, author, ...rest] = line.split(SEP);
      commit = { sha, date, author, subject: rest.join(SEP) };
      continue;
    }
    if (!commit || !line.trim()) continue;

    const [status, ...pathParts] = line.split("\t");
    const path = pathParts[pathParts.length - 1];
    if (!path || !path.endsWith(".md")) continue;

    const id = cellIdFromPath(path);
    if (!id) continue;

    if (!events.has(id)) events.set(id, []);
    events.get(id).push({
      sha: commit.sha.slice(0, 8),
      date: commit.date,
      author: commit.author,
      subject: commit.subject,
      kind: status.startsWith("A") ? "created"
        : status.startsWith("D") ? "deleted"
        : status.startsWith("R") ? "renamed" : "modified",
    });
  }

  // git log is newest-first; a timeline reads forward.
  for (const list of events.values()) list.reverse();
  return { source: "git", repo: loc.repo, events: Object.fromEntries(events) };
}

/** `claude/brain/B-044-cloud-tf-parity.md` -> `B-044`. Falls back to the bare filename. */
function cellIdFromPath(path) {
  const file = path.split("/").pop();
  const m = file.match(/^([A-Za-z]+-\d+)/);
  return m ? m[1] : file.replace(/\.md$/, "");
}

/** No git: use frontmatter `created` where present, else file mtime, as a single event. */
function fsFallback(root) {
  const { cells } = paths(root);
  const out = {};
  try {
    for (const c of readCells(root)) {
      const stat = statSync(resolve(cells, c.file));
      out[c.id] = [{
        sha: null,
        date: c.created || stat.birthtime.toISOString(),
        author: null,
        subject: "(no git history)",
        kind: "created",
      }];
    }
  } catch { /* store unreadable — an empty timeline is correct, not an error */ }
  return out;
}

/**
 * Collapse per-cell events into the fields the UI actually renders, plus a
 * recency-decay factor so stale corners of the brain can visually fade.
 *
 * Half-life is 90 days: a cell untouched for a quarter reads at half strength.
 */
export function summarize(events, { now = Date.now(), halfLifeDays = 90 } = {}) {
  const summary = {};
  for (const [id, list] of Object.entries(events)) {
    if (!list.length) continue;
    const created = list.find((e) => e.kind === "created") || list[0];
    const last = list[list.length - 1];
    const ageDays = (now - Date.parse(last.date)) / 86400000;
    summary[id] = {
      created: created.date,
      updated: last.date,
      revisions: list.length,
      authors: [...new Set(list.map((e) => e.author).filter(Boolean))],
      deleted: last.kind === "deleted",
      ageDays: Math.max(0, ageDays),
      recency: Math.pow(0.5, Math.max(0, ageDays) / halfLifeDays),
    };
  }
  return summary;
}

/** Ordered event stream for the scrubber — every mutation across the whole brain. */
export function timelineStream(events) {
  const all = [];
  for (const [id, list] of Object.entries(events)) {
    for (const e of list) all.push({ id, ...e });
  }
  return all.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}
