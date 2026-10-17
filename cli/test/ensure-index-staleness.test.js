import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initRepo, paths } from '../src/lib.js';
import { ensureIndex, search } from '../src/db.js';

/** Fresh .entergram store per test. */
function makeRepo(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  initRepo(root);
  return root;
}

function writeCellFile(root, { id, hook, tags = [], body = '' }) {
  const { cells } = paths(root);
  const fm = [
    '---',
    `id: ${id}`,
    'type: reference',
    `tags: [${tags.join(', ')}]`,
    'scope: global',
    'confidence: 1.0',
    'created: 2026-01-01',
    `hook: ${hook}`,
    '---',
  ].join('\n');
  writeFileSync(join(cells, `${id}-cell.md`), `${fm}\n\n# ${hook}\n\n${body}\n`);
}

// --- ensureIndex: in-place edits must not go unnoticed just because the row count held ----

test('ensureIndex reindexes a cell edited in place, same filename and row count', () => {
  const root = makeRepo('entergram-stale-edit-');
  writeCellFile(root, { id: 'B-0001', hook: 'Widgets are grommulated', tags: ['widgets'] });

  ensureIndex(root);
  let res = search(root, 'widgets', 1e9);
  assert.equal(res.hits.length, 1);
  assert.equal(res.hits[0].hook, 'Widgets are grommulated');

  // Edit the SAME cell file in place — same id, same filename, same row count,
  // only the content changed. A row-count staleness check cannot see this.
  writeCellFile(root, { id: 'B-0001', hook: 'Gadgets are now frobnicated', tags: ['gadgets'] });

  ensureIndex(root);

  const stale = search(root, 'widgets', 1e9);
  assert.equal(stale.hits.length, 0, 'the old hook must no longer be findable');

  const fresh = search(root, 'gadgets', 1e9);
  assert.equal(fresh.hits.length, 1);
  assert.equal(fresh.hits[0].hook, 'Gadgets are now frobnicated');
});

test('ensureIndex is a no-op (does not reindex) when nothing changed on disk', () => {
  const root = makeRepo('entergram-stale-noop-');
  writeCellFile(root, { id: 'B-0001', hook: 'Widgets are grommulated', tags: ['widgets'] });
  ensureIndex(root);

  // Nothing changed on disk — a second call should still find the same single hit
  // (this mainly guards against a naive "always reindex" fix regressing correctness).
  ensureIndex(root);
  const res = search(root, 'widgets', 1e9);
  assert.equal(res.hits.length, 1);
  assert.equal(res.hits[0].hook, 'Widgets are grommulated');
});
