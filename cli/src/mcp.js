// MCP server — exposes engram memory as tools any MCP client (Claude Code, Cursor,
// Windsurf, Continue) can call over stdio. IMPORTANT: in stdio mode the protocol owns
// stdout; all human/status output MUST go to stderr.
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { findRoot, writeCell, learnGit, learnDocs, doctor, readCells } from "./lib.js";
import { ensureIndex, reindex, search, indexStats } from "./db.js";
import { learnPRs } from "./learn.js";

const textResult = (text) => ({ content: [{ type: "text", text }] });

export async function serve() {
  const root = findRoot();
  if (!root) {
    process.stderr.write("get-engram serve: no .engram/ found — run `get-engram init` first.\n");
    process.exit(1);
  }

  const server = new McpServer({ name: "get-engram", version: "0.1.0" });

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
      const { hits, total, synthesis } = search(root, query, budget ?? 2000);
      if (!hits.length) return textResult(`No memory matches "${query}".`);
      const body = hits
        .map((h) => `- ${h.id} [${h.tags.join(", ")}] (${h.type}${h.confidence < 0.6 ? ", unreviewed" : ""})\n  ${h.hook}`)
        .join("\n");
      return textResult(`${hits.length}/${total} relevant memories for "${query}":\n${body}\n\n${synthesis}`);
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
      description: "Ingest recent git history, docs/README/ADRs, and merged PRs into memory (incremental — skips already-seen and low-signal items). PRs are extracted into {decision, reason, outcome} when ANTHROPIC_API_KEY is set.",
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
    { title: "Memory health", description: "Report memory health and index coverage.", inputSchema: {} },
    async () => {
      const { count, problems } = doctor(root);
      const stats = indexStats(root);
      return textResult(`Cells ${count}, indexed ${stats.total}. ${problems.length ? problems.length + " problem(s)." : "Consistent."}`);
    },
  );

  server.registerResource(
    "cell",
    new ResourceTemplate("get-engram://cell/{id}", { list: undefined }),
    { title: "Memory cell", description: "One engram memory cell's raw markdown, by id (e.g. B-0012)." },
    async (uri, { id }) => {
      const cell = readCells(root).find((c) => c.id === id);
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text: cell ? cell.text : `No cell ${id}.` }],
      };
    },
  );

  server.registerResource(
    "index",
    "get-engram://index",
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
  process.stderr.write("get-engram MCP server ready (stdio).\n");
}
