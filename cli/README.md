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
engram learn [--source all|git|docs|pr|issue] [--limit 50] [--no-llm]
                                  # ingest git history + docs/README/ADRs + merged PRs → cells
engram remember "<fact>" \        # write a fact by hand
        --why "…" --tags a,b --scope services/auth --type decision
engram recall "<query>" [--budget 2000]   # FTS/bm25 retrieval under a token budget
engram review                     # triage low-confidence auto-extracted cells
                                  #   --accept <id> | --reject <id> | --tag <id> --to a,b | --why <id> --to "…"
engram reindex                    # rebuild the SQLite index from the cells
engram doctor                     # health check (ids, hooks, dangling links, index coverage)
engram serve                      # MCP server (stdio): recall/remember/learn/doctor as tools
```

The index is SQLite + FTS5 (`.engram/index.db`, git-ignored and rebuildable). Markdown cells remain the source of truth.

## Extraction (git/PR/issue → {decision, reason, outcome})

- Set **`ANTHROPIC_API_KEY`** (optionally `ENGRAM_MODEL`, default `claude-haiku-4-5`) and `learn` extracts high-confidence structured memories from merged PRs/issues via the Anthropic API (forced tool-use).
- With no key, it falls back to a heuristic (title→what, body→why, confidence 0.4) so `learn` always works offline. Pass `--no-llm` to force heuristic.
- Requires `gh` installed + authenticated for PR/issue sources.

## Connect your agent (MCP)

`engram serve` exposes memory as MCP tools over stdio. Add it once and any MCP client uses it.

**Claude Code** — `.mcp.json` in your repo:
```json
{ "mcpServers": { "engram": { "command": "engram", "args": ["serve"] } } }
```
**Cursor / Windsurf** — add an MCP server: command `engram`, args `["serve"]`.
**Continue** — add the same block to `config.json` → `mcpServers`.

Tools: `recall(query, budget?)`, `remember(what, why?, tags?, scope?, type?)`, `learn(source?, limit?)`, `doctor()`.

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
- ✅ Day 5: `engram serve` — MCP server (recall/remember/learn/doctor over stdio).
- ✅ Day 6: GitHub PR/issue harvest + LLM extraction of {decision, reason, outcome}.
