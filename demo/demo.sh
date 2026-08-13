#!/usr/bin/env bash
# Entergram 3-minute demo — deterministic, runnable. Tells the story:
#   "The codebase remembers WHY, even after the files are gone."
# Usage:  bash demo/demo.sh        (from the entergram repo root)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENTERGRAM="node $REPO_ROOT/cli/bin/entergram.js"    # uses the local CLI; published demo would use `get-entergram`
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
run "$ENTERGRAM init"
run "$ENTERGRAM learn --source all --no-llm"

say "3/6  Ask WHY — the kind of thing a new engineer (or a fresh agent) asks"
run "$ENTERGRAM recall why is auth stateless"
run "$ENTERGRAM recall why postgres ledger"

say "4/6  💥 Disaster: half the project is deleted"
run "rm -rf docs auth.ts ledger.ts README.md"
run "ls -A | grep -v .entergram || true"
echo "   (source + docs are gone — a fresh agent would have nothing to go on)"; pause

say "5/6  But the memory survived — the WHY is still on tap"
run "$ENTERGRAM recall auth jwt redis"
run "$ENTERGRAM recall ledger acid postgres"

say "6/6  This is what your AI agent gets, every session, via MCP"
echo '   .mcp.json →  { "mcpServers": { "get-entergram": { "command": "get-entergram", "args": ["serve"] } } }'
printf "\n\033[1;32m✓ The files came and went. The engineering memory persisted.\033[0m\n\n"
