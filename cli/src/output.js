import { formatProvenanceTree } from "./provenance.js";

export function formatSuccess(message) {
  return `✓ ${message}`;
}

export function formatError(message) {
  return `✗ ${message}`;
}

export function formatInfo(message) {
  return `• ${message}`;
}

export function formatList(items) {
  return items.map((item) => `- ${item}`).join('\n');
}

/** Render a dispatch() result: which case fired — a citable procedure+effector, or the plain
 *  recall fallback — so the human can tell at a glance before deciding whether to run anything. */
export function formatDispatch(result, query) {
  if (result.winner === 'procedure') {
    const { cell, effectorPath, why, citedProcedures } = result;
    const lines = [
      `▶ procedure ${cell.id}  [${cell.tags.join(', ')}]`,
      `  ${cell.hook}`,
      `  effector: ${effectorPath}`,
      `  ${why}`,
    ];
    if (citedProcedures?.length) {
      lines.push(`  cites: ${citedProcedures.map((c) => `${c.id} (${c.hook})`).join(', ')}`);
    }
    lines.push('  (dispatch only selects — nothing has been run)');
    return lines.join('\n');
  }
  const { hits, total, tokens, synthesis } = result;
  if (!hits.length) return `◇ recall fallback — no matches found for "${query}".`;
  const lines = [`◇ recall fallback — ${hits.length} of ${total} matches (${tokens} tok) for "${query}":`, ''];
  for (const h of hits) {
    const flag = h.confidence < 0.6 ? ' ⚠unreviewed' : '';
    lines.push(`  ${h.id}  [${h.tags.join(', ')}]  ${h.type}${flag}`);
    lines.push(`    ${h.hook}`);
  }
  if (synthesis) lines.push('', synthesis);
  return lines.join('\n');
}

export function formatLearnSummary({ added, merged, git, docs, pr, issue, viaLLM }) {
  const parts = [];
  if (git || docs || pr || issue) {
    const sources = [];
    if (git) sources.push(`git (${git})`);
    if (docs) sources.push(`docs (${docs})`);
    if (pr) sources.push(`PRs (${pr})`);
    if (issue) sources.push(`issues (${issue})`);
    parts.push(`from ${sources.join(', ')}`);
  }
  let summary = `Learned ${added} new memory cell${added === 1 ? '' : 's'}`;
  if (parts.length) summary += ` ${parts.join(' ')}`;
  const detailParts = [];
  if (merged) detailParts.push(`merged ${merged} existing cells`);
  if (viaLLM) detailParts.push(`${viaLLM} via LLM`);
  if (detailParts.length) summary += `; ${detailParts.join('; ')}`;
  return summary + '.';
}

/** Render a decision provenance tree */
export function formatProvenance(trace) {
  return formatProvenanceTree(trace);
}

/** Render telemetry metrics summary */
export function formatTelemetry(stats) {
  const lines = [
    `RL Telemetry & Decision Intelligence Stats`,
    `• Total Interaction Events: ${stats.totalEvents}`,
    `• Total Tokens Processed:   ${stats.totalTokens} (avg ${stats.avgTokensPerCall} tok/call)`,
    `• Rewarded Outcome Events:  ${stats.rewardedEvents} (avg reward: ${stats.avgReward})`,
  ];
  if (stats.byType && Object.keys(stats.byType).length > 0) {
    const types = Object.entries(stats.byType).map(([k, v]) => `${k} (${v})`).join(', ');
    lines.push(`• Events by Type:           ${types}`);
  }
  return lines.join('\n');
}

/** Render cellular synaptic network statistics */
export function formatNetworkStats(stats) {
  const lines = [
    `Cognitive Cellular Synaptic Network`,
    `• Active Brain Cells:        ${stats.totalCells}`,
    `• Total Dendritic Links:     ${stats.totalDendriticLinks} (avg ${stats.avgLinksPerCell} links/cell)`,
    `• Verified Task Resolutions: ${stats.totalResolutions}`,
    `• Task Execution Failures:   ${stats.totalFailures}`,
    `• Network Mean Plasticity:   ${stats.avgPlasticity}`,
  ];
  return lines.join('\n');
}
