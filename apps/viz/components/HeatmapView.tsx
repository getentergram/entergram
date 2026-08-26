"use client";

import { useMemo, useState } from "react";
import { useBrain, useVisibleNodes } from "@/lib/store";
import { rampColor } from "@/lib/viz";
import type { CellNode } from "@/lib/types";

type Mode = "heat" | "recency" | "importance" | "betweenness";

const MODES: { id: Mode; label: string; blurb: string; get: (n: CellNode) => number }[] = [
  { id: "heat", label: "Most recalled", blurb: "How often the agent actually pulled this cell", get: (n) => n.heat },
  { id: "recency", label: "Freshest", blurb: "Recently touched cells burn bright; forgotten ones fade", get: (n) => n.recency },
  { id: "importance", label: "Most central", blurb: "PageRank over the citation graph", get: (n) => n.importance },
  { id: "betweenness", label: "Bridges", blurb: "Cells whose removal would fragment recall", get: (n) => Math.min(1, n.betweenness * 6) },
];

/**
 * A sequential heatmap — one hue, light→dark, magnitude only. Each cell is a
 * treemap-ish tile sized uniformly so colour alone carries the value, with the
 * number printed on every tile so the encoding is never colour-only.
 */
export default function HeatmapView() {
  const nodes = useVisibleNodes();
  const select = useBrain((s) => s.select);
  const graph = useBrain((s) => s.graph);
  const [mode, setMode] = useState<Mode>("importance");
  const [hover, setHover] = useState<CellNode | null>(null);

  const spec = MODES.find((m) => m.id === mode)!;
  const sorted = useMemo(
    () => [...nodes].sort((a, b) => spec.get(b) - spec.get(a)),
    [nodes, spec],
  );

  const noActivity = mode === "heat" && (graph?.stats.activations ?? 0) === 0;

  return (
    <div className="flex h-full flex-col overflow-hidden p-5">
      <header className="mb-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-medium">Heat</h2>
          <div className="flex gap-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`rounded px-2 py-1 text-[11px] transition-colors ${
                  mode === m.id
                    ? "bg-[var(--surface-2)] text-[var(--ink-primary)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink-secondary)]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-[11px] text-[var(--ink-muted)]">{spec.blurb}</p>
      </header>

      {noActivity && (
        <div className="mb-3 rounded-md border border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-2 text-[11px] text-[var(--status-warning)]">
          ⚠ No recall activity recorded yet. This store has never answered a query, so
          every cell reads zero — try “Most central” instead.
        </div>
      )}

      {/* Legend: the ramp, with its endpoints named. */}
      <div className="mb-3 flex items-center gap-2 text-[10px] text-[var(--ink-muted)]">
        <span>low</span>
        <div className="flex h-2 w-40 overflow-hidden rounded-full">
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
            <div key={t} className="flex-1" style={{ background: rampColor(t) }} />
          ))}
        </div>
        <span>high</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" onMouseLeave={() => setHover(null)}>
        <div className="flex flex-wrap gap-1">
          {sorted.map((n) => {
            const v = spec.get(n);
            return (
              <button
                key={n.id}
                onMouseEnter={() => setHover(n)}
                onClick={() => select(n.id)}
                title={`${n.id} — ${n.hook}`}
                className="flex h-11 w-[74px] shrink-0 flex-col items-start justify-center rounded-[4px] px-1.5 transition-transform hover:scale-105"
                style={{
                  background: rampColor(v),
                  // 2px surface ring so adjacent tiles never blend into one mass
                  boxShadow: "0 0 0 2px var(--surface-0)",
                }}
              >
                <span className="font-mono text-[9px] font-medium" style={{ color: v > 0.55 ? "#0b0b0b" : "#ffffff" }}>
                  {n.id}
                </span>
                <span className="tabular text-[9px]" style={{ color: v > 0.55 ? "#0b0b0b" : "#c3c2b7" }}>
                  {mode === "heat" ? `${n.activations}×` : `${(v * 100).toFixed(0)}%`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2 h-8 shrink-0 text-[11px] text-[var(--ink-secondary)]">
        {hover ? (
          <span><span className="font-mono text-[var(--ink-muted)]">{hover.id}</span> {hover.hook}</span>
        ) : (
          <span className="text-[var(--ink-muted)]">Hover a tile for its hook.</span>
        )}
      </div>
    </div>
  );
}
