/**
 * TechScout — Stability Gate (Layer 3, Step 4)
 *
 * The core of TechScout's "bias towards stability" principle.
 * Compares cost of change vs cost of no-change to determine if
 * a recommendation should be delivered.
 *
 * PRINCIPLE: Only recommend changes when cost_of_no_change > cost_of_change
 */

import type {
  ProjectProfile,
  CostOfChange,
  CostOfNoChange,
  StabilityAssessment,
  StabilityVerdict,
  RiskLevel,
  Reversibility,
  StackHealthInfluence,
  TechnicalOutput,
  RecommendationAction,
  CalibratedEffort,
} from '../types';
import type { MaturityGateResult } from './maturity';
import { logger } from '../lib/logger';

// ============================================================
// CONFIGURATION
// ============================================================

/** Weights for cost scoring */
const COST_WEIGHTS = {
  // Cost of change weights
  effort: 0.25,
  regressionRisk: 0.25,
  learningCurve: 0.15,
  dependenciesAffected: 0.15,
  reversibility: 0.20,

  // Cost of no change weights
  securityExposure: 0.30,
  maintenanceRisk: 0.20,
  performanceImpact: 0.15,
  deprecationRisk: 0.20,
  complianceRisk: 0.15,
};

/** Risk level numeric values */
const RISK_VALUES: Record<RiskLevel, number> = {
  none: 0,
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1.0,
};

/** Reversibility numeric values */
const REVERSIBILITY_VALUES: Record<Reversibility, number> = {
  easy: 0.1,
  medium: 0.4,
  hard: 0.7,
  irreversible: 1.0,
};

/** Learning curve numeric values */
const LEARNING_CURVE_VALUES: Record<string, number> = {
  none: 0,
  low: 0.25,
  medium: 0.5,
  high: 0.75,
};

/** Thresholds for stability verdict */
interface StabilityThresholds {
  /** If delta > this, RECOMMEND */
  recommendThreshold: number;
  /** If delta < this, DEFER */
  deferThreshold: number;
  /** Stack health score that triggers more conservative thresholds */
  conservativeHealthScore: number;
  /** Multiplier for thresholds when stack health is good */
  healthyStackMultiplier: number;
}

const DEFAULT_THRESHOLDS: StabilityThresholds = {
  recommendThreshold: 0.15,  // Change cost must be significantly lower
  deferThreshold: -0.1,      // Don't change if cost is higher
  conservativeHealthScore: 0.8, // Healthy stacks = more conservative
  healthyStackMultiplier: 1.5,  // Raise threshold for healthy stacks
};

// ============================================================
// COST CALCULATIONS
// ============================================================

/**
 * Parse effort days string to numeric value.
 */
function parseEffortDays(effortStr: string): number {
  // Handle ranges like "2-3" or "1-2"
  const match = effortStr.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (match) {
    // Return upper bound for conservative estimate
    return parseFloat(match[2]);
  }
  // Handle single value
  const single = parseFloat(effortStr);
  return isNaN(single) ? 5 : single; // Default to 5 days if unparseable
}

/**
 * Calculate numeric cost of change score (0-1).
 * Higher = more expensive to change.
 */
export function calculateCostOfChangeScore(cost: CostOfChange): number {
  // Normalize effort (assume 10 days is max reasonable)
  const effortDays = parseEffortDays(cost.effortDays);
  const effortScore = Math.min(1, effortDays / 10);

  // Get other scores
  const regressionScore = RISK_VALUES[cost.regressionRisk];
  const learningScore = LEARNING_CURVE_VALUES[cost.learningCurve] ?? 0.5;
  const depsScore = Math.min(1, cost.dependenciesAffected / 20); // 20+ deps = max
  const reversibilityScore = REVERSIBILITY_VALUES[cost.reversibility];

  // Weighted sum
  const score =
    effortScore * COST_WEIGHTS.effort +
    regressionScore * COST_WEIGHTS.regressionRisk +
    learningScore * COST_WEIGHTS.learningCurve +
    depsScore * COST_WEIGHTS.dependenciesAffected +
    reversibilityScore * COST_WEIGHTS.reversibility;

  return Math.min(1, Math.max(0, score));
}

