---
description: Trace the causal provenance of an architectural decision through the memory graph.
---

Trace why **$ARGUMENTS** is the way it is.

1. `entergram recall "$ARGUMENTS"` to find the relevant cell(s).
2. For the strongest match, `entergram trace <id>` to walk its provenance
   tree — the decisions it descended from and what it caused.

Present it as a causal chain, oldest decision first, so the user sees how the
current state was arrived at. Name the cell ids.

If the trace is empty, say so — an untraced cell means nobody recorded what
it descended from, which is itself worth reporting.
