# Contributing to Entergram

Entergram is MIT-licensed and welcomes issues and pull requests. This doc covers how to submit
a change and how contributors progress on this project.

## Before you start

- **Bug fix or small change** — open a PR directly, no need to ask first.
- **New feature or behavior change** — open an issue first describing the problem and your
  proposed approach. Saves you a rewrite if the maintainers want a different shape.
- **Docs-only fix** — PR directly, no issue needed.

## Setup

```bash
git clone https://github.com/getentergram/entergram.git
cd entergram/cli
pnpm install
```

The CLI (`cli/`) is the package that ships to npm; `web/` is the landing page; `apps/viz/` is the
knowledge-graph browser. Most contributions touch `cli/`.

## Making a change

1. Branch off `main`: `git checkout -b <short-description>`.
2. Make the change. Keep it scoped — one logical change per PR.
3. Run the suite before pushing:
   ```bash
   cd cli
   node --test 'test/*.test.js' 'test/runtime/*.test.js'
   ```
4. If you touched `bin/`, `package.json` `files`, or anything packaged, also sanity-check the
   tarball: `npm pack --dry-run` and confirm nothing needed at runtime is missing (CI's `Test`
   workflow enforces this, but catching it locally is faster).
5. Commit with a message that explains *why*, not just what changed.

## Opening the PR

- Target `main`.
- Describe what changed and why in the PR body; link the issue if there is one.
- CI runs the CLI test suite, the plugin manifest validation, and a packaging check
  (`.github/workflows/test.yml`, `validate-plugin.yml`) — all three must be green before review.
- Keep the diff reviewable. If a PR grew beyond its original scope, split it.

## Review and merge

A maintainer reviews, may ask for changes, and merges once CI is green and the change is sound.
`release-on-merge.yml` handles versioning and publishing after merge — contributors don't need to
bump versions or tag releases themselves.

## Contributor lifecycle

Entergram doesn't have formal tiers or a CLA — this is the practical path a contribution (and a
contributor) takes:

1. **First contact** — an issue, a question, or a first PR (typo fix, small bug). No history
   required; this is where everyone starts.
2. **Reviewed contributor** — a PR gets reviewed, revised if needed, and merged. At this point
   you're in `git log`, which is the only credential that matters here.
3. **Repeat contributor** — a handful of merged PRs across different parts of the repo (CLI,
   docs, CI). Review on your PRs gets lighter as the maintainers learn your judgment.
4. **Trusted / maintainer** — sustained, sound contributions earn write access and a say in
   design decisions (new commands, schema changes, release cadence). This is earned through
   track record, not requested.

As a concrete example of the lifecycle rather than a special role: a contributor working under
the handle **`handofshiv`** would start at step 1 like anyone else — an issue or a first PR against
`cli/` — and move to step 2 the moment that PR is reviewed and merged, with no separate
onboarding process. There's no shortcut through the stages; they're just what naturally happens
as `git log` accumulates history for a given contributor.

## Code style

- Match the existing style in the file you're editing over introducing a new convention.
- No comments that restate what the code does — only ones that explain a non-obvious *why*.
- Don't add abstractions, config flags, or error handling for cases that can't happen; keep
  changes scoped to what the issue/PR describes.

## Reporting issues

Open a GitHub issue with: what you expected, what happened, and `get-entergram doctor` output if
it's a runtime/memory issue. For a security issue, use GitHub's private security advisory
("Report a vulnerability" under the repo's Security tab) instead of a public issue.
