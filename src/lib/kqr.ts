/**
 * TechScout — KQR (Knowledge Qualification & Reliability) Helpers
 *
 * Every source has a reliability score.
 * Confidence = weighted(source_reliability × factual_basis × inference_quality × (1 - assumption_risk))
 */

import type {
  KQRReliability,
  KQRSourceType,
  KQRSource,
  KQRCrossValidation,
  KQRConfidenceBreakdown,
  KQRQualification,
  IFXClaim,
  IFXInference,
} from '../types';
import {
  KQR_RELIABILITY_SCORES,
  KQR_SOURCE_TYPE_WEIGHTS,
} from '../types';
import { calculateAssumptionRisk } from './ifx';

// ============================================================
// SOURCE QUALIFICATION
// ============================================================

/**
 * Qualify a source with reliability information.
 *
 * @param name - Human-readable source name
 * @param type - Type of source
 * @param reliability - Reliability level
 * @param options - Optional URL and timestamp
 */
export function qualifySource(
  name: string,
  type: KQRSourceType,
  reliability: KQRReliability,
  options?: { url?: string; lastFetched?: string }
): KQRSource {
  // Calculate weight based on type and reliability
  const typeWeight = KQR_SOURCE_TYPE_WEIGHTS[type];
  const reliabilityScore = KQR_RELIABILITY_SCORES[reliability];
  const weight = Math.round(typeWeight * reliabilityScore * 100) / 100;

  return {
    source: name,
    type,
    reliability,
    weight,
    url: options?.url,
    lastFetched: options?.lastFetched,
  };
}

/**
 * Common source qualifications for reuse.
 */
export const COMMON_SOURCES = {
  githubApi: (url?: string) => qualifySource(
    'GitHub API',
    'automated_scan',
    'high',
    { url, lastFetched: new Date().toISOString() }
  ),

  codeForensicsL1: (findingId?: string) => qualifySource(
    `Code Forensics L1${findingId ? ` (${findingId})` : ''}`,
    'deterministic_analysis',
    'high',
    { lastFetched: new Date().toISOString() }
  ),

  officialDocs: (url: string) => qualifySource(
    'Official Documentation',
    'primary_source',
    'high',
    { url, lastFetched: new Date().toISOString() }
  ),

  hackerNews: (points: number) => qualifySource(
    `Hacker News (${points}+ points)`,
    'community_signal',
    points > 500 ? 'high' : points > 100 ? 'medium' : 'low',
    { lastFetched: new Date().toISOString() }
  ),

  githubTrending: (rank: number, category: string) => qualifySource(
    `GitHub Trending (#${rank}, ${category})`,
    'traction_signal',
    rank <= 5 ? 'high' : rank <= 20 ? 'medium' : 'low',
    { lastFetched: new Date().toISOString() }
  ),

  userManifest: () => qualifySource(
    'User Manifest',
    'user_input',
    'medium',
    { lastFetched: new Date().toISOString() }
  ),

  npmRegistry: (weeklyDownloads: number) => qualifySource(
    `npm Registry (${weeklyDownloads.toLocaleString()} weekly downloads)`,
    'traction_signal',
    weeklyDownloads > 100000 ? 'high' : weeklyDownloads > 10000 ? 'medium' : 'low',
    { lastFetched: new Date().toISOString() }
  ),
};

// ============================================================
// CROSS-VALIDATION
// ============================================================

/**
 * Perform cross-validation analysis on sources.
 * Checks how many sources agree, conflict, or have insufficient data.
 *
 * @param sources - Array of sources with their claims
 */
export function crossValidateSources(
  sources: Array<{ source: KQRSource; agrees: boolean; hasData: boolean }>
): KQRCrossValidation {
  let agreeing = 0;
  let conflicting = 0;
  let insufficient = 0;

  for (const s of sources) {
    if (!s.hasData) {
      insufficient += 1;
    } else if (s.agrees) {
      agreeing += 1;
    } else {
      conflicting += 1;
    }
  }

  return {
    sourcesAgreeing: agreeing,
    sourcesConflicting: conflicting,
    sourcesInsufficient: insufficient,
  };
}

// ============================================================
// CONFIDENCE CALCULATION
// ============================================================

