// RL Telemetry logger for Entergram.
// Records recall, dispatch, and outcome events to an append-only JSONL log
// to provide the offline/online training dataset for RL contextual bandits and MARL.

import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { paths } from "../lib.js";

/**
 * Log an RL telemetry interaction event.
 *
 * @param {string} root - Repository root path
 * @param {object} event - Telemetry event data
 * @returns {string} The generated event ID
 */
export function logTelemetryEvent(root, event) {
  const p = paths(root);
  const rlDir = join(p.base, "rl");
  if (!existsSync(rlDir)) {
    mkdirSync(rlDir, { recursive: true });
  }

  const logFile = join(p.base, "telemetry.jsonl");
  const eventId = event.event_id || randomUUID();
  const entry = {
    event_id: eventId,
    timestamp: event.timestamp || new Date().toISOString(),
    event_type: event.event_type || "recall",
    session_id: event.session_id || "session-" + new Date().toISOString().slice(0, 10),
    query: event.query || "",
    candidates_count: event.candidates_scored ? event.candidates_scored.length : 0,
    action_taken: event.action_taken || "recall",
    cells_returned: event.cells_returned || [],
    tokens_used: event.tokens_used || 0,
    context: event.context || {},
    rewards: event.rewards || null,
  };

  appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf8");
  return eventId;
}

/**
 * Read recent telemetry events.
 *
 * @param {string} root
 * @param {number} [limit=100]
 * @returns {Array<object>}
 */
export function readTelemetryEvents(root, limit = 100) {
  const { base } = paths(root);
  const logFile = join(base, "telemetry.jsonl");
  if (!existsSync(logFile)) return [];

  const raw = readFileSync(logFile, "utf8").trim();
  if (!raw) return [];

  const lines = raw.split("\n").filter(Boolean);
  const slice = lines.slice(Math.max(0, lines.length - limit));
  return slice.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/**
 * Computes telemetry summary metrics for `entergram telemetry` CLI and health checks.
 *
 * @param {string} root
 * @returns {object} Aggregated stats
 */
export function getTelemetryStats(root) {
  const events = readTelemetryEvents(root, 1000);
  const total = events.length;
  const byType = {};
  let totalTokens = 0;
  let rewardedEvents = 0;
  let sumReward = 0;

  for (const e of events) {
    byType[e.event_type] = (byType[e.event_type] || 0) + 1;
    totalTokens += e.tokens_used || 0;
    if (e.rewards && typeof e.rewards.total === "number") {
      rewardedEvents++;
      sumReward += e.rewards.total;
    }
  }

  const avgTokens = total > 0 ? Math.round(totalTokens / total) : 0;
  const avgReward = rewardedEvents > 0 ? Number((sumReward / rewardedEvents).toFixed(2)) : 0;

  return {
    totalEvents: total,
    byType,
    totalTokens,
    avgTokensPerCall: avgTokens,
    rewardedEvents,
    avgReward,
  };
}
