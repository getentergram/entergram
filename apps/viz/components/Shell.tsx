"use client";

import { useEffect } from "react";
import { useBrain } from "@/lib/store";
import type { ViewId } from "@/lib/types";
import BrainMap from "./BrainMap";
import TimelineView from "./TimelineView";
import ClusterView from "./ClusterView";
import JourneyView from "./JourneyView";
import HeatmapView from "./HeatmapView";
import Inspector from "./Inspector";
import CommandPalette from "./CommandPalette";
import StatBar from "./StatBar";
import CinematicDirector from "./CinematicDirector";

const VIEWS: { id: ViewId; label: string; hint: string }[] = [
  { id: "map", label: "Brain Map", hint: "The whole connectome" },
  { id: "cluster", label: "Clusters", hint: "Communities, faceted" },
  { id: "timeline", label: "Timeline", hint: "How it grew" },
  { id: "journey", label: "Journey", hint: "Reasoning paths" },
  { id: "heatmap", label: "Heat", hint: "What actually fires" },
];

export default function Shell() {
  const { view, setView, loading, error, meta, persona, setPersona, togglePalette } = useBrain();

  // Cmd+K anywhere; digits jump between views.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= VIEWS.length) setView(VIEWS[n - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setView, togglePalette]);

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="text-sm text-[var(--status-critical)]">⚠ Could not reach the brain</div>
        <div className="max-w-md text-xs text-[var(--ink-muted)]">{error}</div>
        <div className="text-xs text-[var(--ink-muted)]">
          Is <code className="text-[var(--ink-secondary)]">entergram viz</code> running?
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="glass z-20 flex shrink-0 items-center gap-4 border-b px-4 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight">Brain OS</span>
          <span className="text-[10px] text-[var(--ink-muted)]">
            {meta?.config.name || "memory"}
          </span>
        </div>

        <nav className="flex items-center gap-1">
          {VIEWS.map((v, i) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              title={`${v.hint}  (${i + 1})`}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                view === v.id
                  ? "bg-[var(--surface-2)] text-[var(--ink-primary)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink-secondary)]"
              }`}
            >
              {v.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <label className="sr-only" htmlFor="persona">Persona</label>
          <select
            id="persona"
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            className="rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--ink-secondary)] outline-none focus:border-[var(--accent)]"
          >
            {meta?.personas.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>

          <button
            onClick={() => togglePalette(true)}
            className="rounded-md border border-[var(--hairline)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--ink-muted)] hover:text-[var(--ink-secondary)]"
          >
            Search <kbd className="ml-1 text-[10px]">⌘K</kbd>
          </button>
        </div>
      </header>

      <PersonaNote />

      <main className="relative flex min-h-0 flex-1">
        <section className="relative min-w-0 flex-1">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--surface-0)]/70 text-xs text-[var(--ink-muted)]">
              <span className="animate-glow">reading the brain…</span>
            </div>
          )}
          {view === "map" && <BrainMap />}
          {view === "cluster" && <ClusterView />}
          {view === "timeline" && <TimelineView />}
          {view === "journey" && <JourneyView />}
          {view === "heatmap" && <HeatmapView />}
        </section>

        <Inspector />
      </main>

      <StatBar />
      <CommandPalette />
      {typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("cinematic") === "1" || (window as any).isCinematic) && (
        <CinematicDirector />
      )}
    </div>
  );
}

/** A persona hides cells; say so plainly rather than letting the count silently shrink. */
function PersonaNote() {
  const persona = useBrain((s) => s.persona);
  const meta = useBrain((s) => s.meta);
  const graph = useBrain((s) => s.graph);
  if (persona === "architect" || !meta || !graph) return null;

  const def = meta.personas.find((p) => p.id === persona);
  const hidden = meta.stats.cells - graph.stats.cells;
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--hairline)] bg-[var(--surface-1)] px-4 py-1.5 text-[11px] text-[var(--ink-muted)]">
      <span className="text-[var(--ink-secondary)]">{def?.label}</span>
      <span>{def?.description}</span>
      {hidden > 0 && (
        <span className="ml-auto tabular">
          {hidden} of {meta.stats.cells} cells hidden · sized by {def?.emphasis}
        </span>
      )}
    </div>
  );
}