/**
 * Calculate the factual basis score based on claims.
 * Higher score = more facts relative to inferences and assumptions.
 */
export function calculateFactualBasis(claims: IFXClaim[]): number {
  if (claims.length === 0) return 0;

  const facts = claims.filter(c => c.ifxTag === 'FACT').length;
  const total = claims.length;

  // Base score is the proportion of facts
  const baseScore = facts / total;

  // Bonus for having more than 3 facts (evidence of thorough research)
  const factBonus = Math.min(0.1, (facts - 3) * 0.02);

  return Math.min(1, Math.max(0, baseScore + (facts > 3 ? factBonus : 0)));
}

/**
 * Calculate the inference quality score based on inference confidence levels.
 */
export function calculateInferenceQuality(claims: IFXClaim[]): number {
  const inferences = claims.filter(c => c.ifxTag === 'INFERENCE') as IFXInference[];

  if (inferences.length === 0) return 1; // No inferences = no inference risk

  // Average confidence of inferences
  const avgConfidence = inferences.reduce((sum, i) => sum + i.confidence, 0) / inferences.length;

  // Penalize low-confidence inferences
  const lowConfidenceCount = inferences.filter(i => i.confidence < 0.5).length;
  const lowConfidencePenalty = lowConfidenceCount * 0.1;

  return Math.max(0, avgConfidence - lowConfidencePenalty);
}

/**
 * Calculate confidence from pre-computed scores.
 *
 * Formula: source_reliability × factual_basis × inference_quality × (1 - assumption_risk)
 *
 * @param sourceReliability - Weighted average of source reliabilities (0-1)
 * @param factualBasis - Proportion of facts in claims (0-1)
 * @param inferenceQuality - Average confidence of inferences (0-1)
 * @param assumptionRisk - Risk from unvalidated assumptions (0-1)
 */
export function calculateConfidenceSimple(
  sourceReliability: number,
  factualBasis: number,
  inferenceQuality: number,
  assumptionRisk: number
): number {
  // Validate inputs
  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  const sr = clamp(sourceReliability);
  const fb = clamp(factualBasis);
  const iq = clamp(inferenceQuality);
  const ar = clamp(assumptionRisk);

  const confidence = sr * fb * iq * (1 - ar);
  return Math.round(confidence * 100) / 100;
}

/**
 * Calculate the overall confidence score from sources and claims.
 *
 * Formula: weighted_avg(source_reliability) × factual_basis × inference_quality × (1 - assumption_risk)
 */
export function calculateConfidence(
  sources: KQRSource[],
  claims: IFXClaim[]
): { confidence: number; breakdown: KQRConfidenceBreakdown } {
  // Source reliability (weighted average)
  const totalWeight = sources.reduce((sum, s) => sum + s.weight, 0);
  const weightedReliability = totalWeight > 0
    ? sources.reduce((sum, s) => sum + s.weight * KQR_RELIABILITY_SCORES[s.reliability], 0) / totalWeight
    : 0.5;

  // Claim analysis
  const factualBasis = calculateFactualBasis(claims);
  const inferenceQuality = calculateInferenceQuality(claims);
  const assumptionRisk = calculateAssumptionRisk(claims);

  // Calculate final confidence
  const confidence = weightedReliability * factualBasis * inferenceQuality * (1 - assumptionRisk);

  // Round to 2 decimal places
  const roundedConfidence = Math.round(confidence * 100) / 100;

  return {
    confidence: roundedConfidence,
    breakdown: {
      factualBasis: Math.round(factualBasis * 100) / 100,
      inferenceQuality: Math.round(inferenceQuality * 100) / 100,
      assumptionRisk: Math.round(assumptionRisk * 100) / 100,
    },
  };
}

// ============================================================
// FULL QUALIFICATION
// ============================================================

/**
 * Generate a complete KQR qualification for a recommendation.
 */
export function generateQualification(
  sources: KQRSource[],
  claims: IFXClaim[],
  crossValidation: KQRCrossValidation
): KQRQualification {
  const { confidence, breakdown } = calculateConfidence(sources, claims);

  // Generate qualification statement
  const highReliabilitySources = sources.filter(s => s.reliability === 'high' || s.reliability === 'very_high').length;
  const statement = generateQualificationStatementInternal(
    sources.length,
    highReliabilitySources,
    confidence,
    breakdown
  );

  return {
    overallConfidence: confidence,
    sourcesUsed: sources,
    crossValidation,
    confidenceBreakdown: breakdown,
    qualificationStatement: statement,
  };
}

