# Architecture

Engram is a small, local memory with four moving parts. Markdown is the source of truth; everything else is a rebuildable cache.

```
 sources                 engine                      surface
 ───────                 ──────                      ───────
 git history  ─┐                       ┌─ recall ──┐
 docs / ADRs  ─┼─ learn → cells ──────►│  (FTS)    ├─► MCP server ─► Claude Code
 merged PRs   ─┘   (extract +          │           │   (stdio)       Cursor / Windsurf
 issues           dedup/reconcile)     └─ index ───┘                 Continue
                                        (SQLite/FTS5)                 + CLI
```

## 1. Cells (source of truth)

Each fact is one Markdown file in `.engram/cells/B-NNNN-*.md` with frontmatter + a body:

```markdown
---
id: B-0007
type: decision            # decision | gotcha | convention | reference | architecture
tags: [auth, jwt]
scope: services/auth
source: {"kind":"pr","ref":"#812","author":"@alice","date":"2026-05-14","url":"…"}
confidence: 0.9           # <0.6 ⇒ review queue
created: 2026-05-14
hook: Moved auth to stateless JWT to drop the Redis dependency
---

# Moved auth to stateless JWT to drop the Redis dependency
## What …   ## Why …   ## Outcome …
```

Cells are plain text you can `git diff` and review in a PR. They commit with your repo (a shared, versioned team memory). Provenance (`source`) links every auto-learned fact back to the PR/commit/doc it came from.

## 2. Ingestion (`learn`)

`harvest → extract → dedup/reconcile → write cell`:

- **Harvest** — git commits (`git log`, noise-filtered), docs/README/ADR sections, merged PRs + closed issues (`gh`). Incremental via per-source watermarks.
- **Extract** — with `ANTHROPIC_API_KEY`, each unit goes to the Anthropic API (forced `record_memory` tool-use) → `{type, what, why, outcome, tags, scope, confidence}`. Without a key, a heuristic fallback (title→what, body→why, confidence 0.4) keeps it working offline.
- **Dedup/reconcile** — the same decision surfacing via a commit *and* its PR is merged into one cell; the stronger/more-recent signal wins (no five contradicting copies).

## 3. Index (SQLite/FTS5)

`.engram/index.db` is a rebuildable FTS5 index (bm25 ranking) — never committed. `recall` filters by tags + full-text, ranks, and packs the top results under a **token budget**, returning a short synthesis. A 5,000-cell memory costs about the same per query as 50 — selective recall, not a document dump.

## 4. Surface (MCP + CLI)

`get-engram serve` exposes memory as MCP tools — `recall`, `remember`, `learn`, `doctor` — over stdio, so any MCP client consumes it. The CLI exposes the same operations for humans and CI.

## Why this shape

- **Local-first** — code and memory stay on your machine unless you opt into sync. A selling point for teams who can't ship code to a cloud memory service.
- **Rebuildable** — delete the index anytime; `get-engram reindex` restores it from the cells.
- **Reviewable** — auto-extracted memories start low-confidence and flow through `get-engram review` before you rely on them.