/**
 * Calculate numeric cost of no-change score (0-1).
 * Higher = more expensive to NOT change.
 */
export function calculateCostOfNoChangeScore(cost: CostOfNoChange): number {
  const securityScore = RISK_VALUES[cost.securityExposure];
  const maintenanceScore = RISK_VALUES[cost.maintenanceRisk];
  const performanceScore = RISK_VALUES[cost.performanceImpact];
  const deprecationScore = RISK_VALUES[cost.deprecationRisk];
  const complianceScore = RISK_VALUES[cost.complianceRisk];

  // Weighted sum
  const score =
    securityScore * COST_WEIGHTS.securityExposure +
    maintenanceScore * COST_WEIGHTS.maintenanceRisk +
    performanceScore * COST_WEIGHTS.performanceImpact +
    deprecationScore * COST_WEIGHTS.deprecationRisk +
    complianceScore * COST_WEIGHTS.complianceRisk;

  return Math.min(1, Math.max(0, score));
}

// ============================================================
// EFFORT CALIBRATION
// ============================================================

/**
 * Apply calibration to effort estimate based on project history.
 */
export function calibrateEffort(
  effort: CalibratedEffort,
  profile: ProjectProfile
): CalibratedEffort {
  const calibration = profile.costTracking?.calibration;

  if (!calibration || calibration.totalAdoptions < 2) {
    // Not enough data for calibration
    return effort;
  }

  // Apply calibration factor based on historical bias
  let factor = 1.0;
  let note = '';

  // avgEstimateAccuracy is actual/estimated ratio
  // > 1 means underestimate, < 1 means overestimate
  const deviation = Math.abs(calibration.avgEstimateAccuracy - 1);

  switch (calibration.biasDirection) {
    case 'underestimate':
      factor = calibration.avgEstimateAccuracy;
      note = `Stima base: ${effort.rawEstimateDays}. Fattore ${factor.toFixed(2)}x applicato per bias storico (sottostima).`;
      break;
    case 'overestimate':
      factor = Math.max(0.7, 1.0 - deviation * 0.5); // Be less aggressive about reducing
      note = `Stima base: ${effort.rawEstimateDays}. Fattore ${factor.toFixed(2)}x applicato per bias storico (sovrastima).`;
      break;
    case 'balanced':
      note = `Stima confermata dallo storico (${calibration.totalAdoptions} data points).`;
      break;
  }

  // Parse and adjust the days
  const rawDays = parseEffortDays(effort.rawEstimateDays);
  const calibratedDays = Math.ceil(rawDays * factor * 10) / 10;

  // Format calibrated estimate
  const calibratedStr = effort.rawEstimateDays.includes('-')
    ? effort.rawEstimateDays.replace(
        /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/,
        (_, min, max) =>
          `${(parseFloat(min) * factor).toFixed(1)}-${(parseFloat(max) * factor).toFixed(1)}`
      )
    : calibratedDays.toFixed(1);

  return {
    ...effort,
    calibrationApplied: true,
    calibrationFactor: factor,
    calibratedEstimateDays: calibratedStr,
    calibrationNote: note,
  };
}

// ============================================================
// COST OF CHANGE INFERENCE
// ============================================================

/**
 * Infer cost of change from technical analysis.
 */
