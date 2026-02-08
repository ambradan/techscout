/**
 * TechScout — KQR (Knowledge Qualification & Reliability) Types
 *
 * Every source has a reliability score.
 * Confidence = weighted(source_reliability × factual_basis × inference_quality × (1 - assumption_risk))
 */

/**
 * KQR reliability levels
 */
export type KQRReliability = 'very_high' | 'high' | 'medium' | 'low';

/**
 * Source types for KQR classification
 */
export type KQRSourceType =
  | 'automated_scan'        // e.g., GitHub API, Code Forensics
  | 'deterministic_analysis' // e.g., CF pattern matching
  | 'primary_source'        // e.g., official docs, release notes
  | 'community_signal'      // e.g., HN discussion, Reddit
  | 'traction_signal'       // e.g., GitHub stars, npm downloads
  | 'user_input';           // e.g., manifest, manual config

/**
 * A qualified source with reliability score
 */
export interface KQRSource {
  source: string;
  type: KQRSourceType;
  reliability: KQRReliability;
  weight: number; // 0-1, relative importance
  url?: string;
  lastFetched?: string;
}

/**
 * Cross-validation result
 */
export interface KQRCrossValidation {
  sourcesAgreeing: number;
  sourcesConflicting: number;
  sourcesInsufficient: number;
}

/**
 * Confidence breakdown by component
 */
export interface KQRConfidenceBreakdown {
  factualBasis: number;       // 0-1: How much is based on facts
  inferenceQuality: number;   // 0-1: Quality of logical derivations
  assumptionRisk: number;     // 0-1: Risk from unverified assumptions
}

/**
 * Complete KQR qualification for a recommendation or analysis
 */
export interface KQRQualification {
  overallConfidence: number; // 0-1
  sourcesUsed: KQRSource[];
  crossValidation: KQRCrossValidation;
  confidenceBreakdown: KQRConfidenceBreakdown;
  qualificationStatement: string; // Human-readable summary
}

/**
 * Reliability score mapping for calculations
 */
export const KQR_RELIABILITY_SCORES: Record<KQRReliability, number> = {
  very_high: 0.95,
  high: 0.80,
  medium: 0.60,
  low: 0.35,
};

/**
 * Default weights for source types
 */
export const KQR_SOURCE_TYPE_WEIGHTS: Record<KQRSourceType, number> = {
  automated_scan: 0.85,
  deterministic_analysis: 0.90,
  primary_source: 0.80,
  community_signal: 0.50,
  traction_signal: 0.45,
  user_input: 0.60,
};
