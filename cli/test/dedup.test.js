import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { initRepo, paths, readCells, learnGit, writeCellDeduped } from '../src/lib.js';

// Issue #18: findDuplicate's tag+hook Jaccard merged commits about genuinely
// different subjects ("Remove foo feature flag" / "Remove bar feature flag")
// because the >=4-char tag filter drops short entity words like "foo"/"bar",
// so the two commits look tag-identical, and writeCellDeduped then let the
// later commit's rationale clobber the earlier cell's Why on a confidence tie
// (both default to 0.4).

function makeGitRepo(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  execSync('git init -q', { cwd: root });
  execSync('git config user.email "test@example.com"', { cwd: root });
  execSync('git config user.name "Test"', { cwd: root });
  initRepo(root);
  return root;
}

function commit(root, file, subject, body) {
  writeFileSync(join(root, file), `${subject}\n${body}\n`);
  execFileSync('git', ['add', file], { cwd: root });
  const msg = body ? `${subject}\n\n${body}` : subject;
  // execFileSync passes argv directly (no shell), so the real newline in `msg`
  // reaches git as an actual line break -- a shell-quoted `-m "..."` string
  // would flatten it to literal "\n" text and merge subject into the body.
  execFileSync('git', ['commit', '-q', '-m', msg], { cwd: root });
}

test('commits removing different feature flags get separate cells, not merged', () => {
  const root = makeGitRepo('entergram-dedup-flags-');
  commit(root, 'a.txt', 'Remove foo feature flag', 'Foo was fully rolled out; the flag is dead weight now.');
  commit(root, 'b.txt', 'Remove bar feature flag', 'Bar caused the Q3 outage; removing it per the postmortem.');

  const { added, merged } = learnGit(root, { limit: 10 });

  assert.equal(merged, 0, 'two different flags must not be deduped into one cell');
  assert.equal(added, 2, 'each commit should get its own cell');

  const cells = readCells(root);
  const fooCell = cells.find((c) => /foo/i.test(c.hook));
  const barCell = cells.find((c) => /bar/i.test(c.hook));
  assert.ok(fooCell, 'expected a cell whose hook names the foo flag');
  assert.ok(barCell, 'expected a cell whose hook names the bar flag');
  assert.notEqual(fooCell.id, barCell.id);

  // The hook subject and the Why rationale must stay paired to the same commit --
  // this is the exact corruption the issue reports: a cell naming flag A ending
  // up with flag B's rationale.
  assert.match(fooCell.text, /fully rolled out/i, 'foo cell should keep its own rationale');
  assert.doesNotMatch(fooCell.text, /Q3 outage/i, 'foo cell must not receive bar\'s rationale');
  assert.match(barCell.text, /Q3 outage/i, 'bar cell should keep its own rationale');
  assert.doesNotMatch(barCell.text, /fully rolled out/i, 'bar cell must not receive foo\'s rationale');
});

test('writeCellDeduped does not overwrite Why when the candidate is only tied, not stronger', () => {
  const root = mkdtempSync(join(tmpdir(), 'entergram-dedup-tie-'));
  initRepo(root);

  const base = {
    type: 'reference',
    tags: ['remove', 'feature', 'flag'],
    scope: 'repo',
    confidence: 0.4,
    hook: 'Remove foo feature flag',
    what: 'Remove foo feature flag',
    why: 'Foo was fully rolled out.',
  };
  const { merged: firstMerged } = writeCellDeduped(root, base);
  assert.equal(firstMerged, false);

  // Same confidence (0.4 == 0.4, the real-world default for every git commit),
  // same tags/hook -- a genuine duplicate of the same subject, but the Why must
  // not be blindly replaced on a tie.
  const { merged: secondMerged } = writeCellDeduped(root, {
    ...base,
    why: 'Unrelated later rationale that must not clobber the original.',
  });
  assert.equal(secondMerged, true);

  const [cell] = readCells(root);
  assert.match(cell.text, /fully rolled out/, 'tie must keep the original Why');
  assert.doesNotMatch(cell.text, /Unrelated later rationale/, 'tie must not overwrite Why');
});
