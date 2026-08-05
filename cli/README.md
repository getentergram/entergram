# engram (CLI)

Persistent engineering memory for AI coding agents. Cells are plain Markdown (source of truth);
the index is a rebuildable cache. Zero native dependencies.

## Install

```bash
npm install -g get-engram        # once published
# or one-liner:
curl -fsSL https://engram.dev/install | bash
```

Local dev (from this repo, before npm publish):
```bash
cd cli && npm install && npm link   # symlinks the `get-engram` binary globally
```

## Commands

```bash
get-engram init                       # scaffold .engram/ in the current repo
get-engram learn [--source all|git|docs|pr|issue] [--limit 50] [--no-llm]
                                  # ingest git history + docs/README/ADRs + merged PRs → cells
get-engram remember "<fact>" \        # write a fact by hand
        --why "…" --tags a,b --scope services/auth --type decision
get-engram recall "<query>" [--budget 2000]   # FTS/bm25 retrieval under a token budget
get-engram review                     # triage low-confidence auto-extracted cells
                                  #   --accept <id> | --reject <id> | --tag <id> --to a,b | --why <id> --to "…"
get-engram reindex                    # rebuild the SQLite index from the cells
get-engram doctor                     # health check (ids, hooks, dangling links, index coverage)
get-engram serve                      # MCP server (stdio): recall/remember/learn/doctor as tools
```

The index is SQLite + FTS5 (`.engram/index.db`, git-ignored and rebuildable). Markdown cells remain the source of truth.

## Extraction (git/PR/issue → {decision, reason, outcome})

- Set a model key and `learn` extracts high-confidence structured memories from merged PRs/issues. Provider auto-selects: **`GEMINI_API_KEY`** (default, `ENGRAM_GEMINI_MODEL` default `gemini-2.0-flash`) or **`ANTHROPIC_API_KEY`** (`ENGRAM_MODEL` default `claude-haiku-4-5`). Force with `ENGRAM_PROVIDER=gemini|anthropic|none`.
- With no key, it falls back to a heuristic (title→what, body→why, confidence 0.4) so `learn` always works offline. Pass `--no-llm` to force heuristic.
- Requires `gh` installed + authenticated for PR/issue sources.

## Connect your agent (MCP)

`get-engram serve` exposes memory as MCP tools over stdio. Add it once and any MCP client uses it.

**Claude Code** — `.mcp.json` in your repo:
```json
{ "mcpServers": { "get-engram": { "command": "get-engram", "args": ["serve"] } } }
```
**Cursor / Windsurf** — add an MCP server: command `get-engram`, args `["serve"]`.
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
- ✅ Day 4: SQLite/FTS index, docs/README/ADR ingestion, `get-engram review`, `get-engram reindex`.
- ✅ Day 5: `get-engram serve` — MCP server (recall/remember/learn/doctor over stdio).
- ✅ Day 6: GitHub PR/issue harvest + LLM extraction of {decision, reason, outcome}.
