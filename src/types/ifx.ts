/**
 * TechScout — IFX (Information Flow eXplicitness) Types v1.1
 *
 * IFX is the governance protocol for tagging all claims in the system.
 * Every claim MUST be tagged as:
 *   - FACT: Verifiable without assumptions
 *   - INFERENCE: Logically derived from FACTs
 *   - ASSUMPTION: Explicit unverified hypothesis
 *
 * Every output has an ifx_trace_id for full traceability.
 */

import { z } from 'zod';

// ============================================================
// IFX TAG TYPE
// ============================================================

export const IFXTagTypeSchema = z.enum(['FACT', 'INFERENCE', 'ASSUMPTION']);
export type IFXTagType = z.infer<typeof IFXTagTypeSchema>;

// ============================================================
// SOURCE RELIABILITY (used by FACTs)
// ============================================================

export const SourceReliabilitySchema = z.enum(['very_high', 'high', 'medium', 'low']);
export type SourceReliability = z.infer<typeof SourceReliabilitySchema>;

// ============================================================
// IFX TRACE ID
// ============================================================

// Format: IFX-YYYY-MMDD-SEQ or IFX-YYYY-MMDD-TYPE-SEQ
export const IFXTraceIdSchema = z.string().regex(
  /^IFX-\d{4}-\d{4}-[A-Z0-9_-]+$/,
  'IFX trace ID must match format IFX-YYYY-MMDD-SEQ'
);
export type IFXTraceId = z.infer<typeof IFXTraceIdSchema>;

// ============================================================
// IFX TAGGED CLAIM (base interface)
// ============================================================

export const IFXTaggedClaimSchema = z.object({
  ifxTag: IFXTagTypeSchema,
  claim: z.string().min(1, 'Claim cannot be empty'),
  timestamp: z.string().datetime().optional(),
});
export type IFXTaggedClaim = z.infer<typeof IFXTaggedClaimSchema>;

// ============================================================
// FACT
// ============================================================

export const IFXFactSchema = z.object({
  ifxTag: z.literal('FACT'),
  claim: z.string().min(1),
  source: z.string().min(1, 'Source is required for FACTs'),
  sourceReliability: SourceReliabilitySchema,
  sourceUrl: z.string().url().optional(),
  cfFindingId: z.string().optional(), // Reference to Code Forensics finding
  timestamp: z.string().datetime().optional(),
});
export type IFXFact = z.infer<typeof IFXFactSchema>;

// ============================================================
// INFERENCE
// ============================================================

export const IFXInferenceSchema = z.object({
  ifxTag: z.literal('INFERENCE'),
  claim: z.string().min(1),
  derivedFrom: z.array(z.string()).min(1, 'Inference must derive from at least one source'),
  confidence: z.number().min(0).max(1, 'Confidence must be between 0 and 1'),
  timestamp: z.string().datetime().optional(),
});
export type IFXInference = z.infer<typeof IFXInferenceSchema>;

// ============================================================
// ASSUMPTION
// ============================================================

export const IFXAssumptionSchema = z.object({
  ifxTag: z.literal('ASSUMPTION'),
  claim: z.string().min(1),
  validated: z.boolean().optional(), // Set when assumption is validated/invalidated
  validatedAt: z.string().datetime().optional(),
  invalidationReason: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});
export type IFXAssumption = z.infer<typeof IFXAssumptionSchema>;

// ============================================================
// UNION TYPE: IFX CLAIM
// ============================================================

export const IFXClaimSchema = z.discriminatedUnion('ifxTag', [
  IFXFactSchema,
  IFXInferenceSchema,
  IFXAssumptionSchema,
]);
export type IFXClaim = z.infer<typeof IFXClaimSchema>;

// ============================================================
// IFX TRACE SUMMARY
// ============================================================

export const IFXTraceSummarySchema = z.object({
  traceId: IFXTraceIdSchema,
  recommendationTrace: IFXTraceIdSchema.optional(),
  factsCount: z.number().int().min(0),
  inferencesCount: z.number().int().min(0),
  assumptionsCount: z.number().int().min(0),
  assumptionsValidated: z.number().int().min(0).default(0),
  assumptionsInvalidated: z.number().int().min(0).default(0),
  newFactsDiscovered: z.number().int().min(0).default(0),
});
export type IFXTraceSummary = z.infer<typeof IFXTraceSummarySchema>;

// ============================================================
// IFX GOVERNANCE METADATA
// ============================================================

export const IFXGovernanceSourceSchema = z.object({
  source: z.string(),
  reliability: SourceReliabilitySchema,
  lastFetched: z.string().datetime(),
});
export type IFXGovernanceSource = z.infer<typeof IFXGovernanceSourceSchema>;

export const IFXGovernanceSchema = z.object({
  ifxVersion: z.string().default('1.0'),
  kqrVersion: z.string().default('1.0'),
  lastProfileValidation: z.string().datetime().optional(),
  profileCompletenessScore: z.number().min(0).max(1),
  dataSourcesUsed: z.array(IFXGovernanceSourceSchema),
});
export type IFXGovernance = z.infer<typeof IFXGovernanceSchema>;

// ============================================================
// CLAIM SUMMARY (for statistics)
// ============================================================

export const ClaimSummarySchema = z.object({
  facts: z.number().int().min(0),
  inferences: z.number().int().min(0),
  assumptions: z.number().int().min(0),
  avgInferenceConfidence: z.number().min(0).max(1).optional(),
});
export type ClaimSummary = z.infer<typeof ClaimSummarySchema>;
