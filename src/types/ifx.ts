/**
 * TechScout — IFX (Information Flow eXplicitness) Types
 *
 * Every claim in the system MUST be tagged with its epistemic status:
 * - FACT: Verifiable without assumptions
 * - INFERENCE: Logically derived from FACTs
 * - ASSUMPTION: Explicit unverified hypothesis
 */

/**
 * IFX tag types
 */
export type IFXTagType = 'FACT' | 'INFERENCE' | 'ASSUMPTION';

/**
 * Base interface for all IFX-tagged claims
 */
export interface IFXTaggedClaim {
  ifxTag: IFXTagType;
  claim: string;
  timestamp?: string;
}

/**
 * A fact claim - verifiable without assumptions
 */
export interface IFXFact extends IFXTaggedClaim {
  ifxTag: 'FACT';
  source: string;
  sourceReliability: 'very_high' | 'high' | 'medium' | 'low';
  sourceUrl?: string;
  cfFindingId?: string; // If derived from Code Forensics
}

/**
 * An inference - logically derived from facts
 */
export interface IFXInference extends IFXTaggedClaim {
  ifxTag: 'INFERENCE';
  derivedFrom: string[]; // References to facts or other inferences
  confidence: number; // 0-1
}

/**
 * An assumption - explicit unverified hypothesis
 */
export interface IFXAssumption extends IFXTaggedClaim {
  ifxTag: 'ASSUMPTION';
  validated?: boolean; // Updated during execution if verified
  validatedAt?: string;
  invalidationReason?: string;
}

/**
 * Union type for any IFX-tagged claim
 */
export type IFXClaim = IFXFact | IFXInference | IFXAssumption;

/**
 * IFX trace identifier format
 * Pattern: IFX-{YYYY}-{MMDD}-{TYPE}-{SEQ}
 * Examples:
 *   - IFX-2026-0208-001 (recommendation)
 *   - IFX-2026-0208-MIG-001 (migration)
 *   - IFX-2026-0208-BCA-001 (breaking change alert)
 */
export type IFXTraceId = string;

/**
 * IFX trace summary for reports
 */
export interface IFXTraceSummary {
  traceId: IFXTraceId;
  recommendationTrace?: IFXTraceId;
  factsCount: number;
  inferencesCount: number;
  assumptionsCount: number;
  assumptionsValidated: number;
  assumptionsInvalidated: number;
  newFactsDiscovered: number;
}

/**
 * Governance metadata using IFX versioning
 */
export interface IFXGovernance {
  ifxVersion: string;
  kqrVersion: string;
  lastProfileValidation?: string;
  profileCompletenessScore: number; // 0-1
  dataSourcesUsed: Array<{
    source: string;
    reliability: 'very_high' | 'high' | 'medium' | 'low';
    lastFetched: string;
  }>;
}
