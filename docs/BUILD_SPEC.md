# Entergram — Technical Build Spec (working name)

*Persistent engineering memory for AI coding agents. Productizes the existing `~/.claude/brain`
system (cells + INDEX + gate loop + `brain.sh` + skills) into a shippable dev-infra product.*

> One line: **"The *why* behind your codebase, on tap for any AI agent — in 5 minutes."**

---

## 0. Design principles (non-negotiable)

1. **Local-first.** Code and memory never leave the machine unless the user opts into hosted sync.
   This is a *sales feature*, not just a policy — enterprises can't send proprietary code to mem0/cloud.
2. **Markdown is the source of truth; SQLite is a derived index.** Never invert this. A human can
   `cat`/`git diff` a cell. The DB is a rebuildable cache (grep → FTS/vector upgrade).
3. **Selective recall, never load-everything.** The token-economics differentiator. Retrieval returns
   top-K cells within a token budget — a 5k-cell brain costs the same per query as a 50-cell one.
4. **The gate loop IS the write path.** Ingestion isn't "embed and dump" — it's extract → dedup →
   conflict-resolve → write-back → doctor. That discipline is the moat; competitors just retrieve.
5. **MCP is the integration.** One server spans Claude Code, Cursor, Windsurf, Continue. Not "one
   config file" (that's a fiction — each tool differs); one *protocol*.

---

## 1. What we're productizing (reuse map)

| Exists today (`~/.claude/brain`) | Becomes in the product |
|---|---|
| `B-NNN-*.md` cells (frontmatter + body) | Cell store — same format, +source/confidence fields |
| `INDEX.md` (grep-addressable map) | SQLite FTS index (grep still works as fallback) |
| `brain.sh` (doctor/next-id/stats/dups/stale) | `entergram` CLI internals — battle-tested hygiene |
| Gate loop (recall→write-back→consolidate→decay) | The ingestion + recall engine |
| Skills + effectors | `learn` extractors + future orchestration layer |
| Cross-machine sync + per-machine blacklist | `entergram sync` + privacy guard (reused verbatim) |
| `redact-identity` scanner | Pre-share leak check for team/public brains |

**This is why 14 days is plausible:** the primitives are dogfooded across 184 cells, 4 machines,
~500 commits, 2 months. We're wrapping a working system, not inventing one.

---

## 2. Architecture

```
┌─────────────────────────── developer machine ───────────────────────────┐
│                                                                          │
│   repo/.entergram/                    entergram CLI                MCP server  │
│   ├── cells/B-NNN-*.md   ◄────────  ingest  ──────►  SQLite   (stdio)    │
│   ├── index.sqlite                  recall           index    recall()   │
│   ├── entergram.toml                   doctor                    remember() │
│   └── .gitignore (privacy guard)    sync                       learn()   │
│                                                              resources   │
│        ▲ source of truth              ▲                          ▲       │
│        │                              │                          │       │
│     git history                 human/agent                 Claude Code, │
│     docs / ADRs                 write-back                  Cursor, etc.  │
└──────────────────────────────────────────────────────────────────────────┘
        (optional) entergram sync  →  private git remote / managed store
```

Three components:
- **Engine** (CLI + SQLite + markdown cells) — ingest, index, recall, hygiene.
- **MCP server** (`entergram serve`) — exposes recall/remember/learn to any MCP-speaking agent.
- **Sync** (optional, phase 2) — push/pull the cell store to a private remote; per-repo team brain.

---

## 3. Data model

### 3.1 Cell schema (extends the existing frontmatter)

```markdown
---
id: B-0421
type: decision            # decision | gotcha | convention | reference | architecture | procedure
tags: [auth, jwt, migration]
scope: services/auth
source:                   # provenance — what this was learned from (NEW)
  kind: pr                # commit | pr | issue | adr | doc | manual
  ref: "#812"
  sha: 9f3a1c2
  author: "@alice"
  date: 2026-05-14
confidence: 0.82          # extractor confidence; <0.6 → review queue (NEW)
hook: Moved auth from sessions to JWT to kill sticky-session infra
---

## What
Session auth was replaced with stateless JWT across services/auth.

## Why
Sticky sessions forced a Redis dependency and blocked horizontal scaling; JWT removed both.

## Outcome
Redis dropped from the auth path; p99 login latency −40%. Cookie sessions still exist in /legacy.

Related: [[B-0417]], [[B-0433]]
```

`{what, why, outcome, author}` is exactly the plan's target quadruple — mapped onto the cell body.

### 3.2 SQLite layout (derived index, rebuildable from cells)

```sql
cells(id PK, type, scope, hook, body, source_kind, source_ref, source_sha,
      author, confidence, created_at, updated_at, file_path)
tags(cell_id, tag)                      -- many-to-many; the coupling coefficients
cells_fts USING fts5(hook, body, content='cells')   -- selective full-text recall
edges(from_id, to_id)                   -- [[B-NNN]] lateral links
embeddings(cell_id, vec BLOB)           -- OPTIONAL, phase 1.5; rerank only, not primary
ingest_watermark(source_kind, last_sha, last_run)    -- incremental ingestion
```

