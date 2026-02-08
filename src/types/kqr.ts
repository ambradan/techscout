/**
 * TechScout — KQR (Knowledge Qualification & Reliability) Types v1.1
 *
 * Every source has a reliability score.
 * Confidence = weighted(source_reliability x factual_basis x inference_quality x (1 - assumption_risk))
 */

import { z } from 'zod';

// ============================================================
// KQR RELIABILITY
// ============================================================

export const KQRReliabilitySchema = z.enum(['very_high', 'high', 'medium', 'low']);
export type KQRReliability = z.infer<typeof KQRReliabilitySchema>;

// ============================================================
// KQR SOURCE TYPE
// ============================================================

export const KQRSourceTypeSchema = z.enum([
  'automated_scan',        // e.g., GitHub API, Code Forensics
  'deterministic_analysis', // e.g., CF pattern matching
  'primary_source',        // e.g., official docs, release notes
  'community_signal',      // e.g., HN discussion, Reddit
  'traction_signal',       // e.g., GitHub stars, npm downloads
  'user_input',            // e.g., manifest, manual config
]);
export type KQRSourceType = z.infer<typeof KQRSourceTypeSchema>;

// ============================================================
// KQR SOURCE
// ============================================================

export const KQRSourceSchema = z.object({
  source: z.string().min(1),
  type: KQRSourceTypeSchema,
  reliability: KQRReliabilitySchema,
  weight: z.number().min(0).max(1),
  url: z.string().url().optional(),
  lastFetched: z.string().datetime().optional(),
});
export type KQRSource = z.infer<typeof KQRSourceSchema>;

// ============================================================
// CROSS VALIDATION
// ============================================================

export const KQRCrossValidationSchema = z.object({
  sourcesAgreeing: z.number().int().min(0),
  sourcesConflicting: z.number().int().min(0),
  sourcesInsufficient: z.number().int().min(0),
});
export type KQRCrossValidation = z.infer<typeof KQRCrossValidationSchema>;

// ============================================================
// CONFIDENCE BREAKDOWN
// ============================================================

export const KQRConfidenceBreakdownSchema = z.object({
  factualBasis: z.number().min(0).max(1),       // How much is based on facts
  inferenceQuality: z.number().min(0).max(1),   // Quality of logical derivations
  assumptionRisk: z.number().min(0).max(1),     // Risk from unverified assumptions
});
export type KQRConfidenceBreakdown = z.infer<typeof KQRConfidenceBreakdownSchema>;

// ============================================================
// COMPLETE KQR QUALIFICATION
// ============================================================

export const KQRQualificationSchema = z.object({
  overallConfidence: z.number().min(0).max(1),
  sourcesUsed: z.array(KQRSourceSchema),
  crossValidation: KQRCrossValidationSchema,
  confidenceBreakdown: KQRConfidenceBreakdownSchema,
  qualificationStatement: z.string().min(1),
});
export type KQRQualification = z.infer<typeof KQRQualificationSchema>;

// ============================================================
// CONSTANT MAPPINGS
// ============================================================

/**
 * Reliability score mapping for calculations
 */
export const KQR_RELIABILITY_SCORES: Record<KQRReliability, number> = {
  very_high: 0.95,
  high: 0.80,
  medium: 0.60,
  low: 0.35,
} as const;

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
} as const;
