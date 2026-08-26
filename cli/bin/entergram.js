#!/usr/bin/env node
import { Command } from "commander";
import {
  findRoot, initRepo, writeCell, doctor, learnGit, learnDocs,
  updateCell, deleteCell, reviewQueue,
} from "../src/lib.js";
import { ensureIndex, reindex, search, dispatch, indexStats, traceDecision } from "../src/db.js";
import { learnPRs, learnIssues } from "../src/learn.js";
import { llmAvailable } from "../src/extract.js";
import {
  formatSuccess, formatError, formatInfo, formatList, formatDispatch, formatLearnSummary,
  formatProvenance, formatTelemetry, formatNetworkStats,
} from "../src/output.js";
import { getTelemetryStats } from "../src/rl/telemetry.js";
import { SynapticNetwork } from "../src/runtime/synaptic_network.js";
import { applySupervisorMutation } from "../src/runtime/mutation_tracker.js";

const program = new Command();
program.name("get-entergram").description("Persistent engineering memory for AI coding agents.").version("0.1.0");

function requireRoot(dir) {
  const root = findRoot(dir || process.cwd());
  if (!root) { console.error(formatError(`No memory store found in ${dir || process.cwd()}. Run \`get-entergram init\` first.`)); process.exit(1); }
  return root;
}

program.command("init").description("Set up a memory store for this repository").action(() => {
  const root = process.cwd();
  const { created, path } = initRepo(root);
  console.log(created ? formatSuccess(`Initialized memory at ${path}`) : formatInfo(`Memory already exists at ${path}`));
  if (created) console.log(formatInfo("Next: run `get-entergram learn` and then connect your agent with `get-entergram serve`."));
});

program.command("remember").description("Save a fact or decision into memory")
  .argument("<what>", "the fact / decision")
  .option("--why <why>").option("--outcome <outcome>")
  .option("--tags <tags>", "comma-separated", (v) => v.split(",").map((s) => s.trim()))
  .option("--scope <scope>", "", "global")
  .option("--type <type>", "decision|gotcha|convention|reference|architecture|procedure", "convention")
  .action((what, o) => {
    const root = requireRoot();
    const { id, file } = writeCell(root, { what, hook: what, why: o.why, outcome: o.outcome, tags: o.tags, scope: o.scope, type: o.type });
    reindex(root);
    console.log(formatSuccess(`Saved ${id} → ${file.split("/").pop()}`));
  });

program.command("recall").description("Retrieve the facts relevant to a query")
  .argument("<query...>").option("--budget <n>", "token budget", (v) => parseInt(v, 10), 2000)
  .action((words, o) => {
    const root = requireRoot();
    ensureIndex(root);
    const q = words.join(" ");
    const { hits, tokens, total, synthesis } = search(root, q, o.budget);
    if (!hits.length) return console.log(formatInfo(`No matches found for "${q}".`));
    console.log(`◆ ${hits.length} of ${total} matches (${tokens} tok) for "${q}":\n`);
    for (const h of hits) {
      const flag = h.confidence < 0.6 ? " ⚠unreviewed" : "";
      console.log(`  ${h.id}  [${h.tags.join(", ")}]  ${h.type}${flag}`);
      console.log(`    ${h.hook}`);
    }
    if (synthesis) console.log(`\n${synthesis}`);
  });

program.command("dispatch").description("Select the strongest-matching procedure for a query, or fall back to recall")
  .argument("<query...>").option("--budget <n>", "token budget for the recall fallback", (v) => parseInt(v, 10), 2000)
  .action((words, o) => {
    const root = requireRoot();
    ensureIndex(root);
    const q = words.join(" ");
    const result = dispatch(root, q, o.budget);
    console.log(formatDispatch(result, q));
  });

program.command("trace").description("Trace the causal provenance tree of an architectural decision")
  .argument("<id>", "Cell ID (e.g. B-0001)")
  .action((id) => {
    const root = requireRoot();
    ensureIndex(root);
    const trace = traceDecision(root, id);
    if (!trace.found) {
      console.error(formatError(trace.error || `Cell ${id} not found.`));
      process.exit(1);
    }
    console.log(formatProvenance(trace));
  });

program.command("network").description("Display active cellular synaptic network metrics and dendritic graph").action(() => {
  const root = requireRoot();
  ensureIndex(root);
  const network = SynapticNetwork.load(root);
  console.log(formatNetworkStats(network.getStats()));
});

