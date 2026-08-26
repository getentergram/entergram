// Temporal Validity Engine for Entergram.
// Models decision lifecycles, exponential confidence decay, reconfirmation boosts,
// and staleness detection to prevent high-authority obsolete decisions from outranking current consensus.

export const LIFECYCLE_STATES = ["draft", "accepted", "active", "superseded", "deprecated"];

export const DECAY_RATES = {
  infrastructure: 0.003,  // ~231 days half-life
  security: 0.004,        // ~173 days half-life
  deployment: 0.005,      // ~139 days half-life
  api_design: 0.001,      // ~693 days half-life
  business_logic: 0.0005, // ~1386 days half-life
  docs: 0.002,            // ~347 days half-life
  repo: 0.002,
  global: 0.0015,
};

const DEFAULT_DECAY_RATE = 0.002;
const RECONFIRM_WEIGHT = 0.15; // Boost per successful citation

/**
 * Parses an ISO date string or timestamp into seconds since epoch.
 *
 * @param {string|number|Date} dateVal
 * @returns {number} Timestamp in seconds
 */
export function toEpochSeconds(dateVal) {
  if (!dateVal) return Math.floor(Date.now() / 1000);
  if (typeof dateVal === "number") {
    return dateVal > 1e11 ? Math.floor(dateVal / 1000) : dateVal;
  }
  const parsed = Date.parse(dateVal);
  return isNaN(parsed) ? Math.floor(Date.now() / 1000) : Math.floor(parsed / 1000);
}

/**
 * Computes dynamic, real-time confidence score for a memory cell.
 *
 * C(t) = C₀ · e^(-λ Δt) + C_reconfirm · Σᵢ e^(-λ(t - tᵢ))
 *
 * @param {object} cell - Cell object { confidence, created, scope, status, type }
 * @param {Array<object>} [citations=[]] - Citation history [{ timestamp, success }]
 * @param {number} [nowSec] - Current time in seconds (defaults to Date.now())
 * @returns {number} Current dynamic confidence (0.0 to 1.0)
 */
export function computeDynamicConfidence(cell, citations = [], nowSec = Math.floor(Date.now() / 1000)) {
  const status = cell.status || (Number(cell.confidence) < 0.6 ? "draft" : "active");

  // Superseded and deprecated decisions have zero confidence
  if (status === "superseded" || status === "deprecated") {
    return 0.0;
  }

  const initialConf = cell.confidence == null ? 1.0 : Number(cell.confidence);
  if (isNaN(initialConf)) return 0.5;

  const scopeKey = (cell.scope || "global").toLowerCase();
  const lambda = DECAY_RATES[scopeKey] || DEFAULT_DECAY_RATE;

  const createdSec = toEpochSeconds(cell.created);
  const ageDays = Math.max(0, (nowSec - createdSec) / 86400);

  // Exponential base decay
  const baseConfidence = initialConf * Math.exp(-lambda * ageDays);

  // Citation reconfirmation boost
  let reconfirmBoost = 0;
  if (Array.isArray(citations) && citations.length > 0) {
    for (const c of citations) {
      if (c.success !== false) {
        const citeSec = toEpochSeconds(c.timestamp);
        const citeAgeDays = Math.max(0, (nowSec - citeSec) / 86400);
        reconfirmBoost += RECONFIRM_WEIGHT * Math.exp(-lambda * citeAgeDays);
      }
    }
  }

  // Amygdala gotchas decay slower because historical mistakes must remain memorable
  const typeMultiplier = cell.type === "gotcha" ? 1.2 : 1.0;

  const total = (baseConfidence + reconfirmBoost) * typeMultiplier;
  return Number(Math.max(0.0, Math.min(1.0, total)).toFixed(4));
}

/**
 * Evaluates whether a cell has become stale and needs human/team reconfirmation.
 *
 * @param {object} cell - Cell object
 * @param {Array<object>} [citations=[]] - Citations
 * @param {number} [nowSec] - Current timestamp
 * @returns {{ isStale: boolean, reason?: string, currentConfidence: number, ageDays: number }}
 */
export function checkStaleness(cell, citations = [], nowSec = Math.floor(Date.now() / 1000)) {
  const status = cell.status || "active";
  if (status === "superseded" || status === "deprecated") {
    return { isStale: false, currentConfidence: 0.0, ageDays: 0 };
  }

  const initialConf = Number(cell.confidence ?? 1.0);
  const currentConfidence = computeDynamicConfidence(cell, citations, nowSec);
  const createdSec = toEpochSeconds(cell.created);
  const ageDays = Math.floor((nowSec - createdSec) / 86400);

  // Stale condition 1: Initial decision had good confidence (>= 0.6) but decayed below 0.45
  if (initialConf >= 0.6 && currentConfidence < 0.45) {
    return {
      isStale: true,
      reason: `Confidence decayed from ${initialConf} to ${currentConfidence} over ${ageDays} days without reconfirmation`,
      currentConfidence,
      ageDays,
    };
  }

  // Stale condition 2: High age (> 365 days) with no citations in the last 180 days
  if (ageDays > 365 && (!citations.length || (nowSec - toEpochSeconds(citations[citations.length - 1].timestamp)) / 86400 > 180)) {
    return {
      isStale: true,
      reason: `Decision is ${ageDays} days old and has not been cited in over 180 days`,
      currentConfidence,
      ageDays,
    };
  }

  return { isStale: false, currentConfidence, ageDays };
}

/**
 * Transitions a cell's lifecycle status.
 *
 * @param {object} cell - Cell object
 * @param {string} targetStatus - One of LIFECYCLE_STATES
 * @param {string} [reason] - Rationale for transition
 * @returns {object} Updated patch object { status, confidence, outcome }
 */
export function transitionLifecycle(cell, targetStatus, reason) {
  if (!LIFECYCLE_STATES.includes(targetStatus)) {
    throw new Error(`Invalid lifecycle state "${targetStatus}". Expected one of: ${LIFECYCLE_STATES.join(", ")}`);
  }

  const patch = { status: targetStatus };

  if (targetStatus === "superseded") {
    patch.confidence = 0.0;
    if (reason) patch.outcome = `Superseded: ${reason}`;
  } else if (targetStatus === "deprecated") {
    patch.confidence = 0.0;
    if (reason) patch.outcome = `Deprecated: ${reason}`;
  } else if (targetStatus === "active" && Number(cell.confidence) < 0.6) {
    patch.confidence = 0.8;
  }

  return patch;
}
