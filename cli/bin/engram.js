#!/usr/bin/env node
import { Command } from "commander";
import { findRoot, initRepo, writeCell, recall, doctor, learnGit } from "../src/lib.js";

const program = new Command();
program
  .name("engram")
  .description("Persistent engineering memory for AI coding agents.")
  .version("0.1.0");

function requireRoot() {
  const root = findRoot();
  if (!root) {
    console.error("✗ No .engram/ found. Run `engram init` in your repo first.");
    process.exit(1);
  }
  return root;
}

program
  .command("init")
  .description("Scaffold engram memory in the current repo")
  .action(() => {
    const root = process.cwd();
    const { created, path } = initRepo(root);
    console.log(created ? `✓ Initialized engram memory at ${path}` : `• Already initialized at ${path}`);
    if (created) console.log("  Next: `engram learn` to ingest your git history, then wire your agent (Day 5: `engram serve`).");
  });

program
  .command("remember")
  .description("Write a fact into memory")
  .argument("<what>", "the fact / decision, stated plainly")
  .option("--why <why>", "rationale")
  .option("--outcome <outcome>", "what resulted")
  .option("--tags <tags>", "comma-separated tags", (v) => v.split(",").map((s) => s.trim()))
  .option("--scope <scope>", "where it applies", "global")
  .option("--type <type>", "decision|gotcha|convention|reference|architecture", "convention")
  .action((what, o) => {
    const root = requireRoot();
    const { id, file } = writeCell(root, { what, hook: what, why: o.why, outcome: o.outcome, tags: o.tags, scope: o.scope, type: o.type });
    console.log(`✓ Remembered ${id} → ${file.split("/").pop()}`);
  });

program
  .command("recall")
  .description("Retrieve the facts relevant to a query")
  .argument("<query...>", "what you're looking for")
  .option("--budget <n>", "token budget", (v) => parseInt(v, 10), 2000)
  .action((queryWords, o) => {
    const root = requireRoot();
    const q = queryWords.join(" ");
    const { hits, tokens, total } = recall(root, q, o.budget);
    if (!hits.length) return console.log(`• Nothing recalled for "${q}".`);
    console.log(`◆ ${hits.length} of ${total} matches (${tokens} tok) for "${q}":\n`);
    for (const h of hits) {
      console.log(`  ${h.id}  [${h.tags.join(", ")}]`);
      console.log(`    ${h.hook}`);
    }
  });

program
  .command("learn")
  .description("Ingest git history into memory (incremental)")
  .option("--limit <n>", "max commits to scan", (v) => parseInt(v, 10), 50)
  .action((o) => {
    const root = requireRoot();
    const { added, skipped } = learnGit(root, { limit: o.limit });
    console.log(`✓ Learned ${added} new cell(s), skipped ${skipped} (seen/low-signal).`);
    if (added) console.log("  Tip: `engram review` (Day 4) will let you refine auto-extracted cells.");
  });

program
  .command("doctor")
  .description("Check memory health")
  .action(() => {
    const root = requireRoot();
    const { count, problems } = doctor(root);
    console.log(`Cells: ${count}`);
    if (!problems.length) return console.log("✓ PASS — memory is consistent.");
    console.log(`✗ ${problems.length} problem(s):`);
    problems.forEach((p) => console.log("  - " + p));
    process.exit(1);
  });

program
  .command("serve")
  .description("Run the MCP server for your agent (Claude Code / Cursor / Windsurf)")
  .action(() => {
    console.log("• MCP server lands on Day 5. It will expose recall/remember/learn as MCP tools over stdio.");
    console.log("  Wiring preview (Claude Code .mcp.json):");
    console.log('  { "mcpServers": { "engram": { "command": "engram", "args": ["serve"] } } }');
  });

program.parseAsync();
