# Getting Started

Engram gives your AI coding agent a persistent memory built from your repo's own history. Five minutes, three steps.

## 1. Install

```bash
npm install -g get-engram        # once published
# or:
curl -fsSL https://engram.dev/install | bash
```

Requires Node ≥ 18. For PR/issue learning you also need [`gh`](https://cli.github.com) installed and authenticated.

> Before publish (from a clone): `cd cli && npm install && npm link`.

## 2. Index your repo

```bash
cd your-project
get-engram init          # scaffolds .engram/ (cells = Markdown, source of truth)
get-engram learn         # ingest git history + docs/README/ADRs + merged PRs
```

`learn` is incremental — run it anytime; it skips what it's already seen and low-signal noise.

**Richer extraction (recommended):** set an Anthropic key and `learn` extracts structured
`{decision, reason, outcome}` from PRs/commits instead of the heuristic fallback:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export ENGRAM_MODEL=claude-haiku-4-5     # optional; default
get-engram learn
```

## 3. Connect your agent (MCP)

`get-engram serve` runs an MCP server over stdio. Add it once; any MCP client uses it.

**Claude Code** — `.mcp.json` in your repo:
```json
{ "mcpServers": { "engram": { "command": "get-engram", "args": ["serve"] } } }
```
**Cursor / Windsurf** — add an MCP server: command `get-engram`, args `["serve"]`.
**Continue** — same block under `mcpServers` in `config.json`.

Your agent now has `recall`, `remember`, `learn`, and `doctor` tools. Ask it *why* something in the codebase is the way it is — it recalls the decision instead of guessing.

## Everyday commands

```bash
get-engram recall "why is auth stateless"   # what the agent retrieves, from the terminal
get-engram remember "Use ULIDs for public ids" --why "sortable + collision-safe" --type decision
get-engram review                            # triage low-confidence auto-extracted memories
get-engram doctor                            # health + coverage
```

Next: [Architecture](architecture.md) · [Why Engram?](why-engram.md)
