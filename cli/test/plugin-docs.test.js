import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression test for https://github.com/getentergram/entergram/issues/22 —
// the slash commands and skills used to instruct Claude to shell out to a
// bare `entergram` binary, but installing this plugin only registers the
// get-entergram MCP server (see .claude-plugin/plugin.json); nothing named
// `entergram` or `get-entergram` is ever put on PATH. Any shell snippet
// telling Claude to run that binary directly is a reintroduction of the bug.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const docs = [
  'commands/recall.md',
  'commands/why.md',
  'skills/capture-decision/SKILL.md',
  'skills/recall-before-build/SKILL.md',
];

// The exact tool names this plugin's MCP server registers (cli/src/mcp.js).
// Pulled from the source rather than hardcoded so this test fails loudly if
// mcp.js ever renames/removes a tool the docs still reference.
const mcpSource = readFileSync(join(repoRoot, 'cli/src/mcp.js'), 'utf8');
const registeredTools = [...mcpSource.matchAll(/registerTool\(\s*\n\s*"([a-zA-Z]+)"/g)].map((m) => m[1]);

test('plugin docs never shell out to the nonexistent `entergram` binary', () => {
  for (const doc of docs) {
    const text = readFileSync(join(repoRoot, doc), 'utf8');
    // A fenced shell block invoking `entergram <word>` (or `get-entergram <word>`)
    // as a command is exactly the broken pattern from issue #22.
    const shellInvocation = /```(?:bash|sh|shell|zsh)\n[^`]*\b(?:get-)?entergram\s+\w/;
    assert.ok(
      !shellInvocation.test(text),
      `${doc} still shells out to the entergram CLI instead of calling an MCP tool`,
    );
  }
});

test('plugin docs only reference MCP tool names that mcp.js actually registers', () => {
  assert.ok(registeredTools.length > 0, 'could not find any registerTool(...) calls in mcp.js — test is broken');

  const mentionedToolPattern = /`(recall|dispatch|trace|stimulate|feedback|remember|learn|doctor)`\s+MCP tool/g;
  for (const doc of docs) {
    const text = readFileSync(join(repoRoot, doc), 'utf8');
    for (const match of text.matchAll(mentionedToolPattern)) {
      const tool = match[1];
      assert.ok(
        registeredTools.includes(tool),
        `${doc} tells Claude to call MCP tool "${tool}", but mcp.js does not register it`,
      );
    }
  }
});
