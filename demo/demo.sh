#!/usr/bin/env bash
# Engram 3-minute demo — deterministic, runnable. Tells the story:
#   "The codebase remembers WHY, even after the files are gone."
# Usage:  bash demo/demo.sh        (from the engram repo root)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGRAM="node $REPO_ROOT/cli/bin/engram.js"    # uses the local CLI; published demo would use `engram`
pause() { sleep "${DEMO_PAUSE:-1}"; }
say() { printf "\n\033[1;35m▶ %s\033[0m\n" "$1"; pause; }
run() { printf "\033[2m\$ %s\033[0m\n" "$*"; eval "$*"; pause; }

WORK="$(mktemp -d)/acme-billing"; mkdir -p "$WORK/docs/adr"; cd "$WORK"
git init -q; git config user.email dev@acme.test; git config user.name Dev

say "1/6  A real-ish project with decisions recorded in commits + an ADR"
cat > README.md <<'EOF'
# Acme Billing
## Architecture
Stateless services behind an API gateway. Postgres is the ledger of record.
EOF
cat > docs/adr/0001-jwt.md <<'EOF'
# ADR 0001: Stateless JWT auth
## Decision
Replace server sessions with stateless JWT to remove the Redis dependency and allow
horizontal scaling of the auth service.
EOF
git add . && git commit -qm "Initial: billing skeleton"
echo x > auth.ts && git add . && git commit -qm "Migrate auth from sessions to JWT to remove Redis"
echo y > ledger.ts && git add . && git commit -qm "Use Postgres for the ledger to get ACID guarantees"
run "git --no-pager log --oneline"

say "2/6  Give it a memory — one command"
run "$ENGRAM init"
run "$ENGRAM learn --source all --no-llm"

say "3/6  Ask WHY — the kind of thing a new engineer (or a fresh agent) asks"
run "$ENGRAM recall why is auth stateless"
run "$ENGRAM recall why postgres ledger"

say "4/6  💥 Disaster: half the project is deleted"
run "rm -rf docs auth.ts ledger.ts README.md"
run "ls -A | grep -v .engram || true"
echo "   (source + docs are gone — a fresh agent would have nothing to go on)"; pause

say "5/6  But the memory survived — the WHY is still on tap"
run "$ENGRAM recall auth jwt redis"
run "$ENGRAM recall ledger acid postgres"

say "6/6  This is what your AI agent gets, every session, via MCP"
echo '   .mcp.json →  { "mcpServers": { "engram": { "command": "engram", "args": ["serve"] } } }'
printf "\n\033[1;32m✓ The files came and went. The engineering memory persisted.\033[0m\n\n"
