---
id: B-0014
type: reference
tags: [sqlite, layout, derived, index]
scope: docs
source: {"kind":"doc","path":"docs/BUILD_SPEC.md","heading":"3.2 SQLite layout (derived index, rebuildable from cells)"}
confidence: 0.5
created: 2026-08-04
hook: 3.2 SQLite layout (derived index, rebuildable from cells)
---

# 3.2 SQLite layout (derived index, rebuildable from cells)

## What
```sql
cells(id PK, type, scope, hook, body, source_kind, source_ref, source_sha,
      author, confidence, created_at, updated_at, file_path)
tags(cell_id, tag)                      -- many-to-many; the coupling coefficients
cells_fts USING fts5(hook, body, content='cells')   -- selective full-text recall
edges(from_id, to_id)                   -- [[B-NNN]] lateral links
embeddings(cell_id, vec BLOB)           -- OPTIONAL, phase 1.5; rerank only, not primary
ingest_watermark(source_kind, last_s



