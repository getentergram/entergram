import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initRepo, paths } from '../src/lib.js';
import { reindex, search } from '../src/db.js';

// Issue #26: ftsMatch() ORs every query term longer than two characters, so common
// function words ("why", "are", "how", ...) match almost every cell in the store and
// drown out the cell that actually contains the substantive query term. These tests
// build a small synthetic store that mirrors the reported symptom: many "noise" cells
// stuffed with the query's stop words, and one on-topic cell that only matches on the
// real content word ("slow").

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

/** Seed a store with one on-topic cell and N noise cells whose only overlap with the
 *  query is a repeated run of stop words ("why", "are"). */
function seedStopwordDilution(root) {
  writeCellFile(root, {
    id: 'B-0001',
    hook: 'Database backup retention policy',
    tags: ['database', 'ops'],
    body: 'Why are backups rotated daily? Are retention windows configured per region? '
      + 'Why are snapshots pruned after 30 days. Are there exceptions. Why are some backups '
      + 'kept longer. Are compliance rules why we keep them. Why are costs rising. Are we '
      + 'over-provisioned. Why are database backups why are backups are why.',
  });
  writeCellFile(root, {
    id: 'B-0002',
    hook: 'Checkout button rendering is slow on mobile devices',
    tags: ['ui', 'performance'],
    body: 'Users report the checkout button takes a long time to appear. Investigate the '
      + 'render path for the slow frames. The slow paint happens after the stylesheet loads.',
  });
  for (let i = 3; i <= 12; i++) {
    writeCellFile(root, {
      id: `B-00${i}`,
      hook: `Filler topic number ${i} about unrelated infrastructure`,
      tags: ['filler'],
      body: `Why are the settings configured this way for topic ${i}? Are the defaults correct? `
        + 'Why are there so many knobs. Are they documented anywhere.',
    });
  }
  reindex(root);
}

test('search(): cells matching only on common query words do not dilute or outrank a content match', () => {
  const root = makeRepo('entergram-ranking-stopwords-');
  seedStopwordDilution(root);

  const res = search(root, 'why are things slow');

  // Pre-fix, every cell above matches the blanket "why" OR "are" OR ... query (the "N of N
  // matches" symptom from the issue). None of them (including the stop-word-stuffed B-0001
  // "database" cell) actually contains "things" or "slow", so a query-aware match should
  // retrieve only the one cell that does.
  assert.equal(res.total, 1, `expected only the on-topic cell to match, got: ${res.hits.map((h) => h.id).join(', ')}`);
  assert.equal(res.hits[0].id, 'B-0002');
});

test('search(): a query made entirely of stop words degrades gracefully (no crash, no empty result)', () => {
  const root = makeRepo('entergram-ranking-allstop-');
  seedStopwordDilution(root);

  const res = search(root, 'why are how');
  assert.ok(res.total > 0, 'an all-stop-word query should still return candidates, not zero results');
  assert.ok(Array.isArray(res.hits));
});
