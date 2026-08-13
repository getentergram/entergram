---
id: B-0017
type: reference
tags: [surface, distribution, wedge, docs]
scope: docs
source: {"kind":"doc","path":"docs/BUILD_SPEC.md","heading":"6. MCP surface (the distribution wedge)"}
confidence: 0.5
created: 2026-08-04
hook: 6. MCP surface (the distribution wedge)
---

# 6. MCP surface (the distribution wedge)

## What
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
  { "mc



