// MCP server — exposes entergram memory as tools any MCP client (Claude Code, Cursor,
// Windsurf, Continue) can call over stdio. IMPORTANT: in stdio mode the protocol owns
// stdout; all human/status output MUST go to stderr.
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { findRoot, writeCell, learnGit, learnDocs, doctor, readCells } from "./lib.js";
import { ensureIndex, reindex, search, dispatch, indexStats, traceDecision } from "./db.js";
import { learnPRs } from "./learn.js";
import { formatProvenance } from "./output.js";
import { recordFeedback } from "./rl/rewards.js";
import { SynapticNetwork } from "./runtime/synaptic_network.js";

const textResult = (text) => ({ content: [{ type: "text", text }] });

export async function serve() {
  const root = findRoot();
  if (!root) {
    process.stderr.write("get-entergram serve: no .entergram/ found — run `get-entergram init` first.\n");
    process.exit(1);
  }

  const server = new McpServer({ name: "get-entergram", version: "0.1.0" });

  server.registerTool(
    "recall",
    {
      title: "Recall engineering memory",
      description:
        "Retrieve the decisions, rationale, and facts most relevant to a query, ranked using RL hybrid retrieval (BM25 + vector + temporal validity), packed under a token budget. Call this BEFORE answering questions about the codebase's architecture, past decisions, or history — it's cheaper than re-deriving.",
      inputSchema: {
        query: z.string().describe("what you're looking for"),
        budget: z.number().optional().describe("token budget (default 2000)"),
      },
    },
    async ({ query, budget }) => {
      ensureIndex(root);
      const { hits, total, synthesis } = search(root, query, budget ?? 2000);
      if (!hits.length) return textResult(`No memory matches "${query}".`);
      const body = hits
        .map((h) => `- ${h.id} [${h.tags.join(", ")}] (${h.type}${h.confidence < 0.6 ? ", unreviewed" : ""})\n  ${h.hook}`)
        .join("\n");
      return textResult(`${hits.length}/${total} relevant memories for "${query}":\n${body}\n\n${synthesis}`);
    },
  );

  server.registerTool(
    "dispatch",
    {
      title: "Dispatch: select a procedure, or fall back to recall",
      description:
        "Select the strongest-matching action for a query: a citable procedure bound to an effector script, if one is a stronger match than any fact AND its effector actually exists on disk — otherwise the same result `recall` would return. dispatch NEVER runs, spawns, or shells out to the effector; it only reports which one would fire and why. Running it is always your decision.",
      inputSchema: {
        query: z.string().describe("what you're trying to do"),
        budget: z.number().optional().describe("token budget for the recall fallback (default 2000)"),
      },
    },
    async ({ query, budget }) => {
      ensureIndex(root);
      const result = dispatch(root, query, budget ?? 2000);
      if (result.winner === "procedure") {
        const { cell, effectorPath, why, citedProcedures } = result;
        const cites = citedProcedures?.length
          ? `\nCites: ${citedProcedures.map((c) => `${c.id} (${c.hook})`).join(", ")}`
          : "";
        return textResult(
          `Procedure ${cell.id} [${cell.tags.join(", ")}] matched: ${cell.hook}\nEffector: ${effectorPath}\n${why}${cites}\n(This is a selection only — nothing has been executed.)`,
        );
      }
      const { hits, total, synthesis } = result;
      if (!hits.length) return textResult(`No procedure or memory matches "${query}".`);
      const body = hits
        .map((h) => `- ${h.id} [${h.tags.join(", ")}] (${h.type}${h.confidence < 0.6 ? ", unreviewed" : ""})\n  ${h.hook}`)
        .join("\n");
      return textResult(`No procedure matched strongly enough — falling back to recall. ${hits.length}/${total} relevant memories for "${query}":\n${body}\n\n${synthesis}`);
    },
  );

  server.registerTool(
    "trace",
    {
      title: "Trace decision provenance",
      description: "Trace the full causal provenance tree for a decision: alternatives considered, why options were rejected, governing constraints, and superseding chains.",
      inputSchema: {
        id: z.string().describe("Cell ID (e.g. B-0012)"),
      },
    },
    async ({ id }) => {
      ensureIndex(root);
      const trace = traceDecision(root, id);
      return textResult(formatProvenance(trace));
    },
  );

  server.registerTool(
    "stimulate",
    {
      title: "Stimulate synaptic network",
      description: "Evaluate raw activation potentials across all living brain cells in the cognitive network in sub-millisecond execution time.",
      inputSchema: {
        query: z.string().describe("Context or intent to stimulate with"),
      },
    },
    async ({ query }) => {
      ensureIndex(root);
      const network = SynapticNetwork.load(root);
      const activations = network.stimulate(query);
      if (!activations.length) return textResult(`No cells stimulated for "${query}".`);
      const lines = activations.slice(0, 6).map((a) => `- ${a.cell.id} (${(a.potential * 100).toFixed(0)}% potential, ${a.cell.type}): ${a.cell.hook}`);
      return textResult(`Active cellular assembly for "${query}":\n${lines.join("\n")}`);
    },
  );

  server.registerTool(
    "feedback",
    {
      title: "Report memory outcome feedback",
      description: "Report whether a recalled memory was useful, cited, or led to a successful code change. Updates the RL contextual bandit and Hebbian weights.",
      inputSchema: {
        cell_id: z.string().describe("Cell ID that received feedback"),
        outcome: z.enum(["cited", "commit_landed", "pr_merged", "dismissed", "prevented_bug"]).describe("Outcome type"),
      },
    },
    async ({ cell_id, outcome }) => {
      const signals = {
        cited: outcome === "cited",
        commitLanded: outcome === "commit_landed",
        prMerged: outcome === "pr_merged",
        dismissed: outcome === "dismissed",
        preventedRegression: outcome === "prevented_bug",
      };
      const cell = readCells(root).find((c) => c.id === cell_id);
      const res = recordFeedback(root, `mcp-fb-${Date.now()}`, signals, cell);
      return textResult(`Feedback recorded for ${cell_id} (reward: ${res.reward}).`);
    },
  );

  server.registerTool(
    "remember",
    {
      title: "Remember a fact",
      description:
        "Persist a durable engineering fact or decision so future sessions recall it instead of re-deriving. Use for architecture decisions, gotchas, and conventions.",
      inputSchema: {
        what: z.string().describe("the fact/decision, stated plainly"),
        why: z.string().optional().describe("rationale"),
        tags: z.array(z.string()).optional(),
        scope: z.string().optional(),
        type: z.enum(["decision", "gotcha", "convention", "reference", "architecture", "procedure"]).optional(),
      },
    },
    async ({ what, why, tags, scope, type }) => {
      const { id } = writeCell(root, { what, hook: what, why, tags, scope: scope || "global", type: type || "convention" });
      reindex(root);
      return textResult(`Remembered ${id}.`);
    },
  );

  server.registerTool(
    "learn",
    {
      title: "Learn from the repo",
      description: "Ingest recent git history, docs/README/ADRs, and merged PRs into memory (incremental — skips already-seen and low-signal items). PRs are extracted into {decision, reason, outcome} when GEMINI_API_KEY or ANTHROPIC_API_KEY is set.",
      inputSchema: {
        source: z.enum(["all", "git", "docs", "pr"]).optional(),
        limit: z.number().optional().describe("max items to scan (default 50)"),
      },
    },
    async ({ source, limit }) => {
      const src = source || "all";
      let g = { added: 0 }, d = { added: 0 }, pr = { added: 0 };
      if (src === "git" || src === "all") g = learnGit(root, { limit: limit ?? 50 });
      if (src === "docs" || src === "all") d = learnDocs(root);
      if (src === "pr" || src === "all") pr = await learnPRs(root, { limit: limit ?? 50 });
      reindex(root);
      return textResult(`Learned ${g.added + d.added + pr.added} new cell(s) (git ${g.added}, docs ${d.added}, PRs ${pr.added}).`);
    },
  );

  server.registerTool(
    "doctor",
    { title: "Memory health", description: "Report memory health, index coverage, and stale decisions.", inputSchema: {} },
    async () => {
      const { count, problems } = doctor(root);
      const stats = indexStats(root);
      const staleStr = stats.staleDecisions?.length ? ` ${stats.staleDecisions.length} stale decision(s).` : "";
      return textResult(`Cells ${count}, indexed ${stats.total}.${staleStr} ${problems.length ? problems.length + " problem(s)." : "Consistent."}`);
    },
  );

  server.registerResource(
    "cell",
    new ResourceTemplate("get-entergram://cell/{id}", { list: undefined }),
    { title: "Memory cell", description: "One entergram memory cell's raw markdown, by id (e.g. B-0012)." },
    async (uri, { id }) => {
      const cell = readCells(root).find((c) => c.id === id);
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: cell ? cell.text : `No cell ${id}.` }],
      };
    },
  );

  server.registerResource(
    "index",
    "get-entergram://index",
    { title: "Memory index", description: "One line per cell: id, type, tags, hook — the recall-addressable map." },
    async (uri) => {
      const cells = readCells(root);
      const text = cells
        .map((c) => `${c.id}  [${(c.tags || []).join(", ")}]  ${c.type}  — ${c.hook}`)
        .join("\n") || "(empty)";
      return { contents: [{ uri: uri.href, mimeType: "text/plain", text }] };
    },
  );

  await server.connect(new StdioServerTransport());
  process.stderr.write("get-entergram MCP server ready (stdio).\n");
}
