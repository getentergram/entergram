"use client";

import { useMemo, useState } from "react";
import { useBrain, suggestionsFor } from "@/lib/store";
import { edgeStyle } from "@/lib/viz";

/**
 * The detail panel: what this cell is, what it connects to, how strongly, and what
 * it probably *should* connect to. Also the editing surface (Phase 4).
 */
export default function Inspector() {
  const graph = useBrain((s) => s.graph);
  const selectedId = useBrain((s) => s.selectedId);
  const select = useBrain((s) => s.select);
  const setJourney = useBrain((s) => s.setJourney);
  const journeyFrom = useBrain((s) => s.journeyFrom);

  const node = useMemo(
    () => graph?.nodes.find((n) => n.id === selectedId) || null,
    [graph, selectedId],
  );

  if (!node || !graph) return null;

  const outgoing = graph.edges.filter((e) => e.from === node.id);
  const incoming = graph.edges.filter((e) => e.to === node.id);
  const suggestions = suggestionsFor(graph, node.id);
  const community = graph.communities.find((c) => c.id === node.community);

  return (
    <aside className="glass z-10 flex w-[340px] shrink-0 flex-col overflow-y-auto border-l">
      <div className="flex items-start gap-2 border-b border-[var(--hairline)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] text-[var(--ink-muted)]">{node.id}</div>
          <h2 className="mt-0.5 text-xs leading-snug text-[var(--ink-primary)]">{node.hook}</h2>
        </div>
        <button
          onClick={() => select(null)}
          aria-label="Close inspector"
          className="shrink-0 text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
        >
          ✕
        </button>
      </div>

      <Section title="Signal">
        <Metric label="Importance" value={node.importance} hint={`PageRank ${node.pagerank.toFixed(4)}`} />
        <Metric label="Bridge" value={Math.min(1, node.betweenness * 6)} hint={`betweenness ${node.betweenness.toFixed(4)}`} />
        <Metric label="Freshness" value={node.recency} hint={node.ageDays != null ? `${Math.round(node.ageDays)}d since last edit` : ""} />
        {node.activations > 0 && (
          <Metric label="Heat" value={node.heat} hint={`${node.activations} recalls`} />
        )}
      </Section>

      <Section title="Facts">
        <Row k="Cluster" v={community ? `${community.label} (${community.size})` : "—"} />
        <Row k="Links" v={`${node.inDegree} in · ${node.outDegree} out`} />
        <Row k="Revisions" v={String(node.revisions || "—")} />
        <Row k="Created" v={node.created?.slice(0, 10) || "—"} />
        <Row k="Updated" v={node.updated?.slice(0, 10) || "—"} />
        <Row k="Confidence" v={node.confidence.toFixed(2)} />
        {node.effector && <Row k="Effector" v={node.effector} />}
        <div className="mt-2 flex flex-wrap gap-1">
          {node.tags.map((t) => (
            <span key={t} className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-muted)]">
              {t}
            </span>
          ))}
        </div>
      </Section>

      {(outgoing.length > 0 || incoming.length > 0) && (
        <Section title={`Connections (${outgoing.length + incoming.length})`}>
          {outgoing.map((e) => (
            <LinkRow key={`o${e.to}${e.type}`} dir="→" id={e.to} type={e.type} onClick={() => select(e.to)} graphLookup={graph} />
          ))}
          {incoming.map((e) => (
            <LinkRow key={`i${e.from}${e.type}`} dir="←" id={e.from} type={e.type} onClick={() => select(e.from)} graphLookup={graph} />
          ))}
        </Section>
      )}

      {suggestions.length > 0 && (
        <Section title="Suggested links">
          <p className="mb-2 text-[10px] leading-relaxed text-[var(--ink-muted)]">
            Cells that read alike or share a neighbourhood, but aren&apos;t linked.
          </p>
          {suggestions.map((s) => {
            const other = s.from === node.id ? s.to : s.from;
            const target = graph.nodes.find((n) => n.id === other);
            return (
              <button
                key={other}
                onClick={() => select(other)}
                className="mb-1 flex w-full items-baseline gap-2 rounded px-1 py-1 text-left hover:bg-[var(--surface-2)]"
              >
                <span className="font-mono text-[10px] text-[var(--accent)]">{other}</span>
                <span className="truncate text-[10px] text-[var(--ink-muted)]">{target?.hook}</span>
                <span className="tabular ml-auto shrink-0 text-[10px] text-[var(--ink-secondary)]">
                  {(s.score * 100).toFixed(0)}%
                </span>
              </button>
            );
          })}
        </Section>
      )}

      <Section title="Journey">
        <div className="flex gap-2">
          <button
            onClick={() => setJourney(node.id, null)}
            className="flex-1 rounded border border-[var(--hairline)] px-2 py-1 text-[10px] text-[var(--ink-secondary)] hover:border-[var(--accent)]"
          >
            Set as start
          </button>
          <button
            disabled={!journeyFrom}
            onClick={() => setJourney(journeyFrom, node.id)}
            className="flex-1 rounded border border-[var(--hairline)] px-2 py-1 text-[10px] text-[var(--ink-secondary)] hover:border-[var(--accent)] disabled:opacity-40"
          >
            Path to here
          </button>
        </div>
      </Section>

      <EditPanel id={node.id} confidence={node.confidence} tags={node.tags} />

      <Section title="Body">
        <pre className="whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-[var(--ink-muted)]">
          {node.body?.slice(0, 2200) || "—"}
          {node.body && node.body.length > 2200 ? "\n…" : ""}
        </pre>
      </Section>
    </aside>
  );
}

