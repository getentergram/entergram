"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useBrain } from "@/lib/store";

/**
 * How the brain grew.
 *
 * Change-over-time, so the form is a time axis. The bars are a histogram of writes
 * per week (magnitude over time), and the scrubber sets a cutoff instant that every
 * other view respects — drag it and the Brain Map replays the brain growing.
 */
export default function TimelineView() {
  const timeline = useBrain((s) => s.timeline);
  const scrubAt = useBrain((s) => s.setScrub);
  const scrubValue = useBrain((s) => s.scrubAt);
  const playing = useBrain((s) => s.playing);
  const setPlaying = useBrain((s) => s.setPlaying);
  const select = useBrain((s) => s.select);
  const [hover, setHover] = useState<number | null>(null);

  const { buckets, min, max } = useMemo(() => {
    if (!timeline.length) return { buckets: [], min: 0, max: 0 };
    const times = timeline.map((e) => Date.parse(e.date));
    const lo = Math.min(...times);
    const hi = Math.max(...times);
    const WEEK = 7 * 86400000;
    const count = Math.max(1, Math.ceil((hi - lo) / WEEK));
    const bins = Array.from({ length: count }, (_, i) => ({
      start: lo + i * WEEK, created: 0, modified: 0, total: 0,
    }));
    for (const e of timeline) {
      const i = Math.min(count - 1, Math.floor((Date.parse(e.date) - lo) / WEEK));
      if (e.kind === "created") bins[i].created++; else bins[i].modified++;
      bins[i].total++;
    }
    return { buckets: bins, min: lo, max: hi };
  }, [timeline]);

  const peak = Math.max(1, ...buckets.map((b) => b.total));
  const current = scrubValue ?? max;

  // Replay: walk the cutoff forward, then stop at the end rather than looping.
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || !max) return;
    let t = scrubValue ?? min;
    const step = (max - min) / 240;
    const tick = () => {
      t += step;
      if (t >= max) { scrubAt(null); setPlaying(false); return; }
      scrubAt(t);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
    // scrubValue intentionally omitted: including it would restart the animation
    // on every frame it sets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, min, max, scrubAt, setPlaying]);

  const recent = useMemo(
    () => timeline.filter((e) => Date.parse(e.date) <= current).slice(-40).reverse(),
    [timeline, current],
  );

  if (!timeline.length) {
    return (
      <Empty text="No history available — this store isn't in a git repository." />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-5">
      <header className="mb-3 flex items-baseline gap-3">
        <h2 className="text-sm font-medium">How this brain grew</h2>
        <span className="tabular text-[11px] text-[var(--ink-muted)]">
          {timeline.length} events · {new Date(min).toISOString().slice(0, 10)} → {new Date(max).toISOString().slice(0, 10)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => { setPlaying(!playing); if (!playing && scrubValue == null) scrubAt(min); }}
            className="rounded border border-[var(--hairline)] px-2 py-1 text-[11px] text-[var(--ink-secondary)] hover:border-[var(--accent)]"
          >
            {playing ? "❚❚ Pause" : "▶ Replay growth"}
          </button>
          <button
            onClick={() => { setPlaying(false); scrubAt(null); }}
            className="rounded border border-[var(--hairline)] px-2 py-1 text-[11px] text-[var(--ink-muted)] hover:text-[var(--ink-secondary)]"
          >
            Reset
          </button>
        </div>
      </header>

      {/* Histogram. Bars sit on a shared baseline with a 2px surface gap. */}
      <div className="relative h-40 shrink-0" onMouseLeave={() => setHover(null)}>
        <div className="flex h-full items-end gap-[2px]">
          {buckets.map((b, i) => {
            const active = b.start <= current;
            return (
              <div
                key={i}
                onMouseEnter={() => setHover(i)}
                onClick={() => scrubAt(b.start)}
                className="group relative flex-1 cursor-pointer"
                style={{ height: "100%" }}
              >
                <div className="absolute bottom-0 w-full rounded-t-[4px] transition-colors"
                  style={{
                    height: `${(b.total / peak) * 100}%`,
                    background: active ? "var(--seq-4)" : "var(--surface-2)",
                    opacity: hover === i ? 1 : 0.9,
                  }}
                />
              </div>
            );
          })}
        </div>

        {hover != null && buckets[hover] && (
          <div
            className="glass pointer-events-none absolute -top-1 z-10 rounded-md px-2 py-1 text-[10px]"
            style={{ left: `${(hover / buckets.length) * 100}%` }}
          >
            <div className="tabular text-[var(--ink-primary)]">
              {new Date(buckets[hover].start).toISOString().slice(0, 10)}
            </div>
            <div className="tabular text-[var(--ink-muted)]">
              {buckets[hover].created} new · {buckets[hover].modified} edits
            </div>
          </div>
        )}
      </div>

      <input
        type="range"
        min={min} max={max} step={(max - min) / 500}
        value={current}
        onChange={(e) => { setPlaying(false); scrubAt(Number(e.target.value)); }}
        className="mt-3 w-full accent-[var(--accent)]"
        aria-label="Scrub through time"
      />
      <div className="tabular mt-1 flex justify-between text-[10px] text-[var(--ink-muted)]">
        <span>{new Date(min).toISOString().slice(0, 10)}</span>
        <span className="text-[var(--ink-secondary)]">
          showing the brain as of {new Date(current).toISOString().slice(0, 10)}
        </span>
        <span>{new Date(max).toISOString().slice(0, 10)}</span>
      </div>

      <h3 className="mb-2 mt-5 text-[10px] font-medium uppercase tracking-wider text-[var(--ink-muted)]">
        Event log
      </h3>
      <ul className="min-h-0 flex-1 overflow-y-auto text-[11px]">
        {recent.map((e, i) => (
          <li key={`${e.id}-${e.sha}-${i}`}>
            <button
              onClick={() => select(e.id)}
              className="flex w-full items-baseline gap-2 rounded px-1 py-1 text-left hover:bg-[var(--surface-2)]"
            >
              <span className="tabular w-[74px] shrink-0 text-[10px] text-[var(--ink-muted)]">
                {e.date.slice(0, 10)}
              </span>
              <span className={`w-[52px] shrink-0 text-[10px] ${
                e.kind === "created" ? "text-[var(--status-good)]" : "text-[var(--ink-muted)]"
              }`}>
                {e.kind === "created" ? "+ new" : e.kind}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-[var(--seq-4)]">{e.id}</span>
              <span className="truncate text-[var(--ink-muted)]">{e.subject}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-xs text-[var(--ink-muted)]">
      {text}
    </div>
  );
}
