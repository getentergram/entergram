import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { initRepo, paths, readCells, learnGit } from '../src/lib.js';
import { prNumberFromSubject, usableBody, bodyIndex } from '../src/github.js';

// Issue #28 (part B): 388 of 2504 cells learned from 3000 commits carried the
// placeholder rationale "(rationale not in commit message ...)" because a squash-merge
// commit's subject line never carries a body -- the real rationale lived in the PR
// description instead, and learnGit never looked there.

function makeGitRepo(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  execSync('git init -q', { cwd: root });
  execSync('git config user.email "test@example.com"', { cwd: root });
  execSync('git config user.name "Test"', { cwd: root });
  initRepo(root);
  return root;
}

function commit(root, file, subject, body) {
  writeFileSync(join(root, file), `${subject}\n${body || ''}\n`);
  execFileSync('git', ['add', file], { cwd: root });
  const msg = body ? `${subject}\n\n${body}` : subject;
  execFileSync('git', ['commit', '-q', '-m', msg], { cwd: root });
}

// --- prNumberFromSubject: parse the GitHub squash-merge "(#N)" suffix ------------------

test('prNumberFromSubject reads the PR number off a squash-merge commit subject', () => {
  assert.equal(prNumberFromSubject('fix(db): detect in-place cell edits as index staleness (#33)'), 33);
});

test('prNumberFromSubject returns null when there is no trailing PR reference', () => {
  assert.equal(prNumberFromSubject('fix(db): detect in-place cell edits as index staleness'), null);
});

// --- usableBody / bodyIndex: don't trade one placeholder for another ------------------

test('usableBody rejects an empty/templated PR body', () => {
  assert.equal(usableBody(''), null);
  assert.equal(usableBody('## Description\n\n## Checklist\n- [ ] tests pass\n- [ ]  \n'), null);
});

test('usableBody accepts real prose', () => {
  assert.equal(
    usableBody('This fixes the race condition in the queue drain by adding a lock around the flush.'),
    'This fixes the race condition in the queue drain by adding a lock around the flush.',
  );
});

test('bodyIndex only indexes PRs whose body is usable, skipping templated ones', () => {
  const idx = bodyIndex([
    { number: 5, body: 'This fixes the race condition in the queue drain by adding a lock.' },
    { number: 6, body: '## Description\n\n## Checklist\n- [ ] done\n' },
    { number: 7, body: '' },
  ]);
  assert.ok(idx.has(5));
  assert.ok(!idx.has(6), 'a templated/unfilled PR body must not become a cell rationale');
  assert.ok(!idx.has(7));
});

// --- learnGit: fall back to the PR body when the commit itself has none ---------------

test('a bodyless commit referencing a PR with a real body gets that body as its Why, not the placeholder', () => {
  const root = makeGitRepo('entergram-why-fallback-');
  commit(root, 'a.txt', 'fix(queue): stop double-draining the flush worker (#5)', '');

  const prBodies = bodyIndex([
    { number: 5, body: 'The flush worker was racing with the drain timer and double-processing the last batch; this adds a lock around the flush so only one path can run it at a time.' },
  ]);

  const { added } = learnGit(root, { limit: 10, prBodies });
  assert.equal(added, 1);

  const [cell] = readCells(root);
  assert.doesNotMatch(cell.text, /rationale not in commit message/i, 'must not fall through to the placeholder when a usable PR body exists');
  assert.match(cell.text, /racing with the drain timer/i, 'Why should carry the PR body text');
});

test('a bodyless commit whose PR body is templated/empty still falls back to the placeholder', () => {
  const root = makeGitRepo('entergram-why-noprfallback-');
  commit(root, 'a.txt', 'fix(queue): stop double-draining the flush worker (#6)', '');

  const prBodies = bodyIndex([
    { number: 6, body: '## Description\n\n## Checklist\n- [ ] done\n' },
  ]);

  const { added } = learnGit(root, { limit: 10, prBodies });
  assert.equal(added, 1);

  const [cell] = readCells(root);
  assert.match(cell.text, /rationale not in commit message/i, 'an unusable PR body must not mask the honest placeholder');
});

test('a bodyless commit with no matching PR reference still falls back to the placeholder (unchanged behavior)', () => {
  const root = makeGitRepo('entergram-why-noref-');
  commit(root, 'a.txt', 'fix(queue): stop double-draining the flush worker', '');

  const { added } = learnGit(root, { limit: 10 });
  assert.equal(added, 1);

  const [cell] = readCells(root);
  assert.match(cell.text, /rationale not in commit message/i);
});

test('a commit that already has its own body keeps using it, ignoring any PR body fallback', () => {
  const root = makeGitRepo('entergram-why-ownbody-');
  commit(
    root,
    'a.txt',
    'fix(queue): stop double-draining the flush worker (#5)',
    'Own commit-message rationale explaining the fix directly.',
  );

  const prBodies = bodyIndex([
    { number: 5, body: 'A totally different PR-body rationale that should not be used here.' },
  ]);

  const { added } = learnGit(root, { limit: 10, prBodies });
  assert.equal(added, 1);

  const [cell] = readCells(root);
  assert.match(cell.text, /own commit-message rationale/i);
  assert.doesNotMatch(cell.text, /totally different pr-body/i);
});
