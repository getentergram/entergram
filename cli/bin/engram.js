#!/usr/bin/env node
import { Command } from "commander";
import {
  findRoot, initRepo, writeCell, doctor, learnGit, learnDocs,
  updateCell, deleteCell, reviewQueue,
} from "../src/lib.js";
import { ensureIndex, reindex, search, indexStats } from "../src/db.js";
import { learnPRs, learnIssues } from "../src/learn.js";
import { llmAvailable } from "../src/extract.js";

const program = new Command();
program.name("engram").description("Persistent engineering memory for AI coding agents.").version("0.1.0");

function requireRoot() {
  const root = findRoot();
  if (!root) { console.error("✗ No .engram/ found. Run `engram init` first."); process.exit(1); }
  return root;
}

program.command("init").description("Scaffold engram memory in the current repo").action(() => {
  const root = process.cwd();
  const { created, path } = initRepo(root);
  console.log(created ? `✓ Initialized engram memory at ${path}` : `• Already initialized at ${path}`);
  if (created) console.log("  Next: `engram learn`, then wire your agent (Day 5: `engram serve`).");
});

program.command("remember").description("Write a fact into memory")
  .argument("<what>", "the fact / decision")
  .option("--why <why>").option("--outcome <outcome>")
  .option("--tags <tags>", "comma-separated", (v) => v.split(",").map((s) => s.trim()))
  .option("--scope <scope>", "", "global")
  .option("--type <type>", "decision|gotcha|convention|reference|architecture", "convention")
  .action((what, o) => {
    const root = requireRoot();
    const { id, file } = writeCell(root, { what, hook: what, why: o.why, outcome: o.outcome, tags: o.tags, scope: o.scope, type: o.type });
    reindex(root);
    console.log(`✓ Remembered ${id} → ${file.split("/").pop()}`);
  });

program.command("recall").description("Retrieve the facts relevant to a query")
  .argument("<query...>").option("--budget <n>", "token budget", (v) => parseInt(v, 10), 2000)
  .action((words, o) => {
    const root = requireRoot();
    ensureIndex(root);
    const q = words.join(" ");
    const { hits, tokens, total } = search(root, q, o.budget);
    if (!hits.length) return console.log(`• Nothing recalled for "${q}".`);
    console.log(`◆ ${hits.length} of ${total} matches (${tokens} tok) for "${q}":\n`);
    for (const h of hits) {
      const flag = h.confidence < 0.6 ? " ⚠unreviewed" : "";
      console.log(`  ${h.id}  [${h.tags.join(", ")}]  ${h.type}${flag}`);
      console.log(`    ${h.hook}`);
    }
  });

program.command("learn").description("Ingest git history, docs, and merged PRs into memory (incremental)")
  .option("--source <src>", "git|docs|pr|issue|all", "all")
  .option("--limit <n>", "max items to scan", (v) => parseInt(v, 10), 50)
  .option("--no-llm", "skip LLM extraction (heuristic only)")
  .action(async (o) => {
    const root = requireRoot();
    const src = o.source;
    const useLLM = o.llm !== false && llmAvailable();
    let g = { added: 0 }, d = { added: 0 }, pr = { added: 0, viaLLM: 0 }, iss = { added: 0, viaLLM: 0 };
    if (src === "git" || src === "all") g = learnGit(root, { limit: o.limit });
    if (src === "docs" || src === "all") d = learnDocs(root);
    if (src === "pr" || src === "all") pr = await learnPRs(root, { limit: o.limit, useLLM });
    if (src === "issue") iss = await learnIssues(root, { limit: o.limit, useLLM });
    reindex(root);
    const total = g.added + d.added + pr.added + iss.added;
    console.log(`✓ Learned ${total} new cell(s) — git ${g.added}, docs ${d.added}, PRs ${pr.added}${iss.added ? `, issues ${iss.added}` : ""}${(pr.viaLLM + iss.viaLLM) ? ` (${pr.viaLLM + iss.viaLLM} via LLM)` : ""}.`);
    if ((src === "pr" || src === "issue" || src === "all") && !useLLM)
      console.log("  (heuristic extraction — set ANTHROPIC_API_KEY for {decision, reason, outcome} extraction)");
    const q = reviewQueue(root).length;
    if (q) console.log(`  ${q} cell(s) await review → \`engram review\``);
  });

program.command("review").description("Triage auto-extracted cells (low confidence)")
  .option("--accept <id>", "mark reviewed (confidence 1.0)")
  .option("--reject <id>", "delete the cell")
  .option("--tag <id>", "retag a cell (with --to a,b)")
  .option("--why <id>", "set the rationale (with --to \"…\")")
  .option("--to <value>", "value for --tag / --why")
  .action((o) => {
    const root = requireRoot();
    if (o.accept) { updateCell(root, o.accept, { confidence: 1.0 }); reindex(root); return console.log(`✓ ${o.accept} accepted.`); }
    if (o.reject) { deleteCell(root, o.reject); reindex(root); return console.log(`✓ ${o.reject} rejected (deleted).`); }
    if (o.tag) { updateCell(root, o.tag, { tags: (o.to || "").split(",").map((s) => s.trim()) }); reindex(root); return console.log(`✓ ${o.tag} retagged.`); }
    if (o.why) { updateCell(root, o.why, { why: o.to || "" }); reindex(root); return console.log(`✓ ${o.why} rationale updated.`); }
    const queue = reviewQueue(root);
    if (!queue.length) return console.log("✓ Review queue empty — everything is reviewed.");
    console.log(`${queue.length} cell(s) awaiting review:\n`);
    for (const c of queue) console.log(`  ${c.id}  (conf ${c.confidence}) [${c.tags.join(", ")}]\n    ${c.hook}`);
    console.log("\nActions: --accept <id> | --reject <id> | --tag <id> --to a,b | --why <id> --to \"…\"");
  });

program.command("reindex").description("Rebuild the search index from the cells").action(() => {
  const root = requireRoot();
  const n = reindex(root);
  console.log(`✓ Reindexed ${n} cell(s).`);
});

program.command("doctor").description("Check memory health").action(() => {
  const root = requireRoot();
  const { count, problems } = doctor(root);
  const stats = indexStats(root);
  console.log(`Cells: ${count} | indexed: ${stats.total}`);
  console.log("By type: " + (stats.byType.map((t) => `${t.type} ${t.n}`).join(", ") || "—"));
  if (!problems.length) return console.log("✓ PASS — memory is consistent.");
  console.log(`✗ ${problems.length} problem(s):`); problems.forEach((p) => console.log("  - " + p));
  process.exit(1);
});

program.command("serve").description("Run the MCP server (stdio) for your agent").action(async () => {
  const { serve } = await import("../src/mcp.js");
  await serve();
});

program.parseAsync();
