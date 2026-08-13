# Comparison

Memory for AI is a crowded space. Entergram is specifically **engineering-decision memory, mined from your repo's history, local-first, and agent-agnostic**. Here's how that differs.

| | **Entergram** | Cursor Memory | Claude Projects | Mem0 / vector RAG | LangGraph / LlamaIndex |
|---|---|---|---|---|---|
| Learns from **git history / PRs** | ✅ | ❌ | ❌ | ❌ | ❌ (you build it) |
| Stores **decisions + rationale + provenance** | ✅ | partial | ❌ | ❌ (chunks) | depends on your code |
| Works across **any agent** (MCP) | ✅ | Cursor only | Claude only | SDK-level | framework-level |
| **Local-first** (code stays on machine) | ✅ | ❌ | ❌ | mostly cloud | your choice |
| **Selective, token-budgeted** recall | ✅ | — | whole-project context | similarity top-k | your choice |
| **Human-reviewable** store (`git diff`) | ✅ (Markdown cells) | ❌ | ❌ | ❌ (opaque vectors) | ❌ |
| Setup effort | one command | built-in | built-in | build it | build it |

## How to think about each

- **Cursor Memory / Claude Projects** — convenient, but locked to one tool and one vendor, and they remember *conversations*, not the *engineering decisions* recorded in your history. Entergram is agent-agnostic and history-derived.
- **Mem0 / vector RAG** — great primitives for chat/agent memory, but they retrieve opaque chunks by similarity. Entergram stores structured, reviewable decisions with provenance, and doesn't require standing up a vector store.
- **LangGraph / LlamaIndex** — frameworks to *build* memory/RAG yourself. Entergram is the finished product for the specific job of codebase decision memory — though you can point them at Entergram's cells if you want.

## The honest take

If you want conversational memory inside one editor, the built-ins are fine. If you want **the durable "why" of a codebase, available to every agent, that you can read and review like code** — that's Entergram.
