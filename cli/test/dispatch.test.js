import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initRepo, paths } from '../src/lib.js';
import { reindex, search, dispatch } from '../src/db.js';

/** Fresh .entergram store per test, cleaned up after. */
function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'entergram-dispatch-'));
  initRepo(root);
  return root;
}

/** Write a cell file directly (full control over frontmatter, incl. `effector`), mirroring the
 *  format writeCell() produces — parseFrontmatter() is a generic per-line key:value parser so
 *  any recognized or new field just needs to appear as `key: value` inside the `---` fence. */
function writeCellFile(root, { id, type = 'reference', hook, tags = [], effector, body = '' }) {
  const { cells } = paths(root);
  const fm = [
    '---',
    `id: ${id}`,
    `type: ${type}`,
    `tags: [${tags.join(', ')}]`,
    'scope: global',
    'confidence: 1.0',
    'created: 2026-01-01',
    effector ? `effector: ${effector}` : null,
    `hook: ${hook}`,
    '---',
  ].filter(Boolean).join('\n');
  writeFileSync(join(cells, `${id}-cell.md`), `${fm}\n\n# ${hook}\n\n${body}\n`);
}

test('search()/reindex() basics: a reindexed fact is findable by keyword', () => {
  const root = makeRepo();
  writeCellFile(root, { id: 'B-0001', type: 'reference', hook: 'Widgets are grommulated in the frobnicator', tags: ['widgets', 'frobnicator'] });
  const n = reindex(root);
  assert.equal(n, 1);
  const { hits, total } = search(root, 'widgets frobnicator');
  assert.equal(total, 1);
  assert.equal(hits[0].id, 'B-0001');
});

test('dispatch(): a stronger-matching procedure wins over a weaker-matching fact', () => {
  const root = makeRepo();
  const effectorRel = 'effectors/fix-foo.sh';
  mkdirSync(join(paths(root).base, 'effectors'), { recursive: true });
  writeFileSync(join(paths(root).base, effectorRel), '#!/bin/sh\necho stub\n');

  writeCellFile(root, {
    id: 'B-0001', type: 'procedure', effector: effectorRel,
    hook: 'Fix foo when foo is broken', tags: ['foo', 'broken'],
    body: 'Foo is broken sometimes. Run the fix-foo effector to repair foo. Foo foo foo.',
  });
  writeCellFile(root, {
    id: 'B-0002', type: 'reference', hook: 'Widgets are grommulated in the frobnicator', tags: ['widgets'],
    body: 'An unrelated fact about widgets and the frobnicator.',
  });
  reindex(root);

  const result = dispatch(root, 'foo is broken');
  assert.equal(result.winner, 'procedure');
  assert.equal(result.cell.id, 'B-0001');
  assert.equal(result.effectorPath, join(paths(root).base, effectorRel));
  assert.ok(existsSync(result.effectorPath));
  assert.match(result.why, /foo/i);
});

test('dispatch(): falls back to recall when the winning procedure has no effector on disk', () => {
  const root = makeRepo();
  // Frontmatter names an effector, but the file is never created.
  writeCellFile(root, {
    id: 'B-0001', type: 'procedure', effector: 'effectors/does-not-exist.sh',
    hook: 'Fix foo when foo is broken', tags: ['foo', 'broken'],
    body: 'Foo is broken sometimes. Foo foo foo.',
  });
  reindex(root);

  assert.ok(!existsSync(join(paths(root).base, 'effectors/does-not-exist.sh')));
  const result = dispatch(root, 'foo is broken');
  assert.equal(result.winner, 'recall');
  assert.equal(result.effectorPath, undefined);
  assert.equal(result.cell, undefined);
});

test('dispatch(): a query that only matches fact cells falls back to recall', () => {
  const root = makeRepo();
  const effectorRel = 'effectors/fix-foo.sh';
  mkdirSync(join(paths(root).base, 'effectors'), { recursive: true });
  writeFileSync(join(paths(root).base, effectorRel), '#!/bin/sh\necho stub\n');

  writeCellFile(root, {
    id: 'B-0001', type: 'procedure', effector: effectorRel,
    hook: 'Fix foo when foo is broken', tags: ['foo', 'broken'],
    body: 'Foo is broken sometimes.',
  });
  writeCellFile(root, {
    id: 'B-0002', type: 'reference', hook: 'Widgets are grommulated in the frobnicator', tags: ['widgets'],
    body: 'An unrelated fact about widgets and the frobnicator, widgets everywhere.',
  });
  reindex(root);

  const result = dispatch(root, 'widgets frobnicator');
  assert.equal(result.winner, 'recall');
  assert.ok(result.hits.length >= 1);
  assert.equal(result.hits[0].id, 'B-0002');
});

test('dispatch(): surfaces cited procedures without ever executing anything', () => {
  const root = makeRepo();
  const effectorRel = 'effectors/fix-foo.sh';
  const markerPath = join(paths(root).base, 'ran.marker');
  mkdirSync(join(paths(root).base, 'effectors'), { recursive: true });
  // A stub effector that WOULD leave evidence behind if anything ever ran it.
  writeFileSync(join(paths(root).base, effectorRel), `#!/bin/sh\ntouch "${markerPath}"\n`);

  writeCellFile(root, {
    id: 'B-0002', type: 'procedure', hook: 'Restart the frobnicator service', tags: ['frobnicator'],
    body: 'Restart the frobnicator when it wedges.',
  });
  writeCellFile(root, {
    id: 'B-0001', type: 'procedure', effector: effectorRel,
    hook: 'Fix foo when foo is broken', tags: ['foo', 'broken'],
    body: 'Foo is broken sometimes. Foo foo foo. See also [[B-0002]] for the related restart procedure.',
  });
  reindex(root);

  const result = dispatch(root, 'foo is broken');
  assert.equal(result.winner, 'procedure');
  assert.equal(result.cell.id, 'B-0001');
  assert.ok(Array.isArray(result.citedProcedures));
  assert.equal(result.citedProcedures.length, 1);
  assert.equal(result.citedProcedures[0].id, 'B-0002');
  assert.equal(result.citedProcedures[0].hook, 'Restart the frobnicator service');

  // The safety boundary: dispatch() never runs, spawns, or shells out to any effector.
  assert.ok(!existsSync(markerPath), 'dispatch() must never execute an effector');

  rmSync(root, { recursive: true, force: true });
});
