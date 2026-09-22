---
name: capture-decision
description: Write a durable cell into the repo's engineering memory after solving something non-obvious — a decision with a rationale, a gotcha that cost real time, a convention the team just settled, or a constraint discovered the hard way. Fires at the end of a debugging session, after a design decision is made, or when the user says "remember this" / "don't let us hit that again". Skip for anything the code, tests, or git history already record plainly.
---

# Capture what the code cannot say

Memory is only worth querying if something writes to it. The failure mode is
a store that everyone reads and nobody feeds, which decays into noise within
a few weeks.

## What is worth a cell

Write one when the answer took real effort and is **not recoverable from the
repo**:

- a decision plus the *why* and the alternatives rejected
- a gotcha whose symptom does not name its cause
- a convention the team just agreed, before it is anywhere in code
- a constraint imposed from outside (a vendor limit, a compliance rule)

## What is NOT worth a cell

- anything a reader gets from the code, the tests, or `git log`
- what a function does — that is a docstring
- transient state ("the build is red right now")
- a restatement of the framework's documentation

A store full of things the code already says makes recall worse, because the
real signal is now competing with filler for the token budget.

## How to write one

```bash
entergram remember "<hook — the one-line claim>" \
  --type decision \
  --tags "<comma,separated>" \
  --why "<the rationale, and what was rejected>"
```

`--type` is one of `decision`, `gotcha`, `convention`, `reference`,
`architecture`, `procedure`.

Rules that make a cell useful later:

1. **The hook is a claim, not a topic.** "Use pnpm, not npm, because the
   shared store halves CI install time" beats "package manager notes". Recall
   matches against the hook; a topic matches everything and answers nothing.
2. **Put the why in the body.** A decision without its rationale cannot be
   re-evaluated when conditions change — it just becomes folklore.
3. **Date the constraints.** "Vendor caps us at 100 rps" should say when, so a
   future reader knows whether to re-check.
4. **Link related cells** with `[[B-NNN]]` so the graph connects. Isolated
   cells are findable only by exact search; linked cells are reachable by
   traversal, which is how `trace` and the viz work.

## Before writing

Check you are not duplicating. `entergram recall "<your hook>"` first — if a
cell already covers it, update that one rather than adding a near-duplicate.
Two cells making the same claim with different confidence is worse than one.

## After writing

```bash
entergram doctor
```

Must report consistent. If it does not, fix it now rather than leaving a
broken index for the next session.
