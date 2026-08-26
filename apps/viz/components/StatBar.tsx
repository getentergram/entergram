"use client";

import { useBrain, useVisibleNodes } from "@/lib/store";

/**
 * Stat tiles, not a chart — these are single headline numbers, and the form
 * heuristic says a hero number beats a plot for a single magnitude.
 */
export default function StatBar() {
  const meta = useBrain((s) => s.meta);
  const graph = useBrain((s) => s.graph);
  const nodes = useVisibleNodes();
  if (!meta || !graph) return null;

  const stats = [
    { label: "cells", value: nodes.length, total: meta.stats.cells },
    { label: "synapses", value: graph.stats.edges, total: meta.stats.edges },
    { label: "clusters", value: graph.stats.communities },
    { label: "orphans", value: graph.orphans.length, status: graph.orphans.length > 0 },
    { label: "suggested links", value: graph.suggestions.length },
  ];

  return (
    <footer className="glass z-20 flex shrink-0 items-center gap-5 border-t px-4 py-1.5 text-[11px]">
      {stats.map((s) => (
        <div key={s.label} className="flex items-baseline gap-1.5">
          <span className="tabular font-medium text-[var(--ink-primary)]">{s.value}</span>
          {s.total != null && s.total !== s.value && (
            <span className="tabular text-[var(--ink-muted)]">/ {s.total}</span>
          )}
          <span className="text-[var(--ink-muted)]">{s.label}</span>
          {/* Status is never colour alone — the icon carries it too. */}
          {s.status && <span className="text-[var(--status-warning)]" title="unlinked cells">⚠</span>}
        </div>
      ))}

      <div className="ml-auto flex items-center gap-3 text-[var(--ink-muted)]">
        <span title={`History from ${meta.historySource}`}>
          {meta.historySource === "git" ? "git history" : meta.historySource}
        </span>
        {graph.stats.span && (
          <span className="tabular">
            {graph.stats.span.first.slice(0, 10)} → {graph.stats.span.last.slice(0, 10)}
          </span>
        )}
      </div>
    </footer>
  );
}
