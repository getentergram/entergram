// PR/issue learning: harvest → extract (LLM or heuristic) → write cells. Incremental.
import { readFileSync, writeFileSync } from "node:fs";
import { paths, writeCellDeduped } from "./lib.js";
import { harvestPRs, harvestIssues, githubAccess, bodyIndex } from "./github.js";
import { extractLLM, extractHeuristic, llmAvailable } from "./extract.js";

async function ingest(root, units, seenKey, { useLLM }) {
  const p = paths(root);
  const state = JSON.parse(readFileSync(p.state, "utf8"));
  const seen = new Set(state[seenKey] || []);
  let added = 0, skipped = 0, merged = 0, viaLLM = 0;
  for (const u of units) {
    if (seen.has(u.number)) { skipped++; continue; }
    let mem = null;
    if (useLLM) {
      try { mem = await extractLLM(u); if (mem) viaLLM++; }
      catch (e) { process.stderr.write(`  extract ${u.ref} failed (${e.message}); using heuristic\n`); }
    }
    if (!mem) mem = extractHeuristic(u);
    // dedup/reconcile against existing cells (§4.4-4.5) — the same decision surfacing via a
    // commit AND its PR shouldn't produce two cells; the stronger/more-recent one wins.
    const { merged: wasMerged } = writeCellDeduped(root, {
      type: mem.type, tags: mem.tags, scope: mem.scope || "repo",
      confidence: mem.confidence, hook: mem.what, what: mem.what,
      why: mem.why, outcome: mem.outcome,
      source: { kind: u.kind, ref: u.ref, author: u.author, date: u.date, url: u.url },
    });
    seen.add(u.number);
    wasMerged ? merged++ : added++;
  }
  state[seenKey] = [...seen];
  writeFileSync(p.state, JSON.stringify(state, null, 2));
  return { added, skipped, merged, viaLLM };
}

export async function learnPRs(root, { limit = 30, useLLM = llmAvailable(), units } = {}) {
  const access = githubAccess(root);
  if (!access.ok) {
    process.stderr.write(`  ${access.reason}\n`);
    return { added: 0, skipped: 0, merged: 0, viaLLM: 0, warning: access.reason };
  }
  const prUnits = units || harvestPRs(root, { limit });
  const result = await ingest(root, prUnits, "seenPRs", { useLLM });
  return { ...result, warning: null };
}

export async function learnIssues(root, { limit = 30, useLLM = llmAvailable() } = {}) {
  const access = githubAccess(root);
  if (!access.ok) {
    process.stderr.write(`  ${access.reason}\n`);
    return { added: 0, skipped: 0, merged: 0, viaLLM: 0, warning: access.reason };
  }
  const result = await ingest(root, harvestIssues(root, { limit }), "seenIssues", { useLLM });
  return { ...result, warning: null };
}

/**
 * Pre-harvest merged PRs (when reachable) into a `PR number -> body` lookup that
 * `learnGit` uses as a placeholder-rationale fallback for bodyless commits (issue #28
 * part B). Only attempted — and only worth the extra `gh` call — when PR learning is
 * actually running alongside git learning in this invocation; returns an empty index
 * (never throws) when GitHub isn't reachable, so git-only learning stays offline-safe.
 */
export function prBodiesForGit(root, { limit = 30 } = {}) {
  const access = githubAccess(root);
  if (!access.ok) return { index: new Map(), units: null };
  const units = harvestPRs(root, { limit });
  return { index: bodyIndex(units), units };
}
