import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { initRepo } from '../src/lib.js';
import { serve } from '../src/mcp.js';

const pkgVersion = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf8'),
).version;

async function connectedClient(cwd) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [, connected] = await Promise.all([
    serve({ transport: serverTransport, cwd }),
    client.connect(clientTransport),
  ]);
  return client;
}

// --- Part C: version string must come from package.json, not be hardcoded -------------

test('McpServer reports the real package.json version, not a hardcoded 0.1.0', async () => {
  const root = mkdtempSync(join(tmpdir(), 'entergram-mcp-ver-'));
  initRepo(root);

  const client = await connectedClient(root);
  const serverInfo = client.getServerVersion();

  assert.notEqual(serverInfo.version, '0.1.0', 'version string is still the old hardcoded literal');
  assert.equal(serverInfo.version, pkgVersion, 'server-reported version must match cli/package.json');
});

// --- Part B: starting in a directory with no .entergram/ must not hard-exit -----------

test('serve() does not call process.exit when .entergram/ is missing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'entergram-mcp-noroot-'));
  // deliberately: no initRepo(root) here — this directory has no .entergram/

  const originalExit = process.exit;
  let exitCode;
  process.exit = (code) => { exitCode = code; throw new Error(`process.exit(${code}) was called`); };

  try {
    const client = await connectedClient(root);
    assert.equal(exitCode, undefined, 'serve() must not call process.exit when no store is found');
    // The server should still be reachable (idle), not have crashed the connection.
    const serverInfo = client.getServerVersion();
    assert.ok(serverInfo, 'server should still complete the MCP handshake in idle mode');
  } finally {
    process.exit = originalExit;
  }
});

test('calling a tool with no store present returns a graceful message, not a crash', async () => {
  const root = mkdtempSync(join(tmpdir(), 'entergram-mcp-noroot-tool-'));

  const client = await connectedClient(root);
  const result = await client.callTool({ name: 'recall', arguments: { query: 'anything' } });

  const text = result?.content?.[0]?.text ?? '';
  assert.match(text, /\.entergram|init/i, 'tool should explain no store was found rather than throwing');
});
