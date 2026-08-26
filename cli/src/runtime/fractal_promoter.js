// Fractal Scale Promoter for Entergram.
// Manages cellular graduation across biological scale hierarchies:
// Individual Developer Scratchpad -> Team Git-Committed Brain -> Organization Doctrine.

export const SCALE_TIERS = {
  INDIVIDUAL: "individual", // Local working memory, high plasticity (η ≈ 0.2)
  TEAM: "team",             // Git-committed shared repository memory (η ≈ 0.05)
  ORGANIZATION: "org",      // Centralized invariant doctrine (η ≈ 0.001)
};

const PROMOTION_THRESHOLDS = {
  INDIVIDUAL_TO_TEAM: { minResolutions: 5, maxFailureRate: 0.15, minConfidence: 0.8 },
  TEAM_TO_ORG: { minResolutions: 25, maxFailureRate: 0.05, minConfidence: 0.95 },
};

/**
 * Evaluates whether a cell qualifies for graduation to a broader scope.
 *
 * @param {import("./cell_agent.js").BrainCell} cell
 * @param {string} [currentTier=SCALE_TIERS.INDIVIDUAL]
 * @returns {{ eligible: boolean, targetTier?: string, reason: string }}
 */
export function evaluateGraduation(cell, currentTier = SCALE_TIERS.INDIVIDUAL) {
  const totalAttempts = cell.resolutions + cell.failures;
  const failureRate = totalAttempts > 0 ? cell.failures / totalAttempts : 0;

  if (currentTier === SCALE_TIERS.INDIVIDUAL) {
    const rules = PROMOTION_THRESHOLDS.INDIVIDUAL_TO_TEAM;
    if (cell.resolutions >= rules.minResolutions && failureRate <= rules.maxFailureRate && cell.confidence >= rules.minConfidence) {
      return {
        eligible: true,
        targetTier: SCALE_TIERS.TEAM,
        reason: `Verified across ${cell.resolutions} successful tasks with ${Number((failureRate * 100).toFixed(1))}% failure rate.`,
      };
    }
    return {
      eligible: false,
      reason: `Requires ${rules.minResolutions} resolutions (current: ${cell.resolutions}).`,
    };
  }

  if (currentTier === SCALE_TIERS.TEAM) {
    const rules = PROMOTION_THRESHOLDS.TEAM_TO_ORG;
    if (cell.resolutions >= rules.minResolutions && failureRate <= rules.maxFailureRate && cell.confidence >= rules.minConfidence) {
      return {
        eligible: true,
        targetTier: SCALE_TIERS.ORGANIZATION,
        reason: `Hardened across ${cell.resolutions} resolutions with high consensus.`,
      };
    }
    return {
      eligible: false,
      reason: `Requires ${rules.minResolutions} resolutions for organization promotion (current: ${cell.resolutions}).`,
    };
  }

  return { eligible: false, reason: "Already at highest organizational tier." };
}

/**
 * Promotes a cell to a target scale tier, adjusting its metaplasticity and threshold.
 *
 * @param {import("./cell_agent.js").BrainCell} cell
 * @param {string} targetTier - One of SCALE_TIERS
 * @returns {object} Promotion result with updated parameters
 */
export function promoteCell(cell, targetTier) {
  if (targetTier === SCALE_TIERS.TEAM) {
    cell.plasticity = 0.05; // Lower plasticity for team stability
    cell.threshold = Math.max(0.55, cell.threshold);
    cell.status = "active";
  } else if (targetTier === SCALE_TIERS.ORGANIZATION) {
    cell.plasticity = 0.001; // Crystallized doctrine
    cell.threshold = Math.max(0.75, cell.threshold);
    cell.status = "active";
  }

  return {
    cellId: cell.id,
    newTier: targetTier,
    newPlasticity: cell.plasticity,
    newThreshold: cell.threshold,
  };
}
