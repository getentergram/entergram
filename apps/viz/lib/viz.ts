import type { CellEdge, CellNode, Graph } from "./types";

/** Sequential blue ramp, low -> high magnitude on a dark surface. Validated monotone. */
export const SEQ = ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"];

/** The only three categorical slots that clear the all-pairs floors on this surface. */
export const SERIES = ["#3987e5", "#d95926", "#199e70"];

export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

/** Map a 0..1 magnitude onto the sequential ramp. */
export function rampColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  return SEQ[Math.min(SEQ.length - 1, Math.floor(clamped * SEQ.length))];
}

export type EmphasisKey = "importance" | "heat" | "recency" | "betweenness" | "degree" | "confidence";

/** Read the metric a persona emphasises, normalized to 0..1 for the ramp. */
export function emphasisValue(n: CellNode, key: EmphasisKey, maxDegree: number): number {
  switch (key) {
    case "heat": return n.heat;
    case "recency": return n.recency;
    case "betweenness": return Math.min(1, n.betweenness * 6); // betweenness is tiny; expand to use the ramp
    case "degree": return maxDegree ? n.degree / maxDegree : 0;
    case "confidence": return n.confidence;
    default: return n.importance;
  }
}

/*
 * Edge semantics are encoded by LINE STYLE, not hue.
 *
 * There are seven edge types, and edges of any two types can sit adjacent on the
 * canvas — an all-pairs case where only three colors would be separable. Dash
 * pattern is the classic secondary encoding for edge meaning and sidesteps the
 * problem entirely, leaving color free to signal interaction state (selected,
 * on-path, suggested).
 */
export const EDGE_STYLE: Record<string, { dash: number[]; width: number; label: string }> = {
  supersedes:     { dash: [],        width: 2.4, label: "supersedes" },
  caused_by:      { dash: [7, 3],    width: 2.0, label: "caused by" },
  constrained_by: { dash: [2, 3],    width: 1.8, label: "constrained by" },
  related:        { dash: [],        width: 1.2, label: "related" },
  cites:          { dash: [],        width: 1.0, label: "cites" },
  considered:     { dash: [4, 4],    width: 1.2, label: "considered" },
  rejected:       { dash: [1, 4],    width: 1.2, label: "rejected" },
};

export function edgeStyle(type: string) {
  return EDGE_STYLE[type] || EDGE_STYLE.cites;
}

export interface BuildOptions {
  emphasis: EmphasisKey;
  showSuggestions: boolean;
  fadeStale: boolean;
}

/** Translate the graph payload into Cytoscape elements. */
export function toElements(graph: Graph, nodes: CellNode[], opts: BuildOptions) {
  const visible = new Set(nodes.map((n) => n.id));
  const maxDegree = Math.max(1, ...nodes.map((n) => n.degree));

  const nodeEls = nodes.map((n) => {
    const mag = emphasisValue(n, opts.emphasis, maxDegree);
    return {
      group: "nodes" as const,
      data: {
        id: n.id,
        label: n.id,
        hook: n.hook,
        community: n.community,
        // 14px floor keeps the smallest cell clickable; area, not diameter, tracks
        // magnitude so a 4x more important cell doesn't read as 16x.
        size: 14 + Math.sqrt(mag) * 34,
        color: rampColor(mag),
        // Recency decay: cells untouched for months fade toward the surface. Never
        // below 0.35 — invisible is not the same as stale.
        opacity: opts.fadeStale ? 0.35 + 0.65 * n.recency : 1,
        // Bridges get a ring. High-betweenness cells are the ones whose removal
        // fragments recall, which raw size does not reveal.
        ring: n.betweenness > 0.05 ? 1 : 0,
        orphan: n.degree === 0 ? 1 : 0,
      },
    };
  });

  const edgeEls = graph.edges
    .filter((e: CellEdge) => visible.has(e.from) && visible.has(e.to))
    .map((e) => {
      const st = edgeStyle(e.type);
      return {
        group: "edges" as const,
        data: {
          id: `${e.from}->${e.to}:${e.type}`,
          source: e.from,
          target: e.to,
          type: e.type,
          width: st.width,
          dash: st.dash,
          suggested: 0,
        },
      };
    });

  const suggestionEls = opts.showSuggestions
    ? graph.suggestions
        .filter((s) => visible.has(s.from) && visible.has(s.to))
        .map((s) => ({
          group: "edges" as const,
          data: {
            id: `sug:${s.from}~${s.to}`,
            source: s.from,
            target: s.to,
            type: "suggested",
            width: 1 + s.score * 2,
            dash: [3, 5],
            suggested: 1,
          },
        }))
    : [];

  return [...nodeEls, ...edgeEls, ...suggestionEls];
}

