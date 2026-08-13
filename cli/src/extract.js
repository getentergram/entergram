// Turn a PR/issue/commit unit into a structured memory. Provider-agnostic:
//   GEMINI_API_KEY  → Google Gemini (structured output via responseSchema)   [preferred]
//   ANTHROPIC_API_KEY → Anthropic (forced tool-use)
//   neither → heuristic fallback, so `learn` always works offline.
// Override auto-selection with ENTERGRAM_PROVIDER=gemini|anthropic|none.

const GEMINI_MODEL = process.env.ENTERGRAM_GEMINI_MODEL || "gemini-2.0-flash";
const ANTHROPIC_MODEL = process.env.ENTERGRAM_MODEL || "claude-haiku-4-5-20251001";

// Shared field set. Anthropic wants JSON-Schema (lowercase types); Gemini wants its
// Schema proto (uppercase types). Same fields, two dialects.
const FIELDS = {
  type: { desc: "decision | gotcha | convention | reference | architecture", enum: ["decision", "gotcha", "convention", "reference", "architecture"] },
  what: { desc: "what changed, one sentence" },
  why: { desc: "the rationale / motivation" },
  outcome: { desc: "the result, if stated (else empty)" },
  tags: { desc: "2-4 lowercase topic tags", array: true },
  scope: { desc: "area of the codebase, or 'global'" },
  confidence: { desc: "0-1: how clearly a durable decision is present", number: true },
};
const REQUIRED = ["type", "what", "why", "tags", "confidence"];

function anthropicSchema() {
  const properties = {};
  for (const [k, f] of Object.entries(FIELDS)) {
    properties[k] = f.array
      ? { type: "array", items: { type: "string" }, description: f.desc }
      : { type: f.number ? "number" : "string", description: f.desc, ...(f.enum ? { enum: f.enum } : {}) };
  }
  return { type: "object", properties, required: REQUIRED };
}

function geminiSchema() {
  const properties = {};
  for (const [k, f] of Object.entries(FIELDS)) {
    properties[k] = f.array
      ? { type: "ARRAY", items: { type: "STRING" } }
      : { type: f.number ? "NUMBER" : "STRING", ...(f.enum ? { enum: f.enum } : {}) };
  }
  return { type: "OBJECT", properties, required: REQUIRED };
}

function prompt(unit) {
  return `Extract the durable engineering memory from this merged ${unit.kind}.
Focus on the DECISION and its RATIONALE — skip mechanical/noise changes (set confidence low if there's no real decision).

Title: ${unit.title}
${unit.body ? "Body:\n" + unit.body.slice(0, 4000) : "(no description)"}

Return what/why/outcome, 2-4 tags, scope, and confidence (0-1).`;
}

export function provider() {
  const forced = process.env.ENTERGRAM_PROVIDER;
  if (forced) return forced === "none" ? null : forced;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function llmAvailable() {
  return provider() !== null;
}

async function extractGemini(unit) {
  const key = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt(unit) }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: geminiSchema() },
    }),
  });
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

async function extractAnthropic(unit) {
  const key = process.env.ANTHROPIC_API_KEY;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 512,
      tools: [{ name: "record_memory", description: "Record the extracted engineering memory.", input_schema: anthropicSchema() }],
      tool_choice: { type: "tool", name: "record_memory" },
      messages: [{ role: "user", content: prompt(unit) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const use = (data.content || []).find((b) => b.type === "tool_use");
  return use ? use.input : null;
}

/** Extract via the selected provider. Returns a memory object or null (→ caller falls back). */
export async function extractLLM(unit) {
  switch (provider()) {
    case "gemini": return extractGemini(unit);
    case "anthropic": return extractAnthropic(unit);
    default: return null;
  }
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
      || "(rationale not in description — refine with `get-entergram review`)",
    tags: tags.length ? tags : ["change"],
    scope: "repo",
    confidence: 0.4,
  };
}
