import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// scripts/version.mjs is the single place that keeps cli/package.json,
// .claude-plugin/plugin.json and .claude-plugin/marketplace.json in lockstep, and the
// release workflow runs `set <version>` on every release -- including a release where
// the target version was already hand-bumped in a merged PR (the "not on npm yet;
// releasing it as-is" branch in release-on-merge.yml). That path calls `set` with a
// version that's already written in all three files, which must be a no-op success,
// not a failure.

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_SCRIPT = join(HERE, '..', '..', 'scripts', 'version.mjs');

/** A fake repo root with the real script and three fixture manifests at the same
 *  relative layout version.mjs expects (it resolves REPO from its own file location). */
function makeFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), 'entergram-version-script-'));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'cli'));
  mkdirSync(join(root, '.claude-plugin'));
  copyFileSync(REAL_SCRIPT, join(root, 'scripts', 'version.mjs'));

  writeFileSync(join(root, 'cli', 'package.json'), JSON.stringify({ name: 'get-entergram', version: '0.1.0' }, null, 2));
  writeFileSync(join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'entergram', version: '0.1.0' }, null, 2));
  writeFileSync(
    join(root, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ name: 'entergram', plugins: [{ name: 'entergram', version: '0.1.0' }] }, null, 2),
  );
  return root;
}

function run(root, ...args) {
  return execFileSync('node', [join(root, 'scripts', 'version.mjs'), ...args], { encoding: 'utf8' });
}

test('version.mjs set is idempotent -- setting the version already on disk succeeds', () => {
  const root = makeFixtureRepo();
  // Same version as the fixtures already carry: this is exactly the "manifests were
  // hand-bumped in the merged PR, release just confirms it" path.
  assert.doesNotThrow(() => run(root, 'set', '0.1.0'));
  assert.equal(JSON.parse(readFileSync(join(root, 'cli', 'package.json'), 'utf8')).version, '0.1.0');
});

test('version.mjs set bumps all three manifests together', () => {
  const root = makeFixtureRepo();
  run(root, 'set', '0.2.0');
  assert.equal(JSON.parse(readFileSync(join(root, 'cli', 'package.json'), 'utf8')).version, '0.2.0');
  assert.equal(JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version, '0.2.0');
  assert.equal(JSON.parse(readFileSync(join(root, '.claude-plugin', 'marketplace.json'), 'utf8')).plugins[0].version, '0.2.0');
});

test('version.mjs set can be re-run for the same version a second time without failing', () => {
  const root = makeFixtureRepo();
  run(root, 'set', '0.2.0');
  // The regression this guards: running `set` again for a version already written
  // (a retried/re-dispatched release run) used to exit 1 with "no version field
  // rewritten", because the script couldn't tell "nothing to change" apart from
  // "the version field doesn't exist".
  assert.doesNotThrow(() => run(root, 'set', '0.2.0'));
});

test('version.mjs set still fails loudly when a target file has no version field at all', () => {
  const root = makeFixtureRepo();
  writeFileSync(join(root, 'cli', 'package.json'), JSON.stringify({ name: 'get-entergram' }, null, 2));
  assert.throws(() => run(root, 'set', '0.2.0'));
});
