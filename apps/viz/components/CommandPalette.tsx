"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useBrain } from "@/lib/store";
import type { SearchHit } from "@/lib/types";

/**
 * Cmd+K search. Queries the store's own FTS5 + embedding recall, so the ranking
 * here is the same ranking the agent sees — the palette is a window onto real
 * retrieval, not a second search engine that happens to agree.
 */
export default function CommandPalette() {
  const open = useBrain((s) => s.paletteOpen);
  const togglePalette = useBrain((s) => s.togglePalette);
  const select = useBrain((s) => s.select);
  const setView = useBrain((s) => s.setView);
  const graph = useBrain((s) => s.graph);

  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [cursor, setCursor] = useState(0);
  const [degraded, setDegraded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQ(""); setHits([]); setCursor(0); setTimeout(() => inputRef.current?.focus(), 10); }
  }, [open]);

  // Debounced so a fast typist doesn't fire a query per keystroke.
  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await api.search(q);
        if (cancelled) return;
        setHits(r.hits);
        setDegraded(Boolean(r.degraded));
        setCursor(0);
      } catch { if (!cancelled) setHits([]); }
    }, 130);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const byId = useMemo(
    () => new Map((graph?.nodes || []).map((n) => [n.id, n])),
    [graph],
  );

  if (!open) return null;

  const choose = (id: string) => {
    select(id);
    setView("map");
    togglePalette(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh]"
      onClick={() => togglePalette(false)}
    >
      <div
        className="glass animate-rise w-[min(640px,92vw)] overflow-hidden rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") togglePalette(false);
            if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, hits.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
            if (e.key === "Enter" && hits[cursor]) choose(hits[cursor].id);
          }}
          placeholder="Search every neuron…"
          className="w-full bg-transparent px-4 py-3 text-sm outline-none placeholder:text-[var(--ink-muted)]"
        />

        {degraded && (
          <div className="border-t border-[var(--hairline)] px-4 py-1.5 text-[10px] text-[var(--status-warning)]">
            ⚠ full-text index unavailable — falling back to substring match
          </div>
        )}

        {hits.length > 0 && (
          <ul className="max-h-[46vh] overflow-y-auto border-t border-[var(--hairline)]">
            {hits.map((h, i) => {
              const node = byId.get(h.id);
              return (
                <li key={h.id}>
                  <button
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => choose(h.id)}
                    className={`flex w-full items-baseline gap-2 px-4 py-2 text-left text-xs ${
                      i === cursor ? "bg-[var(--surface-2)]" : ""
                    }`}
                  >
                    <span className="tabular shrink-0 font-mono text-[10px] text-[var(--ink-muted)]">{h.id}</span>
                    <span className="truncate text-[var(--ink-secondary)]">{h.hook}</span>
                    {node && (
                      <span className="tabular ml-auto shrink-0 text-[10px] text-[var(--ink-muted)]">
                        {node.degree} links
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {q.trim() && hits.length === 0 && (
          <div className="border-t border-[var(--hairline)] px-4 py-3 text-xs text-[var(--ink-muted)]">
            Nothing matches “{q}”.
          </div>
        )}
      </div>
    </div>
  );
}
