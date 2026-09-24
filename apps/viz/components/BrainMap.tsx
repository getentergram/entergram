"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Core, EventObject } from "cytoscape";
import { useBrain, useVisibleNodes } from "@/lib/store";
import { getLayoutOptions, stylesheet, toElements, type EmphasisKey } from "@/lib/viz";

/**
 * The primary canvas.
 *
 * Cytoscape is loaded lazily on the client — it touches `window` at import time and
 * would break the static export otherwise. The instance is created once and then
 * *patched* on data changes rather than rebuilt, so a live cell edit doesn't
 * re-run the layout and throw away the reader's mental map of the graph.
 */
export default function BrainMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const layoutSigRef = useRef<string | null>(null); // node-set signature of the last layout run
  const [spread, setSpread] = useState<number>(1.35);
  const [cyReady, setCyReady] = useState<number>(0);

  const graph = useBrain((s) => s.graph);
  const nodes = useVisibleNodes();
  const persona = useBrain((s) => s.persona);
  const selectedId = useBrain((s) => s.selectedId);
  const journeyPath = useBrain((s) => s.journeyPath);
  const select = useBrain((s) => s.select);
  const meta = useBrain((s) => s.meta);

  const emphasis = (meta?.personas.find((p) => p.id === persona)?.emphasis ||
    "importance") as EmphasisKey;

  const triggerLayout = useCallback((spreadFactor: number = spread) => {
    const cy = cyRef.current;
    if (!cy || !nodes.length) return;
    const opts = getLayoutOptions(spreadFactor, nodes.length);
    const layout = cy.layout(opts as never);
    layout.one("layoutstop", () => cy.fit(undefined, 50));
    layout.run();
  }, [spread, nodes.length]);

  // --- create once ---------------------------------------------------------
  useEffect(() => {
    let disposed = false;
    (async () => {
      const [{ default: cytoscape }, { default: fcose }] = await Promise.all([
        import("cytoscape"),
        import("cytoscape-fcose"),
      ]);
      if (disposed || !containerRef.current || cyRef.current) return;

      cytoscape.use(fcose);
      const cy = cytoscape({
        container: containerRef.current,
        style: stylesheet as never,
        elements: [],
        minZoom: 0.05,
        maxZoom: 5,
        wheelSensitivity: 0.22,
        pixelRatio: 1,
      });
      cyRef.current = cy;
      (window as any).cy = cy;
      (window as any).cyReady = true;
      setCyReady((c) => c + 1);

      cy.on("tap", "node", (e: EventObject) => select(e.target.id()));
      cy.on("tap", (e: EventObject) => { if (e.target === cy) select(null); });

      cy.on("zoom", () => {
        const on = cy.zoom() > 0.95;
        cy.batch(() => { on ? cy.nodes().addClass("labelled") : cy.nodes().removeClass("labelled"); });
      });

      cy.on("mouseover", "node", (e: EventObject) => e.target.addClass("labelled"));
      cy.on("mouseout", "node", (e: EventObject) => {
        if (cy.zoom() <= 0.95) e.target.removeClass("labelled");
      });
    })();

    return () => {
      disposed = true;
      cyRef.current?.destroy();
      cyRef.current = null;
      layoutSigRef.current = null;
    };
  }, [select]);

  // --- data / emphasis changes --------------------------------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !graph) return;

    const els = toElements(graph, nodes, {
      emphasis,
      showSuggestions: true,
      fadeStale: true,
    });

    cy.batch(() => {
      cy.elements().remove();
      cy.add(els as never);
    });

    const signature = `${nodes.map((n) => n.id).join(",")}_s${spread}`;
    if (signature !== layoutSigRef.current) {
      layoutSigRef.current = signature;
      const layout = cy.layout(getLayoutOptions(spread, nodes.length) as never);
      layout.one("layoutstop", () => cy.fit(undefined, 50));
      layout.run();
    }
  }, [graph, nodes, emphasis, spread, cyReady]);

  // --- selection highlighting ---------------------------------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.batch(() => {
      cy.elements().removeClass("dim focus neighbor");
      if (!selectedId) return;
      const node = cy.getElementById(selectedId);
      if (!node || node.empty()) return;
      const neighborhood = node.closedNeighborhood();
      cy.elements().not(neighborhood).addClass("dim");
      neighborhood.nodes().not(node).addClass("neighbor");
      node.addClass("focus");
    });
  }, [selectedId, nodes, cyReady]);

  // --- journey path overlay ------------------------------------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().removeClass("pathNode pathEdge");
      if (!journeyPath?.length) return;
      journeyPath.forEach((id, i) => {
        cy.getElementById(id).addClass("pathNode");
        if (i > 0) {
          const a = journeyPath[i - 1];
          cy.edges().filter((e) => {
            const s = e.source().id(), t = e.target().id();
            return (s === a && t === id) || (s === id && t === a);
          }).addClass("pathEdge");
        }
      });
    });
  }, [journeyPath, cyReady]);

  return (
    <div className="relative h-full w-full">
      {/* Top Floating Graph Spread & View Controls */}
      <div className="glass absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-lg border border-[var(--hairline)] px-2.5 py-1.5 text-[11px] shadow-lg backdrop-blur-md">
        <span className="font-mono text-[10px] text-[var(--ink-muted)] uppercase tracking-wider mr-1">Spread:</span>
        {[
          { label: "1.0×", val: 1.0 },
          { label: "1.35×", val: 1.35 },
          { label: "1.75×", val: 1.75 },
          { label: "2.2×", val: 2.2 },
        ].map((s) => (
          <button
            key={s.val}
            onClick={() => {
              setSpread(s.val);
              triggerLayout(s.val);
            }}
            className={`rounded px-2 py-0.5 font-mono text-[10px] transition-colors ${
              Math.abs(spread - s.val) < 0.05
                ? "bg-[var(--accent)] text-white font-medium shadow-sm"
                : "bg-[var(--surface-2)] text-[var(--ink-secondary)] hover:text-white hover:bg-[var(--surface-3)]"
            }`}
          >
            {s.label}
          </button>
        ))}

        <div className="mx-1 h-3.5 w-[1px] bg-[var(--hairline)]" />

        <button
          onClick={() => triggerLayout(spread)}
          title="Re-run repulsion force layout to untangle clusters"
          className="flex items-center gap-1 rounded bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--ink-secondary)] hover:text-white hover:bg-[var(--surface-3)] transition-colors"
        >
          <span>⚡ Relax</span>
        </button>

        <button
          onClick={() => cyRef.current?.fit(undefined, 50)}
          title="Fit and center full graph in view"
          className="flex items-center gap-1 rounded bg-[var(--surface-2)] px-2 py-0.5 text-[10px] text-[var(--ink-secondary)] hover:text-white hover:bg-[var(--surface-3)] transition-colors"
        >
          <span>⤢ Center</span>
        </button>
      </div>

      <div ref={containerRef} className="h-full w-full" />
      <MapLegend />
    </div>
  );
}

/**
 * Identity is never carried by color alone, so the legend states what each visual
 * channel means — including the two channels that are deliberately NOT color.
 */
function MapLegend() {
  return (
    <div className="glass pointer-events-none absolute bottom-3 left-3 rounded-lg px-3 py-2 text-[10px] leading-relaxed text-[var(--ink-muted)]">
      <div className="mb-1 font-medium text-[var(--ink-secondary)]">How to read this</div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#184f95" }} />
        <span className="inline-block h-3 w-3 rounded-full" style={{ background: "#6da7ec" }} />
        <span className="inline-block h-4 w-4 rounded-full" style={{ background: "#cde2fb" }} />
        <span>size + colour = magnitude</span>
      </div>
      <div className="mt-1">faded = not touched recently</div>
      <div className="mt-1">
        <span className="mr-1 inline-block h-3 w-3 rounded-full border-2" style={{ borderColor: "#c3c2b7" }} />
        bridge (high betweenness)
      </div>
      <div className="mt-1">
        <span className="mr-1 inline-block h-3 w-3 rounded-full border-2 border-dashed" style={{ borderColor: "#fab219" }} />
        orphan — no links
      </div>
      <div className="mt-1">dash pattern = link type · violet = suggested</div>
    </div>
  );
}
