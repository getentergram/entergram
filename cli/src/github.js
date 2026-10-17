// Harvest merged PRs and closed issues via the `gh` CLI. Each becomes a candidate
// unit for extraction. Requires `gh` installed + authenticated; degrades gracefully.
import { execSync } from "node:child_process";

function gh(root, args) {
  return execSync(`gh ${args}`, { cwd: root, encoding: "utf8", maxBuffer: 1 << 24, stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * The host of the `origin` remote, parsed out of whatever shape it's in
 * (scp-like `git@host:owner/repo.git`, `ssh://`, `https://`, plain `http://`).
 * Returns null when there is no `origin` remote at all (a fresh/local-only repo).
 */
export function remoteHost(root) {
  let url;
  try {
    url = execSync(`git -C "${root}" remote get-url origin`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
  if (!url) return null;
  // scp-like: [user@]host:owner/repo(.git)
  let m = /^[\w.-]+@([^:/]+):/.exec(url);
  if (m) return m[1].toLowerCase();
  // scheme://[user@]host[:port]/owner/repo(.git)
  m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)/i.exec(url);
  if (m) return m[1].toLowerCase();
  return null;
}

/**
 * Heuristic only: does this host look like it's running GitHub (github.com or a
 * GitHub Enterprise instance)? We never hard-fail purely on an unrecognized name --
 * `gh` itself knows about configured Enterprise hosts -- this only decides whether a
 * failed `gh` call gets blamed on "not GitHub" or on something else (not installed,
 * not authenticated, network).
 */
export function looksLikeGitHub(host) {
  return !!host && /github/i.test(host);
}

/**
 * Can PR/issue harvesting run at all here, and if not, why not? Issue #28 part A:
 * `learn --source pr` used to swallow every failure (no remote, a non-GitHub remote,
 * `gh` missing, `gh` unauthenticated) into one silent no-op. Callers use `reason` to
 * surface a clear, specific warning instead.
 */
export function githubAccess(root) {
  const host = remoteHost(root);
  if (host === null) {
    return { ok: false, host: null, reason: `no git remote named "origin" is configured here — skipping PR/issue learning.` };
  }
  if (!looksLikeGitHub(host)) {
    return {
      ok: false,
      host,
      reason: `remote host "${host}" is not GitHub — PR/issue learning only supports GitHub (via the \`gh\` CLI) right now, so it's being skipped. (GitLab/Bitbucket support is tracked separately.)`,
    };
  }
  try {
    gh(root, "repo view --json nameWithOwner -q .nameWithOwner");
    return { ok: true, host };
  } catch (e) {
    const stderr = `${e.stderr || ""}${e.message || ""}`;
    const hint = /command not found|not recognized|ENOENT/i.test(stderr)
      ? "the `gh` CLI isn't installed"
      : /auth|login|credential/i.test(stderr)
      ? "`gh` isn't authenticated (run `gh auth login`)"
      : "`gh` couldn't reach it (run `gh auth status` to check)";
    return { ok: false, host, reason: `GitHub host "${host}" detected, but ${hint} — skipping PR/issue learning.` };
  }
}

/** Backward-compatible boolean form of {@link githubAccess}. */
export function ghAvailable(root) {
  return githubAccess(root).ok;
}

export function harvestPRs(root, { limit = 30 } = {}) {
  const raw = gh(root, `pr list --state merged --limit ${limit} --json number,title,body,author,mergedAt,url`);
  return JSON.parse(raw).map((p) => ({
    kind: "pr", ref: `#${p.number}`, number: p.number,
    title: p.title, body: p.body || "",
    author: p.author?.login ? "@" + p.author.login : "",
    date: (p.mergedAt || "").slice(0, 10), url: p.url,
  }));
}

export function harvestIssues(root, { limit = 30 } = {}) {
  const raw = gh(root, `issue list --state closed --limit ${limit} --json number,title,body,author,closedAt,url`);
  return JSON.parse(raw).map((i) => ({
    kind: "issue", ref: `#${i.number}`, number: i.number,
    title: i.title, body: i.body || "",
    author: i.author?.login ? "@" + i.author.login : "",
    date: (i.closedAt || "").slice(0, 10), url: i.url,
  }));
}

/**
 * The PR number GitHub's squash-merge embeds in a commit subject, e.g.
 * "fix(db): detect in-place cell edits as index staleness (#33)" -> 33.
 * Returns null when the subject doesn't end in one.
 */
export function prNumberFromSubject(subject) {
  const m = /\(#(\d+)\)\s*$/.exec((subject || "").trim());
  return m ? Number(m[1]) : null;
}

/**
 * Is this PR/issue body worth using as a fallback rationale, or is it empty/templated
 * boilerplate (an unfilled "## Description" PR template, a bare checklist, ...)? Issue
 * #28 part B: falling back to PR body text must not just trade one placeholder for
 * another.
 */
export function usableBody(body) {
  const stripped = (body || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^#{1,6}\s/.test(l) && !/^#{1,6}$/.test(l) && !/^[-*]\s*\[[ xX]?\]/.test(l) && !/^[-*]\s*$/.test(l))
    .join(" ")
    .trim();
  return stripped.length >= 15 ? stripped : null;
}

/**
 * Build a `PR number -> usable body text` lookup from harvested PR (or issue) units,
 * for learnGit's placeholder-rationale fallback (issue #28 part B).
 */
export function bodyIndex(units) {
  const idx = new Map();
  for (const u of units || []) {
    const text = usableBody(u.body);
    if (text) idx.set(u.number, text);
  }
  return idx;
}
