#!/usr/bin/env bash
# Entergram one-command installer.  Usage:  curl -fsSL https://entergram.dev/install | bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "Entergram needs Node.js >= 18. Install it from https://nodejs.org and re-run." >&2
  exit 1
fi

echo "Installing get-entergram…"
npm install -g get-entergram

echo
echo "✓ Installed. Next:"
echo "    cd your-project"
echo "    get-entergram init && get-entergram learn"
echo "    get-entergram serve      # then add as an MCP server in Claude Code / Cursor"