program.command("stimulate").description("Stimulate the living cellular network with a query and view activation potentials")
  .argument("<query...>", "Query to stimulate the network")
  .action((words) => {
    const root = requireRoot();
    ensureIndex(root);
    const network = SynapticNetwork.load(root);
    const q = words.join(" ");
    const activations = network.stimulate(q);
    if (!activations.length) return console.log(formatInfo(`No cells stimulated above threshold for "${q}".`));
    console.log(`⚡ Top cellular excitations for "${q}":\n`);
    for (const a of activations.slice(0, 8)) {
      const bar = "█".repeat(Math.round(a.potential * 10)).padEnd(10, "░");
      console.log(`  ${a.cell.id} [${bar} ${(a.potential * 100).toFixed(0)}%] (${a.cell.type}) ${a.cell.hook}`);
    }
  });

program.command("mutate").description("Apply a supervisor mutation gradient or view cell parameters")
  .argument("<id>", "Cell ID (e.g. B-0010)")
  .option("--hook <text>", "Updated hook text")
  .option("--why <reason>", "Updated rationale")
  .action((id, o) => {
    const root = requireRoot();
    ensureIndex(root);
    const network = SynapticNetwork.load(root);
    const cell = network.getCell(id);
    if (!cell) {
      console.error(formatError(`Cell ${id} not found.`));
      process.exit(1);
    }

    if (o.hook || o.why) {
      const updateData = {};
      if (o.hook) updateData.hook = o.hook;
      if (o.why) updateData.why = o.why;
      const res = applySupervisorMutation(cell, updateData, o.hook || o.why, 1.0);
      network.save(root);
      updateCell(root, id, updateData);
      console.log(formatSuccess(`Applied supervisor mutation to ${id}:`));
      console.log(`  • Threshold barrier: ${res.newThreshold} (shift ${res.thresholdShift >= 0 ? '+' : ''}${res.thresholdShift})`);
      console.log(`  • Metaplasticity η:  ${res.newPlasticity} (shift ${res.plasticityShift >= 0 ? '+' : ''}${res.plasticityShift})`);
    } else {
      console.log(`Cell ${id} Synaptic Parameters:`);
      console.log(`  • Status:        ${cell.status}`);
      console.log(`  • Threshold θ:   ${cell.threshold}`);
      console.log(`  • Plasticity η:  ${cell.plasticity}`);
      console.log(`  • Resolutions:   ${cell.resolutions}`);
      console.log(`  • Failures:      ${cell.failures}`);
      console.log(`  • Dendrites:     ${cell.dendrites.size} active link(s)`);
      if (cell.mutationHistory.length) {
        console.log(`  • Mutation log:  ${cell.mutationHistory.length} supervisor edit(s)`);
      }
    }
  });

program.command("telemetry").description("Show RL telemetry and decision intelligence metrics").action(() => {
  const root = requireRoot();
  const stats = getTelemetryStats(root);
  console.log(formatTelemetry(stats));
});

program.command("learn").description("Ingest Git history, docs, and PRs into memory")
  .option("--source <src>", "git|docs|pr|issue|all", "all")
  .option("--limit <n>", "max items to scan", (v) => parseInt(v, 10), 50)
  .option("--since <sha>", "only commits after this SHA (git source)")
  .option("--no-llm", "skip LLM extraction (heuristic only)")
  .action(async (o) => {
    const root = requireRoot();
    const src = o.source;
    const useLLM = o.llm !== false && llmAvailable();
    let g = { added: 0, merged: 0 }, d = { added: 0, merged: 0 }, pr = { added: 0, merged: 0, viaLLM: 0 }, iss = { added: 0, merged: 0, viaLLM: 0 };
    if (src === "git" || src === "all") g = learnGit(root, { limit: o.limit, since: o.since });
    if (src === "docs" || src === "all") d = learnDocs(root);
    if (src === "pr" || src === "all") pr = await learnPRs(root, { limit: o.limit, useLLM });
    if (src === "issue") iss = await learnIssues(root, { limit: o.limit, useLLM });
    reindex(root);
    const total = g.added + d.added + pr.added + iss.added;
    const merged = (g.merged || 0) + (d.merged || 0) + (pr.merged || 0) + (iss.merged || 0);
    console.log(formatSuccess(formatLearnSummary({
      added: total,
      merged,
      git: g.added,
      docs: d.added,
      pr: pr.added,
      issue: iss.added,
      viaLLM: pr.viaLLM + iss.viaLLM,
    })));
    if ((src === "pr" || src === "issue" || src === "all") && !useLLM)
      console.log(formatInfo("Heuristic extraction is running. Set GEMINI_API_KEY (or ANTHROPIC_API_KEY) for richer decision and outcome extraction."));
    const q = reviewQueue(root).length;
    if (q) console.log(formatInfo(`${q} memory cells need a review. Run \`get-entergram review\`.`));
  });