export function inferCostOfChange(
  technical: TechnicalOutput,
  profile: ProjectProfile
): CostOfChange {
  const effort = technical.effort;

  // Infer regression risk from impact and complexity
  let regressionRisk: RiskLevel = 'low';
  if (effort.breakingChanges) {
    regressionRisk = 'high';
  } else if (effort.complexity === 'high' || effort.complexity === 'very_high') {
    regressionRisk = 'medium';
  }

  // Infer learning curve from complexity and framework changes
  let learningCurve: CostOfChange['learningCurve'] = 'low';
  if (effort.complexity === 'very_high') {
    learningCurve = 'high';
  } else if (effort.complexity === 'high' || effort.complexity === 'medium') {
    learningCurve = 'medium';
  }

  // Count affected dependencies from steps (rough heuristic)
  const depsAffected = Math.max(1, Math.floor(effort.steps.length / 2));

  // Get test update needs
  const testMention = effort.steps.find(s =>
    s.toLowerCase().includes('test') || s.toLowerCase().includes('e2e')
  );

  return {
    effortDays: effort.calibratedEstimateDays || effort.rawEstimateDays,
    regressionRisk,
    learningCurve,
    dependenciesAffected: depsAffected,
    testsToUpdate: testMention,
    reversibility: effort.reversibility,
  };
}

/**
 * Infer cost of no-change from CF findings and stack health.
 */
export function inferCostOfNoChange(
  profile: ProjectProfile,
  technologiesMatched: string[],
  action: RecommendationAction
): CostOfNoChange {
  // Check for relevant CF findings (matching technologies)
  const relevantFindings = profile.cfFindings.findings.filter(f => {
    const findingText = `${f.patternId} ${f.description}`.toLowerCase();
    return technologiesMatched.some(t => findingText.includes(t.toLowerCase()));
  });

  // CRITICAL/HIGH findings should ALWAYS be considered, regardless of technology match
  const criticalFindings = profile.cfFindings.findings.filter(f =>
    f.severity === 'critical' || f.severity === 'high'
  );

  // Aggregate severity from findings
  let securityExposure: RiskLevel = 'none';
  let maintenanceRisk: RiskLevel = 'none';

  // Consider technology-matched findings
  for (const finding of relevantFindings) {
    if (finding.category === 'security' || finding.category === 'crypto' || finding.category === 'auth') {
      securityExposure = maxRisk(securityExposure, finding.severity as RiskLevel);
    }
    if (finding.category === 'maintainability' || finding.category === 'code_smell' || finding.category === 'complexity') {
      maintenanceRisk = maxRisk(maintenanceRisk, finding.severity as RiskLevel);
    }
  }

  // Critical findings always contribute to security exposure (project-wide risk)
  for (const finding of criticalFindings) {
    if (finding.category === 'security' || finding.category === 'crypto' || finding.category === 'auth') {
      // Critical/high security findings increase noChangeScore even without direct match
      securityExposure = maxRisk(securityExposure, finding.severity as RiskLevel);
    }
  }

  // Check stack health for deprecation/maintenance concerns
  const stackHealth = profile.stackHealth;
  let deprecationRisk: RiskLevel = 'none';
  let performanceImpact: RiskLevel = 'none';

  // Low security score is a strong indicator of risk
  if (stackHealth.components.security.score < 0.5) {
    securityExposure = maxRisk(securityExposure, 'medium');
  }
  if (stackHealth.components.security.score < 0.3) {
    securityExposure = maxRisk(securityExposure, 'high');
  }

  if (stackHealth.components.freshness.score < 0.5) {
    deprecationRisk = 'medium';
  }
  if (stackHealth.components.freshness.score < 0.3) {
    deprecationRisk = 'high';
  }

  // For REPLACE actions, the cost of not changing is higher
  if (action === 'REPLACE_EXISTING') {
    maintenanceRisk = maxRisk(maintenanceRisk, 'low');
  }

  // Build detail string
  const details: string[] = [];
  if (criticalFindings.length > 0) {
    details.push(`${criticalFindings.length} finding(s) critico/alto nel progetto`);
  }
  if (relevantFindings.length > 0) {
    details.push(`${relevantFindings.length} CF finding(s) matching tecnologie`);
  }
  if (deprecationRisk !== 'none') {
    details.push(`Stack freshness basso (${(stackHealth.components.freshness.score * 100).toFixed(0)}%)`);
  }
  if (securityExposure !== 'none') {
    details.push(`Esposizione sicurezza: ${securityExposure}`);
  }

  return {
    securityExposure,
    maintenanceRisk,
    performanceImpact,
    deprecationRisk,
    complianceRisk: 'none', // Default, could be enhanced
    detail: details.length > 0 ? details.join('. ') : 'Nessun rischio significativo identificato.',
  };
}

