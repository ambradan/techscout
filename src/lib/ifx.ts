/**
 * TechScout — IFX (Information Flow eXplicitness) Helpers
 *
 * Every claim in the system MUST be tagged with its epistemic status.
 * These helpers ensure consistent tagging throughout the codebase.
 */

import { nanoid } from 'nanoid';
import type {
  IFXTagType,
  IFXFact,
  IFXInference,
  IFXAssumption,
  IFXClaim,
  IFXTraceId,
  IFXTraceSummary,
  KQRReliability,
} from '../types';

// ============================================================
// TRACE ID GENERATION
// ============================================================

/**
 * Generate a new IFX trace ID.
 * Format: IFX-{YYYY}-{MMDD}-{TYPE}-{SEQ}
 *
 * @param type - Optional type suffix (e.g., 'MIG' for migration, 'BCA' for breaking change alert)
 */
export function generateTraceId(type?: string): IFXTraceId {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const seq = nanoid(6).toUpperCase();

  if (type) {
    return `IFX-${year}-${month}${day}-${type}-${seq}`;
  }
  return `IFX-${year}-${month}${day}-${seq}`;
}

/**
 * Generate a trace ID for a recommendation.
 */
export function generateRecommendationTraceId(): IFXTraceId {
  return generateTraceId();
}

/**
 * Generate a trace ID for a migration job.
 */
export function generateMigrationTraceId(): IFXTraceId {
  return generateTraceId('MIG');
}

/**
 * Generate a trace ID for a breaking change alert.
 */
export function generateBreakingChangeTraceId(): IFXTraceId {
  return generateTraceId('BCA');
}

// ============================================================
// CLAIM TAGGING
// ============================================================

/**
 * Tag a claim as a FACT.
 * A fact is verifiable without assumptions.
 *
 * @param claim - The factual statement
 * @param source - The source of this fact (e.g., "github_api", "code_forensics_l1")
 * @param sourceReliability - How reliable is this source
 * @param options - Additional options (sourceUrl, cfFindingId)
 */
