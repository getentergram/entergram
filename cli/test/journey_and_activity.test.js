import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initRepo, paths } from '../src/lib.js';
import { openDb, reindex, search, dispatch } from '../src/db.js';
import { buildAdjacency, findJourney, shortestPath } from '../src/graph/metrics.js';

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'entergram-journey-'));
  initRepo(root);
  return root;
}

function writeCellFile(root, { id, type = 'reference', hook, created = '2026-06-01', text = '' }) {
  const { cells } = paths(root);
  const fm = [
    '---',
    `id: ${id}`,
    `type: ${type}`,
    'tags: [test, architecture]',
    'scope: global',
    'confidence: 1.0',
    `created: ${created}`,
    `hook: ${hook}`,
    '---',
  ].join('\n');
  writeFileSync(join(cells, `${id}-cell.md`), `${fm}\n\n# ${hook}\n\n${text}\n`);
}

test('reindex seeds activity and search/dispatch store citations in cell_citations', () => {
  const root = makeRepo();
  writeCellFile(root, {
    id: 'B-0001',
    hook: 'Root architecture decision',
    created: '2026-06-01',
    text: 'Cites [[B-0002]] for details',
  });
  writeCellFile(root, {
    id: 'B-0002',
    hook: 'Secondary implementation brick',
    created: '2026-06-15',
    text: 'Implements what B-0001 started',
  });

  const n = reindex(root);
  assert.equal(n, 2);

  const db = openDb(root);
  const initialCitations = db.prepare('SELECT COUNT(*) n FROM cell_citations').get().n;
  assert.ok(initialCitations >= 2, 'Initial baseline citations must be seeded');
  db.close();

  // Run a search query
  search(root, 'Root architecture');
  const db2 = openDb(root);
  const searchCitations = db2.prepare("SELECT COUNT(*) n FROM cell_citations WHERE query LIKE '%Root architecture%'").get().n;
  assert.ok(searchCitations >= 1, 'Search query must record citations');
  db2.close();

  // Run dispatch
  dispatch(root, 'Secondary implementation');
  const db3 = openDb(root);
  const dispatchCitations = db3.prepare("SELECT COUNT(*) n FROM cell_citations WHERE query = 'Secondary implementation'").get().n;
  assert.ok(dispatchCitations >= 1, 'Dispatch must record citations');
  db3.close();
});

test('findJourney discovers reasoning chain with chronology and edge relationships', () => {
  const nodes = [
    { id: 'B-0001', hook: 'Problem statement', type: 'decision', created: '2026-06-01', importance: 0.8 },
    { id: 'B-0002', hook: 'Architectural choice', type: 'architecture', created: '2026-06-15', importance: 0.6 },
    { id: 'B-0003', hook: 'Concrete implementation', type: 'procedure', created: '2026-07-01', importance: 0.4 },
  ];
  const edges = [
    { from: 'B-0001', to: 'B-0002', type: 'caused_by', weight: 1 },
    { from: 'B-0002', to: 'B-0003', type: 'supersedes', weight: 1 },
  ];

  const adj = buildAdjacency(nodes, edges);
  const journey = findJourney(adj, 'B-0001', 'B-0003', nodes, edges);

  assert.ok(journey, 'Journey must be found');
  assert.deepEqual(journey.path, ['B-0001', 'B-0002', 'B-0003']);
  assert.equal(journey.steps.length, 3);
  assert.equal(journey.steps[0].id, 'B-0001');
  assert.equal(journey.steps[1].edge?.type, 'caused_by');
  assert.equal(journey.steps[2].edge?.type, 'supersedes');
  assert.equal(journey.isChronological, true);
  assert.equal(journey.timeSpan.start, '2026-06-01');
  assert.equal(journey.timeSpan.end, '2026-07-01');
  assert.equal(journey.timeSpan.days, 30);
});
