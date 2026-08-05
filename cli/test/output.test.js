import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSuccess, formatInfo, formatList, formatLearnSummary } from '../src/output.js';

test('formatSuccess prefixes a success marker', () => {
  assert.equal(formatSuccess('Initialized memory'), '✓ Initialized memory');
});

test('formatInfo prefixes an info marker', () => {
  assert.equal(formatInfo('Already initialized'), '• Already initialized');
});

test('formatList creates a clean bullet list', () => {
  assert.equal(formatList(['one', 'two']), '- one\n- two');
});

test('formatLearnSummary reports counts clearly', () => {
  assert.equal(
    formatLearnSummary({ added: 3, merged: 1, git: 2, docs: 1, pr: 0, issue: 0, viaLLM: 1 }),
    'Learned 3 new memory cells from git (2), docs (1); merged 1 existing cells; 1 via LLM.'
  );
});
