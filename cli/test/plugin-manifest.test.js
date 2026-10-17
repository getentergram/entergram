import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// This file lives at cli/test/, so the repo root is two levels up.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pluginManifestPath = join(repoRoot, '.claude-plugin', 'plugin.json');
const rootMcpConfigPath = join(repoRoot, '.mcp.json');

// --- regression: issue #21 ----------------------------------------------------------
// The plugin declared its MCP server via `.claude-plugin/plugin.json` (run through
// `npx -y get-entergram@latest serve`, which works for anyone who installs the plugin).
// A second, stray `.mcp.json` at the repo root ALSO declared an MCP server, under a
// bare `get-entergram` command. Claude Code loaded both for the one plugin, and the
// second always failed: nothing on a typical install puts `get-entergram` on PATH as
// a global binary. Fix: the repo declares its MCP server in exactly one place.

test('plugin.json declares exactly one MCP server, started via npx (no bare-binary/PATH assumption)', () => {
  const plugin = JSON.parse(readFileSync(pluginManifestPath, 'utf8'));
  const servers = Object.entries(plugin.mcpServers ?? {});

  assert.equal(
    servers.length,
    1,
    `expected exactly one MCP server in plugin.json, found: ${servers.map(([name]) => name).join(', ') || 'none'}`
  );

  const [, def] = servers[0];
  assert.equal(def.command, 'npx', 'the MCP server must run via npx, not a bare binary that may not be on PATH');
  assert.ok(
    (def.args ?? []).some((a) => /^get-entergram(@|$)/.test(a)),
    'the npx invocation must resolve the published get-entergram package'
  );
});

test('no repo-root .mcp.json registers a second, conflicting MCP server (issue #21)', () => {
  if (!existsSync(rootMcpConfigPath)) return; // removed entirely — the fix landed in this PR

  const mcp = JSON.parse(readFileSync(rootMcpConfigPath, 'utf8'));
  for (const [name, def] of Object.entries(mcp.mcpServers ?? {})) {
    assert.notEqual(
      def.command,
      'get-entergram',
      `.mcp.json's "${name}" server runs a bare "get-entergram" binary — this is not guaranteed ` +
        'to be on PATH and duplicates the server plugin.json already declares'
    );
  }
});
