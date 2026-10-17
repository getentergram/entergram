---
description: Trace the causal provenance of an architectural decision through the memory graph.
---

Trace why **$ARGUMENTS** is the way it is.

1. Call the `recall` MCP tool with `{ "query": "$ARGUMENTS" }` to find the
   relevant cell(s).
2. For the strongest match, call the `trace` MCP tool with `{ "id": "<cell
   id>" }` to walk its provenance tree — the decisions it descended from and
   what it caused.

Both tools are exposed by the `get-entergram` MCP server this plugin
connects. There is no `entergram` shell command installed by this plugin —
do not shell out to one.

Present it as a causal chain, oldest decision first, so the user sees how the
current state was arrived at. Name the cell ids.

If the trace is empty, say so — an untraced cell means nobody recorded what
it descended from, which is itself worth reporting.