/** Cytoscape stylesheet. Kept in one place so visual rules aren't scattered. */
export const stylesheet = [
  {
    selector: "node",
    style: {
      width: "data(size)",
      height: "data(size)",
      "background-color": "data(color)",
      "background-opacity": "data(opacity)",
      "border-width": 0,
      label: "data(label)",
      "font-size": 9,
      "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
      color: "#898781",
      "text-valign": "bottom",
      "text-margin-y": 3,
      "text-opacity": 0, // labels appear on zoom-in / hover, not at rest
      "transition-property": "background-opacity, border-width, text-opacity",
      "transition-duration": "140ms",
    },
  },
  {
    // Bridge ring — a 2px surface-colored gap keeps it from muddying the fill.
    selector: "node[ring = 1]",
    style: { "border-width": 2, "border-color": "#c3c2b7", "border-opacity": 0.55 },
  },
  {
    // Orphans carry a status color AND a dashed ring — never color alone.
    selector: "node[orphan = 1]",
    style: { "border-width": 2, "border-color": STATUS.warning, "border-style": "dashed", "border-opacity": 0.8 },
  },
  {
    selector: "edge",
    style: {
      width: "data(width)",
      "line-color": "#2c2c2a",
      "line-dash-pattern": "data(dash)",
      "curve-style": "straight",
      opacity: 0.55,
      "transition-property": "line-color, opacity, width",
      "transition-duration": "140ms",
    },
  },
  { selector: "edge[type = 'related']", style: { "line-color": "#33334a" } },
  {
    selector: "edge[suggested = 1]",
    style: { "line-color": "#7c6cff", opacity: 0.5, "line-style": "dashed" },
  },
  // --- interaction states -------------------------------------------------
  {
    selector: ".dim",
    style: { "background-opacity": 0.1, "line-color": "#1c1c26", opacity: 0.12, "text-opacity": 0 },
  },
  {
    selector: ".focus",
    style: {
      "border-width": 3,
      "border-color": "#ffffff",
      "border-opacity": 1,
      "text-opacity": 1,
      "font-size": 11,
      color: "#ffffff",
      "z-index": 99,
    },
  },
  {
    selector: ".neighbor",
    style: { "text-opacity": 1, "border-width": 2, "border-color": "#6da7ec", "border-opacity": 0.9 },
  },
  {
    selector: "edge.pathEdge",
    style: { "line-color": "#cde2fb", opacity: 1, width: 3, "z-index": 98 },
  },
  {
    selector: "node.pathNode",
    style: { "border-width": 3, "border-color": "#cde2fb", "border-opacity": 1, "text-opacity": 1, "z-index": 99 },
  },
  { selector: ".labelled", style: { "text-opacity": 1 } },
];

/** fcose settings: cluster-aware, deterministic enough to be re-runnable. */
export const layoutOptions = {
  name: "fcose",
  quality: "proof",
  animate: true,
  animationDuration: 600,
  randomize: false,
  nodeSeparation: 90,
  idealEdgeLength: 95,
  nodeRepulsion: 7000,
  gravity: 0.28,
  gravityRange: 3.2,
  packComponents: true, // keeps the 7 orphans from being flung off-canvas
  padding: 40,
};
