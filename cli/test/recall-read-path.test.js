import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initRepo, paths, readCells } from '../src/lib.js';
import { reindex, search, packHits } from '../src/db.js';

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

const est = (s) => Math.ceil((s || '').length / 4);

// --- readCells: a .md without an `id:` is not a cell -------------------------------------

test('readCells skips .md files that carry no id in frontmatter', () => {
  const root = makeRepo('entergram-readcells-');
  const { cells } = paths(root);
  writeCellFile(root, { id: 'B-0001', hook: 'Widgets are grommulated', tags: ['widgets'] });

  // A store that doubles as a docs folder: prose files living beside the cells.
  writeFileSync(join(cells, 'README.md'), '# Read me\n\nProse, not a cell.\n');
  writeFileSync(join(cells, 'INDEX.md'), '---\ntitle: Index\n---\n\nStill not a cell.\n');
  writeFileSync(join(cells, 'BLANK.md'), '---\nid:   \ntype: reference\n---\n\nEmpty id.\n');

  const got = readCells(root);
  assert.deepEqual(got.map((c) => c.id), ['B-0001']);
});

test('id-less .md files never reach the index', () => {
  const root = makeRepo('entergram-index-');
  const { cells } = paths(root);
  writeCellFile(root, { id: 'B-0001', hook: 'Widgets are grommulated', tags: ['widgets'] });
  writeFileSync(join(cells, 'PROTOCOL.md'), '# Protocol\n\nProse.\n');

  // Would previously insert a NULL-id row: SQLite permits NULL in a non-INTEGER PRIMARY KEY.
  assert.equal(reindex(root), 1);
  assert.equal(search(root, 'widgets', 1e9).total, 1);
});

// --- packHits: body size must not govern packing -----------------------------------------

test('a long body does not evict rows from the result', () => {
  // Same cells, same hooks, same budget — only the body size differs. Packing must not care,
  // because a hit carries no body.
  const build = (bodyLen) => {
    const root = makeRepo(`entergram-pack-${bodyLen}-`);
    for (let i = 1; i <= 6; i++) {
      writeCellFile(root, {
        id: `B-000${i}`,
        hook: `Widgets rule number ${i}`,
        tags: ['widgets'],
        body: 'x'.repeat(bodyLen),
      });
    }
    reindex(root);
    return search(root, 'widgets', 200);
  };

  const lean = build(0);
  const fat = build(20000);
  assert.equal(fat.hits.length, lean.hits.length);
  assert.equal(fat.tokens, lean.tokens);
});

test('tokens reports the cost of what is actually returned', () => {
  const root = makeRepo('entergram-tokens-');
  for (let i = 1; i <= 4; i++) {
    writeCellFile(root, { id: `B-000${i}`, hook: `Widgets rule number ${i}`, tags: ['widgets'], body: 'y'.repeat(5000) });
  }
  reindex(root);

  const res = search(root, 'widgets', 1e9);
  const expected = res.hits.reduce((n, h) => n + est(h.hook), 0);
  assert.equal(res.tokens, expected);
});

// packHits is order-dependent, so these drive it directly: going through search() would
// silently test bm25's ranking too, and bm25 never ranks a bulky row early enough to reach
// the defect these guard.

const row = (id, hook, body = '') => ({ id, hook, body, tags_str: '', type: 'reference', confidence: 1 });

test('an oversized row is skipped, not treated as the end of the walk', () => {
  const rows = [
    row('B-0001', 'short one'),
    row('B-0002', 'x'.repeat(400)), // alone exceeds the budget
    row('B-0003', 'short three'),
    row('B-0004', 'short four'),
  ];
  const res = packHits(rows, 'q', 40);
  // The rows behind the bulky one must survive it.
  assert.deepEqual(res.hits.map((h) => h.id), ['B-0001', 'B-0003', 'B-0004']);
  assert.ok(res.tokens <= 40);
});

test('packHits charges the hook it returns, not the body it drops', () => {
  const rows = [row('B-0001', 'short one', 'z'.repeat(40000))];
  const res = packHits(rows, 'q', 100);
  assert.equal(res.tokens, est('short one'));
  assert.equal(res.hits.length, 1);
  assert.equal(res.hits[0].body, undefined);
});

test('a single row larger than the whole budget still yields a hit', () => {
  const root = makeRepo('entergram-single-');
  writeCellFile(root, { id: 'B-0001', hook: `Widgets ${'verbose '.repeat(100)}`, tags: ['widgets'] });
  reindex(root);

  const res = search(root, 'widgets', 1);
  assert.equal(res.hits.length, 1);
});
