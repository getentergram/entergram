import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync, execFileSync } from 'node:child_process';
import { initRepo, paths, readCells, learnGit, learnDocs, writeCellDeduped } from '../src/lib.js';
import { reindex, traceDecision, openDb } from '../src/db.js';
import { getProvenanceEdges } from '../src/provenance.js';

// Issue #23: trace/why return empty for auto-learned cells because `learn` never
// creates provenance edges -- only hand-written [[B-NNNN]] links do. A cell learned
// from a git commit, a PR/issue, or a doc section should come out of `reindex` with
// a provenance edge back to its origin, so `trace` has something real to show.

function makeGitRepo(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  execSync('git init -q', { cwd: root });
  execSync('git config user.email "test@example.com"', { cwd: root });
  execSync('git config user.name "Test"', { cwd: root });
  initRepo(root);
  return root;
}

function commit(root, file, subject, body) {
  writeFileSync(join(root, file), `${subject}\n${body}\n`);
  execFileSync('git', ['add', file], { cwd: root });
  const msg = body ? `${subject}\n\n${body}` : subject;
  execFileSync('git', ['commit', '-q', '-m', msg], { cwd: root });
}

test('trace on a cell auto-learned from a git commit is non-empty and names the commit', () => {
  const root = makeGitRepo('entergram-prov-git-');
  commit(root, 'a.txt', 'Adopt PostgreSQL for payments', 'Needed strict multi-doc ACID transactions.');

  learnGit(root, { limit: 10 });
  reindex(root);

  const [cell] = readCells(root);
  assert.ok(cell, 'expected a cell to have been learned from the commit');

  const trace = traceDecision(root, cell.id);
  assert.equal(trace.found, true);

  // Today this is empty: learn never writes a provenance edge for auto-learned
  // cells, only for hand-written [[B-NNNN]] links.
  assert.ok(
    trace.provenance.derivedFrom && trace.provenance.derivedFrom.length > 0,
    'expected a derived_from provenance edge pointing at the originating commit',
  );
  const origin = trace.provenance.derivedFrom[0];
  assert.equal(origin.kind, 'commit');
  assert.match(origin.sha, /^[0-9a-f]{7,}$/);

  const formatted = formatTrace(trace);
  assert.match(formatted, /commit/i, 'the rendered trace should mention its commit origin');
});

test('re-running learn + reindex over the same commit does not duplicate the provenance edge', () => {
  const root = makeGitRepo('entergram-prov-idempotent-');
  commit(root, 'a.txt', 'Adopt PostgreSQL for payments', 'Needed strict multi-doc ACID transactions.');

  learnGit(root, { limit: 10 });
  reindex(root);
  reindex(root); // simulate a second `learn` run's trailing reindex over unchanged cells

  const [cell] = readCells(root);
  const trace = traceDecision(root, cell.id);
  assert.equal(trace.provenance.derivedFrom.length, 1, 'the edge must be upserted, not duplicated');
});

test('trace on a cell auto-learned from a doc section names the doc', () => {
  const root = mkdtempSync(join(tmpdir(), 'entergram-prov-doc-'));
  initRepo(root);
  writeFileSync(paths(root).config, 'doc_paths = ["docs"]');
  execSync('git init -q', { cwd: root });
  writeFileSync(
    join(root, 'README.md'),
    '# placeholder\n',
  );
  const docsDir = join(root, 'docs');
  execSync(`mkdir -p "${docsDir}"`);
  writeFileSync(
    join(docsDir, 'design.md'),
    '# Storage choice\n\nWe use Postgres because it gives us ACID transactions across documents, which Mongo does not. This sentence pads the section past the forty character minimum easily.\n',
  );

  learnDocs(root);
  reindex(root);

  const [cell] = readCells(root);
  assert.ok(cell, 'expected a cell to have been learned from the doc');

  const trace = traceDecision(root, cell.id);
  assert.ok(trace.provenance.derivedFrom?.length > 0, 'expected a derived_from edge pointing at the doc');
  assert.equal(trace.provenance.derivedFrom[0].kind, 'doc');
  assert.match(trace.provenance.derivedFrom[0].path, /design\.md/);
});

