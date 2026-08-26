"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  ReactFlow, Background, Controls, MarkerType,
  type Edge, type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useBrain } from "@/lib/store";
import { rampColor } from "@/lib/viz";
import type { CellNode, JourneyStep } from "@/lib/types";

// Curated reasoning paths demonstrating causal reasoning & architectural evolution
const PRESET_JOURNEYS = [
  {
    label: "Substrate → RLM/MARL",
    icon: "🧠",
    from: "B-059",
    to: "B-216",
    description: "From neurodynamic principles to live cellular MARL runtime",
  },
  {
    label: "Amnesia Tax → Nitrosamines",
    icon: "💊",
    from: "B-218",
    to: "B-219",
    description: "From pharma business case to active API toxicity gotcha gates",
  },
  {
    label: "Mobius Oath → CARMA",
    icon: "⚙️",
    from: "B-105",
    to: "B-106",
    description: "From core engineering creed to concrete schema-shaped JS bricks",
  },
  {
    label: "Billing Trap → Cloud Run",
    icon: "☁️",
    from: "B-207",
    to: "B-208",
    description: "From GCP billing closure blast-radius to deploy gotchas",
  },
  {
    label: "User Profile → Handoff",
    icon: "👤",
    from: "B-001",
    to: "B-070",
    description: "From user profile and mental models to live active session context",
  },
];

function findMatchingId(nodes: CellNode[], target: string): string | null {
  if (nodes.some((n) => n.id === target)) return target;
  const numMatch = target.match(/^B-(\d+)$/);
  if (!numMatch) return null;
  const num = parseInt(numMatch[1], 10);
  const found = nodes.find((n) => {
    const m = n.id.match(/^B-(\d+)$/);
    return m ? parseInt(m[1], 10) === num : false;
  });
  return found ? found.id : null;
}

const EDGE_COLORS: Record<string, string> = {
  supersedes: "#ec835a",
  caused_by: "#fab219",
  constrained_by: "#d03b3b",
  cites: "#6da7ec",
  related: "#9ec5f4",
  considered: "#c3c2b7",
  rejected: "#7c6cff",
};

