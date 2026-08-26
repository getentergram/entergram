"use client";

import { useCallback, useEffect, useMemo } from "react";
import {
  ReactFlow, Background, Controls, MarkerType,
  type Edge, type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useBrain } from "@/lib/store";
import { rampColor } from "@/lib/viz";

/**
 * Reasoning paths — problem → concept → decision → implementation.
 *
 * React Flow rather than Cytoscape here on purpose: a journey is a short, ordered,
 * left-to-right chain, which is a flow diagram, not a force-directed cloud. Cytoscape
 * owns the big canvas; this owns the linear one.
 */
export default function JourneyView() {
  const graph = useBrain((s) => s.graph);
  const journeyFrom = useBrain((s) => s.journeyFrom);
  const journeyTo = useBrain((s) => s.journeyTo);
  const journeyPath = useBrain((s) => s.journeyPath);
  const journeyError = useBrain((s) => s.journeyError);
  const setJourney = useBrain((s) => s.setJourney);
  const select = useBrain((s) => s.select);

  const byId = useMemo(
    () => new Map((graph?.nodes || []).map((n) => [n.id, n])),
    [graph],
  );

  // Default the endpoints to the two most central cells, so the view shows something
  // meaningful before the reader has picked anything.
  useEffect(() => {
    if (!graph || journeyFrom || journeyTo) return;
    const top = [...graph.nodes].sort((a, b) => b.pagerank - a.pagerank);
    if (top.length >= 2) setJourney(top[0].id, top[Math.min(4, top.length - 1)].id);
  }, [graph, journeyFrom, journeyTo, setJourney]);

  const { nodes, edges } = useMemo(() => {
    if (!journeyPath?.length) return { nodes: [] as Node[], edges: [] as Edge[] };
    const ns: Node[] = journeyPath.map((id, i) => {
      const cell = byId.get(id);
      return {
        id,
        position: { x: i * 250, y: (i % 2) * 90 }, // slight stagger keeps long labels from colliding
        data: {
          label: (
            <div className="max-w-[190px] text-left">
              <div className="font-mono text-[9px] text-[var(--ink-muted)]">{id}</div>
              <div className="mt-0.5 line-clamp-3 text-[10px] leading-snug text-[var(--ink-primary)]">
                {cell?.hook || ""}
              </div>
            </div>
          ),
        },
        style: {
          background: "var(--surface-1)",
          border: `2px solid ${rampColor(cell?.importance ?? 0)}`,
          borderRadius: 10,
          padding: 8,
          width: 210,
        },
      };
    });

    const es: Edge[] = journeyPath.slice(1).map((id, i) => ({
      id: `${journeyPath[i]}->${id}`,
      source: journeyPath[i],
      target: id,
      animated: true,
      style: { stroke: "var(--seq-4)", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#6da7ec" },
    }));

    return { nodes: ns, edges: es };
  }, [journeyPath, byId]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => select(node.id),
    [select],
  );

  if (!graph) return null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--hairline)] px-5 py-3">
        <h2 className="text-sm font-medium">Journey</h2>
        <span className="text-[11px] text-[var(--ink-muted)]">shortest reasoning path between two cells</span>

        <div className="ml-auto flex items-center gap-2">
          <CellPicker value={journeyFrom} onChange={(v) => setJourney(v, journeyTo)} label="From" graph={graph} />
          <span className="text-[var(--ink-muted)]">→</span>
          <CellPicker value={journeyTo} onChange={(v) => setJourney(journeyFrom, v)} label="To" graph={graph} />
        </div>
      </header>

      {journeyError && (
        <div className="border-b border-[var(--hairline)] px-5 py-2 text-[11px] text-[var(--status-warning)]">
          ⚠ No path connects these two cells — they sit in disconnected parts of the brain.
        </div>
      )}

      {journeyPath && journeyPath.length > 0 && (
        <div className="border-b border-[var(--hairline)] px-5 py-2 text-[11px] text-[var(--ink-muted)]">
          <span className="tabular text-[var(--ink-secondary)]">{journeyPath.length - 1} hops</span>
          {" · "}
          {journeyPath.join(" → ")}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodeClick={onNodeClick}
          fitView
          proOptions={{ hideAttribution: false }}
          colorMode="dark"
        >
          <Background color="#262633" gap={22} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

function CellPicker({
  value, onChange, label, graph,
}: {
  value: string | null;
  onChange: (v: string) => void;
  label: string;
  graph: { nodes: { id: string; hook: string; pagerank: number }[] };
}) {
  const options = useMemo(
    () => [...graph.nodes].sort((a, b) => b.pagerank - a.pagerank),
    [graph],
  );
  return (
    <label className="flex items-center gap-1 text-[11px] text-[var(--ink-muted)]">
      <span>{label}</span>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[190px] rounded border border-[var(--hairline)] bg-[var(--surface-2)] px-1.5 py-1 text-[11px] text-[var(--ink-secondary)] outline-none focus:border-[var(--accent)]"
      >
        <option value="" disabled>pick a cell…</option>
        {options.map((n) => (
          <option key={n.id} value={n.id}>{n.id} — {n.hook.slice(0, 46)}</option>
        ))}
      </select>
    </label>
  );
}
