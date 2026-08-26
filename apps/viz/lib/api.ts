import type { Graph, Meta, SearchHit, TimelineEvent, Suggestion, CellNode, JourneyResponse } from "./types";

// In production the UI is served by the viz server itself, so the API is same-origin.
// Under `next dev` the UI runs on 4701 and must reach the server on 4700.
const BASE =
  process.env.NODE_ENV === "development" ? "http://127.0.0.1:4700" : "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error || `${res.status} ${path}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  meta: () => get<Meta>("/api/meta"),
  graph: (persona?: string) =>
    get<Graph>(`/api/graph${persona && persona !== "architect" ? `?persona=${persona}` : ""}`),
  timeline: () => get<{ source: string; events: TimelineEvent[] }>("/api/timeline"),
  suggestions: () => get<Suggestion[]>("/api/suggestions"),
  search: (q: string) =>
    get<{ total: number; hits: SearchHit[]; degraded?: boolean }>(
      `/api/search?q=${encodeURIComponent(q)}`,
    ),
  path: (from: string, to: string) =>
    get<JourneyResponse>(
      `/api/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),
  seedActivity: async () => {
    const res = await fetch(`${BASE}/api/seed-activity`, { method: "POST" });
    if (!res.ok) throw new Error("failed to seed activity");
    return res.json();
  },
  cell: (id: string) => get<CellNode & { metrics: CellNode }>(`/api/cell/${encodeURIComponent(id)}`),

  async patchCell(id: string, patch: { confidence?: number; tags?: string[]; why?: string }) {
    const res = await fetch(`${BASE}/api/cell/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error || "patch failed");
    return res.json();
  },

  /** Live updates: the server pushes when a cell changes on disk. */
  subscribe(onChange: () => void): () => void {
    if (typeof window === "undefined") return () => {};
    const src = new EventSource(`${BASE}/api/events`);
    src.addEventListener("graph:changed", onChange);
    // EventSource reconnects on its own; swallow the error rather than surfacing
    // a scary banner every time the CLI restarts.
    src.onerror = () => {};
    return () => src.close();
  },
};
