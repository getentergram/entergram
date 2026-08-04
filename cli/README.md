# engram (CLI)

Persistent engineering memory for AI coding agents. Cells are plain Markdown (source of truth);
the index is a rebuildable cache. Zero native dependencies.

## Install

```bash
npm install -g engram        # once published
# or one-liner:
curl -fsSL https://engram.dev/install | bash
```

Local dev (from this repo, before npm publish):
```bash
cd cli && npm install && npm link   # symlinks the `engram` binary globally
```

## Commands

```bash
engram init                       # scaffold .engram/ in the current repo
engram learn [--source all|git|docs] [--limit 50]   # ingest git history + docs/README/ADRs → cells
engram remember "<fact>" \        # write a fact by hand
        --why "…" --tags a,b --scope services/auth --type decision
engram recall "<query>" [--budget 2000]   # FTS/bm25 retrieval under a token budget
engram review                     # triage low-confidence auto-extracted cells
                                  #   --accept <id> | --reject <id> | --tag <id> --to a,b | --why <id> --to "…"
engram reindex                    # rebuild the SQLite index from the cells
engram doctor                     # health check (ids, hooks, dangling links, index coverage)
engram serve                      # MCP server for your agent (Day 5)
```

The index is SQLite + FTS5 (`.engram/index.db`, git-ignored and rebuildable). Markdown cells remain the source of truth.

## What a cell looks like

```markdown
---
id: B-0007
type: decision
tags: [auth, jwt]
scope: services/auth
source: {"kind":"commit","sha":"9f3a1c2","author":"@alice","date":"2026-05-14"}
confidence: 0.4
created: 2026-05-14
hook: Moved auth from sessions to JWT to kill sticky-session infra
---

# Moved auth from sessions to JWT to kill sticky-session infra
## What …  ## Why …  ## Outcome …
```

## Roadmap (from the build spec)
- ✅ Day 4: SQLite/FTS index, docs/README/ADR ingestion, `engram review`, `engram reindex`.
- Day 5: `engram serve` — MCP server (recall/remember/learn over stdio).
- Day 6: LLM extraction of {decision, reason, outcome} from PRs/issues.
