# Security

## Trust boundary: recalled cell content is untrusted data

Entergram ingests text it did not write and returns it directly into an AI
agent's context on `recall`, `dispatch`, and `trace`:

- **`learn`** pulls commit messages, README/ADR/doc sections, and PR
  descriptions from the repo's own history — written by any past
  contributor, not reviewed before ingestion.
- **`remember`** writes a cell from whatever the running agent/user passes
  it — ordinarily the person operating the session, but nothing stops an
  agent from calling it with content it was itself fed from somewhere else.

In both cases, by the time a cell's `hook` or body reaches an agent's
context via a tool result, it is **data that arbitrary contributors wrote**,
not an instruction the person running the agent authored or approved. A
commit message, a doc heading, or a PR description can contain text phrased
to look like an instruction to the agent reading it — a classic
prompt-injection vector via tool-result content. Nothing about Markdown
storage or SQLite indexing filters that out; the text passes through as-is.

**This is not a solved problem, here or anywhere in the industry.** Reliably
detecting and neutralizing instruction-like text embedded in natural-language
data is an open research question. What follows is proportionate, low-cost
hardening — not a claim that prompt injection is "prevented."

## What Entergram does about it

1. **The trust boundary is explicit.** `skills/recall-before-build/SKILL.md`
   states plainly that cell content is data, never instructions, and that
   recalled text must be evaluated as a claim, not obeyed as a command. This
   is necessary but, on its own, not a technical control — a model can still
   be manipulated by sufficiently clever embedded text regardless of what a
   skill file tells it. The remaining two measures below are the technical
   backstop.

2. **Provenance is surfaced, not just stored.** Every hit returned by
   `recall`/`dispatch`/`trace` is tagged `curated` (written via `remember` —
   a deliberate human act, no `source`) or `auto-ingested` (written via
   `learn` from git/docs/PRs — unreviewed by any human before it reached the
   index). This lets a reader tell "someone running this session chose to
   write this down" apart from "this text came from whoever happened to
   write a commit message or a doc section, possibly years ago and possibly
   not this user." It is a provenance signal, not a correctness signal:
   curated cells can still be wrong, and most auto-ingested cells are
   perfectly benign.

3. **A cheap, pattern-based flag for instruction-like phrasing.**
   `cli/src/safety.js` matches hook/body text against a short, explicit list
   of phrasings that disproportionately show up in attempts to redirect an
   AI agent — "ignore previous instructions," "you are now an AI...," DAN-style
   jailbreak phrasing, fenced ` ```system `/` ```assistant ` blocks, and a
   few others. A match adds a `possible-injection-phrasing` flag to the hit.

   **This is deliberately not a classifier.** It is a handful of regexes,
   not a model, and it is tuned to a low false-positive rate on ordinary
   commit messages and docs — not to catching every attempt. Expect both:
   - **False negatives**: any attacker who avoids these specific phrasings
     is not caught. This is a floor, not a ceiling.
   - **False positives**: a commit or doc that legitimately *discusses*
     prompt injection (such as this file) will trip the same patterns. That
     is accepted and by design — the flag is a prompt to look closer, never
     a block. It never removes a hit, truncates its content, or refuses a
     query; `recall`/`dispatch`/`trace` output is unconditionally unchanged
     in shape.

## What this does NOT do

- It does not sandbox, filter, or rewrite cell content before indexing or
  return — text is stored and returned verbatim.
- It does not verify that a `curated` cell is actually trustworthy, only
  that a human invoked `remember` to create it.
- It does not detect injection attempts that avoid the specific phrasings in
  `cli/src/safety.js`'s pattern list.
- It does not stop an agent from acting on embedded instructions — the
  defense here is a visible signal plus documentation, not an enforcement
  mechanism. The actual backstop is, and remains, the operator/agent
  treating all recalled content as data per the trust-boundary rule above.

## Reporting a vulnerability

Open a GitHub issue, or email the maintainers listed in `CODEOWNERS`, for
anything beyond the scope of ordinary bug reports.
