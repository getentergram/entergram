// Mirrors the payload from cli/src/graph/build.js. Kept hand-written rather than
// generated: the surface is small, and a drifting type here is a loud compile error
// rather than a silent runtime undefined.

export interface Synapse {
  threshold: number;
  plasticity: number;
  resolutions: number;
  failures: number;
  status: string;
}

export interface CellNode {
  id: string;
  hook: string;
  body: string;
  tags: string[];
  type: string;
  scope: string;
  source: string;
  status: string;
  file: string;
  effector: string;
  confidence: number;

  // graph intelligence
  pagerank: number;
  importance: number;   // 0..1, normalized PageRank — drives node size
  degree: number;
  inDegree: number;
  outDegree: number;
  betweenness: number;  // bridge-ness
  community: number;

  // connectome
  activations: number;
  heat: number;         // 0..1 — drives the heatmap
  lastActivated: string | null;
  recentQueries: string[];
  synapse: Synapse | null;

  // temporal
  created: string | null;
  updated: string | null;
  revisions: number;
  authors: string[];
  ageDays: number | null;
  recency: number;      // 1 = fresh, 90-day half-life
}

export type EdgeType =
  | "cites" | "related" | "supersedes" | "caused_by"
  | "constrained_by" | "considered" | "rejected";

export interface CellEdge {
  from: string;
  to: string;
  type: EdgeType;
  weight: number;
  confidence: number;
  created?: string;
}

export interface Suggestion {
  from: string;
  to: string;
  score: number;
  semantic: number;
  structural: number;
}

export interface Community {
  id: number;
  size: number;
  label: string;
  tags: { tag: string; count: number }[];
  anchor: { id: string; hook: string } | null;
  members: string[];
}

export interface GraphStats {
  cells: number;
  edges: number;
  communities: number;
  orphans: number;
  activations: number;
  span: { first: string; last: string } | null;
}

export interface Graph {
  generated: string;
  root: string;
  historySource: "git" | "filesystem" | "none";
  persona?: string;
  nodes: CellNode[];
  edges: CellEdge[];
  suggestions: Suggestion[];
  orphans: string[];
  communities: Community[];
  stats: GraphStats;
}

export interface Persona {
  id: string;
  label: string;
  description: string;
  emphasis: string;
  defaultView?: ViewId;
}

export interface TimelineEvent {
  id: string;
  sha: string | null;
  date: string;
  author: string | null;
  subject: string;
  kind: "created" | "modified" | "deleted" | "renamed";
}

export interface SearchHit {
  id: string;
  hook: string;
  tags: string[];
  type: string;
  confidence: number;
}

export interface PluginManifest {
  name: string;
  title: string;
  description: string;
  panels: { id: string; title: string; slot: string }[];
}

export interface Meta {
  root: string;
  generation: number;
  historySource: string;
  stats: GraphStats;
  personas: Persona[];
  plugins: PluginManifest[];
  config: { name: string | null };
}

export interface JourneyStep {
  index: number;
  id: string;
  hook: string;
  type: string;
  scope: string;
  date: string;
  timestamp: number;
  importance: number;
  heat: number;
  recency: number;
  edge: { type: string; direction: "forward" | "reverse" } | null;
  node: CellNode;
}

export interface JourneyResponse {
  path: string[];
  steps?: JourneyStep[];
  chronologicalSteps?: JourneyStep[];
  isChronological?: boolean;
  timeSpan?: { start: string | null; end: string | null; days: number };
  nodes: CellNode[];
}

export type ViewId = "map" | "timeline" | "journey" | "cluster" | "heatmap";
