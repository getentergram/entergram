"use client";

import { useEffect, useRef } from "react";
import type { Core, EventObject } from "cytoscape";
import { useBrain, useVisibleNodes } from "@/lib/store";
import { layoutOptions, stylesheet, toElements, type EmphasisKey } from "@/lib/viz";

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

  const graph = useBrain((s) => s.graph);
  const nodes = useVisibleNodes();
  const persona = useBrain((s) => s.persona);
  const selectedId = useBrain((s) => s.selectedId);
  const journeyPath = useBrain((s) => s.journeyPath);
  const select = useBrain((s) => s.select);
  const meta = useBrain((s) => s.meta);

  const emphasis = (meta?.personas.find((p) => p.id === persona)?.emphasis ||
    "importance") as EmphasisKey;

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
        minZoom: 0.08,
        maxZoom: 4,
        wheelSensitivity: 0.22,
        pixelRatio: 1, // a 208-node canvas doesn't need retina fills; this keeps pans at 60fps
      });
      cyRef.current = cy;

      cy.on("tap", "node", (e: EventObject) => select(e.target.id()));
      cy.on("tap", (e: EventObject) => { if (e.target === cy) select(null); });

      // Labels are noise at low zoom and essential at high zoom.
      cy.on("zoom", () => {
        const on = cy.zoom() > 1.15;
        cy.batch(() => { on ? cy.nodes().addClass("labelled") : cy.nodes().removeClass("labelled"); });
      });

      cy.on("mouseover", "node", (e: EventObject) => e.target.addClass("labelled"));
      cy.on("mouseout", "node", (e: EventObject) => {
        if (cy.zoom() <= 1.15) e.target.removeClass("labelled");
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

    // Only lay out when the node SET changes. Re-running fcose because a colour
    // changed would scramble positions the reader has already learned.
    const signature = nodes.map((n) => n.id).join(",");
    if (signature !== layoutSigRef.current) {
      layoutSigRef.current = signature;
      // Bind on the layout object, not the core: `layoutstop` belongs to the run,
      // and cytoscape's Core exposes `one`, not `once`.
      const layout = cy.layout(layoutOptions as never);
      layout.one("layoutstop", () => cy.fit(undefined, 60));
      layout.run();
    }
  }, [graph, nodes, emphasis]);

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
  }, [selectedId, nodes]);

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
          // The path is undirected, so light whichever direction actually exists.
          const a = journeyPath[i - 1];
          cy.edges().filter((e) => {
            const s = e.source().id(), t = e.target().id();
            return (s === a && t === id) || (s === id && t === a);
          }).addClass("pathEdge");
        }
      });
    });
  }, [journeyPath]);

  return (
    <div className="relative h-full w-full">
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
