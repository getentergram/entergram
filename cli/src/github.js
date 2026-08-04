// Harvest merged PRs and closed issues via the `gh` CLI. Each becomes a candidate
// unit for extraction. Requires `gh` installed + authenticated; degrades gracefully.
import { execSync } from "node:child_process";

function gh(root, args) {
  return execSync(`gh ${args}`, { cwd: root, encoding: "utf8", maxBuffer: 1 << 24, stdio: ["ignore", "pipe", "pipe"] });
}

export function ghAvailable(root) {
  try { gh(root, "repo view --json nameWithOwner -q .nameWithOwner"); return true; }
  catch { return false; }
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
