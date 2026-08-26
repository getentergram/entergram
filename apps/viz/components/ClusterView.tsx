"use client";

import { useBrain, useVisibleNodes } from "@/lib/store";
import { rampColor } from "@/lib/viz";

/**
 * Communities as small multiples.
 *
 * This brain has 17 detected clusters. Categorical colour tops out at three
 * separable slots on this canvas, so identity is carried by FACETING — one titled
 * panel per community — exactly the fallback the method prescribes past three
 * series. Within a facet, colour is free to encode magnitude again.
 */
export default function ClusterView() {
  const graph = useBrain((s) => s.graph);
  const nodes = useVisibleNodes();
  const select = useBrain((s) => s.select);
  const selectedId = useBrain((s) => s.selectedId);
  const setCommunity = useBrain((s) => s.setCommunity);
  const activeCommunity = useBrain((s) => s.activeCommunity);

  if (!graph) return null;
  const visible = new Set(nodes.map((n) => n.id));
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const clusters = graph.communities
    .map((c) => ({ ...c, members: c.members.filter((m) => visible.has(m)) }))
    .filter((c) => c.members.length > 0);

  return (
    <div className="h-full overflow-y-auto p-5">
      <header className="mb-4 flex items-baseline gap-3">
        <h2 className="text-sm font-medium">Clusters</h2>
        <span className="text-[11px] text-[var(--ink-muted)]">
          {clusters.length} communities found by modularity — grouped by what they
          actually link to, not by tag
        </span>
        {activeCommunity != null && (
          <button
            onClick={() => setCommunity(null)}
            className="ml-auto rounded border border-[var(--hairline)] px-2 py-1 text-[11px] text-[var(--ink-secondary)]"
          >
            Clear filter
          </button>
        )}
      </header>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(258px,1fr))]">
        {clusters.map((c) => (
          <section
            key={c.id}
            className={`glass rounded-lg p-3 transition-colors ${
              activeCommunity === c.id ? "ring-1 ring-[var(--accent)]" : ""
            }`}
          >
            <header className="mb-2 flex items-baseline gap-2">
              <h3 className="truncate font-mono text-[11px] text-[var(--ink-secondary)]">{c.label}</h3>
              <span className="tabular ml-auto shrink-0 text-[10px] text-[var(--ink-muted)]">
                {c.members.length}
              </span>
            </header>

            {c.anchor && (
              <p className="mb-2 line-clamp-2 text-[10px] leading-relaxed text-[var(--ink-muted)]">
                <span className="text-[var(--ink-secondary)]">anchor:</span> {c.anchor.hook}
              </p>
            )}

            <ul className="max-h-44 space-y-0.5 overflow-y-auto">
              {c.members
                .map((id) => byId.get(id)!)
                .filter(Boolean)
                .sort((a, b) => b.importance - a.importance)
                .map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => select(n.id)}
                      className={`flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-[var(--surface-2)] ${
                        selectedId === n.id ? "bg-[var(--surface-2)]" : ""
                      }`}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: rampColor(n.importance) }}
                        aria-hidden
                      />
                      <span className="shrink-0 font-mono text-[9px] text-[var(--ink-muted)]">{n.id}</span>
                      <span className="truncate text-[10px] text-[var(--ink-muted)]">{n.hook}</span>
                    </button>
                  </li>
                ))}
            </ul>

            <button
              onClick={() => setCommunity(activeCommunity === c.id ? null : c.id)}
              className="mt-2 w-full rounded border border-[var(--hairline)] px-2 py-1 text-[10px] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--ink-secondary)]"
            >
              {activeCommunity === c.id ? "Showing only this" : "Isolate on map"}
            </button>
          </section>
        ))}
      </div>
    </div>
  );
}
