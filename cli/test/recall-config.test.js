import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initRepo, paths } from '../src/lib.js';
import { reindex, search } from '../src/db.js';

// Issue #24: entergram.toml's [recall] section (default_budget, synthesis) was parsed
// but never consumed -- recall/dispatch always used the hardcoded 2000/on regardless of
// what the config said. These tests pin that recall() now actually respects it, while
// staying backward compatible when the section is absent.

function makeRepo(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  initRepo(root);
  return root;
}

const writeConfig = (root, body) => writeFileSync(paths(root).config, body);

function writeCellFile(root, { id, hook, tags = [], type = 'reference' }) {
  const { cells } = paths(root);
  const fm = [
    '---',
    `id: ${id}`,
    `type: ${type}`,
    `tags: [${tags.join(', ')}]`,
    'scope: global',
    'confidence: 1.0',
    'created: 2026-01-01',
    `hook: ${hook}`,
    '---',
  ].join('\n');
  writeFileSync(join(cells, `${id}-cell.md`), `${fm}\n\n# ${hook}\n\n${hook}\n`);
}

test('search() without an explicit budget respects entergram.toml recall.default_budget', () => {
  const root = makeRepo('entergram-budget-');
  writeConfig(root, '[recall]\ndefault_budget = 1\n');
  writeCellFile(root, { id: 'B-0001', hook: 'Widgets are grommulated widely', tags: ['widgets'] });
  writeCellFile(root, { id: 'B-0002', hook: 'Gadgets are grommulated widgets too', tags: ['widgets'] });
  reindex(root);

  const res = search(root, 'widgets'); // no budget argument at all
  assert.equal(res.hits.length, 1, 'a tiny configured default_budget should cap packed hits to one');
});

test('search() keeps today\'s 2000 default when [recall] is absent', () => {
  const root = makeRepo('entergram-budget-default-');
  writeCellFile(root, { id: 'B-0001', hook: 'Widgets are grommulated', tags: ['widgets'] });
  reindex(root);

  const res = search(root, 'widgets');
  assert.equal(res.hits.length, 1);
});

test('recall.synthesis = false suppresses the synthesis line', () => {
  const root = makeRepo('entergram-synthesis-off-');
  writeConfig(root, '[recall]\nsynthesis = false\n');
  writeCellFile(root, { id: 'B-0001', hook: 'Widgets are grommulated', tags: ['widgets'] });
  reindex(root);

  const res = search(root, 'widgets');
  assert.equal(res.synthesis, '');
});

test('synthesis stays on by default when [recall] is absent', () => {
  const root = makeRepo('entergram-synthesis-default-');
  writeCellFile(root, { id: 'B-0001', hook: 'Widgets are grommulated', tags: ['widgets'], type: 'decision' });
  reindex(root);

  const res = search(root, 'widgets');
  assert.notEqual(res.synthesis, '');
});
