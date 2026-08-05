# FAQ

**Does my code leave my machine?**
No. Cells and the index are local files. The only outbound calls are (a) to the Anthropic API for extraction *if* you set `ANTHROPIC_API_KEY`, and (b) to GitHub via `gh` for PR/issue harvest. Both are opt-in per source.

**Do I need an Anthropic key?**
No — `learn` works offline with a heuristic. A key upgrades PR/commit ingestion to real `{decision, reason, outcome}` extraction. `get-engram learn --no-llm` forces heuristic even if a key is set.

**Where is the memory stored? Should I commit it?**
In `.engram/cells/` as Markdown — commit these to share a team memory (they're reviewable in PRs). The SQLite index (`.engram/index.db`) is git-ignored and rebuilt with `get-engram reindex`.

**How is this different from just putting docs in the repo?**
Docs go stale and aren't selectively retrievable. Engram extracts *decisions with rationale and provenance*, ranks them, and serves only what's relevant to the current task under a token budget — to your agent, automatically.

**What if extraction gets something wrong?**
Auto-extracted memories start at low confidence and land in `get-engram review`. Accept, reject, retag, or fix the rationale before you rely on them. `recall` flags unreviewed cells.

**Does it duplicate a decision found in both a commit and its PR?**
No. `learn` dedups/reconciles — the same decision from multiple sources merges into one cell; the stronger/more-recent signal wins.

**Which agents work?**
Anything that speaks MCP: Claude Code, Cursor, Windsurf, Continue. Add one `get-engram serve` server. The CLI works everywhere else (and in CI).

**How big a repo can it handle?**
Recall cost is proportional to what a query matches, not total memory size — a large memory costs about the same per query as a small one. `learn` is incremental via watermarks, so re-running is cheap.

**Is it free / open source?**
The CLI is MIT. Paid tiers add hosted sync, team features, and a done-for-you install. See the [README](../README.md) for pricing.

**How do I remove a wrong memory?**
`get-engram review --reject <id>` (deletes the cell) or edit/delete the Markdown file directly, then `get-engram reindex`.
