---
id: B-0030
type: reference
tags: [works, readme]
scope: docs
source: {"kind":"doc","path":"README.md","heading":"How it works"}
confidence: 0.5
created: 2026-08-04
hook: How it works
---

# How it works

## What
Entergram is a small three-layer memory, not a database you babysit:

- **Cells** — one durable fact each (a decision, a gotcha, a convention), stored as plain Markdown you can `git diff`.
- **Index** — a tagged, full-text map; recall greps it and loads only what matches.
- **Discipline** — every write goes through extract → dedup → conflict-resolve, so you get *one authoritative answer*, not five contradicting notes.

Markdown is the source of truth; the local SQLite index is just a rebuildable ca



