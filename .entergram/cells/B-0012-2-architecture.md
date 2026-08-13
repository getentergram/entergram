---
id: B-0012
type: reference
tags: [architecture, docs, build, spec]
scope: docs
source: {"kind":"doc","path":"docs/BUILD_SPEC.md","heading":"2. Architecture"}
confidence: 0.5
created: 2026-08-04
hook: 2. Architecture
---

# 2. Architecture

## What
```
┌─────────────────────────── developer machine ───────────────────────────┐
│                                                                          │
│   repo/.entergram/                    entergram CLI                MCP server  │
│   ├── cells/B-NNN-*.md   ◄────────  ingest  ──────►  SQLite   (stdio)    │
│   ├── index.sqlite                  recall           index    recall()   │
│   ├── entergram.toml                   doctor                    remember() │
│   └── .gitignore (privacy guard) 



