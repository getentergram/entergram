// Engineering Outcome Rewards for Entergram RL.
// Formulates and computes reward signals grounded in actual engineering success
// (commits landed, PRs merged, builds passed, gotchas prevented, procedures dispatched)
// rather than superficial clicks or views.

import { LinUCBBandit, extractFeatures } from "./bandit.js";
import { logTelemetryEvent, readTelemetryEvents } from "./telemetry.js";

export const REWARD_WEIGHTS = {
  cell_cited_in_output: 1.0,     // Agent used cell in its response/code
  task_success_commit: 3.0,      // Commit landed successfully
  task_success_pr_merged: 5.0,   // PR merged with the changes
  task_success_build_pass: 2.0,  // Build / test passed
  user_accepted_dispatch: 2.0,   // Engineer accepted/executed the procedure
  user_dismissed: -1.5,          // Engineer dismissed or ignored recall
  tokens_wasted_per_100: -0.1,   // Token efficiency penalty
  stale_cell_served: -2.0,       // Served a stale/superseded cell
  gotcha_prevented_bug: 4.0,     // Gotcha prevented a known historical regression
};

/**
 * Computes composite reward from observed engineering signals.
 *
 * @param {object} signals - Boolean or numeric telemetry signals
 * @returns {number} Composite reward scalar
 */
export function computeReward(signals = {}) {
  let reward = 0;

  if (signals.cited) reward += REWARD_WEIGHTS.cell_cited_in_output;
  if (signals.commitLanded) reward += REWARD_WEIGHTS.task_success_commit;
  if (signals.prMerged) reward += REWARD_WEIGHTS.task_success_pr_merged;
  if (signals.buildPassed) reward += REWARD_WEIGHTS.task_success_build_pass;
  if (signals.acceptedDispatch) reward += REWARD_WEIGHTS.user_accepted_dispatch;
  if (signals.dismissed) reward += REWARD_WEIGHTS.user_dismissed;
  if (signals.preventedRegression) reward += REWARD_WEIGHTS.gotcha_prevented_bug;
  if (signals.staleServed) reward += REWARD_WEIGHTS.stale_cell_served;

  if (signals.unnecessaryTokens && signals.unnecessaryTokens > 0) {
    reward += (signals.unnecessaryTokens / 100.0) * REWARD_WEIGHTS.tokens_wasted_per_100;
  }

  return Number(reward.toFixed(2));
}

/**
 * Records outcome feedback for a previously logged telemetry event and updates the bandit.
 *
 * @param {string} root - Repo root
 * @param {string} eventId - Telemetry event ID to reward
 * @param {object} signals - Outcome signals
 * @param {object} [cell] - Optional cell that received the feedback
 * @param {object} [context] - Context features when the decision was made
 * @returns {{ eventId: string, reward: number }}
 */
export function recordFeedback(root, eventId, signals, cell = null, context = {}) {
  const reward = computeReward(signals);

  // Update LinUCB bandit model if candidate cell & context provided
  if (cell) {
    const bandit = LinUCBBandit.load(root);
    const x = extractFeatures(cell, context);
    bandit.update(x, reward);
    bandit.save(root);
  }

  // Log feedback event to telemetry
  logTelemetryEvent(root, {
    event_type: "feedback",
    target_event_id: eventId,
    rewards: {
      total: reward,
      signals,
    },
  });

  return { eventId, reward };
}
