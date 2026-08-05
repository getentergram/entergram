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