test('trace on a cell auto-learned from a merged PR names the PR', () => {
  const root = mkdtempSync(join(tmpdir(), 'entergram-prov-pr-'));
  initRepo(root);

  // Mirrors exactly the shape learn.js's ingest() passes to writeCellDeduped for a
  // PR/issue unit harvested via github.js (kind/ref/author/date/url).
  const { id } = writeCellDeduped(root, {
    type: 'decision', tags: ['payments'], scope: 'repo', confidence: 0.6,
    hook: 'Adopt PostgreSQL for payments', what: 'Adopt PostgreSQL for payments',
    why: 'Needed strict multi-doc ACID transactions.',
    source: { kind: 'pr', ref: '#42', author: '@octocat', date: '2026-01-01', url: 'https://github.com/x/y/pull/42' },
  });
  reindex(root);

  const trace = traceDecision(root, id);
  assert.ok(trace.provenance.derivedFrom?.length > 0, 'expected a derived_from edge pointing at the PR');
  assert.equal(trace.provenance.derivedFrom[0].kind, 'pr');
  assert.equal(trace.provenance.derivedFrom[0].ref, '#42');
});

test('trace on a cell auto-learned from a closed issue names the issue', () => {
  const root = mkdtempSync(join(tmpdir(), 'entergram-prov-issue-'));
  initRepo(root);

  const { id } = writeCellDeduped(root, {
    type: 'reference', tags: ['bug'], scope: 'repo', confidence: 0.5,
    hook: 'Fix off-by-one in pagination', what: 'Fix off-by-one in pagination',
    source: { kind: 'issue', ref: '#17', author: '@octocat', date: '2026-01-02', url: 'https://github.com/x/y/issues/17' },
  });
  reindex(root);

  const trace = traceDecision(root, id);
  assert.ok(trace.provenance.derivedFrom?.length > 0, 'expected a derived_from edge pointing at the issue');
  assert.equal(trace.provenance.derivedFrom[0].kind, 'issue');
  assert.equal(trace.provenance.derivedFrom[0].ref, '#17');
});

test('a hand-written [[B-NNNN]] link and an auto-learned derived_from edge coexist on the same cell without conflict', () => {
  const root = makeGitRepo('entergram-prov-coexist-');
  // A cell with BOTH a `source` (so learn's origin edge fires) AND a hand-written
  // [[B-NNNN]] link in its body (so the existing "related" edge path also fires),
  // simulating a learned cell a human later annotated by hand.
  writeFileSync(
    join(paths(root).cells, 'B-9000-hand.md'),
    [
      '---', 'id: B-9000', 'type: decision', 'tags: [test]', 'scope: global',
      'source: {"kind":"commit","sha":"deadbeef1","author":"Test","date":"2026-01-01"}',
      'confidence: 1.0', 'created: 2026-01-01', 'hook: Example learned-then-annotated cell',
      '---', '', 'References [[B-9001]] directly.',
    ].join('\n'),
  );
  writeFileSync(
    join(paths(root).cells, 'B-9001-hand.md'),
    [
      '---', 'id: B-9001', 'type: decision', 'tags: [test]', 'scope: global',
      'confidence: 1.0', 'created: 2026-01-01', 'hook: Referenced cell',
      '---', '', 'Nothing special.',
    ].join('\n'),
  );
  reindex(root);

  const trace = traceDecision(root, 'B-9000');
  assert.equal(trace.provenance.derivedFrom.length, 1, 'the auto-ingestion origin edge must still be emitted');
  assert.equal(trace.provenance.derivedFrom[0].kind, 'commit');

  const db = openDb(root);
  const edges = getProvenanceEdges(db, 'B-9000', 'outgoing');
  db.close();
  assert.ok(edges.some((e) => e.edge_type === 'related' && e.to_id === 'B-9001'),
    'the hand-written [[B-9001]] link must still produce its own "related" edge');
  assert.ok(edges.some((e) => e.edge_type === 'derived_from'),
    'the two edge types must coexist on the same from_id, not overwrite each other');
});

// Minimal stand-in for formatProvenance so this test doesn't need to import output.js;
// exercises the same traceDecisionProvenance shape the CLI's `trace` command renders.
function formatTrace(trace) {
  const d = trace.provenance.derivedFrom || [];
  return d.map((o) => `derived_from: ${o.kind} ${o.sha || o.ref || o.path || ''}`).join('\n');
}
