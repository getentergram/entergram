// Turn a PR/issue/commit unit into a structured memory. Uses the Anthropic API when
// ANTHROPIC_API_KEY is set (high-confidence, tool-use structured output); otherwise a
// heuristic fallback so `learn` always works offline.

const MODEL = process.env.ENGRAM_MODEL || "claude-haiku-4-5-20251001";

const RECORD_TOOL = {
  name: "record_memory",
  description: "Record the durable engineering memory extracted from a change.",
  input_schema: {
    type: "object",
    properties: {
      type: { type: "string", enum: ["decision", "gotcha", "convention", "reference", "architecture"] },
      what: { type: "string", description: "what changed, one sentence" },
      why: { type: "string", description: "the rationale / motivation" },
      outcome: { type: "string", description: "the result, if stated (else empty)" },
      tags: { type: "array", items: { type: "string" }, description: "2-4 lowercase topic tags" },
      scope: { type: "string", description: "area of the codebase, or 'global'" },
      confidence: { type: "number", description: "0-1: how clearly a durable decision is present" },
    },
    required: ["type", "what", "why", "tags", "confidence"],
  },
};

function prompt(unit) {
  return `Extract the durable engineering memory from this merged ${unit.kind}.
Focus on the DECISION and its RATIONALE — skip mechanical/noise changes (set confidence low if there's no real decision).

Title: ${unit.title}
${unit.body ? "Body:\n" + unit.body.slice(0, 4000) : "(no description)"}

Call record_memory with what/why/outcome/tags/scope/confidence.`;
}

export function llmAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** LLM extraction via the Anthropic Messages API (forced tool use). Returns a memory or null. */
export async function extractLLM(unit) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      tools: [RECORD_TOOL],
      tool_choice: { type: "tool", name: "record_memory" },
      messages: [{ role: "user", content: prompt(unit) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const use = (data.content || []).find((b) => b.type === "tool_use");
  return use ? use.input : null;
}

/** Offline fallback: title → what, body → why, low confidence for review. */
export function extractHeuristic(unit) {
  const type = /\b(add|introduce|migrat|switch|replace|refactor|remov|decid|design|adopt)/i.test(unit.title)
    ? "decision" : "reference";
  const tags = [...new Set((unit.title.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || []))].slice(0, 4);
  return {
    type,
    what: unit.title.trim(),
    why: (unit.body || "").split("\n").find((l) => l.trim())?.trim()
      || "(rationale not in description — refine with `get-engram review`)",
    tags: tags.length ? tags : ["change"],
    scope: "repo",
    confidence: 0.4,
  };
}
