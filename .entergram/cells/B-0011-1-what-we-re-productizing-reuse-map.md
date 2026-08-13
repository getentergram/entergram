---
id: B-0011
type: reference
tags: [what, productizing, reuse, docs]
scope: docs
source: {"kind":"doc","path":"docs/BUILD_SPEC.md","heading":"1. What we're productizing (reuse map)"}
confidence: 0.5
created: 2026-08-04
hook: 1. What we're productizing (reuse map)
---

# 1. What we're productizing (reuse map)

## What
| Exists today (`~/.claude/brain`) | Becomes in the product |
|---|---|
| `B-NNN-*.md` cells (frontmatter + body) | Cell store — same format, +source/confidence fields |
| `INDEX.md` (grep-addressable map) | SQLite FTS index (grep still works as fallback) |
| `brain.sh` (doctor/next-id/stats/dups/stale) | `entergram` CLI internals — battle-tested hygiene |
| Gate loop (recall→write-back→consolidate→decay) | The ingestion + recall engine |
| Skills + effectors | `learn` extractors + future orchestra



