"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useBrain } from "@/lib/store";

interface TelemetryState {
  activeScene: number;
  sceneTitle: string;
  sceneSubtitle: string;
  showSplash: boolean;
  activeHud: "none" | "overview" | "hub" | "path" | "persona" | "timeline" | "hero";
  activePersona: "executive" | "engineer" | "researcher" | "pm" | "architect";
  subtitleText: string;
  categoryChips: boolean;
  highlightNodeId: string | null;
  pathNodes: string[];
}

export default function CinematicDirector() {
  const { setPersona, setView, select, graph, meta } = useBrain();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [state, setState] = useState<TelemetryState>({
    activeScene: 1,
    sceneTitle: "BRAIN OS",
    sceneSubtitle: "The Enterprise Knowledge Connectome",
    showSplash: true,
    activeHud: "none",
    activePersona: "architect",
    subtitleText: "Every organization stores knowledge. Very few understand how that knowledge is actually connected.",
    categoryChips: false,
    highlightNodeId: null,
    pathNodes: [],
  });

  // Scene Director API exposed to Playwright via window.brainDirector
  useEffect(() => {
    const director = {
      setScene: (sceneNum: number, config?: Partial<TelemetryState>) => {
        setState((prev) => ({
          ...prev,
          activeScene: sceneNum,
          ...config,
        }));
      },
      setSubtitle: (text: string) => {
        setState((prev) => ({ ...prev, subtitleText: text }));
      },
      showTitle: (title: string, subtitle: string, durationMs: number = 3000) => {
        setState((prev) => ({
          ...prev,
          sceneTitle: title,
          sceneSubtitle: subtitle,
          showSplash: true,
        }));
        if (durationMs > 0) {
          setTimeout(() => {
            setState((prev) => ({ ...prev, showSplash: false }));
          }, durationMs);
        }
      },
      hideTitle: () => {
        setState((prev) => ({ ...prev, showSplash: false }));
      },
      setHud: (hud: TelemetryState["activeHud"]) => {
        setState((prev) => ({ ...prev, activeHud: hud }));
      },
      switchPersona: (personaId: TelemetryState["activePersona"]) => {
        setPersona(personaId);
        setState((prev) => ({ ...prev, activePersona: personaId }));
      },
      switchView: (viewId: any) => {
        setView(viewId);
      },
      highlightPath: (nodeIds: string[]) => {
        setState((prev) => ({ ...prev, pathNodes: nodeIds }));
        try {
          const cy = (window as any).cy;
          if (cy && !cy.destroyed?.()) {
            cy.batch(() => {
              cy.elements().removeClass("focus neighbor pathNode pathEdge dim");
              if (nodeIds.length > 0) {
                cy.elements().addClass("dim");
                nodeIds.forEach((id) => {
                  const node = cy.$id(id);
                  node.removeClass("dim").addClass("pathNode");
                });
                for (let i = 0; i < nodeIds.length - 1; i++) {
                  const src = nodeIds[i];
                  const dst = nodeIds[i + 1];
                  const edge = cy.edges(`[source = "${src}"][target = "${dst}"], [source = "${dst}"][target = "${src}"]`);
                  edge.removeClass("dim").addClass("pathEdge");
                }
              }
            });
          }
        } catch (e) {
          console.warn("highlightPath skipped:", e);
        }
      },
      focusNode: (nodeId: string) => {
        setState((prev) => ({ ...prev, highlightNodeId: nodeId }));
        select(nodeId);
        try {
          const cy = (window as any).cy;
          if (cy && !cy.destroyed?.()) {
            const target = cy.$id(nodeId);
            if (target.length) {
              cy.animate(
                {
                  center: { eles: target },
                  zoom: 1.4,
                },
                { duration: 1200, easing: "ease-in-out-cubic" }
              );
            }
          }
        } catch (e) {
          console.warn("focusNode skipped:", e);
        }
      },
      orbitCamera: (targetZoom: number = 0.9, duration: number = 5000) => {
        try {
          const cy = (window as any).cy;
          if (cy && !cy.destroyed?.()) {
            cy.animate(
              {
                zoom: targetZoom,
              },
              { duration, easing: "ease-in-out-cubic" }
            );
          }
        } catch (e) {
          console.warn("orbitCamera skipped:", e);
        }
      },
      resetCamera: (duration: number = 1000) => {
        try {
          const cy = (window as any).cy;
          if (cy && !cy.destroyed?.()) {
            cy.elements().removeClass("focus neighbor pathNode pathEdge dim");
            cy.animate(
              {
                fit: { padding: 40 },
              },
              { duration, easing: "ease-in-out-cubic" }
            );
          }
        } catch (e) {
          console.warn("resetCamera skipped:", e);
        }
      },
    };

    (window as any).brainDirector = director;
  }, [setPersona, setView, select]);

  // Particle Synapse Pulses Canvas Animation (60fps)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    // Particle pulses
    const particles: Array<{
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      progress: number;
      speed: number;
      size: number;
      color: string;
    }> = [];

    const spawnInterval = setInterval(() => {
      const cy = (window as any).cy;
      if (!cy) return;
      
      const edges = cy.edges(":visible");
      if (edges.length === 0) return;

      // Pick random visible edge or path edge
      const edge = edges[Math.floor(Math.random() * edges.length)];
      const srcNode = edge.source();
      const tgtNode = edge.target();
      if (!srcNode || !tgtNode) return;

      const sp = srcNode.renderedPosition();
      const tp = tgtNode.renderedPosition();

      const isPath = edge.hasClass("pathEdge");

      particles.push({
        fromX: sp.x,
        fromY: sp.y,
        toX: tp.x,
        toY: tp.y,
        progress: 0,
        speed: isPath ? 0.025 : 0.012 + Math.random() * 0.015,
        size: isPath ? 4.5 : 2.5,
        color: isPath ? "#38bdf8" : "#818cf8",
      });

      if (particles.length > 80) particles.shift();
    }, 120);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.progress += p.speed;

        if (p.progress >= 1.0) {
          particles.splice(i, 1);
          continue;
        }

        const currX = p.fromX + (p.toX - p.fromX) * p.progress;
        const currY = p.fromY + (p.toY - p.fromY) * p.progress;

        // Glow trail
        const grad = ctx.createRadialGradient(currX, currY, 0, currX, currY, p.size * 3.5);
        grad.addColorStop(0, p.color);
        grad.addColorStop(0.4, p.color);
        grad.addColorStop(1, "transparent");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(currX, currY, p.size * 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(currX, currY, p.size * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      clearInterval(spawnInterval);
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden select-none font-sans">
      {/* Particle Synapse Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 z-10 pointer-events-none" />

      {/* Top Palantir Gotham Telemetry Bar */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-8 py-4 bg-gradient-to-b from-[#030712]/90 via-[#030712]/50 to-transparent border-b border-cyan-500/10">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center">
            <span className="absolute w-3 h-3 rounded-full bg-cyan-400 animate-ping opacity-75" />
            <span className="relative w-2 h-2 rounded-full bg-cyan-400" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-widest text-white uppercase drop-shadow-[0_0_12px_rgba(56,189,248,0.6)]">
                BRAIN OS
              </span>
              <span className="text-[10px] font-mono tracking-widest px-2 py-0.5 rounded bg-cyan-950/70 border border-cyan-500/30 text-cyan-300 uppercase">
                ENTERPRISE CONNECTOME
              </span>
            </div>
            <span className="text-[11px] font-mono text-cyan-200/60 tracking-wider">
              QUANTUM SYNAPSE TOPOLOGY // ACTIVE RUNTIME
            </span>
          </div>
        </div>

        <div className="flex items-center gap-8 text-xs font-mono">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">CONNECTOME STATE</span>
            <span className="text-cyan-400 font-semibold tracking-wider">215 NEURONS · 832 SYNAPSES</span>
          </div>
          <div className="h-6 w-px bg-cyan-500/20" />
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">MODULARITY INDEX</span>
            <span className="text-emerald-400 font-semibold tracking-wider">Q = 0.742 · 17 CLUSTERS</span>
          </div>
          <div className="h-6 w-px bg-cyan-500/20" />
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">CITATION LATENCY</span>
            <span className="text-indigo-300 font-semibold tracking-wider">&lt; 0.8ms (TENSOR SPEED)</span>
          </div>
        </div>
      </header>

      {/* Floating Apple Keynote Scene Splash Card */}
      {state.showSplash && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md transition-opacity duration-1000 animate-fadeIn">
          <div className="flex flex-col items-center text-center max-w-4xl px-8 py-12 rounded-3xl bg-gradient-to-b from-white/5 to-white/[0.02] border border-white/10 shadow-[0_0_80px_rgba(56,189,248,0.15)]">
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-mono uppercase tracking-widest">
              <span>●</span> SCENE 0{state.activeScene} // FLAGSHIP REVEAL
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white drop-shadow-[0_0_35px_rgba(255,255,255,0.4)] mb-4">
              {state.sceneTitle}
            </h1>
            <p className="text-xl md:text-2xl text-cyan-100/70 font-light tracking-wide max-w-2xl">
              {state.sceneSubtitle}
            </p>
          </div>
        </div>
      )}

      {/* Scene 2 Category HUD Chips */}
      {state.categoryChips && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 animate-fadeIn">
          {["AI Systems", "Memory", "Enterprise", "Research", "Strategy"].map((cat, i) => (
            <div
              key={cat}
              style={{ animationDelay: `${i * 150}ms` }}
              className="px-4 py-1.5 rounded-full bg-cyan-950/80 border border-cyan-400/40 backdrop-blur-lg text-cyan-200 text-xs font-mono tracking-wider shadow-[0_0_20px_rgba(56,189,248,0.3)] animate-pulse"
            >
              ✦ {cat}
            </div>
          ))}
        </div>
      )}

      {/* Scene 3: Knowledge Hub & Centrality Telemetry Card */}
      {state.activeHud === "hub" && (
        <div className="absolute top-24 left-8 z-30 w-96 rounded-2xl bg-gray-950/85 border border-cyan-500/40 backdrop-blur-xl p-5 shadow-[0_0_40px_rgba(56,189,248,0.25)] animate-slideRight">
          <div className="flex items-center justify-between pb-3 border-b border-cyan-500/20 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-300">
                KNOWLEDGE HUB DETECTED
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
              RANK #1
            </span>
          </div>

          <div className="space-y-3 font-mono">
            <div>
              <div className="text-[10px] text-gray-400 uppercase">NEURON IDENTITY</div>
              <div className="text-sm font-bold text-white tracking-tight">
                B-059 // Neurodynamic Principles
              </div>
              <div className="text-xs text-cyan-200/70 truncate">Rosenblatt S/A/R Perceptron Connectome</div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-cyan-500/10">
              <div className="p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/20">
                <div className="text-[9px] text-cyan-400 uppercase">BETWEENNESS CENTRALITY</div>
                <div className="text-lg font-bold text-cyan-300">96.4%</div>
              </div>
              <div className="p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/20">
                <div className="text-[9px] text-cyan-400 uppercase">PAGERANK WEIGHT</div>
                <div className="text-lg font-bold text-white">0.0841</div>
              </div>
            </div>

            <div className="p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/20">
              <div className="flex justify-between text-[10px] text-gray-300 mb-1">
                <span>SYNAPTIC CONNECTIVITY</span>
                <span className="text-cyan-300 font-bold">42 Citations</span>
              </div>
              <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-cyan-500 to-indigo-400 h-full w-[96%]" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scene 3: Shortest Path Reasoning Card */}
      {state.activeHud === "path" && (
        <div className="absolute top-24 right-8 z-30 w-[420px] rounded-2xl bg-gray-950/85 border border-cyan-400/40 backdrop-blur-xl p-5 shadow-[0_0_40px_rgba(56,189,248,0.25)] animate-slideLeft">
          <div className="flex items-center justify-between pb-3 border-b border-cyan-500/20 mb-3">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-300">
              ⚡ CAUSAL REASONING PATH
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
              SHORTEST PATH: 3 HOPS
            </span>
          </div>

          <div className="space-y-2.5 font-mono text-xs">
            <div className="flex items-center gap-3 p-2 rounded-lg bg-cyan-950/50 border border-cyan-400/30">
              <span className="w-6 h-6 rounded-full bg-cyan-500 text-black flex items-center justify-center font-bold text-[11px]">
                1
              </span>
              <div className="truncate">
                <div className="font-bold text-white">B-059 · Neurodynamic Principles</div>
                <div className="text-[10px] text-cyan-300">Origin Perceptron Theory (2026-06)</div>
              </div>
            </div>

            <div className="flex justify-center text-cyan-400 text-xs py-0.5 font-bold">
              ↓ <span className="text-[10px] ml-1 text-cyan-200/60">[caused_by]</span>
            </div>

            <div className="flex items-center gap-3 p-2 rounded-lg bg-cyan-950/50 border border-cyan-400/30">
              <span className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-[11px]">
                2
              </span>
              <div className="truncate">
                <div className="font-bold text-white">B-203 · Anatomy Architecture</div>
                <div className="text-[10px] text-indigo-300">Substrate Layer Protocol (2026-08)</div>
              </div>
            </div>

            <div className="flex justify-center text-cyan-400 text-xs py-0.5 font-bold">
              ↓ <span className="text-[10px] ml-1 text-cyan-200/60">[cites]</span>
            </div>

            <div className="flex items-center gap-3 p-2 rounded-lg bg-cyan-950/50 border border-cyan-400/30">
              <span className="w-6 h-6 rounded-full bg-emerald-400 text-black flex items-center justify-center font-bold text-[11px]">
                3
              </span>
              <div className="truncate">
                <div className="font-bold text-white">B-216 · Cellular Runtime & MARL</div>
                <div className="text-[10px] text-emerald-300">Shipped Living Connectome (2026-08)</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scene 4: Multi-Persona Holographic HUD Card */}
      {state.activeHud === "persona" && (
        <div className="absolute top-24 left-8 z-30 w-96 rounded-2xl bg-gray-950/90 border border-indigo-500/40 backdrop-blur-xl p-5 shadow-[0_0_40px_rgba(99,102,241,0.25)] animate-slideRight">
          <div className="flex items-center justify-between pb-3 border-b border-indigo-500/20 mb-3">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-300">
              PERSONA QUERY ENGINE
            </span>
            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 uppercase font-bold border border-indigo-400/30">
              {state.activePersona}
            </span>
          </div>

          {state.activePersona === "executive" && (
            <div className="space-y-3 font-mono">
              <div className="text-sm font-bold text-white tracking-tight">
                👔 STRATEGIC DOCTRINE & DECISION TREES
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded bg-indigo-950/40 border border-indigo-500/20">
                  <div className="text-[9px] text-indigo-300">AMNESIA TAX AVOIDED</div>
                  <div className="text-lg font-bold text-emerald-400">$4.2M / YR</div>
                </div>
                <div className="p-2 rounded bg-indigo-950/40 border border-indigo-500/20">
                  <div className="text-[9px] text-indigo-300">KEYSTONE MILESTONES</div>
                  <div className="text-lg font-bold text-white">12 SHIPPED</div>
                </div>
              </div>
              <div className="text-xs text-gray-300 border-l-2 border-indigo-400 pl-2.5">
                Surfaces only decisions, principles, and high-impact architectural governance.
              </div>
            </div>
          )}

          {state.activePersona === "engineer" && (
            <div className="space-y-3 font-mono">
              <div className="text-sm font-bold text-white tracking-tight">
                🛠️ ARCHITECTURE, APIS & GOTCHA GATES
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded bg-indigo-950/40 border border-indigo-500/20">
                  <div className="text-[9px] text-indigo-300">CONNECTED APIS</div>
                  <div className="text-lg font-bold text-cyan-400">48 SURFACES</div>
                </div>
                <div className="p-2 rounded bg-indigo-950/40 border border-indigo-500/20">
                  <div className="text-[9px] text-indigo-300">EFFERENT BRICKS</div>
                  <div className="text-lg font-bold text-white">106 JS MODULES</div>
                </div>
              </div>
              <div className="text-xs text-amber-300/90 border-l-2 border-amber-400 pl-2.5">
                Highlights critical gotchas, schema shapes, and execution failure barriers.
              </div>
            </div>
          )}

          {state.activePersona === "researcher" && (
            <div className="space-y-3 font-mono">
              <div className="text-sm font-bold text-white tracking-tight">
                🔬 HYPOTHESES, CONFIDENCE & CITATIONS
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded bg-indigo-950/40 border border-indigo-500/20">
                  <div className="text-[9px] text-indigo-300">ACTIVE HYPOTHESES</div>
                  <div className="text-lg font-bold text-purple-400">28 THEOREMS</div>
                </div>
                <div className="p-2 rounded bg-indigo-950/40 border border-indigo-500/20">
                  <div className="text-[9px] text-indigo-300">DECAY CONSTANT λ</div>
                  <div className="text-lg font-bold text-white">0.008 / DAY</div>
                </div>
              </div>
              <div className="text-xs text-cyan-200/90 border-l-2 border-cyan-400 pl-2.5">
                Ranks claims by temporal confidence decay e^(-λΔt) and supporting evidence.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Subtitle Telemetry Bar (Synced with Audio) */}
      <footer className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 max-w-4xl w-[90%] flex flex-col items-center">
        <div className="w-full px-8 py-4 rounded-2xl bg-[#030712]/90 border border-white/15 backdrop-blur-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] text-center">
          <p className="text-lg md:text-xl font-medium tracking-wide text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
            "{state.subtitleText}"
          </p>
        </div>
      </footer>
    </div>
  );
}
