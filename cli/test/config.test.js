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

// --- readConfig: [section] headers nest their keys, typed ----------------------------
// Issue #24: init writes [extraction]/[recall] sections, but every key inside them
// landed on the flat top-level `out` object as a raw string (section headers have no
// "=" so they were silently skipped, and the keys under them were indistinguishable
// from top-level keys) -- so `cfg.extraction.min_commit_len` was always undefined and
// `cfg.min_commit_len` was the string "20", not the number 20.

test('[extraction] and [recall] keys nest under their section, not the top level', () => {
  const root = makeRepo(); // init's own template already writes both sections
  const cfg = readConfig(root);

  assert.equal(typeof cfg.extraction, 'object', 'expected a nested extraction object');
  assert.equal(typeof cfg.recall, 'object', 'expected a nested recall object');

  // must NOT have flattened onto the top level
  assert.equal(cfg.min_commit_len, undefined);
  assert.equal(cfg.max_prs, undefined);
  assert.equal(cfg.default_budget, undefined);
  assert.equal(cfg.synthesis, undefined);
});

test('nested scalars are typed (numbers/booleans), not left as raw TOML strings', () => {
  const root = makeRepo();
  writeConfig(root, [
    '[extraction]',
    'min_commit_len = 15',
    'max_prs = 10',
    '',
    '[recall]',
    'default_budget = 500',
    'synthesis = false',
  ].join('\n'));

  const cfg = readConfig(root);
  assert.equal(cfg.extraction.min_commit_len, 15);
  assert.equal(cfg.extraction.max_prs, 10);
  assert.equal(cfg.recall.default_budget, 500);
  assert.equal(cfg.recall.synthesis, false);
  assert.equal(typeof cfg.recall.synthesis, 'boolean');
});

test('init\'s own config parses to the exact nested values it documents in comments', () => {
  const root = makeRepo();
  const cfg = readConfig(root);
  assert.equal(cfg.extraction.min_commit_len, 20);
  assert.equal(cfg.extraction.max_prs, 50);
  assert.equal(cfg.recall.default_budget, 2000);
  assert.equal(cfg.recall.synthesis, true);
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

// --- init's default doc_paths covers common non-"docs" directory names --------------

test('the default doc_paths ingests a repo whose docs live under doc/ or documentation/', () => {
  // Regression for #25: a repo with 3024 markdown files outside the default
  // doc_paths (README.md, docs/**, ARCHITECTURE.md, DESIGN.md) only had its
  // README ingested. This doesn't try to detect "the real docs directory" --
  // it just broadens the committed default list with the other common names.
  const root = makeRepo('entergram-docpaths-');
  mkdirSync(join(root, 'doc'), { recursive: true });
  mkdirSync(join(root, 'documentation'), { recursive: true });
  const section = (t, b) => `# ${t}\n\n${b.repeat(3)}\n`;
  writeFileSync(join(root, 'doc/guide.md'), section('Guide', 'Content lives outside docs/ on purpose. '));
  writeFileSync(join(root, 'documentation/manual.md'), section('Manual', 'Also outside docs/ on purpose. '));

  // No writeConfig call: this exercises the config init actually wrote.
  const { added } = learnDocs(root);
  assert.equal(added, 2, 'both non-"docs" directories should be picked up by the default doc_paths');
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
