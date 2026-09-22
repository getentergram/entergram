"use client";

import { useEffect, useState, useRef } from "react";
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
  const { setPersona, select } = useBrain();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [state, setState] = useState<TelemetryState>({
    activeScene: 1,
    sceneTitle: "BRAIN OS",
    sceneSubtitle: "The Enterprise Knowledge Connectome",
    showSplash: true,
    activeHud: "overview",
    activePersona: "architect",
    subtitleText: "Knowledge isn't static. It's alive.",
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
      showTitle: (title: string, subtitle: string, durationMs: number = 3500) => {
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
                  zoom: 1.35,
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
                fit: { padding: 45 },
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
  }, [setPersona, select]);

  // Particle Synapse Pulses Canvas Animation (60fps continuous)
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
      if (!edges || edges.length === 0) return;

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
        speed: isPath ? 0.03 : 0.015 + Math.random() * 0.015,
        size: isPath ? 5.0 : 3.0,
        color: isPath ? "#38bdf8" : "#818cf8",
      });

      if (particles.length > 90) particles.shift();
    }, 100);

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

        const grad = ctx.createRadialGradient(currX, currY, 0, currX, currY, p.size * 3.5);
        grad.addColorStop(0, p.color);
        grad.addColorStop(0.5, p.color);
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
      {/* Particle Synapse Canvas Overlay */}
      <canvas ref={canvasRef} className="absolute inset-0 z-10 pointer-events-none" />

      {/* Top Palantir Gotham Telemetry Header */}
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-8 py-4 bg-gradient-to-b from-[#030712]/95 via-[#030712]/70 to-transparent border-b border-cyan-500/20">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center">
            <span className="absolute w-3.5 h-3.5 rounded-full bg-cyan-400 animate-ping opacity-75" />
            <span className="relative w-2.5 h-2.5 rounded-full bg-cyan-400" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-widest text-white uppercase drop-shadow-[0_0_15px_rgba(56,189,248,0.7)]">
                BRAIN OS
              </span>
              <span className="text-[10px] font-mono tracking-widest px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 uppercase">
                ENTERPRISE CONNECTOME
              </span>
            </div>
            <span className="text-[11px] font-mono text-cyan-200/70 tracking-wider">
              LIVING KNOWLEDGE NETWORK // 215 NEURONS · 832 SYNAPSES
            </span>
          </div>
        </div>

        <div className="flex items-center gap-8 text-xs font-mono">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">STATUS</span>
            <span className="text-cyan-400 font-semibold tracking-wider">LIVE AUTONOMOUS CONNECTOME</span>
          </div>
          <div className="h-6 w-px bg-cyan-500/20" />
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">MODULARITY</span>
            <span className="text-emerald-400 font-semibold tracking-wider">17 GALAXY CLUSTERS (Q=0.742)</span>
          </div>
          <div className="h-6 w-px bg-cyan-500/20" />
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">CITATION RECALL</span>
            <span className="text-indigo-300 font-semibold tracking-wider">&lt; 0.8ms LATENCY</span>
          </div>
        </div>
      </header>

      {/* Floating Apple Keynote Splash Title Card */}
      {state.showSplash && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/65 backdrop-blur-lg transition-opacity duration-1000">
          <div className="flex flex-col items-center text-center max-w-4xl px-10 py-12 rounded-3xl bg-gradient-to-b from-white/10 to-white/[0.02] border border-white/20 shadow-[0_0_90px_rgba(56,189,248,0.25)]">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 mb-6 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-mono uppercase tracking-widest">
              <span>●</span> SCENE 0{state.activeScene} // THE CONNECTOME REVEAL
            </div>
            <h1 className="text-6xl md:text-7xl font-bold tracking-tight text-white drop-shadow-[0_0_40px_rgba(255,255,255,0.5)] mb-4">
              {state.sceneTitle}
            </h1>
            <p className="text-2xl md:text-3xl text-cyan-200/85 font-light tracking-wide max-w-2xl">
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
              className="px-5 py-2 rounded-full bg-cyan-950/90 border border-cyan-400/50 backdrop-blur-xl text-cyan-200 text-xs font-mono tracking-wider shadow-[0_0_25px_rgba(56,189,248,0.35)]"
            >
              ✦ {cat}
            </div>
          ))}
        </div>
      )}

      {/* Scene 3: Knowledge Hub Telemetry Card */}
      {state.activeHud === "hub" && (
        <div className="absolute top-24 left-8 z-30 w-[400px] rounded-2xl bg-gray-950/90 border border-cyan-500/50 backdrop-blur-2xl p-5 shadow-[0_0_50px_rgba(56,189,248,0.3)]">
          <div className="flex items-center justify-between pb-3 border-b border-cyan-500/30 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-300">
                CRITICAL KNOWLEDGE HUB
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold">
              RANK #1
            </span>
          </div>

          <div className="space-y-3 font-mono">
            <div>
              <div className="text-[10px] text-gray-400 uppercase">NEURON IDENTITY</div>
              <div className="text-base font-bold text-white tracking-tight">
                B-059 // Neurodynamic Principles
              </div>
              <div className="text-xs text-cyan-200/80">Rosenblatt S/A/R Perceptron Connectome</div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-cyan-500/20">
              <div className="p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-500/30">
                <div className="text-[9px] text-cyan-400 uppercase">BETWEENNESS CENTRALITY</div>
                <div className="text-xl font-bold text-cyan-300">96.4%</div>
              </div>
              <div className="p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-500/30">
                <div className="text-[9px] text-cyan-400 uppercase">PAGERANK IMPACT</div>
                <div className="text-xl font-bold text-white">0.0841</div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-500/30">
              <div className="flex justify-between text-[10px] text-gray-300 mb-1">
                <span>SYNAPTIC CITATIONS</span>
                <span className="text-cyan-300 font-bold">42 Synapses Active</span>
              </div>
              <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-cyan-500 to-indigo-400 h-full w-[96%]" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scene 3: Shortest Causal Path Reasoning Card */}
      {state.activeHud === "path" && (
        <div className="absolute top-24 right-8 z-30 w-[440px] rounded-2xl bg-gray-950/90 border border-cyan-400/50 backdrop-blur-2xl p-5 shadow-[0_0_50px_rgba(56,189,248,0.3)]">
          <div className="flex items-center justify-between pb-3 border-b border-cyan-500/30 mb-3">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-300">
              ⚡ SHORTEST CAUSAL REASONING PATH
            </span>
            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
              3 HOPS · CONFIDENCE 0.94
            </span>
          </div>

          <div className="space-y-2.5 font-mono text-xs">
            <div className="flex items-center gap-3 p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-400/40">
              <span className="w-6 h-6 rounded-full bg-cyan-500 text-black flex items-center justify-center font-bold text-xs">
                1
              </span>
              <div className="truncate">
                <div className="font-bold text-white">B-059 · Neurodynamic Principles</div>
                <div className="text-[10px] text-cyan-300">Perceptron Memory Model (2026-06)</div>
              </div>
            </div>

            <div className="flex justify-center text-cyan-400 text-xs py-0.5 font-bold">
              ↓ <span className="text-[10px] ml-1 text-cyan-200/70">[caused_by]</span>
            </div>

            <div className="flex items-center gap-3 p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-400/40">
              <span className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-xs">
                2
              </span>
              <div className="truncate">
                <div className="font-bold text-white">B-203 · Anatomy Architecture</div>
                <div className="text-[10px] text-indigo-300">Substrate Runtime Adapter (2026-08)</div>
              </div>
            </div>

            <div className="flex justify-center text-cyan-400 text-xs py-0.5 font-bold">
              ↓ <span className="text-[10px] ml-1 text-cyan-200/70">[cites]</span>
            </div>

            <div className="flex items-center gap-3 p-2.5 rounded-lg bg-cyan-950/60 border border-cyan-400/40">
              <span className="w-6 h-6 rounded-full bg-emerald-400 text-black flex items-center justify-center font-bold text-xs">
                3
              </span>
              <div className="truncate">
                <div className="font-bold text-white">B-216 · Cellular Runtime & MARL</div>
                <div className="text-[10px] text-emerald-300">Autonomous Execution Unit (2026-08)</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scene 4: Multi-Persona Holographic HUD Card */}
      {state.activeHud === "persona" && (
        <div className="absolute top-24 left-8 z-30 w-[420px] rounded-2xl bg-gray-950/95 border border-indigo-500/50 backdrop-blur-2xl p-5 shadow-[0_0_50px_rgba(99,102,241,0.3)]">
          <div className="flex items-center justify-between pb-3 border-b border-indigo-500/30 mb-3">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-300">
              PERSONA QUERY ENGINE
            </span>
            <span className="text-[10px] font-mono px-3 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 uppercase font-bold border border-indigo-400/40">
              {state.activePersona}
            </span>
          </div>

          {state.activePersona === "executive" && (
            <div className="space-y-3 font-mono">
              <div className="text-sm font-bold text-white tracking-tight">
                👔 STRATEGIC DOCTRINE & DECISION TREES
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded bg-indigo-950/50 border border-indigo-500/30">
                  <div className="text-[9px] text-indigo-300">AMNESIA TAX SAVINGS</div>
                  <div className="text-xl font-bold text-emerald-400">$4.2M / YR</div>
                </div>
                <div className="p-2.5 rounded bg-indigo-950/50 border border-indigo-500/30">
                  <div className="text-[9px] text-indigo-300">FIRST-TO-FILE MILESTONES</div>
                  <div className="text-xl font-bold text-white">12 SHIPPED</div>
                </div>
              </div>
              <div className="text-xs text-gray-300 border-l-2 border-indigo-400 pl-2.5">
                Isolates strategic governance, ROI models, and milestone dependencies.
              </div>
            </div>
          )}

          {state.activePersona === "engineer" && (
            <div className="space-y-3 font-mono">
              <div className="text-sm font-bold text-white tracking-tight">
                🛠️ ARCHITECTURE, APIS & GOTCHA GATES
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded bg-indigo-950/50 border border-indigo-500/30">
                  <div className="text-[9px] text-indigo-300">CONNECTED APIS</div>
                  <div className="text-xl font-bold text-cyan-400">48 SURFACES</div>
                </div>
                <div className="p-2.5 rounded bg-indigo-950/50 border border-indigo-500/30">
                  <div className="text-[9px] text-indigo-300">EFFERENT BRICKS</div>
                  <div className="text-xl font-bold text-white">106 MODULES</div>
                </div>
              </div>
              <div className="text-xs text-amber-300/90 border-l-2 border-amber-400 pl-2.5">
                Surfaces execution gotchas, schema shapes, and amygdala safety boundaries.
              </div>
            </div>
          )}

          {state.activePersona === "researcher" && (
            <div className="space-y-3 font-mono">
              <div className="text-sm font-bold text-white tracking-tight">
                🔬 HYPOTHESES, CONFIDENCE & CITATIONS
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded bg-indigo-950/50 border border-indigo-500/30">
                  <div className="text-[9px] text-indigo-300">ACTIVE HYPOTHESES</div>
                  <div className="text-xl font-bold text-purple-400">28 THEOREMS</div>
                </div>
                <div className="p-2.5 rounded bg-indigo-950/50 border border-indigo-500/30">
                  <div className="text-[9px] text-indigo-300">DECAY RATE λ</div>
                  <div className="text-xl font-bold text-white">0.008 / DAY</div>
                </div>
              </div>
              <div className="text-xs text-cyan-200/90 border-l-2 border-cyan-400 pl-2.5">
                Tracks temporal confidence decay e^(-λΔt) and 1,282 literature citations.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scene 5: Floating Timeline & Evolution HUD */}
      {state.activeHud === "timeline" && (
        <div className="absolute top-24 left-8 z-30 w-[450px] rounded-2xl bg-gray-950/95 border border-cyan-500/50 backdrop-blur-2xl p-5 shadow-[0_0_50px_rgba(56,189,248,0.3)]">
          <div className="flex items-center justify-between pb-3 border-b border-cyan-500/30 mb-3">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-cyan-300">
              ⏳ MULTI-TRACK TEMPORAL EVOLUTION
            </span>
            <span className="text-[10px] font-mono px-2.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold">
              2026-06 → 2026-08
            </span>
          </div>

          <div className="space-y-2.5 font-mono text-xs">
            <div className="p-2 rounded bg-cyan-950/50 border border-cyan-500/30 flex justify-between items-center">
              <div>
                <div className="font-bold text-white">Lane 1: CARMA EKS & Regulatory</div>
                <div className="text-[10px] text-cyan-300">42 Milestones · Shipped</div>
              </div>
              <span className="text-emerald-400 font-bold">100%</span>
            </div>

            <div className="p-2 rounded bg-cyan-950/50 border border-cyan-500/30 flex justify-between items-center">
              <div>
                <div className="font-bold text-white">Lane 2: L-Plane Substrate Gateway</div>
                <div className="text-[10px] text-cyan-300">68 Neurons · Active</div>
              </div>
              <span className="text-emerald-400 font-bold">100%</span>
            </div>

            <div className="p-2 rounded bg-cyan-950/50 border border-cyan-500/30 flex justify-between items-center">
              <div>
                <div className="font-bold text-white">Lane 3: Entergram Cellular Runtime</div>
                <div className="text-[10px] text-cyan-300">105 Neurons · PR #2 Shipped</div>
              </div>
              <span className="text-cyan-400 font-bold">ACTIVE</span>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Subtitle Telemetry Bar (Word-for-word Synced) */}
      <footer className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 max-w-4xl w-[92%] flex flex-col items-center">
        <div className="w-full px-8 py-4 rounded-2xl bg-[#030712]/95 border border-cyan-400/30 backdrop-blur-2xl shadow-[0_10px_50px_rgba(0,0,0,0.9)] text-center">
          <p className="text-lg md:text-xl font-medium tracking-wide text-white drop-shadow-[0_2px_12px_rgba(0,0,0,1)]">
            "{state.subtitleText}"
          </p>
        </div>
      </footer>
    </div>
  );
}
