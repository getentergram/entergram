---
id: B-0023
type: reference
tags: [open, risks, mitigation, docs]
scope: docs
source: {"kind":"doc","path":"docs/BUILD_SPEC.md","heading":"12. Open risks → mitigation"}
confidence: 0.5
created: 2026-08-04
hook: 12. Open risks → mitigation
---

# 12. Open risks → mitigation

## What
| Risk | Mitigation |
|---|---|
| Auto-extraction quality (garbage in on messy repos) | Confidence scoring + `entergram review` queue; skip-noise heuristics; never claim full coverage |
| Crowded "AI memory" market | Position as *engineering-decision* memory (git-mined), local-first, agent-agnostic — not chat memory |
| MCP client drift across tools | Server is one artifact; per-tool config is thin and versioned in docs |
| Big-repo ingest cost/time | Incremental watermark; PR-level units; prompt-c



