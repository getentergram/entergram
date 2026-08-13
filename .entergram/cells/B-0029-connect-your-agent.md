---
id: B-0029
type: reference
tags: [connect, your, agent, readme]
scope: docs
source: {"kind":"doc","path":"README.md","heading":"Connect your agent"}
confidence: 0.5
created: 2026-08-04
hook: Connect your agent
---

# Connect your agent

## What
<details open>
<summary><b>Claude Code</b></summary>

Add to `.mcp.json`:
```json
{ "mcpServers": { "entergram": { "command": "entergram", "args": ["serve"] } } }
```
</details>

<details>
<summary><b>Cursor / Windsurf</b></summary>

Add an MCP server in settings: command `entergram`, args `["serve"]`.
</details>

<details>
<summary><b>Continue.dev</b></summary>

Add the same `entergram serve` block to your `config.json` `mcpServers`.
</details>

That's it. Your agent now has `recall`, `remember`, and `lear



