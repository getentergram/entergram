---
id: B-0039
type: convention
tags: [pnpm, build, packaging]
scope: repo
confidence: 1
created: 2026-08-12
hook: cli/ and web/ migrated from npm to pnpm (shared global store); web/Dockerfile now uses `pnpm install --frozen-lockfile`; both package.json declare `pnpm.onlyBuiltDependencies` (better-sqlite3 for cli, sharp for web) since pnpm skips native build scripts by default
---

# cli/ and web/ migrated from npm to pnpm (shared global store); web/Dockerfile now uses `pnpm install --frozen-lockfile`; both package.json declare `pnpm.onlyBuiltDependencies` (better-sqlite3 for cli, sharp for web) since pnpm skips native build scripts by default

## What
cli/ and web/ migrated from npm to pnpm (shared global store); web/Dockerfile now uses `pnpm install --frozen-lockfile`; both package.json declare `pnpm.onlyBuiltDependencies` (better-sqlite3 for cli, sharp for web) since pnpm skips native build scripts by default

## Why
reduce disk duplication across this user's many Node repos (same rationale as the brain's B-200 cell) — verified with a clean store-pruned reinstall plus full test suite + Docker build/run pass


