import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initRepo, paths, readConfig, learnDocs } from '../src/lib.js';

function makeRepo(prefix = 'entergram-cfg-') {
  const root = mkdtempSync(join(tmpdir(), prefix));
  initRepo(root);
  return root;
}

const writeConfig = (root, body) => writeFileSync(paths(root).config, body);

// --- readConfig: arrays may span lines -----------------------------------------------

test('a multi-line array is read in full, not truncated to the opening bracket', () => {
  const root = makeRepo();
  writeConfig(root, [
    'name = "demo"',
    'doc_paths = [',
    '  "README.md",',
    '  "docs",',
    '  "ARCHITECTURE.md",',
    ']',
    '',
    '[extraction]',
    'min_commit_len = 20',
  ].join('\n'));

  assert.deepEqual(readConfig(root).doc_paths, ['README.md', 'docs', 'ARCHITECTURE.md']);
});

test('the config init writes parses to a non-empty doc_paths', () => {
  // This is the regression: init's own config produced [], which overrode the
  // built-in default and silently disabled doc ingestion entirely.
  const root = makeRepo();
  const cfg = readConfig(root);
  assert.ok(cfg.doc_paths.length > 0, 'init wrote a config whose doc_paths parse to empty');
  assert.ok(cfg.doc_paths.includes('README.md'));
});

test('a single-line array still works', () => {
  const root = makeRepo();
  writeConfig(root, 'doc_paths = ["a.md", "b.md"]');
  assert.deepEqual(readConfig(root).doc_paths, ['a.md', 'b.md']);
});

test('scalar values are unaffected', () => {
  const root = makeRepo();
  writeConfig(root, 'name = "my-project"\ndoc_paths = ["docs"]');
  assert.equal(readConfig(root).name, 'my-project');
});

// --- docFiles: globs are expanded ----------------------------------------------------

test('a glob doc_path matches nested files instead of being skipped', () => {
  const root = makeRepo('entergram-glob-');
  mkdirSync(join(root, 'docs/deep/deeper'), { recursive: true });
  // Distinct bodies on purpose: identical ones are genuine duplicates and get
  // merged, which would make this test about dedup rather than glob expansion.
  const section = (t, b) => `# ${t}\n\n${b.repeat(3)}\n`;
  writeFileSync(join(root, 'docs/top.md'), section('Top level doc', 'The index is a rebuildable cache. '));
  writeFileSync(join(root, 'docs/deep/mid.md'), section('Middle doc', 'Cells are plain markdown you can diff. '));
  writeFileSync(join(root, 'docs/deep/deeper/low.md'), section('Deep doc', 'Recall is capped by a token budget. '));

  writeConfig(root, 'doc_paths = ["docs/**/*.md"]');
  const { added } = learnDocs(root);
  assert.equal(added, 3, 'expected all three nested docs to be ingested');
});

test('a glob that matches nothing is simply empty, not an error', () => {
  const root = makeRepo('entergram-glob-empty-');
  writeConfig(root, 'doc_paths = ["nope/**/*.md"]');
  assert.equal(learnDocs(root).added, 0);
});

test('excluded paths stay excluded when expanding a glob', () => {
  const root = makeRepo('entergram-glob-excl-');
  mkdirSync(join(root, 'docs/node_modules'), { recursive: true });
  const body = `# Heading\n\n${'Long enough body to be ingested as a cell. '.repeat(3)}\n`;
  writeFileSync(join(root, 'docs/real.md'), body);
  writeFileSync(join(root, 'docs/node_modules/vendor.md'), body);

  writeConfig(root, 'doc_paths = ["docs/**/*.md"]\nexclude = ["node_modules"]');
  assert.equal(learnDocs(root).added, 1, 'node_modules should not be harvested');
});

test('sections with identical content are merged, not duplicated', () => {
  // Hooks now carry the first sentence for short verbless headings, which makes
  // boilerplate sections look alike to the deduper -- by design, but worth
  // pinning so the behaviour is deliberate rather than discovered later.
  const root = makeRepo('entergram-dupe-');
  mkdirSync(join(root, 'docs'), { recursive: true });
  const same = `${'Identical body text repeated across two files. '.repeat(3)}`;
  writeFileSync(join(root, 'docs/a.md'), `# Setup\n\n${same}\n`);
  writeFileSync(join(root, 'docs/b.md'), `# Install\n\n${same}\n`);

  writeConfig(root, 'doc_paths = ["docs"]');
  const { added, merged } = learnDocs(root);
  assert.equal(added + merged, 2, 'both sections accounted for');
  assert.ok(merged >= 1, 'identical content should merge rather than duplicate');
});
