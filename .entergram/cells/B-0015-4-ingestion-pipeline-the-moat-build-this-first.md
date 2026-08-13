---
id: B-0015
type: reference
tags: [ingestion, pipeline, moat, build]
scope: docs
source: {"kind":"doc","path":"docs/BUILD_SPEC.md","heading":"4. Ingestion pipeline (the moat — build this first)"}
confidence: 0.5
created: 2026-08-04
hook: 4. Ingestion pipeline (the moat — build this first)
---

# 4. Ingestion pipeline (the moat — build this first)

## What
```
harvest → chunk → extract → dedup → reconcile → write-back → doctor
```

1. **Harvest** (incremental, since `ingest_watermark`):
   - `git log` (commits since last SHA; skip merge/`fix typo`/`wip` noise heuristically)
   - PRs + issues via `gh api` (title, body, review comments, merge outcome)
   - `docs/`, `README`, `ADR/` (architecture decision records), `CHANGELOG`
   - Repo structure (dir tree, entrypoints) → one "architecture" cell
2. **Chunk**: one candidate unit = one PR (preferred; r



