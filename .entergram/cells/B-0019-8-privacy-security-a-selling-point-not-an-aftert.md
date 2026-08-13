---
id: B-0019
type: reference
tags: [privacy, security, selling, point]
scope: docs
source: {"kind":"doc","path":"docs/BUILD_SPEC.md","heading":"8. Privacy & security (a selling point, not an afterthought)"}
confidence: 0.5
created: 2026-08-04
hook: 8. Privacy & security (a selling point, not an afterthought)
---

# 8. Privacy & security (a selling point, not an afterthought)

## What
- Default: **nothing leaves the machine.** Extraction can run against a local model or the user's own
  API key; the cell store is local files.
- Reuse the per-machine blacklist + `redact-identity` scanner before any `sync push` or team share.
- `entergram.toml` declares what sources are in-scope (never scans `.env`, secrets, `node_modules`).

---



