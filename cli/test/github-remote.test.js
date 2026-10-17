import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { initRepo } from '../src/lib.js';
import { learnPRs, learnIssues } from '../src/learn.js';
import { remoteHost, githubAccess } from '../src/github.js';

// Issue #28 (part A): `learn --source pr` only ever understood GitHub. On any other
// remote it called `gh repo view`, got an error, swallowed it, and returned the exact
// same zero-counts result as "nothing new to learn" -- a user pointed at a GitLab or
// Bitbucket repo had no way to tell their PR/issue history wasn't being ingested at all.

function gitRepo(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  execSync('git init -q', { cwd: root });
  execSync('git config user.email "test@example.com"', { cwd: root });
  execSync('git config user.name "Test"', { cwd: root });
  initRepo(root);
  return root;
}

function withRemote(prefix, url) {
  const root = gitRepo(prefix);
  execSync(`git remote add origin ${url}`, { cwd: root });
  return root;
}

// --- remoteHost: parse the host out of common remote URL shapes -----------------------

test('remoteHost parses an scp-like GitLab remote (git@gitlab.com:owner/repo.git)', () => {
  const root = withRemote('entergram-gl-scp-', 'git@gitlab.com:someorg/somerepo.git');
  assert.equal(remoteHost(root), 'gitlab.com');
});

test('remoteHost parses an https Bitbucket remote', () => {
  const root = withRemote('entergram-bb-https-', 'https://bitbucket.org/someorg/somerepo.git');
  assert.equal(remoteHost(root), 'bitbucket.org');
});

test('remoteHost parses an https GitHub Enterprise remote', () => {
  const root = withRemote('entergram-ghe-', 'https://github.mycompany.com/someorg/somerepo.git');
  assert.equal(remoteHost(root), 'github.mycompany.com');
});

test('remoteHost parses a plain github.com https remote', () => {
  const root = withRemote('entergram-gh-https-', 'https://github.com/someorg/somerepo.git');
  assert.equal(remoteHost(root), 'github.com');
});

test('remoteHost returns null for a local-only repo with no remote', () => {
  const root = gitRepo('entergram-norem-');
  assert.equal(remoteHost(root), null);
});

// --- githubAccess: the gate that decides whether PR/issue harvesting can run ----------

test('githubAccess refuses a GitLab remote with a reason naming the host', () => {
  const root = withRemote('entergram-gl-access-', 'git@gitlab.com:someorg/somerepo.git');
  const access = githubAccess(root);
  assert.equal(access.ok, false);
  assert.match(access.reason, /gitlab\.com/i);
  assert.match(access.reason, /not github|only supports github/i);
});

test('githubAccess refuses a Bitbucket remote with a reason naming the host', () => {
  const root = withRemote('entergram-bb-access-', 'https://bitbucket.org/someorg/somerepo.git');
  const access = githubAccess(root);
  assert.equal(access.ok, false);
  assert.match(access.reason, /bitbucket\.org/i);
});

test('githubAccess refuses a local-only repo (no remote) with a reason saying so', () => {
  const root = gitRepo('entergram-norem-access-');
  const access = githubAccess(root);
  assert.equal(access.ok, false);
  assert.match(access.reason, /no (git )?remote/i);
});

test('githubAccess does not reject a GitHub Enterprise host purely by name (only the gh call may fail)', () => {
  const root = withRemote('entergram-ghe-access-', 'https://github.mycompany.com/someorg/somerepo.git');
  const access = githubAccess(root);
  // We can't assume `gh` is installed/authenticated for this host in CI, so `ok` may
  // still be false -- but the reason must be about reaching/authenticating with GitHub,
  // not a blanket "this host isn't GitHub" claim (github.mycompany.com plainly is one).
  if (!access.ok) assert.doesNotMatch(access.reason, /is not github/i);
});

// --- learn --source pr surfaces a clear, non-silent warning on a non-GitHub remote -----

test('learnPRs on a GitLab remote returns a clear warning instead of silently doing nothing', async () => {
  const root = withRemote('entergram-gl-learn-', 'git@gitlab.com:someorg/somerepo.git');
  const result = await learnPRs(root, { limit: 10, useLLM: false });
  assert.equal(result.added, 0);
  assert.ok(result.warning, 'expected a warning explaining why PR learning was skipped');
  assert.match(result.warning, /gitlab\.com/i);
});

test('learnIssues on a Bitbucket remote returns a clear warning instead of silently doing nothing', async () => {
  const root = withRemote('entergram-bb-learn-', 'https://bitbucket.org/someorg/somerepo.git');
  const result = await learnIssues(root, { limit: 10, useLLM: false });
  assert.equal(result.added, 0);
  assert.ok(result.warning, 'expected a warning explaining why issue learning was skipped');
  assert.match(result.warning, /bitbucket\.org/i);
});

test('learnPRs on a local-only repo (no remote at all) returns a clear warning', async () => {
  const root = gitRepo('entergram-norem-learn-');
  const result = await learnPRs(root, { limit: 10, useLLM: false });
  assert.equal(result.added, 0);
  assert.ok(result.warning, 'expected a warning explaining why PR learning was skipped');
  assert.match(result.warning, /no (git )?remote/i);
});
