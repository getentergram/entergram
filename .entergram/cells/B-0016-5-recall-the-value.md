---
id: B-0016
type: reference
tags: [recall, value, docs, build]
scope: docs
source: {"kind":"doc","path":"docs/BUILD_SPEC.md","heading":"5. Recall (the value)"}
confidence: 0.5
created: 2026-08-04
hook: 5. Recall (the value)
---

# 5. Recall (the value)

## What
`recall(query, budget_tokens=2000)`:
1. Parse query → candidate tags + FTS terms.
2. Tag filter → FTS rank → (optional) embedding rerank.
3. Pack top-K cells until `budget_tokens` — return hooks first, expand bodies as budget allows.
4. Return structured: `[{id, hook, why, source, confidence}]` + a one-paragraph synthesis.

The agent gets *the decisions relevant to this task*, not a document dump. That's the token story
in the pitch: "connect a 300k-line repo, the agent understands architecture 



