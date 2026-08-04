// MCP server — exposes engram memory as tools any MCP client (Claude Code, Cursor,
// Windsurf, Continue) can call over stdio. IMPORTANT: in stdio mode the protocol owns
// stdout; all human/status output MUST go to stderr.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { findRoot, writeCell, learnGit, learnDocs, doctor } from "./lib.js";
import { ensureIndex, reindex, search, indexStats } from "./db.js";

const textResult = (text) => ({ content: [{ type: "text", text }] });

export async function serve() {
  const root = findRoot();
  if (!root) {
    process.stderr.write("engram serve: no .engram/ found — run `engram init` first.\n");
    process.exit(1);
  }

  const server = new McpServer({ name: "engram", version: "0.1.0" });

  server.registerTool(
    "recall",
    {
      title: "Recall engineering memory",
      description:
        "Retrieve the decisions, rationale, and facts most relevant to a query, packed under a token budget. Call this BEFORE answering questions about the codebase's architecture, past decisions, or history — it's cheaper than re-deriving.",
      inputSchema: {
        query: z.string().describe("what you're looking for"),
        budget: z.number().optional().describe("token budget (default 2000)"),
      },
    },
    async ({ query, budget }) => {
      ensureIndex(root);
      const { hits, total } = search(root, query, budget ?? 2000);
      if (!hits.length) return textResult(`No memory matches "${query}".`);
      const body = hits
        .map((h) => `- ${h.id} [${h.tags.join(", ")}] (${h.type}${h.confidence < 0.6 ? ", unreviewed" : ""})\n  ${h.hook}`)
        .join("\n");
      return textResult(`${hits.length}/${total} relevant memories for "${query}":\n${body}`);
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
        type: z.enum(["decision", "gotcha", "convention", "reference", "architecture"]).optional(),
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
      description: "Ingest recent git history and docs/README/ADRs into memory (incremental — skips already-seen and low-signal items).",
      inputSchema: {
        source: z.enum(["all", "git", "docs"]).optional(),
        limit: z.number().optional().describe("max commits to scan (default 50)"),
      },
    },
    async ({ source, limit }) => {
      const src = source || "all";
      let g = { added: 0 }, d = { added: 0 };
      if (src === "git" || src === "all") g = learnGit(root, { limit: limit ?? 50 });
      if (src === "docs" || src === "all") d = learnDocs(root);
      reindex(root);
      return textResult(`Learned ${g.added + d.added} new cell(s) (git ${g.added}, docs ${d.added}).`);
    },
  );

  server.registerTool(
    "doctor",
    { title: "Memory health", description: "Report memory health and index coverage.", inputSchema: {} },
    async () => {
      const { count, problems } = doctor(root);
      const stats = indexStats(root);
      return textResult(`Cells ${count}, indexed ${stats.total}. ${problems.length ? problems.length + " problem(s)." : "Consistent."}`);
    },
  );

  await server.connect(new StdioServerTransport());
  process.stderr.write("engram MCP server ready (stdio).\n");
}