/** Phase-4 editing. Only the fields the CLI can actually persist are offered. */
function EditPanel({ id, confidence, tags }: { id: string; confidence: number; tags: string[] }) {
  const patchCell = useBrain((s) => s.patchCell);
  const [conf, setConf] = useState(confidence);
  const [tagText, setTagText] = useState(tags.join(", "));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  const dirty = conf !== confidence || tagText !== tags.join(", ");

  async function save() {
    setState("saving");
    try {
      await patchCell(id, {
        confidence: conf,
        tags: tagText.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setState("saved");
      setTimeout(() => setState("idle"), 1600);
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Section title="Edit">
      <label className="mb-1 block text-[10px] text-[var(--ink-muted)]">
        Confidence <span className="tabular text-[var(--ink-secondary)]">{conf.toFixed(2)}</span>
      </label>
      <input
        type="range" min={0} max={1} step={0.05} value={conf}
        onChange={(e) => setConf(Number(e.target.value))}
        className="mb-3 w-full accent-[var(--accent)]"
      />

      <label className="mb-1 block text-[10px] text-[var(--ink-muted)]">Tags (comma separated)</label>
      <input
        value={tagText}
        onChange={(e) => setTagText(e.target.value)}
        className="mb-2 w-full rounded border border-[var(--hairline)] bg-[var(--surface-2)] px-2 py-1 font-mono text-[10px] outline-none focus:border-[var(--accent)]"
      />

      <button
        onClick={save}
        disabled={!dirty || state === "saving"}
        className="w-full rounded bg-[var(--accent)] px-2 py-1.5 text-[10px] font-medium text-white disabled:opacity-35"
      >
        {state === "saving" ? "Writing…" : state === "saved" ? "✓ Written to Markdown" : "Save to cell"}
      </button>

      {state === "error" && (
        <p className="mt-1 text-[10px] text-[var(--status-critical)]">⚠ {message}</p>
      )}
      <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--ink-muted)]">
        Writes straight to the Markdown file — the index rebuilds itself. Body text is
        edited in your editor, not here.
      </p>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--hairline)] px-4 py-3">
      <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-[var(--ink-muted)]">{title}</h3>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between py-0.5 text-[11px]">
      <span className="text-[var(--ink-muted)]">{k}</span>
      <span className="tabular text-[var(--ink-secondary)]">{v}</span>
    </div>
  );
}

/** A meter, not a chart: one magnitude, anchored to a baseline, 4px rounded end. */
function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="mb-2">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-[var(--ink-muted)]">{label}</span>
        <span className="tabular text-[var(--ink-secondary)]">{pct.toFixed(0)}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div className="h-full rounded-full bg-[var(--seq-4)]" style={{ width: `${pct}%` }} />
      </div>
      {hint && <div className="mt-0.5 text-[10px] text-[var(--ink-muted)]">{hint}</div>}
    </div>
  );
}

function LinkRow({
  dir, id, type, onClick, graphLookup,
}: {
  dir: string; id: string; type: string; onClick: () => void;
  graphLookup: { nodes: { id: string; hook: string }[] };
}) {
  const target = graphLookup.nodes.find((n) => n.id === id);
  return (
    <button onClick={onClick} className="flex w-full items-baseline gap-2 rounded px-1 py-1 text-left hover:bg-[var(--surface-2)]">
      <span className="w-3 shrink-0 text-[10px] text-[var(--ink-muted)]">{dir}</span>
      <span className="font-mono text-[10px] text-[var(--seq-4)]">{id}</span>
      <span className="truncate text-[10px] text-[var(--ink-muted)]">{target?.hook}</span>
      <span className="ml-auto shrink-0 text-[9px] text-[var(--ink-muted)]">{edgeStyle(type).label}</span>
    </button>
  );
}