Recall path: `tags` filter → `cells_fts` match → (optional) embedding rerank → top-K under budget.
No embedding provider required for v1 — FTS + tags is enough for a great demo and keeps it offline.

---

## 4. Ingestion pipeline (the moat — build this first)

```
harvest → chunk → extract → dedup → reconcile → write-back → doctor
```

1. **Harvest** (incremental, since `ingest_watermark`):
   - `git log` (commits since last SHA; skip merge/`fix typo`/`wip` noise heuristically)
   - PRs + issues via `gh api` (title, body, review comments, merge outcome)
   - `docs/`, `README`, `ADR/` (architecture decision records), `CHANGELOG`
   - Repo structure (dir tree, entrypoints) → one "architecture" cell
2. **Chunk**: one candidate unit = one PR (preferred; richest {what/why/outcome}) or one meaningful
   commit cluster. Squash-merge aware (a squashed PR = one unit; don't double-count its commits — this
   is where naive tools break; reuse `pr-merge-sweep` logic).
3. **Extract** (LLM): per unit → `{type, what, why, outcome, author, tags, scope, confidence}`.
   Batchable + prompt-cacheable (the extraction prompt is the stable prefix).
4. **Dedup**: match candidate against existing cells by tag overlap + FTS/embedding similarity.
   Same fact → update/merge, not new cell.
5. **Reconcile** (gate-loop conflict rule): if it contradicts an existing cell, stronger/more-recent
   wins; mark the loser superseded; record why. Prevents the "5 contradicting copies" failure.
6. **Write-back**: emit cell markdown + upsert SQLite row + edges.
7. **Doctor**: validate (links resolve, frontmatter well-formed, no dangling) — gate the commit.

Quality guards: confidence < 0.6 → **review queue** (`entergram review`), not silently trusted.
"Learn from git history" degrades on messy repos — surface what was skipped, never claim full coverage.

---

## 5. Recall (the value)

`recall(query, budget_tokens=2000)`:
1. Parse query → candidate tags + FTS terms.
2. Tag filter → FTS rank → (optional) embedding rerank.
3. Pack top-K cells until `budget_tokens` — return hooks first, expand bodies as budget allows.
4. Return structured: `[{id, hook, why, source, confidence}]` + a one-paragraph synthesis.

The agent gets *the decisions relevant to this task*, not a document dump. That's the token story
in the pitch: "connect a 300k-line repo, the agent understands architecture + past decisions" =
selective recall over an auto-built decision index.

---

## 6. MCP surface (the distribution wedge)

`entergram serve` → MCP server over stdio.

**Tools:**
- `recall(query, budget?)` → relevant cells + synthesis
- `remember(what, why?, tags?, scope?)` → write a cell (agent- or human-initiated)
- `learn(source?, since?)` → run ingestion (e.g. "learn from the last 50 commits")
- `doctor()` → health/coverage report

**Resources:** each cell exposed as `entergram://cell/B-NNN`; `entergram://index` for the map.

**Client config (the "5-minute" install):**
- Claude Code — add to `.mcp.json`:
  ```json
  { "mcpServers": { "entergram": { "command": "entergram", "args": ["serve"] } } }
  ```
- Cursor / Windsurf — MCP settings entry (same command).
- Continue — `config.json` mcpServers block.

One binary, one server, every agent. That's the universal integration the plan wanted.

---

## 7. CLI

```
entergram init          # scaffold repo/.entergram/, entergram.toml, privacy .gitignore
entergram learn [--since SHA] [--source git|pr|docs|all]   # ingestion pipeline
entergram recall "<query>" [--budget N]                    # test recall from terminal
entergram dispatch "<query>" [--budget N]                  # procedure-vs-fact selection (§13)
entergram remember "<what>" [--why ...] [--tags ...]       # manual write-back
entergram review        # triage low-confidence extracted cells (accept/edit/reject)
entergram doctor        # hygiene (wraps brain.sh checks)
entergram sync [push|pull]                                 # phase 2 — team/cross-machine
entergram serve         # MCP server (stdio)
```

Distribution: `npm i -g entergram` (Node wrapper) or `curl … | bash`. Node/TS core (fast MCP libs,
Cursor/Continue ecosystem), SQLite via better-sqlite3, `simple-git` + `gh` for harvest.

---

## 8. Privacy & security (a selling point, not an afterthought)

- Default: **nothing leaves the machine.** Extraction can run against a local model or the user's own
  API key; the cell store is local files.
- Reuse the per-machine blacklist + `redact-identity` scanner before any `sync push` or team share.
- `entergram.toml` declares what sources are in-scope (never scans `.env`, secrets, `node_modules`).

---

## 9. 14-day plan (as specified — followed verbatim)

