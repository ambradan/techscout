/**
 * TechScout — Maturity Gate (Layer 3, Step 2)
 *
 * Evaluates technology maturity to determine if it's safe
 * to recommend for specific actions.
 *
 * Maturity levels (ascending):
 *   experimental < growth < stable < declining < deprecated
 *
 * Higher-risk actions (REPLACE_EXISTING) require higher maturity.
 */

import type {
  FeedItem,
  SubjectMaturity,
  RecommendationAction,
  MaturityGate,
  SubjectTraction,
} from '../types';
import { logger } from '../lib/logger';

// ============================================================
// MATURITY CONFIGURATION
// ============================================================

/** Minimum maturity required for each action type */
const MATURITY_REQUIREMENTS: Record<RecommendationAction, SubjectMaturity> = {
  REPLACE_EXISTING: 'growth',      // High risk - need proven stability
  COMPLEMENT: 'experimental',       // Medium risk - can try new things
  NEW_CAPABILITY: 'experimental',   // Medium risk - new features can experiment
  MONITOR: 'experimental',          // No risk - just watching
};

/** Maturity level ordering (higher index = more mature) */
const MATURITY_ORDER: SubjectMaturity[] = [
  'experimental',
  'growth',
  'stable',
  'declining',
  'deprecated',
];

/** Thresholds for determining maturity from traction signals */
interface MaturityThresholds {
  starsForGrowth: number;
  starsForStable: number;
  downloadsForGrowth: number;
  downloadsForStable: number;
  ageMonthsForGrowth: number;
  ageMonthsForStable: number;
  contributorsForGrowth: number;
  contributorsForStable: number;
}

const DEFAULT_THRESHOLDS: MaturityThresholds = {
  starsForGrowth: 500,
  starsForStable: 5000,
  downloadsForGrowth: 1000,
  downloadsForStable: 50000,
  ageMonthsForGrowth: 6,
  ageMonthsForStable: 24,
  contributorsForGrowth: 5,
  contributorsForStable: 20,
};

// ============================================================
// MATURITY ASSESSMENT
// ============================================================

/**
 * Get the numeric order of a maturity level.
 */
function getMaturityOrder(maturity: SubjectMaturity): number {
  return MATURITY_ORDER.indexOf(maturity);
}

/**
 * Check if one maturity level is at least as mature as another.
 */
export function isAtLeastAsMature(
  actual: SubjectMaturity,
  required: SubjectMaturity
): boolean {
  // Special cases: declining and deprecated are "mature" but not desirable
  // For action requirements, treat them as meeting the bar but with warnings
  if (actual === 'deprecated') return false; // Never recommend deprecated
  if (actual === 'declining') {
    // Declining can pass growth check but not stable
    return getMaturityOrder(required) < getMaturityOrder('stable');
  }

  return getMaturityOrder(actual) >= getMaturityOrder(required);
}

/**
 * Calculate months since a date.
 */
function monthsSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
}

/**
 * Infer maturity from traction signals.
 * This is a heuristic based on available signals.
 */
export function inferMaturity(
  traction: SubjectTraction,
  thresholds: MaturityThresholds = DEFAULT_THRESHOLDS
): SubjectMaturity {
  let stableSignals = 0;
  let growthSignals = 0;
  let experimentalSignals = 0;
  let totalSignals = 0;

  // GitHub stars
  if (traction.githubStars !== undefined) {
    totalSignals++;
    if (traction.githubStars >= thresholds.starsForStable) {
      stableSignals++;
    } else if (traction.githubStars >= thresholds.starsForGrowth) {
      growthSignals++;
    } else {
      experimentalSignals++;
    }
  }

  // npm weekly downloads
  if (traction.npmWeeklyDownloads !== undefined) {
    totalSignals++;
    if (traction.npmWeeklyDownloads >= thresholds.downloadsForStable) {
      stableSignals++;
    } else if (traction.npmWeeklyDownloads >= thresholds.downloadsForGrowth) {
      growthSignals++;
    } else {
      experimentalSignals++;
    }
  }

  // Age (first release)
  if (traction.firstRelease) {
    totalSignals++;
    const ageMonths = monthsSince(traction.firstRelease);
    if (ageMonths >= thresholds.ageMonthsForStable) {
      stableSignals++;
    } else if (ageMonths >= thresholds.ageMonthsForGrowth) {
      growthSignals++;
    } else {
      experimentalSignals++;
    }
  }

  // Contributors
  if (traction.contributors !== undefined) {
    totalSignals++;
    if (traction.contributors >= thresholds.contributorsForStable) {
      stableSignals++;
    } else if (traction.contributors >= thresholds.contributorsForGrowth) {
      growthSignals++;
    } else {
      experimentalSignals++;
    }
  }

  // If no signals, assume experimental
  if (totalSignals === 0) {
    return 'experimental';
  }

  // Determine maturity based on majority of signals
  const stableRatio = stableSignals / totalSignals;
  const growthRatio = (stableSignals + growthSignals) / totalSignals;

  if (stableRatio >= 0.5) {
    return 'stable';
  } else if (growthRatio >= 0.5) {
    return 'growth';
  } else {
    return 'experimental';
  }
}

/**
 * Infer maturity from feed item traction signals.
 */
export function inferMaturityFromFeedItem(item: FeedItem): SubjectMaturity {
  // Convert FeedItem traction to SubjectTraction format
  const traction: SubjectTraction = {
    githubStars: item.traction.githubStars,
    githubStars30dGrowth: item.traction.githubStars30dGrowth,
    npmWeeklyDownloads: item.traction.npmWeeklyDownloads,
  };

  return inferMaturity(traction);
}