export default function JourneyView() {
  const graph = useBrain((s) => s.graph);
  const journeyFrom = useBrain((s) => s.journeyFrom);
  const journeyTo = useBrain((s) => s.journeyTo);
  const journeyPath = useBrain((s) => s.journeyPath);
  const journeyData = useBrain((s) => s.journeyData);
  const journeyError = useBrain((s) => s.journeyError);
  const setJourney = useBrain((s) => s.setJourney);
  const select = useBrain((s) => s.select);
  const [orderMode, setOrderMode] = useState<"causal" | "chronological">("causal");

  const byId = useMemo(
    () => new Map((graph?.nodes || []).map((n) => [n.id, n])),
    [graph],
  );

  // Default the endpoints to a prominent curated journey or top central nodes
  useEffect(() => {
    if (!graph || journeyFrom || journeyTo) return;
    for (const p of PRESET_JOURNEYS) {
      const fromId = findMatchingId(graph.nodes, p.from);
      const toId = findMatchingId(graph.nodes, p.to);
      if (fromId && toId) {
        setJourney(fromId, toId);
        return;
      }
    }
    const top = [...graph.nodes].sort((a, b) => b.pagerank - a.pagerank);
    if (top.length >= 2) setJourney(top[0].id, top[Math.min(4, top.length - 1)].id);
  }, [graph, journeyFrom, journeyTo, setJourney]);

  const activeSteps = useMemo<JourneyStep[]>(() => {
    if (!journeyData?.steps?.length) {
      if (!journeyPath?.length) return [];
      return journeyPath.map((id, idx) => {
        const node = byId.get(id);
        return {
          index: idx + 1,
          id,
          hook: node?.hook || "",
          type: node?.type || "reference",
          scope: node?.scope || "global",
          date: node?.created?.slice(0, 10) || "2026-06-01",
          timestamp: node?.created ? new Date(node.created).getTime() : 0,
          importance: node?.importance ?? 0.5,
          heat: node?.heat ?? 0,
          recency: node?.recency ?? 1,
          edge: idx > 0 ? { type: "cites", direction: "forward" as const } : null,
          node: node as CellNode,
        };
      });
    }
    return orderMode === "chronological" && journeyData.chronologicalSteps
      ? journeyData.chronologicalSteps
      : journeyData.steps;
  }, [journeyData, journeyPath, byId, orderMode]);

  const { nodes, edges } = useMemo(() => {
    if (!activeSteps.length) return { nodes: [] as Node[], edges: [] as Edge[] };

    const ns: Node[] = activeSteps.map((step: JourneyStep, i: number) => {
      const cell = byId.get(step.id);
      const isStart = i === 0;
      const isEnd = i === activeSteps.length - 1;
      const edgeType = step.edge?.type || "cites";
      const edgeColor = EDGE_COLORS[edgeType] || "#6da7ec";

      return {
        id: step.id,
        position: { x: i * 270, y: (i % 2) * 80 + 30 },
        data: {
          label: (
            <div className="max-w-[220px] text-left">
              <div className="flex items-center justify-between gap-1 border-b border-[var(--hairline)] pb-1">
                <span className="font-mono text-[9px] font-semibold text-[var(--accent)]">
                  {step.id}
                </span>
                <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.2 font-mono text-[8px] text-[var(--ink-muted)]">
                  {step.date}
                </span>
              </div>

              <div className="mt-1 flex items-center gap-1">
                <span
                  className="rounded px-1 py-0.2 text-[8px] font-medium uppercase tracking-wider"
                  style={{
                    backgroundColor: `${rampColor(step.importance)}22`,
                    color: rampColor(step.importance),
                  }}
                >
                  {step.type}
                </span>
                {isStart && (
                  <span className="rounded bg-emerald-900/60 px-1 text-[8px] font-medium text-emerald-300">
                    START (A)
                  </span>
                )}
                {isEnd && (
                  <span className="rounded bg-blue-900/60 px-1 text-[8px] font-medium text-blue-300">
                    GOAL (B)
                  </span>
                )}
              </div>

              <div className="mt-1.5 line-clamp-3 text-[11px] font-normal leading-snug text-[var(--ink-primary)]">
                {step.hook || cell?.hook || ""}
              </div>

              {step.edge && i > 0 && (
                <div className="mt-1.5 flex items-center gap-1 text-[9px] text-[var(--ink-muted)]">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: edgeColor }}
                  />
                  <span>via {step.edge.type.replace("_", " ")}</span>
                </div>
              )}
            </div>
          ),
        },
        style: {
          background: "var(--surface-1)",
          border: `2px solid ${isStart ? "#10b981" : isEnd ? "#3b82f6" : rampColor(cell?.importance ?? 0)}`,
          borderRadius: 12,
          padding: 10,
          width: 240,
          boxShadow: isStart || isEnd ? "0 0 16px rgba(59, 130, 246, 0.25)" : "none",
        },
      };
    });

    const es: Edge[] = [];
    for (let i = 0; i < activeSteps.length - 1; i++) {
      const fromId = activeSteps[i].id;
      const toId = activeSteps[i + 1].id;
      const stepTarget = activeSteps[i + 1];
      const edgeType = stepTarget.edge?.type || "cites";
      const edgeColor = EDGE_COLORS[edgeType] || "#6da7ec";

      es.push({
        id: `${fromId}->${toId}`,
        source: fromId,
        target: toId,
        animated: true,
        label: edgeType !== "cites" ? edgeType.replace("_", " ") : undefined,
        labelStyle: { fill: edgeColor, fontSize: 10, fontFamily: "monospace" },
        labelBgStyle: { fill: "#13131a", fillOpacity: 0.9 },
        style: { stroke: edgeColor, strokeWidth: 2.2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
      });
    }

    return { nodes: ns, edges: es };
  }, [activeSteps, byId]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => select(node.id),
    [select],
  );

  const swapDirection = () => {
    if (journeyFrom && journeyTo) {
      setJourney(journeyTo, journeyFrom);
    }
  };

  const pickRandomJourney = () => {
    if (!graph || graph.edges.length === 0) return;
    const randomEdge = graph.edges[Math.floor(Math.random() * graph.edges.length)];
    if (randomEdge) {
      setJourney(randomEdge.from, randomEdge.to);
    }
  };

  if (!graph) return null;

  const timeSpan = journeyData?.timeSpan || {
    start: activeSteps[0]?.date || null,
    end: activeSteps[activeSteps.length - 1]?.date || null,
    days: 0,
  };

  return (
    <div className="flex h-full flex-col bg-[var(--surface-0)]">
      {/* Header with Searchable Pickers and Swap Button */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] px-5 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-[var(--ink-primary)]">Reasoning Journey</h2>
            <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--accent)]">
              A → B Connectome Flow
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--ink-muted)]">
            Trace causal antecedents, decision provenance, and chronological evolution
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SearchableCellPicker
            value={journeyFrom}
            onChange={(v) => setJourney(v, journeyTo)}
            label="Origin (A)"
            nodes={graph.nodes}
          />

          <button
            onClick={swapDirection}
            title="Swap Origin and Destination"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] text-[12px] text-[var(--ink-secondary)] transition-colors hover:bg-[var(--surface-3)] hover:text-white"
          >
            ⇄
          </button>

          <SearchableCellPicker
            value={journeyTo}
            onChange={(v) => setJourney(journeyFrom, v)}
            label="Goal (B)"
            nodes={graph.nodes}
          />
        </div>
      </header>

      {/* Preset Curated Journeys Bar */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--hairline)] bg-[var(--surface-1)]/50 px-5 py-2">
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-muted)]">
          Discover:
        </span>
        {PRESET_JOURNEYS.map((p) => {
          const fromId = findMatchingId(graph.nodes, p.from);
          const toId = findMatchingId(graph.nodes, p.to);
          if (!fromId || !toId) return null;
          const isActive = journeyFrom === fromId && journeyTo === toId;
          return (
            <button
              key={p.label}
              onClick={() => setJourney(fromId, toId)}
              title={`${p.description} (${fromId} → ${toId})`}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] transition-colors ${
                isActive
                  ? "bg-[var(--accent)] text-white font-medium shadow-sm"
                  : "bg-[var(--surface-2)] text-[var(--ink-secondary)] hover:bg-[var(--surface-3)] hover:text-white"
              }`}
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
            </button>
          );
        })}

        <button
          onClick={pickRandomJourney}
          title="Pick a random connected journey in the brain"
          className="ml-auto flex shrink-0 items-center gap-1 rounded bg-[var(--surface-2)] px-2 py-1 text-[10px] text-[var(--ink-muted)] hover:bg-[var(--surface-3)] hover:text-white transition-colors"
        >
          <span>🎲 Discover Random</span>
        </button>
      </div>

      {/* Chronology & Metrics Progression Rail */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--hairline)] bg-[var(--surface-1)] px-5 py-2 text-[11px]">
        <div className="flex items-center gap-4">
          {activeSteps.length > 0 ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-[var(--ink-primary)]">{activeSteps.length} Steps</span>
                <span className="text-[var(--ink-muted)]">({activeSteps.length - 1} hops)</span>
              </div>

              {timeSpan.start && timeSpan.end && (
                <div className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--ink-muted)]">
                  <span>📅 {timeSpan.start}</span>
                  <span>→</span>
                  <span>{timeSpan.end}</span>
                  {timeSpan.days > 0 && (
                    <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.2 text-[9px] text-[var(--accent)]">
                      {timeSpan.days} days
                    </span>
                  )}
                </div>
              )}

              {journeyData?.isChronological != null && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                    journeyData.isChronological
                      ? "bg-emerald-950/80 text-emerald-300 border border-emerald-800/60"
                      : "bg-amber-950/80 text-amber-300 border border-amber-800/60"
                  }`}
                >
                  {journeyData.isChronological ? "✓ Chronological Order" : "↻ Multi-era Causal Hop"}
                </span>
              )}
            </>
          ) : (
            <span className="text-[var(--ink-muted)]">No active path</span>
          )}
        </div>

        {/* View Order Toggle */}
        <div className="flex items-center gap-1">
          <span className="font-mono text-[9px] text-[var(--ink-muted)] uppercase">Order:</span>
          <button
            onClick={() => setOrderMode("causal")}
            className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
              orderMode === "causal"
                ? "bg-[var(--surface-3)] text-white font-medium"
                : "text-[var(--ink-muted)] hover:text-white"
            }`}
          >
            Network Hops
          </button>
          <button
            onClick={() => setOrderMode("chronological")}
            className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
              orderMode === "chronological"
                ? "bg-[var(--surface-3)] text-white font-medium"
                : "text-[var(--ink-muted)] hover:text-white"
            }`}
          >
            Chronological
          </button>
        </div>
      </div>

      {journeyError && (
        <div className="border-b border-[var(--hairline)] bg-amber-950/40 px-5 py-2.5 text-[11px] text-[var(--status-warning)]">
          ⚠ No path connects these two cells — they sit in disconnected regions of the brain.
        </div>
      )}

      {/* Main Graph Canvas */}
      <div className="min-h-0 flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          proOptions={{ hideAttribution: false }}
          colorMode="dark"
        >
          <Background color="#1f1f2e" gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {/* Bottom Step-by-Step Chronological Stream */}
      {activeSteps.length > 0 && (
        <div className="shrink-0 border-t border-[var(--hairline)] bg-[var(--surface-1)] px-5 py-2.5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {activeSteps.map((step, idx) => (
              <div key={step.id} className="flex items-center shrink-0">
                <button
                  onClick={() => select(step.id)}
                  className="flex flex-col items-start rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] p-2 text-left transition-all hover:border-[var(--accent)] hover:bg-[var(--surface-3)] max-w-[200px]"
                >
                  <div className="flex w-full items-center justify-between gap-1">
                    <span className="font-mono text-[9px] font-semibold text-[var(--accent)]">
                      #{idx + 1} {step.id}
                    </span>
                    <span className="font-mono text-[8px] text-[var(--ink-muted)]">
                      {step.date}
                    </span>
                  </div>
                  <div className="mt-1 line-clamp-2 text-[10px] leading-tight text-[var(--ink-secondary)]">
                    {step.hook}
                  </div>
                </button>

                {idx < activeSteps.length - 1 && (
                  <div className="mx-2 flex flex-col items-center text-[10px] text-[var(--ink-muted)]">
                    <span>→</span>
                    {activeSteps[idx + 1].edge?.type && (
                      <span className="text-[7px] font-mono text-[var(--ink-muted)]">
                        {activeSteps[idx + 1].edge?.type}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Searchable Autocomplete Combobox for picking cells by ID, hook, or tag.
 */
function SearchableCellPicker({
  value,
  onChange,
  label,
  nodes,
}: {
  value: string | null;
  onChange: (v: string) => void;
  label: string;
  nodes: CellNode[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === value), [nodes, value]);

  const filtered = useMemo(() => {
    if (!search.trim()) {
      return [...nodes].sort((a, b) => b.pagerank - a.pagerank).slice(0, 30);
    }
    const q = search.toLowerCase();
    return nodes
      .filter(
        (n) =>
          n.id.toLowerCase().includes(q) ||
          n.hook.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .slice(0, 30);
  }, [nodes, search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as HTMLElement)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={popoverRef}>
      <div className="flex items-center gap-1 text-[11px] text-[var(--ink-muted)]">
        <span className="font-mono text-[10px] uppercase">{label}:</span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex h-7 min-w-[160px] max-w-[210px] items-center justify-between rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 text-[11px] text-[var(--ink-primary)] outline-none hover:border-[var(--accent)]"
        >
          <span className="truncate">
            {selectedNode ? `${selectedNode.id} — ${selectedNode.hook}` : "Pick cell…"}
          </span>
          <span className="ml-1 text-[8px] text-[var(--ink-muted)]">▼</span>
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] p-2 shadow-2xl backdrop-blur-xl">
          <input
            type="text"
            placeholder="Search by ID, keyword, tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="w-full rounded border border-[var(--hairline)] bg-[var(--surface-2)] px-2 py-1 text-[11px] text-[var(--ink-primary)] outline-none focus:border-[var(--accent)]"
          />

          <div className="mt-1.5 max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="py-3 text-center text-[10px] text-[var(--ink-muted)]">
                No matching cells found
              </div>
            ) : (
              filtered.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    onChange(n.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-[11px] transition-colors ${
                    n.id === value
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--ink-secondary)] hover:bg-[var(--surface-2)] hover:text-white"
                  }`}
                >
                  <div className="flex w-full items-center justify-between font-mono text-[9px]">
                    <span className="font-semibold">{n.id}</span>
                    <span className="text-[8px] opacity-75">{n.created?.slice(0, 10)}</span>
                  </div>
                  <div className="line-clamp-1 text-[10px] font-normal">{n.hook}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