/**
 * Generate a human-readable qualification statement.
 * Internal version with full breakdown parameter.
 */
function generateQualificationStatementInternal(
  totalSources: number,
  highReliabilitySources: number,
  confidence: number,
  breakdown: KQRConfidenceBreakdown
): string {
  const parts: string[] = [];

  // Source summary
  parts.push(
    `Raccomandazione basata su ${totalSources} fonti indipendenti, ` +
    `di cui ${highReliabilitySources} ad alta affidabilità.`
  );

  // Confidence
  parts.push(`Confidenza complessiva ${confidence}.`);

  // Main area of uncertainty
  if (breakdown.assumptionRisk > 0.3) {
    parts.push('Area di maggiore incertezza: assunzioni non verificate.');
  } else if (breakdown.inferenceQuality < 0.7) {
    parts.push('Area di maggiore incertezza: qualità delle inferenze.');
  } else if (breakdown.factualBasis < 0.5) {
    parts.push('Area di maggiore incertezza: base fattuale limitata.');
  }

  return parts.join(' ');
}

/**
 * Generate a human-readable qualification statement.
 *
 * @param confidence - Overall confidence score (0-1)
 * @param sources - Array of KQR sources used
 */
export function generateQualificationStatement(
  confidence: number,
  sources: KQRSource[]
): string {
  const highReliabilitySources = sources.filter(
    s => s.reliability === 'high' || s.reliability === 'very_high'
  ).length;

  // Calculate breakdown for uncertainty detection
  const avgWeight = sources.length > 0
    ? sources.reduce((sum, s) => sum + s.weight, 0) / sources.length
    : 0.5;

  const breakdown: KQRConfidenceBreakdown = {
    factualBasis: Math.min(1, avgWeight * 1.2), // Estimate
    inferenceQuality: Math.min(1, confidence * 1.1), // Estimate
    assumptionRisk: Math.max(0, 1 - confidence), // Inverse of confidence
  };

  return generateQualificationStatementInternal(
    sources.length,
    highReliabilitySources,
    confidence,
    breakdown
  );
}

// ============================================================
// CONFIDENCE THRESHOLDS
// ============================================================

/**
 * Confidence thresholds for different actions.
 */
export const CONFIDENCE_THRESHOLDS = {
  /** Minimum confidence for REPLACE_EXISTING action */
  replaceExisting: 0.70,

  /** Minimum confidence for COMPLEMENT action */
  complement: 0.60,

  /** Minimum confidence for NEW_CAPABILITY action */
  newCapability: 0.55,

  /** Minimum confidence for MONITOR action */
  monitor: 0.40,

  /** Minimum confidence for any recommendation */
  minimum: 0.35,
};

/**
 * Check if confidence meets the threshold for a given action.
 */
export function meetsConfidenceThreshold(
  confidence: number,
  action: 'REPLACE_EXISTING' | 'COMPLEMENT' | 'NEW_CAPABILITY' | 'MONITOR'
): boolean {
  const threshold = CONFIDENCE_THRESHOLDS[
    action.toLowerCase().replace('_', '') as keyof typeof CONFIDENCE_THRESHOLDS
  ] ?? CONFIDENCE_THRESHOLDS.minimum;

  return confidence >= threshold;
}

/**
 * Get the maximum action type allowed for a given confidence level.
 */
export function getMaxActionForConfidence(
  confidence: number
): 'REPLACE_EXISTING' | 'COMPLEMENT' | 'NEW_CAPABILITY' | 'MONITOR' | null {
  if (confidence >= CONFIDENCE_THRESHOLDS.replaceExisting) return 'REPLACE_EXISTING';
  if (confidence >= CONFIDENCE_THRESHOLDS.complement) return 'COMPLEMENT';
  if (confidence >= CONFIDENCE_THRESHOLDS.newCapability) return 'NEW_CAPABILITY';
  if (confidence >= CONFIDENCE_THRESHOLDS.monitor) return 'MONITOR';
  return null;
}
