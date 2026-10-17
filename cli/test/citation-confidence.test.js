import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initRepo, paths } from '../src/lib.js';
import { reindex, search } from '../src/db.js';

// Issue #19: every recall writes a citation, and citations raised displayed confidence
// via RECONFIRM_WEIGHT — so retrieval alone promoted unreviewed cells to look reviewed.
// A fresh cell at confidence 0.4 displayed as 0.54 after recall 1, 0.69 after recall 2,
// 0.84 after recall 3, 0.99 after recall 4, while the on-disk file still said 0.4.

function makeRepo(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  initRepo(root);
  return root;
}

function writeCellFile(root, { id, hook, tags = [], confidence = 1.0 }) {
  const { cells } = paths(root);
  const fm = [
    '---',
    `id: ${id}`,
    'type: reference',
    `tags: [${tags.join(', ')}]`,
    'scope: global',
    `confidence: ${confidence}`,
    'created: 2026-01-01',
    `hook: ${hook}`,
    '---',
  ].join('\n');
  writeFileSync(join(cells, `${id}-cell.md`), `${fm}\n\n# ${hook}\n\n${body(hook)}\n`);
}

function body(hook) {
  return `Some supporting detail about ${hook}.`;
}

test('repeated recalls of a fresh unreviewed cell do not flip it to reviewed', () => {
  const root = makeRepo('entergram-citeconf-');
  writeCellFile(root, { id: 'B-0001', hook: 'Widgets are grommulated before shipping', tags: ['widgets'], confidence: 0.4 });
  reindex(root);

  // Recall the same cell 4 times in a row, exactly like the issue's reproduction.
  for (let i = 1; i <= 4; i++) {
    const { hits } = search(root, 'widgets grommulated', 1e9);
    assert.equal(hits.length, 1);
    const h = hits[0];
    assert.ok(
      h.confidence < 0.6,
      `recall #${i}: confidence ${h.confidence} crossed the unreviewed threshold from citations alone`,
    );
  }
});
