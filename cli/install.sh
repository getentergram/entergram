#!/usr/bin/env bash
# Engram one-command installer.  Usage:  curl -fsSL https://engram.dev/install | bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "Engram needs Node.js >= 18. Install it from https://nodejs.org and re-run." >&2
  exit 1
fi

echo "Installing engram…"
npm install -g engram

echo
echo "✓ Installed. Next:"
echo "    cd your-project"
echo "    engram init && engram learn"
echo "    engram serve      # then add as an MCP server in Claude Code / Cursor"