/**
 * Check deprecation signals.
 */
export function checkDeprecationSignals(
  traction: SubjectTraction
): { isDeprecated: boolean; isDeclining: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let isDeprecated = false;
  let isDeclining = false;

  // Check for no recent releases
  if (traction.lastRelease) {
    const monthsSinceRelease = monthsSince(traction.lastRelease);
    if (monthsSinceRelease > 24) {
      reasons.push('No releases in over 2 years');
      isDeclining = true;
    }
    if (monthsSinceRelease > 36) {
      reasons.push('No releases in over 3 years - likely abandoned');
      isDeprecated = true;
    }
  }

  // Check for negative growth trend
  if (traction.githubStars30dGrowth) {
    const growth = traction.githubStars30dGrowth;
    if (growth.startsWith('-')) {
      const lossPercent = parseInt(growth.slice(1), 10);
      if (lossPercent > 10) {
        reasons.push(`Losing stars: ${growth}`);
        isDeclining = true;
      }
    }
  }

  // High open issues to stars ratio can indicate maintenance problems
  if (traction.githubStars && traction.openIssues) {
    const issueRatio = traction.openIssues / traction.githubStars;
    if (issueRatio > 0.1) { // More than 1 issue per 10 stars
      reasons.push('High open issues ratio - may indicate maintenance problems');
      isDeclining = true;
    }
  }

  return { isDeprecated, isDeclining, reasons };
}

// ============================================================
// MATURITY GATE
// ============================================================

export interface MaturityGateInput {
  maturity: SubjectMaturity;
  action: RecommendationAction;
  traction?: SubjectTraction;
}

export interface MaturityGateResult extends MaturityGate {
  warnings: string[];
  signals: {
    deprecation: ReturnType<typeof checkDeprecationSignals>;
    inferredMaturity?: SubjectMaturity;
  };
}

/**
 * Evaluate maturity gate for a recommendation.
 */
export function evaluateMaturityGate(input: MaturityGateInput): MaturityGateResult {
  const { maturity, action, traction } = input;
  const minRequired = MATURITY_REQUIREMENTS[action];

  // Check deprecation signals if traction available
  const deprecationSignals = traction
    ? checkDeprecationSignals(traction)
    : { isDeprecated: false, isDeclining: false, reasons: [] };

  // Adjust maturity if deprecation detected
  let effectiveMaturity = maturity;
  if (deprecationSignals.isDeprecated) {
    effectiveMaturity = 'deprecated';
  } else if (deprecationSignals.isDeclining && maturity !== 'deprecated') {
    effectiveMaturity = 'declining';
  }

  const passed = isAtLeastAsMature(effectiveMaturity, minRequired);

  // Collect warnings
  const warnings: string[] = [...deprecationSignals.reasons];

  if (effectiveMaturity === 'declining') {
    warnings.push('Technology shows signs of declining adoption');
  }

  if (effectiveMaturity === 'experimental' && action !== 'MONITOR') {
    warnings.push('Technology is experimental - higher risk of breaking changes');
  }

  if (!passed) {
    warnings.push(`Maturity ${effectiveMaturity} below required ${minRequired} for ${action}`);
  }

  // Infer maturity from traction if available
  const inferredMaturity = traction ? inferMaturity(traction) : undefined;

  logger.debug('Maturity gate evaluated', {
    maturity: effectiveMaturity,
    minRequired,
    action,
    passed,
    warnings: warnings.length,
  });

  return {
    subjectMaturity: effectiveMaturity,
    minMaturityForAction: minRequired,
    passed,
    warnings,
    signals: {
      deprecation: deprecationSignals,
      inferredMaturity,
    },
  };
}

/**
 * Batch evaluate maturity for multiple items.
 */
export function evaluateMaturityBatch(
  items: Array<{
    item: FeedItem;
    proposedAction: RecommendationAction;
  }>
): Map<string, MaturityGateResult> {
  const results = new Map<string, MaturityGateResult>();

  for (const { item, proposedAction } of items) {
    const maturity = inferMaturityFromFeedItem(item);

    // Convert FeedItem traction to SubjectTraction
    const traction: SubjectTraction = {
      githubStars: item.traction.githubStars,
      githubStars30dGrowth: item.traction.githubStars30dGrowth,
      npmWeeklyDownloads: item.traction.npmWeeklyDownloads,
    };

    const result = evaluateMaturityGate({
      maturity,
      action: proposedAction,
      traction,
    });

    results.set(item.id, result);
  }

  const passed = Array.from(results.values()).filter(r => r.passed).length;

  logger.info('Maturity batch evaluated', {
    total: items.length,
    passed,
    failed: items.length - passed,
  });

  return results;
}

/**
 * Get recommended action based on maturity.
 * If the subject isn't mature enough for REPLACE, suggest MONITOR instead.
 */
export function getRecommendedAction(
  maturity: SubjectMaturity,
  preferredAction: RecommendationAction
): RecommendationAction {
  if (maturity === 'deprecated') {
    return 'MONITOR'; // Never recommend deprecated tech
  }

  if (isAtLeastAsMature(maturity, MATURITY_REQUIREMENTS[preferredAction])) {
    return preferredAction;
  }

  // Downgrade to a less risky action
  if (preferredAction === 'REPLACE_EXISTING') {
    if (isAtLeastAsMature(maturity, MATURITY_REQUIREMENTS.COMPLEMENT)) {
      return 'COMPLEMENT';
    }
  }

  return 'MONITOR';
}