| Day | Deliverable | Technical notes (the *how*) |
|---|---|---|
| 1 | **Positioning**: name, domain, README rewrite, ICP, one-liner | See Day-1 pack below; name → Entergram; ICP = senior eng on 50k+ LOC, 6mo+ repos on Claude/Cursor |
| 2 | **Landing page**: hero, demo GIF slot, features, pricing, waitlist, Stripe link (Next.js/Vercel/Tailwind) | No blog, no docs yet |
| 3 | **Installation**: one-command install + CLI shell (`init`/`remember`/`recall`/`learn`/`doctor`) | `npm i -g entergram` or `curl…\|bash`; wraps `brain.sh` internals |
| 4 | **Memory engine**: repo indexing (README, docs, ADRs, git history) into SQLite | Cell schema §3; source of truth = markdown, SQLite = FTS index; no external DB |
| 5 | **Agent integration**: Claude Code, Cursor, Windsurf, Continue | Ship as **MCP server** (§6) — the real "one integration" |
| 6 | **GitHub integration**: learn from commits/PRs/issues → {decision, reason, outcome, author} | Ingestion pipeline §4; squash-aware; incremental watermark |
| 7 | **Demo** (3-min): "deleted half my project, Claude rebuilt it because Entergram remembered" | The sales asset — recall §5 over the auto-built index |
| 8 | **Docs**: Getting Started, Architecture, Why, FAQ, Comparison (Cursor memory / Claude Projects / LangGraph / mem0 / LlamaIndex) | Objection-handling |
| 9 | **Payments**: Stripe — Starter $19 / Pro $49 / Teams $199 / Enterprise book-demo | Per-repo for Teams |
| 10 | **First customers**: DM 100 founders + 100 CTOs + 100 AI engineers — "$500, I set up your engineering memory in an hour" | Cash-first |
| 11 | **Reddit**: r/ClaudeAI, r/Cursor, r/programming, r/ArtificialIntelligence, r/LocalLLaMA — show demo, don't advertise | |
| 12 | **Hacker News**: "I built persistent memory for Claude Code" | |
| 13 | **Product Hunt assets**: logo, GIF, screenshots, video, tagline, description, FAQ | |
| 14 | **Launch**: GitHub, HN, Reddit, LinkedIn, X, Product Hunt, email everyone | |

**One risk to hold in view (not a re-sequence, just a flag):** the Day 7 demo depends entirely on the
Day 4–6 engine landing well. Keep a Day 4 checkpoint — if git-history recall isn't compelling by end of
Day 6, the demo (and everything downstream) needs that fixed first. Build the page Day 2 as planned, but
treat the engine as the thing that can't slip.

---

## 10. Pricing (per-repo, services-first)

- **Brain Install — $500 one-off**: I set up Entergram on your repo (ingest, MCP wiring, tuning). Cash + design-partner intimacy.
- **Solo — $19/mo**, **Pro — $49/mo** (private sync, PR/issue learn, priority).
- **Team — $199/mo per repo** (shared engineering memory — the real money; keep it central even without RBAC).
- Enterprise — book a call (local-first/on-prem is the wedge vs cloud memory tools).

---

## 11. Explicitly NOT building (v1)

Multi-agent, knowledge-graph UI, RL dashboards, analytics, healthcare/compliance, marketplace, RBAC,
billing portal, Kubernetes. Memory + recall + MCP, done exceptionally.

---

## 12. Open risks → mitigation

| Risk | Mitigation |
|---|---|
| Auto-extraction quality (garbage in on messy repos) | Confidence scoring + `entergram review` queue; skip-noise heuristics; never claim full coverage |
| Crowded "AI memory" market | Position as *engineering-decision* memory (git-mined), local-first, agent-agnostic — not chat memory |
| MCP client drift across tools | Server is one artifact; per-tool config is thin and versioned in docs |
| Big-repo ingest cost/time | Incremental watermark; PR-level units; prompt-cache the extractor; cap first-run to last N months |
| Recall relevance without embeddings | Ship tags+FTS v1; add embedding rerank v1.5 only if recall@k is weak |

---

## 13. Evolution → cognitive runtime (architect for, don't market)

Memory (v1) → recall (v1) → **learn/consolidate** (built) → **dispatch** (built — the selector) →
**skills/orchestration** (owed) → planning/reflection (v2+). The gate loop is the runtime; today's
product turns on memory + recall + learn. Say "memory" in the market; keep the runtime in the
architecture.

`dispatch(query, budget?)` (`cli/src/db.js`, design in `docs/cognitive-runtime.md`) is now built:
given a query, it ranks `type: procedure` cells against the fact pool by bm25 and returns the
procedure as the winner only if it's a stronger match AND its `effector:` script exists on disk —
otherwise it falls back to the exact shape `recall`/`search()` already return. It also surfaces
(never follows) any other procedure cells the winner cites via `[[B-NNNN]]`, as `citedProcedures`.
Wired into the CLI (`entergram dispatch "<query>"`) and the MCP server (`dispatch` tool) alongside
`recall`. What's still owed: `dispatch` is a selector, not an executor — it never runs, spawns, or
shells out to an effector — so *orchestration* (a procedure automatically triggering its cited
sub-procedures, or a human/agent action actually running the effector `dispatch` pointed at) and
any MARL-style *learned* action selection both remain unbuilt.
```
