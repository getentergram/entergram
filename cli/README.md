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
engram learn [--limit 50]         # ingest git history → cells (incremental, skips seen/noise)
engram remember "<fact>" \        # write a fact by hand
        --why "…" --tags a,b --scope services/auth --type decision
engram recall "<query>" [--budget 2000]   # retrieve the relevant cells under a token budget
engram doctor                     # health check (ids, hooks, dangling links)
engram serve                      # MCP server for your agent (Day 5)
```

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
- Day 4: SQLite/FTS index + `engram review` (triage auto-extracted cells).
- Day 5: `engram serve` — MCP server (recall/remember/learn over stdio).
- Day 6: LLM extraction of {decision, reason, outcome} from PRs/issues.
