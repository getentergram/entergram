"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { api } from "./api";
import type { CellNode, Graph, Meta, Suggestion, TimelineEvent, ViewId } from "./types";

interface BrainState {
  meta: Meta | null;
  graph: Graph | null;
  timeline: TimelineEvent[];
  loading: boolean;
  error: string | null;

  view: ViewId;
  persona: string;
  selectedId: string | null;
  hoveredId: string | null;
  paletteOpen: boolean;

  // filters
  activeTags: string[];
  activeCommunity: number | null;
  query: string;

  // journey
  journeyFrom: string | null;
  journeyTo: string | null;
  journeyPath: string[] | null;
  journeyError: string | null;

  // timeline scrubbing — nodes after this instant are hidden, so the graph
  // visibly grows as you drag forward
  scrubAt: number | null;
  playing: boolean;

  load: () => Promise<void>;
  refresh: () => Promise<void>;
  setView: (v: ViewId) => void;
  setPersona: (p: string) => Promise<void>;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  togglePalette: (open?: boolean) => void;
  toggleTag: (tag: string) => void;
  setCommunity: (c: number | null) => void;
  setJourney: (from: string | null, to: string | null) => Promise<void>;
  setScrub: (t: number | null) => void;
  setPlaying: (p: boolean) => void;
  patchCell: (id: string, patch: { confidence?: number; tags?: string[]; why?: string }) => Promise<void>;
}

export const useBrain = create<BrainState>((set, get) => ({
  meta: null,
  graph: null,
  timeline: [],
  loading: true,
  error: null,

  view: "map",
  persona: "architect",
  selectedId: null,
  hoveredId: null,
  paletteOpen: false,

  activeTags: [],
  activeCommunity: null,
  query: "",

  journeyFrom: null,
  journeyTo: null,
  journeyPath: null,
  journeyError: null,

  scrubAt: null,
  playing: false,

  async load() {
    set({ loading: true, error: null });
    try {
      // Timeline is a separate git walk (~850ms cold); fetching it alongside the graph
      // rather than on first Timeline click keeps that view instant.
      const [meta, graph, timeline] = await Promise.all([
        api.meta(),
        api.graph(get().persona),
        api.timeline().then((t) => t.events).catch(() => [] as TimelineEvent[]),
      ]);
      set({ meta, graph, timeline, loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },

  async refresh() {
    try {
      const graph = await api.graph(get().persona);
      set({ graph });
    } catch { /* a failed background refresh keeps the last good graph on screen */ }
  },

  setView: (view) => set({ view }),

  async setPersona(persona) {
    set({ persona, loading: true });
    try {
      const graph = await api.graph(persona);
      // A persona switch can hide the selected cell; clear rather than leave the
      // inspector describing something no longer on the canvas.
      const stillVisible = graph.nodes.some((n) => n.id === get().selectedId);
      set({ graph, loading: false, selectedId: stillVisible ? get().selectedId : null });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },

  select: (selectedId) => set({ selectedId }),
  hover: (hoveredId) => set({ hoveredId }),
  togglePalette: (open) => set((s) => ({ paletteOpen: open ?? !s.paletteOpen })),

  toggleTag: (tag) =>
    set((s) => ({
      activeTags: s.activeTags.includes(tag)
        ? s.activeTags.filter((t) => t !== tag)
        : [...s.activeTags, tag],
    })),

  setCommunity: (activeCommunity) => set({ activeCommunity }),

  async setJourney(journeyFrom, journeyTo) {
    set({ journeyFrom, journeyTo, journeyError: null });
    if (!journeyFrom || !journeyTo) return set({ journeyPath: null });
    try {
      const { path } = await api.path(journeyFrom, journeyTo);
      set({ journeyPath: path });
    } catch (e) {
      // "no path" is a real answer about the brain's shape, not a failure.
      set({ journeyPath: null, journeyError: e instanceof Error ? e.message : String(e) });
    }
  },

  setScrub: (scrubAt) => set({ scrubAt }),
  setPlaying: (playing) => set({ playing }),

  async patchCell(id, patch) {
    await api.patchCell(id, patch);
    await get().refresh();
  },
}));

/**
 * Nodes surviving the current tag/community/scrub filters.
 *
 * This MUST be a hook with its own useMemo, not a zustand selector. A selector that
 * builds a new array on every call has a different identity each read, so
 * useSyncExternalStore never sees a stable snapshot and React re-renders forever
 * (error #185). Selecting the primitive inputs and memoizing here keeps the
 * identity stable between actual changes.
 */
export function useVisibleNodes(): CellNode[] {
  const graph = useBrain((s) => s.graph);
  const activeTags = useBrain((s) => s.activeTags);
  const activeCommunity = useBrain((s) => s.activeCommunity);
  const scrubAt = useBrain((s) => s.scrubAt);

  return useMemo(() => {
    if (!graph) return [];
    return graph.nodes.filter((n) => {
      if (activeCommunity != null && n.community !== activeCommunity) return false;
      if (activeTags.length && !activeTags.some((t) => n.tags.includes(t))) return false;
      if (scrubAt != null) {
        if (!n.created) return false;
        if (Date.parse(n.created) > scrubAt) return false;
      }
      return true;
    });
  }, [graph, activeTags, activeCommunity, scrubAt]);
}

export function suggestionsFor(g: Graph | null, id: string | null): Suggestion[] {
  if (!g || !id) return [];
  return g.suggestions.filter((s) => s.from === id || s.to === id);
}