/**
 * Get the higher of two risk levels.
 */
function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_VALUES[a] >= RISK_VALUES[b] ? a : b;
}

// ============================================================
// STACK HEALTH INFLUENCE
// ============================================================

/**
 * Calculate how stack health influences the stability decision.
 */
export function calculateStackHealthInfluence(
  profile: ProjectProfile,
  painPointMatched: boolean,
  matchedPainPoint?: string
): StackHealthInfluence {
  const healthScore = profile.stackHealth.overallScore;

  // Determine threshold tier
  let thresholdApplied: 'high' | 'medium' | 'low';
  if (healthScore > 0.8) {
    thresholdApplied = 'high'; // Healthy stack = be more conservative
  } else if (healthScore > 0.5) {
    thresholdApplied = 'medium';
  } else {
    thresholdApplied = 'low'; // Unhealthy stack = be more open to changes
  }

  return {
    currentScore: healthScore,
    thresholdApplied,
    painPointMatch: painPointMatched,
    matchedPainPoint,
  };
}

/**
 * Check if any pain point matches the technology.
 */
export function checkPainPointMatch(
  profile: ProjectProfile,
  itemTitle: string,
  itemDescription?: string
): { matched: boolean; painPoint?: string } {
  const itemText = `${itemTitle} ${itemDescription || ''}`.toLowerCase();

  for (const painPoint of profile.manifest.painPoints) {
    // Extract keywords from pain point (words > 4 chars)
    const keywords = painPoint.toLowerCase().split(/\s+/).filter(w => w.length > 4);

    // Check if item addresses this pain point
    const matchCount = keywords.filter(kw => itemText.includes(kw)).length;
    if (matchCount >= 2 || matchCount >= keywords.length * 0.5) {
      return { matched: true, painPoint };
    }
  }

  return { matched: false };
}

// ============================================================
// STABILITY VERDICT
// ============================================================

export interface StabilityGateInput {
  technical: TechnicalOutput;
  profile: ProjectProfile;
  maturityResult: MaturityGateResult;
  action: RecommendationAction;
  technologiesMatched: string[];
  itemTitle: string;
  itemDescription?: string;
}

/**
 * Evaluate stability gate and produce verdict.
 */
