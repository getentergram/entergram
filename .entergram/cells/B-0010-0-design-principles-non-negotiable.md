---
id: B-0010
type: reference
tags: [design, principles, non-negotiable, docs]
scope: docs
source: {"kind":"doc","path":"docs/BUILD_SPEC.md","heading":"0. Design principles (non-negotiable)"}
confidence: 0.5
created: 2026-08-04
hook: 0. Design principles (non-negotiable)
---

# 0. Design principles (non-negotiable)

## What
1. **Local-first.** Code and memory never leave the machine unless the user opts into hosted sync.
   This is a *sales feature*, not just a policy — enterprises can't send proprietary code to mem0/cloud.
2. **Markdown is the source of truth; SQLite is a derived index.** Never invert this. A human can
   `cat`/`git diff` a cell. The DB is a rebuildable cache (grep → FTS/vector upgrade).
3. **Selective recall, never load-everything.** The token-economics differentiator. Retrieval returns
   top-K 