export function tagFact(
  claim: string,
  source: string,
  sourceReliability: KQRReliability,
  options?: { sourceUrl?: string; cfFindingId?: string }
): IFXFact {
  return {
    ifxTag: 'FACT',
    claim,
    source,
    sourceReliability,
    sourceUrl: options?.sourceUrl,
    cfFindingId: options?.cfFindingId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Tag a claim as an INFERENCE.
 * An inference is logically derived from facts.
 *
 * @param claim - The inferred statement
 * @param derivedFrom - References to facts or other inferences this is derived from
 * @param confidence - Confidence level (0-1)
 */
export function tagInference(
  claim: string,
  derivedFrom: string[],
  confidence: number
): IFXInference {
  if (confidence < 0 || confidence > 1) {
    throw new Error('Confidence must be between 0 and 1');
  }

  return {
    ifxTag: 'INFERENCE',
    claim,
    derivedFrom,
    confidence,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Tag a claim as an ASSUMPTION.
 * An assumption is an explicit unverified hypothesis.
 *
 * @param claim - The assumed statement
 */
export function tagAssumption(claim: string): IFXAssumption {
  return {
    ifxTag: 'ASSUMPTION',
    claim,
    validated: undefined,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Mark an assumption as validated.
 */
export function validateAssumption(
  assumption: IFXAssumption,
  validated: boolean,
  invalidationReason?: string
): IFXAssumption {
  return {
    ...assumption,
    validated,
    validatedAt: new Date().toISOString(),
    invalidationReason: validated ? undefined : invalidationReason,
  };
}

// ============================================================
// CLAIM ANALYSIS
// ============================================================

/**
 * Analyze a collection of claims and produce a summary.
 */
export function summarizeClaims(claims: IFXClaim[]): {
  facts: number;
  inferences: number;
  assumptions: number;
  validatedAssumptions: number;
  invalidatedAssumptions: number;
  avgInferenceConfidence: number;
} {
  const facts = claims.filter(c => c.ifxTag === 'FACT');
  const inferences = claims.filter(c => c.ifxTag === 'INFERENCE') as IFXInference[];
  const assumptions = claims.filter(c => c.ifxTag === 'ASSUMPTION') as IFXAssumption[];

  const validatedAssumptions = assumptions.filter(a => a.validated === true);
  const invalidatedAssumptions = assumptions.filter(a => a.validated === false);

  const avgInferenceConfidence = inferences.length > 0
    ? inferences.reduce((sum, i) => sum + i.confidence, 0) / inferences.length
    : 0;

  return {
    facts: facts.length,
    inferences: inferences.length,
    assumptions: assumptions.length,
    validatedAssumptions: validatedAssumptions.length,
    invalidatedAssumptions: invalidatedAssumptions.length,
    avgInferenceConfidence: Math.round(avgInferenceConfidence * 100) / 100,
  };
}

/**
 * Create an IFX trace summary for a recommendation or migration.
 */
export function createTraceSummary(
  traceId: IFXTraceId,
  claims: IFXClaim[],
  recommendationTrace?: IFXTraceId,
  newFactsDiscovered: number = 0
): IFXTraceSummary {
  const summary = summarizeClaims(claims);

  return {
    traceId,
    recommendationTrace,
    factsCount: summary.facts,
    inferencesCount: summary.inferences,
    assumptionsCount: summary.assumptions,
    assumptionsValidated: summary.validatedAssumptions,
    assumptionsInvalidated: summary.invalidatedAssumptions,
    newFactsDiscovered,
  };
}

// ============================================================
// IFX-TAGGED TEXT FORMATTING
// ============================================================

/**
 * Format a claim for display in technical output.
 * Prefixes the claim with its IFX tag in brackets.
 */
export function formatClaim(claim: IFXClaim): string {
  return `[${claim.ifxTag}] ${claim.claim}`;
}

/**
 * Format multiple claims as a structured analysis.
 */
export function formatAnalysis(claims: IFXClaim[]): string {
  const facts = claims.filter(c => c.ifxTag === 'FACT');
  const inferences = claims.filter(c => c.ifxTag === 'INFERENCE');
  const assumptions = claims.filter(c => c.ifxTag === 'ASSUMPTION');

  let output = '';

  if (facts.length > 0) {
    output += 'FACTS:\n';
    for (const fact of facts) {
      output += `  - ${fact.claim}\n`;
    }
    output += '\n';
  }

  if (inferences.length > 0) {
    output += 'INFERENCES:\n';
    for (const inference of inferences as IFXInference[]) {
      output += `  - ${inference.claim} (confidence: ${inference.confidence})\n`;
    }
    output += '\n';
  }

  if (assumptions.length > 0) {
    output += 'ASSUMPTIONS:\n';
    for (const assumption of assumptions) {
      output += `  - ${assumption.claim}\n`;
    }
  }

  return output.trim();
}

/**
 * Extract all assumptions from a collection of claims.
 * Useful for generating the "Assumptions/Limitations" section.
 */
export function extractAssumptions(claims: IFXClaim[]): string[] {
  return claims
    .filter(c => c.ifxTag === 'ASSUMPTION')
    .map(c => c.claim);
}

/**
 * Calculate the "assumption risk" for a collection of claims.
 * Used in KQR confidence calculation.
 * Higher risk = more unverified assumptions relative to facts.
 */
export function calculateAssumptionRisk(claims: IFXClaim[]): number {
  const facts = claims.filter(c => c.ifxTag === 'FACT').length;
  const assumptions = claims.filter(c => c.ifxTag === 'ASSUMPTION').length;
  const validatedAssumptions = claims.filter(
    c => c.ifxTag === 'ASSUMPTION' && (c as IFXAssumption).validated === true
  ).length;

  if (assumptions === 0) return 0;

  const unvalidatedAssumptions = assumptions - validatedAssumptions;
  const total = facts + assumptions;

  if (total === 0) return 0.5; // No claims = moderate risk

  // Risk increases with more unvalidated assumptions relative to facts
  return Math.min(1, unvalidatedAssumptions / Math.max(1, facts));
}
