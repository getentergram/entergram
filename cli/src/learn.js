// PR/issue learning: harvest → extract (LLM or heuristic) → write cells. Incremental.
import { readFileSync, writeFileSync } from "node:fs";
import { paths, writeCellDeduped, readConfig, buildCellIndex } from "./lib.js";
import { harvestPRs, harvestIssues, ghAvailable } from "./github.js";
import { extractLLM, extractHeuristic, llmAvailable } from "./extract.js";

async function ingest(root, units, seenKey, { useLLM }) {
  const p = paths(root);
  const state = JSON.parse(readFileSync(p.state, "utf8"));
  const seen = new Set(state[seenKey] || []);
  let added = 0, skipped = 0, merged = 0, viaLLM = 0;
  // Load cells once and reuse across every PR/issue in this run (issue #27) instead
  // of re-reading all cell files and re-listing the cell dir per unit.
  const index = buildCellIndex(root);
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
    }, index);
    seen.add(u.number);
    wasMerged ? merged++ : added++;
  }
  state[seenKey] = [...seen];
  writeFileSync(p.state, JSON.stringify(state, null, 2));
  return { added, skipped, merged, viaLLM };
}

/**
 * Effective item limit for a `learn` harvest: an explicit caller-supplied limit always
 * wins, otherwise entergram.toml's `[extraction]` key (e.g. `max_prs`) is consulted,
 * falling back to `fallback` when the config has nothing to say either. Exported so the
 * precedence itself is directly testable without a live `gh` call.
 */
export function resolveLearnLimit(root, explicit, fallback, configKey = "max_prs") {
  if (explicit != null) return explicit;
  return readConfig(root).extraction?.[configKey] ?? fallback;
}

export async function learnPRs(root, { limit, useLLM = llmAvailable() } = {}) {
  if (!ghAvailable(root)) { process.stderr.write("  gh not available / no GitHub remote — skipping PRs.\n"); return { added: 0, skipped: 0, merged: 0, viaLLM: 0 }; }
  const effectiveLimit = resolveLearnLimit(root, limit, 30);
  return ingest(root, harvestPRs(root, { limit: effectiveLimit }), "seenPRs", { useLLM });
}

export async function learnIssues(root, { limit = 30, useLLM = llmAvailable() } = {}) {
  if (!ghAvailable(root)) { process.stderr.write("  gh not available / no GitHub remote — skipping issues.\n"); return { added: 0, skipped: 0, merged: 0, viaLLM: 0 }; }
  return ingest(root, harvestIssues(root, { limit }), "seenIssues", { useLLM });
}