export function evaluateStabilityGate(
  input: StabilityGateInput,
  thresholds: StabilityThresholds = DEFAULT_THRESHOLDS
): StabilityAssessment {
  const {
    technical,
    profile,
    maturityResult,
    action,
    technologiesMatched,
    itemTitle,
    itemDescription,
  } = input;

  // Calibrate effort
  const calibratedEffort = calibrateEffort(technical.effort, profile);
  technical.effort = calibratedEffort;

  // Calculate costs
  const costOfChange = inferCostOfChange(technical, profile);
  const costOfNoChange = inferCostOfNoChange(profile, technologiesMatched, action);

  const changeScore = calculateCostOfChangeScore(costOfChange);
  const noChangeScore = calculateCostOfNoChangeScore(costOfNoChange);

  // Calculate delta: positive = change is cheaper, negative = change is more expensive
  const delta = noChangeScore - changeScore;

  // Check pain point match
  const painPointMatch = checkPainPointMatch(profile, itemTitle, itemDescription);

  // Calculate stack health influence
  const stackHealthInfluence = calculateStackHealthInfluence(
    profile,
    painPointMatch.matched,
    painPointMatch.painPoint
  );

  // Adjust thresholds based on stack health
  let adjustedRecommendThreshold = thresholds.recommendThreshold;
  let adjustedDeferThreshold = thresholds.deferThreshold;

  if (profile.stackHealth.overallScore >= thresholds.conservativeHealthScore) {
    // Healthy stack = raise the bar for recommendations
    adjustedRecommendThreshold *= thresholds.healthyStackMultiplier;
    adjustedDeferThreshold *= thresholds.healthyStackMultiplier;
  }

  // Pain point match lowers the bar
  if (painPointMatch.matched) {
    adjustedRecommendThreshold *= 0.7; // 30% easier to recommend
  }

  // Determine verdict
  let verdict: StabilityVerdict;
  if (!maturityResult.passed) {
    verdict = 'DEFER';
  } else if (delta >= adjustedRecommendThreshold) {
    verdict = 'RECOMMEND';
  } else if (delta <= adjustedDeferThreshold) {
    verdict = 'DEFER';
  } else {
    verdict = 'MONITOR';
  }

  // Build reasoning (IFX-tagged)
  const reasoningParts: string[] = [];

  reasoningParts.push(`[FACT] Cost of change score: ${(changeScore * 100).toFixed(0)}%`);
  reasoningParts.push(`[FACT] Cost of no-change score: ${(noChangeScore * 100).toFixed(0)}%`);
  reasoningParts.push(`[INFERENCE] Delta: ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)}%`);

  if (painPointMatch.matched) {
    reasoningParts.push(`[FACT] Matches declared pain point`);
  }

  if (!maturityResult.passed) {
    reasoningParts.push(`[FACT] Maturity gate failed: ${maturityResult.warnings.join('; ')}`);
  }

  reasoningParts.push(`VERDICT: ${verdict}`);

  // Build plain reasoning for PM
  let verdictPlain: string;
  switch (verdict) {
    case 'RECOMMEND':
      verdictPlain = `Consigliamo questo cambiamento perché i benefici (${costOfNoChange.detail}) superano i costi (${costOfChange.effortDays} giorni di lavoro, rischio regressione ${costOfChange.regressionRisk}).`;
      break;
    case 'MONITOR':
      verdictPlain = `Suggeriamo di monitorare questa tecnologia. I benefici sono interessanti ma non sufficienti a giustificare un cambiamento immediato. Rivedere tra qualche mese.`;
      break;
    case 'DEFER':
      verdictPlain = `Sconsigliamo questo cambiamento al momento. Il costo del cambiamento (${costOfChange.effortDays} giorni, rischio ${costOfChange.regressionRisk}) supera i benefici potenziali.`;
      break;
  }

  logger.info('Stability gate evaluated', {
    changeScore: changeScore.toFixed(2),
    noChangeScore: noChangeScore.toFixed(2),
    delta: delta.toFixed(2),
    verdict,
    painPointMatch: painPointMatch.matched,
    maturityPassed: maturityResult.passed,
  });

  return {
    costOfChange,
    costOfNoChange,
    maturityGate: {
      subjectMaturity: maturityResult.subjectMaturity,
      minMaturityForAction: maturityResult.minMaturityForAction,
      passed: maturityResult.passed,
    },
    stackHealthInfluence,
    verdict,
    verdictReasoning: reasoningParts.join('\n'),
    verdictPlain,
  };
}

/**
 * Quick stability check without full analysis.
 * Used to filter out obvious non-recommendations early.
 */
export function quickStabilityCheck(
  profile: ProjectProfile,
  maturityResult: MaturityGateResult,
  matchScore: number
): { proceed: boolean; reason: string } {
  // Fail if maturity gate didn't pass
  if (!maturityResult.passed) {
    return {
      proceed: false,
      reason: `Maturity insufficient: ${maturityResult.subjectMaturity}`,
    };
  }

  // Fail if match score is too low
  if (matchScore < 0.2) {
    return {
      proceed: false,
      reason: `Match score too low: ${matchScore}`,
    };
  }

  // For healthy stacks, require higher match score
  if (profile.stackHealth.overallScore > 0.8 && matchScore < 0.4) {
    return {
      proceed: false,
      reason: `Healthy stack requires higher relevance: ${matchScore}`,
    };
  }

  return { proceed: true, reason: 'Passed quick stability check' };
}
