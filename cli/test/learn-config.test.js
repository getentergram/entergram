import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { initRepo, paths, readCells, learnGit, resolveSources } from '../src/lib.js';
import { resolveLearnLimit } from '../src/learn.js';

// Issue #24: entergram.toml's [extraction]/[recall] sections carried keys
// (min_commit_len, max_prs, sources) that nothing in the codebase actually read.
// These tests pin the wiring: each key now drives a real, already-existing code path.

function makeGitRepo(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  execSync('git init -q', { cwd: root });
  execSync('git config user.email "test@example.com"', { cwd: root });
  execSync('git config user.name "Test"', { cwd: root });
  initRepo(root);
  return root;
}

const writeConfig = (root, body) => writeFileSync(paths(root).config, body);

function commit(root, file, subject) {
  writeFileSync(join(root, file), `${subject}\n`);
  execFileSync('git', ['add', file], { cwd: root });
  execFileSync('git', ['commit', '-q', '-m', subject], { cwd: root });
}

// --- learnGit: extraction.min_commit_len -----------------------------------------------

test('learnGit skips commits shorter than extraction.min_commit_len', () => {
  const root = makeGitRepo('entergram-mincommit-');
  writeConfig(root, '[extraction]\nmin_commit_len = 20\n');
  commit(root, 'a.txt', 'Short one'); // 9 chars -- below the threshold
  commit(root, 'b.txt', 'Add the new widget catalog loader'); // well above it

  const { added, skipped } = learnGit(root, { limit: 10 });

  assert.equal(added, 1, 'only the long-enough commit should be ingested');
  assert.equal(skipped, 1);
  const cells = readCells(root);
  assert.ok(cells.every((c) => !/short one/i.test(c.hook)), 'the short subject must not have been ingested');
});

test('learnGit does not filter by length when min_commit_len is absent from config', () => {
  const root = makeGitRepo('entergram-mincommit-off-');
  writeConfig(root, 'name = "x"\n'); // no [extraction] section at all
  commit(root, 'a.txt', 'Add x'); // 5 chars

  const { added } = learnGit(root, { limit: 10 });
  assert.equal(added, 1, 'with no configured threshold, short commits must still be ingested (backward compatible)');
});

// --- resolveSources: entergram.toml's `sources` scopes down `learn --source all` --------

test('resolveSources: "all" honors a customized entergram.toml sources list', () => {
  const root = makeGitRepo('entergram-sources-');
  writeConfig(root, 'sources = ["git"]\n');
  assert.deepEqual(resolveSources(root, 'all'), { git: true, docs: false, pr: false, issue: false });
});

test('resolveSources: the default sources list reproduces the historical "all" behavior', () => {
  const root = makeGitRepo('entergram-sources-default-');
  // init's own config (sources = ["git", "docs", "github"]) is in force, untouched
  assert.deepEqual(resolveSources(root, 'all'), { git: true, docs: true, pr: true, issue: false });
});

test('resolveSources: an explicit --source is unaffected by the sources list', () => {
  const root = makeGitRepo('entergram-sources-explicit-');
  writeConfig(root, 'sources = ["git"]\n');
  assert.deepEqual(resolveSources(root, 'issue'), { git: false, docs: false, pr: false, issue: true });
});

// --- resolveLearnLimit: extraction.max_prs ----------------------------------------------

test('resolveLearnLimit: extraction.max_prs is the default when no explicit limit is given', () => {
  const root = makeGitRepo('entergram-maxprs-');
  writeConfig(root, '[extraction]\nmax_prs = 7\n');
  assert.equal(resolveLearnLimit(root, undefined, 30), 7);
});

test('resolveLearnLimit: an explicit limit always wins over config', () => {
  const root = makeGitRepo('entergram-maxprs-explicit-');
  writeConfig(root, '[extraction]\nmax_prs = 7\n');
  assert.equal(resolveLearnLimit(root, 99, 30), 99);
});

test('resolveLearnLimit: falls back to the built-in default when config has no max_prs', () => {
  const root = makeGitRepo('entergram-maxprs-absent-');
  writeConfig(root, 'name = "x"\n');
  assert.equal(resolveLearnLimit(root, undefined, 30), 30);
});
