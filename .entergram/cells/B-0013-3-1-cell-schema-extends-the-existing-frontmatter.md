---
id: B-0013
type: reference
tags: [cell, schema, extends, existing]
scope: docs
source: {"kind":"doc","path":"docs/BUILD_SPEC.md","heading":"3.1 Cell schema (extends the existing frontmatter)"}
confidence: 0.5
created: 2026-08-04
hook: 3.1 Cell schema (extends the existing frontmatter)
---

# 3.1 Cell schema (extends the existing frontmatter)

## What
```markdown
---
id: B-0421
type: decision            # decision | gotcha | convention | reference | architecture
tags: [auth, jwt, migration]
scope: services/auth
source:                   # provenance — what this was learned from (NEW)
  kind: pr                # commit | pr | issue | adr | doc | manual
  ref: "#812"
  sha: 9f3a1c2
  author: "@alice"
  date: 2026-05-14
confidence: 0.82          # extractor confidence; <0.6 → review queue (NEW)
hook: Moved auth from sessions to JWT to kill stick



