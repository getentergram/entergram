import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initRepo, paths, learnDocs, doctor } from '../src/lib.js';

function makeRepo(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  initRepo(root);
  writeFileSync(paths(root).config, 'doc_paths = ["docs"]');
  mkdirSync(join(root, 'docs'), { recursive: true });
  return root;
}

const hooks = (root) =>
  readdirSync(paths(root).cells)
    .filter((f) => f.endsWith('.md'))
    .map((f) => /^hook:\s*(.+)$/m.exec(readFileSync(join(paths(root).cells, f), 'utf8'))?.[1] ?? '');

const BODY = 'Recall reads the hook first, so the hook has to carry the claim. '.repeat(2);

// --- links inside harvested docs are not this store's links ---------------------------

test('a [[B-NNN]] inside a harvested doc does not become a dangling link', () => {
  const root = makeRepo('entergram-doclink-');
  writeFileSync(
    join(root, 'docs/design.md'),
    `# How cells cite each other\n\nA cell may reference another, written [[B-1204]] in prose. ${BODY}\n`,
  );
  learnDocs(root);

  const problems = doctor(root).problems ?? [];
  assert.equal(
    problems.filter((p) => /dangling link/.test(p)).length,
    0,
    'ids quoted inside documentation are not links this store owns',
  );
});

test('a dangling link in a hand-written cell is still reported', () => {
  const root = makeRepo('entergram-handlink-');
  writeFileSync(
    join(paths(root).cells, 'B-9999-hand.md'),
    [
      '---',
      'id: B-9999',
      'type: decision',
      'tags: [test]',
      'scope: global',
      'confidence: 1.0',
      'created: 2026-01-01',
      'hook: We pin node 22 because 24 breaks the sqlite prebuilds',
      '---',
      '',
      'Relates to [[B-8888]], which does not exist.',
    ].join('\n'),
  );

  const problems = doctor(root).problems ?? [];
  assert.ok(
    problems.some((p) => /dangling link B-8888/.test(p)),
    'the guard must not blanket-silence real dangling links',
  );
});

// --- hooks ----------------------------------------------------------------------------

test('a short verbless heading is given the first sentence for context', () => {
  const root = makeRepo('entergram-hook-short-');
  writeFileSync(
    join(root, 'docs/stack.md'),
    `# Stack\n\nThe CLI runs on Node 22 with better-sqlite3 for the index. ${BODY}\n`,
  );
  learnDocs(root);

  const h = hooks(root)[0];
  assert.ok(h.startsWith('Stack'), `expected the heading to lead, got: ${h}`);
  assert.ok(h.length > 'Stack'.length, 'a verbless one-word heading should be extended');
  assert.match(h, /Node 22/);
});

test('a heading that already reads as a claim is left alone', () => {
  const root = makeRepo('entergram-hook-claim-');
  const title = 'Recall is capped by a token budget';
  writeFileSync(join(root, 'docs/recall.md'), `# ${title}\n\n${BODY}\n`);
  learnDocs(root);

  assert.equal(hooks(root)[0], title, 'a heading containing a verb needs no help');
});

test('a long descriptive heading is left alone', () => {
  const root = makeRepo('entergram-hook-long-');
  const title = 'Cell schema, frontmatter fields and their defaults';
  writeFileSync(join(root, 'docs/schema.md'), `# ${title}\n\n${BODY}\n`);
  learnDocs(root);

  assert.equal(hooks(root)[0], title, 'long headings already carry enough terms to match on');
});
