// Personas: saved queries over the connectome.
//
// A persona is not a separate dataset — it is a filter plus a choice of which metric
// drives visual weight. The Executive and the Engineer look at the same 208 cells;
// they disagree about which ones are large.
//
// Definitions are declarative (tag globs, types, a metric name) so a store can override
// them in entergram.toml without shipping code.

/** Glob match supporting a trailing `*` — `arch:*` catches `arch:carma`, `arch:lplane`. */
function matchesTag(tag, pattern) {
  if (pattern === "*") return true;
  if (pattern.endsWith("*")) return tag.startsWith(pattern.slice(0, -1));
  return tag === pattern;
}

export const DEFAULT_PERSONAS = [
  {
    id: "architect",
    label: "Brain Architect",
    description: "Every neuron, every synapse. Orphans and weak links included.",
    tags: ["*"],
    emphasis: "betweenness",
    showOrphans: true,
    showSuggestions: true,
    defaultView: "map",
  },
  {
    id: "executive",
    label: "Executive",
    description: "Strategy, decisions and doctrine. The load-bearing few.",
    tags: ["meta", "workflow", "arch:*", "project:*", "process"],
    types: ["decision", "principle", "reference"],
    emphasis: "pagerank",
    maxNodes: 60,
    showOrphans: false,
    showSuggestions: false,
    defaultView: "cluster",
  },
  {
    id: "engineer",
    label: "Engineer",
    description: "Architecture, APIs, dependencies and the gotchas that bite.",
    tags: ["code", "infra", "api*", "arch:*", "gotcha", "deploy", "config", "docker", "auth"],
    emphasis: "degree",
    showOrphans: false,
    showSuggestions: true,
    defaultView: "map",
  },
  {
    id: "researcher",
    label: "Researcher",
    description: "Evidence, references and low-confidence claims worth testing.",
    tags: ["reference", "llm", "memory", "routing", "meta"],
    emphasis: "confidence",
    invertEmphasis: true, // least-certain first — those are the ones needing work
    showOrphans: true,
    showSuggestions: true,
    defaultView: "cluster",
  },
  {
    id: "pm",
    label: "Project Manager",
    description: "Live projects, blockers and what moved recently.",
    tags: ["project:*", "process", "workflow", "migration", "deploy"],
    emphasis: "recency",
    showOrphans: false,
    showSuggestions: false,
    defaultView: "timeline",
  },
];

/** Emphasis metric -> node accessor. Unknown names fall back to PageRank. */
const METRICS = {
  pagerank: (n) => n.importance,
  betweenness: (n) => n.betweenness,
  degree: (n) => n.degree,
  recency: (n) => n.recency,
  heat: (n) => n.heat,
  confidence: (n) => n.confidence,
};

export function metricFor(persona) {
  return METRICS[persona?.emphasis] || METRICS.pagerank;
}

/**
 * Project a graph through a persona.
 *
 * Edges survive only when both endpoints do, so a filtered view never renders a synapse
 * into a cell the viewer cannot see.
 */
export function applyPersona(graph, persona) {
  if (!persona || persona.id === "architect") {
    return { ...graph, persona: persona?.id || "architect" };
  }

  const patterns = persona.tags || ["*"];
  const types = persona.types ? new Set(persona.types) : null;

  let nodes = graph.nodes.filter((n) => {
    const tagHit = n.tags.some((t) => patterns.some((p) => matchesTag(t, p)));
    const typeHit = types ? types.has(n.type) : false;
    // Either signal admits the node — tag vocabularies vary per store, and demanding
    // both would empty the view on any store that doesn't tag the way the brain does.
    return tagHit || typeHit;
  });

  if (persona.showOrphans === false) {
    const orphaned = new Set(graph.orphans);
    nodes = nodes.filter((n) => !orphaned.has(n.id));
  }

  const metric = metricFor(persona);
  if (persona.maxNodes && nodes.length > persona.maxNodes) {
    const dir = persona.invertEmphasis ? 1 : -1;
    nodes = nodes.slice().sort((a, b) => dir * (metric(b) - metric(a))).slice(0, persona.maxNodes);
  }

  const keep = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  const communities = graph.communities
    .map((c) => ({ ...c, members: c.members.filter((m) => keep.has(m)) }))
    .filter((c) => c.members.length > 0)
    .map((c) => ({ ...c, size: c.members.length }));

  return {
    ...graph,
    persona: persona.id,
    nodes,
    edges,
    communities,
    suggestions: persona.showSuggestions === false
      ? []
      : graph.suggestions.filter((s) => keep.has(s.from) && keep.has(s.to)),
    orphans: graph.orphans.filter((id) => keep.has(id)),
    stats: { ...graph.stats, cells: nodes.length, edges: edges.length, communities: communities.length },
  };
}

/** Merge user-defined personas from config over the defaults, matching on id. */
export function resolvePersonas(config = {}) {
  const custom = config.personas || [];
  if (!custom.length) return DEFAULT_PERSONAS;
  const byId = new Map(DEFAULT_PERSONAS.map((p) => [p.id, p]));
  for (const p of custom) byId.set(p.id, { ...(byId.get(p.id) || {}), ...p });
  return [...byId.values()];
}
