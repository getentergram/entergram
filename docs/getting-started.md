# Getting Started

Entergram gives your AI coding agent a persistent memory built from your repo's own history. Five minutes, three steps.

## 1. Install

```bash
npm install -g get-entergram        # once published
# or:
curl -fsSL https://entergram.dev/install | bash
```

Requires Node ≥ 18. For PR/issue learning you also need [`gh`](https://cli.github.com) installed and authenticated.

> Before publish (from a clone): `cd cli && npm install && npm link`.

## 2. Index your repo

```bash
cd your-project
get-entergram init          # scaffolds .entergram/ (cells = Markdown, source of truth)
get-entergram learn         # ingest git history + docs/README/ADRs + merged PRs
```

`learn` is incremental — run it anytime; it skips what it's already seen and low-signal noise.

**Richer extraction (recommended):** set a model API key and `learn` extracts structured
`{decision, reason, outcome}` from PRs/commits instead of the heuristic fallback. Gemini is the default provider:

```bash
export GEMINI_API_KEY=...                        # preferred
# export ENTERGRAM_GEMINI_MODEL=gemini-2.0-flash    # optional; default
#   — or use Anthropic instead —
# export ANTHROPIC_API_KEY=sk-ant-...
get-entergram learn
```

Provider auto-selects: **Gemini if `GEMINI_API_KEY` is set, else Anthropic.** Force it with
`ENTERGRAM_PROVIDER=gemini|anthropic|none`.

## 3. Connect your agent (MCP)

`get-entergram serve` runs an MCP server over stdio. Add it once; any MCP client uses it.

**Claude Code** — `.mcp.json` in your repo:
```json
{ "mcpServers": { "entergram": { "command": "get-entergram", "args": ["serve"] } } }
```
**Cursor / Windsurf** — add an MCP server: command `get-entergram`, args `["serve"]`.
**Continue** — same block under `mcpServers` in `config.json`.

Your agent now has `recall`, `remember`, `learn`, and `doctor` tools. Ask it *why* something in the codebase is the way it is — it recalls the decision instead of guessing.

## Everyday commands

```bash
get-entergram recall "why is auth stateless"   # what the agent retrieves, from the terminal
get-entergram remember "Use ULIDs for public ids" --why "sortable + collision-safe" --type decision
get-entergram review                            # triage low-confidence auto-extracted memories
get-entergram doctor                            # health + coverage
```

Next: [Architecture](architecture.md) · [Why Entergram?](why-entergram.md)