program.command("review").description("Review low-confidence memory cells")
  .option("--accept <id>", "mark reviewed (confidence 1.0)")
  .option("--reject <id>", "delete the cell")
  .option("--tag <id>", "retag a cell (with --to a,b)")
  .option("--why <id>", "set the rationale (with --to \"…\")")
  .option("--to <value>", "value for --tag / --why")
  .action((o) => {
    const root = requireRoot();
    if (o.accept) { updateCell(root, o.accept, { confidence: 1.0 }); reindex(root); return console.log(formatSuccess(`${o.accept} accepted.`)); }
    if (o.reject) { deleteCell(root, o.reject); reindex(root); return console.log(formatSuccess(`${o.reject} rejected and removed.`)); }
    if (o.tag) { updateCell(root, o.tag, { tags: (o.to || "").split(",").map((s) => s.trim()) }); reindex(root); return console.log(formatSuccess(`${o.tag} retagged.`)); }
    if (o.why) { updateCell(root, o.why, { why: o.to || "" }); reindex(root); return console.log(formatSuccess(`${o.why} rationale updated.`)); }
    const queue = reviewQueue(root);
    if (!queue.length) return console.log(formatSuccess("Review queue is empty."));
    console.log(`${queue.length} memory cell(s) awaiting review:\n`);
    for (const c of queue) console.log(`  ${c.id}  (conf ${c.confidence}) [${c.tags.join(", ")}]\n    ${c.hook}`);
    console.log("\nActions: --accept <id> | --reject <id> | --tag <id> --to a,b | --why <id> --to \"…\"");
  });

program.command("reindex [dir]").description("Rebuild the search index from memory cells").action((dir) => {
  const root = requireRoot(dir);
  const n = reindex(root);
  console.log(formatSuccess(`Reindexed ${n} memory cell(s).`));
});

program.command("doctor [dir]").description("Check memory health").action((dir) => {
  const root = requireRoot(dir);
  const { count, problems } = doctor(root);
  const stats = indexStats(root);
  console.log(`Memory cells: ${count} | indexed: ${stats.total}`);
  console.log("By type: " + (stats.byType.map((t) => `${t.type} ${t.n}`).join(", ") || "—"));
  const wm = stats.watermarks.filter((w) => w.count > 0);
  if (wm.length) console.log("Ingested: " + wm.map((w) => `${w.source_kind} ${w.count}`).join(", "));

  if (stats.staleDecisions && stats.staleDecisions.length > 0) {
    console.log(formatInfo(`${stats.staleDecisions.length} stale decision(s) detected:`));
    for (const s of stats.staleDecisions) {
      console.log(`  • ${s.id} (conf ${s.currentConfidence}): ${s.hook}`);
      console.log(`    ${s.reason}`);
    }
  }

  if (!problems.length) return console.log(formatSuccess("Memory is consistent."));
  console.log(formatError(`${problems.length} issue(s) found:`)); problems.forEach((p) => console.log("  - " + p));
  process.exit(1);
});

program.command("serve").description("Run the MCP server (stdio) for your agent").action(async () => {
  const { serve } = await import("../src/mcp.js");
  await serve();
});

program.command("viz [dir]").description("Open the visual brain — explore memory as a living knowledge graph")
  .option("-p, --port <port>", "port to listen on", "4700")
  .option("--host <host>", "interface to bind (loopback only unless you know why)", "127.0.0.1")
  .option("--no-open", "don't open a browser")
  .action(async (dir, opts) => {
    const storeDir = typeof dir === "string" ? dir : undefined;
    const options = typeof dir === "object" && dir !== null ? dir : opts;
    const root = requireRoot(storeDir);
    const { startVizServer } = await import("../src/viz/server.js");
    const server = await startVizServer(root, { port: Number(options.port || 4700), host: options.host || "127.0.0.1" });

    if (!server.uiDir) {
      console.log(formatError("UI bundle missing — the API is up but there's nothing to render."));
      console.log(formatInfo("Build it with: pnpm --dir apps/viz install && pnpm --dir apps/viz build"));
    }
    console.log(formatSuccess(`Brain OS running at ${server.url}`));
    console.log(formatInfo(`Store: ${root}`));
    if (server.plugins.length) console.log(formatInfo(`Plugins: ${server.plugins.join(", ")}`));
    if (options.host && options.host !== "127.0.0.1" && options.host !== "localhost") {
      console.log(formatError(`Bound to ${options.host} — this serves your full memory text to the network.`));
    }

    if (options.open) {
      const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      const { spawn } = await import("node:child_process");
      spawn(opener, [server.url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
    }

    const shutdown = async () => { await server.close(); process.exit(0); };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });

program.parseAsync();
