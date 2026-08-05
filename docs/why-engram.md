# Why Engram?

## The problem

AI coding agents are brilliant and amnesiac. Every session they re-read the same files, re-derive the same architecture, and re-ask questions your team answered six months ago. They don't know *why* auth moved to JWT, *why* a module is shaped the way it is, or *what* broke last time someone touched billing.

That re-derivation is the hidden tax on every prompt — and it compounds on large, long-lived codebases, exactly where agents should help most.

## What Engram changes

- **The agent recalls decisions instead of guessing.** Ask *why* and it returns the actual decision, its rationale, and the PR/commit it came from.
- **Memory survives the code.** Delete the files and the *why* is still on tap (see the [demo](../demo/demo.sh)) — because it's stored as durable cells, not re-scraped context.
- **Any agent, one integration.** MCP means Claude Code, Cursor, Windsurf, and Continue all use the same memory — you set it up once.
- **Local-first.** Your code never leaves your machine unless you choose to sync. That's a hard requirement for many teams and a wedge cloud memory tools can't match.

## Who it's for

Senior engineers and tech leads on **large, long-lived codebases (50k+ LOC, 6+ months of history)** already paying for Claude Code or Cursor — and small teams onboarding people into gnarly repos, where a shared per-repo memory turns "ask the one person who knows" into "ask the agent."

## The bigger picture

Engram ships as memory, but it's architected as the first layer of a **cognitive runtime**: memory → recall → the same cell/skill discipline extends to planning, reflection, and orchestration. You get a focused, sellable product now without painting the long-term vision into a corner.

See the [Comparison](comparison.md) for how this differs from Cursor Memory, Claude Projects, and vector-RAG memory tools.
