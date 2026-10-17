import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { initRepo, learnGit, _diskStats } from '../src/lib.js';

// Issue #27: `learn` is quadratic. Every candidate commit re-read every existing
// cell file from disk for dedup (findDuplicate -> readCells) and re-listed the
// cell directory to compute the next id (nextId), so ingesting M candidates
// against N pre-existing cells cost O(N*M) disk operations instead of O(N+M).
//
// This is asserted via deterministic disk-operation counters (_diskStats) rather
// than wall-clock timing, which is reliable but can be flaky under CI load.

function makeGitRepo(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  execSync('git init -q', { cwd: root });
  execSync('git config user.email "test@example.com"', { cwd: root });
  execSync('git config user.name "Test"', { cwd: root });
  initRepo(root);
  return root;
}

function commit(root, file, subject) {
  writeFileSync(join(root, file), `${subject}\n`);
  execFileSync('git', ['add', file], { cwd: root });
  // Each subject is unique and long enough to pass min_commit_len, and carries
  // "add" so it is extracted as a real candidate, never skipped as low-signal.
  execFileSync('git', ['commit', '-q', '-m', subject], { cwd: root });
}

test('learn does not re-read every cell file or re-list the cell dir per candidate', () => {
  const root = makeGitRepo('entergram-learn-perf-');
  const SEED = 200;
  const BATCH = 50;

  // Seed N pre-existing cells from N real commits. Each subject carries a unique
  // token (widgetN) so the N seed cells stay distinct from each other -- tag/hook
  // overlap from shared filler words alone stays under findDuplicate's merge
  // threshold, so this really produces N separate cell files, not fewer merged ones.
  for (let i = 0; i < SEED; i++) {
    commit(root, `seed-${i}.txt`, `Add widget${i} caching layer to the pipeline`);
  }
  learnGit(root, { limit: SEED + 10 });

  // Add M more, distinct, never-before-seen commits (same shape, disjoint token).
  for (let i = 0; i < BATCH; i++) {
    commit(root, `batch-${i}.txt`, `Add gadget${i} caching layer to the pipeline`);
  }

  _diskStats.cellFileReads = 0;
  _diskStats.dirListings = 0;

  learnGit(root, { limit: BATCH + 10 });

  // Fixed cost: one index build should read each of the SEED pre-existing cells
  // once (~SEED file reads), not once per new candidate (~SEED * BATCH reads).
  assert.ok(
    _diskStats.cellFileReads < SEED * 3,
    `expected roughly O(N) cell file reads (~${SEED}) while ingesting ${BATCH} candidates against ${SEED} ` +
    `existing cells, got ${_diskStats.cellFileReads} (O(N*M) would be ~${SEED * BATCH})`,
  );

  // Fixed cost: the next-id counter should be tracked in memory, not recomputed
  // by re-listing the cell directory for every newly written cell.
  assert.ok(
    _diskStats.dirListings < 5,
    `expected the cell directory to be listed only a handful of times (one index build), ` +
    `got ${_diskStats.dirListings} listings while ingesting ${BATCH} candidates`,
  );
});
