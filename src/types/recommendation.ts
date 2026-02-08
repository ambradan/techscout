/**
 * TechScout — Recommendation Types v1.1
 *
 * Every recommendation MUST be conforming to this schema.
 * Dual-output: technical (dev) + human-friendly (PM/stakeholder).
 * Governed by IFX/KQR.
 */

import type { IFXFact, IFXInference, IFXAssumption, IFXTraceId } from './ifx';
import type { KQRQualification } from './kqr';
import type { TeamRole, BreakingChangeAlertType } from './project-profile';

// ============================================================
// ENUMS AND CONSTANTS
// ============================================================

export type RecommendationType = 'recommendation' | 'breaking_change_alert';

export type RecommendationAction =
  | 'REPLACE_EXISTING'
  | 'COMPLEMENT'
  | 'NEW_CAPABILITY'
  | 'MONITOR';

export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type SubjectType =
  | 'library'
  | 'framework'
  | 'platform'
  | 'tool'
  | 'service'
  | 'pattern'
  | 'practice';

export type SubjectMaturity =
  | 'experimental'
  | 'growth'
  | 'stable'
  | 'declining'
  | 'deprecated';

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export type Reversibility = 'easy' | 'medium' | 'hard' | 'irreversible';

export type StabilityVerdict = 'RECOMMEND' | 'MONITOR' | 'DEFER';

export type FeedbackStatus =
  | 'pending'
  | 'useful'
  | 'not_relevant'
  | 'already_knew'
  | 'adopted'
  | 'dismissed';

export type ActionRequired = 'IMMEDIATE' | 'PLAN' | 'MONITOR';

// ============================================================
// SUBJECT (the thing being recommended)
// ============================================================

export interface SubjectTraction {
  githubStars?: number;
  githubStars30dGrowth?: string;
  npmWeeklyDownloads?: number;
  pypiMonthlyDownloads?: number;
  firstRelease?: string;
  lastRelease?: string;
  contributors?: number;
  openIssues?: number;
}

export interface RecommendationSubject {
  name: string;
  type: SubjectType;
  url?: string;
  version?: string;
  ecosystem?: string; // npm, pip, cargo, etc.
  license?: string;
  maturity: SubjectMaturity;
  traction: SubjectTraction;
}

// ============================================================
// STABILITY ASSESSMENT (Stability Gate output)
// ============================================================

export interface CostOfChange {
  effortDays: string; // e.g., "2-3"
  regressionRisk: RiskLevel;
  learningCurve: 'none' | 'low' | 'medium' | 'high';
  dependenciesAffected: number;
  testsToUpdate?: string;
  reversibility: Reversibility;
}

export interface CostOfNoChange {
  securityExposure: RiskLevel;
  maintenanceRisk: RiskLevel;
  performanceImpact: RiskLevel;
  deprecationRisk: RiskLevel;
  complianceRisk: RiskLevel;
  detail: string;
}

export interface MaturityGate {
  subjectMaturity: SubjectMaturity;
  minMaturityForAction: SubjectMaturity;
  passed: boolean;
}

export interface StackHealthInfluence {
  currentScore: number;
  thresholdApplied: 'high' | 'medium' | 'low';
  painPointMatch: boolean;
  matchedPainPoint?: string;
}

export interface StabilityAssessment {
  costOfChange: CostOfChange;
  costOfNoChange: CostOfNoChange;
  maturityGate: MaturityGate;
  stackHealthInfluence: StackHealthInfluence;
  verdict: StabilityVerdict;
  verdictReasoning: string; // IFX-tagged reasoning
  verdictPlain: string; // Plain language for PM
}

// ============================================================
// TECHNICAL OUTPUT (for developers)
// ============================================================

export interface TechnicalAnalysis {
  facts: IFXFact[];
  inferences: IFXInference[];
  assumptions: IFXAssumption[];
}

export interface CalibratedEffort {
  rawEstimateDays: string;
  calibrationApplied: boolean;
  calibrationFactor?: number;
  calibratedEstimateDays: string;
  calibrationNote?: string;
  complexity: 'trivial' | 'low' | 'medium' | 'high' | 'very_high';
  breakingChanges: boolean;
  reversibility: Reversibility;
  steps: string[];
}

export interface ImpactScore {
  scoreChange: string; // e.g., "+high", "neutral", "-low"
  detail: string;
}

export interface TechnicalImpact {
  security: ImpactScore;
  performance: ImpactScore;
  maintainability: ImpactScore;
  cost: ImpactScore;
  risk: {
    level: RiskLevel;
    detail: string;
  };
}

export interface Tradeoffs {
  gains: string[];
  losses: string[];
}

export interface FailureMode {
  mode: string;
  probability: 'low' | 'medium' | 'high';
  mitigation: string;
}

export interface TechnicalOutput {
  analysis: TechnicalAnalysis;
  effort: CalibratedEffort;
  impact: TechnicalImpact;
  tradeoffs: Tradeoffs;
  failureModes: FailureMode[];
  limitations: string[];
}

// ============================================================
// HUMAN-FRIENDLY OUTPUT (for PM, stakeholders)
// ============================================================

export interface ClientTalkingPoint {
  point: string;
  answer: string;
}

export interface HumanFriendlyImpact {
  security: string;
  costo: string;
  rischio: string;
  urgenza: string;
}

export interface HumanFriendlyOutput {
  title: string;
  oneLiner: string;
  summary: string;
  whyNow: string;
  clientTalkingPoints: ClientTalkingPoint[];
  impactSummary: HumanFriendlyImpact;
}

// ============================================================
// COMPLETE RECOMMENDATION
// ============================================================

export interface Recommendation {
  id: string;
  ifxTraceId: IFXTraceId;
  projectId: string;
  feedItemId?: string;
  generatedAt: string;
  modelUsed: string;

  // Type and classification
  type: RecommendationType;
  action: RecommendationAction;
  priority: RecommendationPriority;
  confidence: number;

  // Subject
  subject: RecommendationSubject;

  // What it affects
  replaces?: string;
  complements?: string;
  enables?: string;

  // Role visibility
  roleVisibility: TeamRole[];

  // Assessments
  stabilityAssessment: StabilityAssessment;
  technical: TechnicalOutput;
  humanFriendly: HumanFriendlyOutput;
  kqr: KQRQualification;

  // Delivery state
  isDelivered: boolean;
  deliveredAt?: string;
  deliveryChannel?: string;
}

// ============================================================
// BREAKING CHANGE ALERT
// ============================================================

export interface BreakingChangeAlert {
  id: string;
  ifxTraceId: IFXTraceId;
  projectId: string;
  generatedAt: string;
  type: 'breaking_change_alert';

  alertType: BreakingChangeAlertType;

  subject: {
    name: string;
    currentVersion: string;
    newVersion: string;
    url?: string;
  };

  severity: RecommendationPriority;

  technicalSummary: string; // IFX-tagged
  humanSummary: string;

  actionRequired: ActionRequired;
  actionDetail: string;

  affectedTeamRoles: TeamRole[];
}

// ============================================================
// FEEDBACK
// ============================================================

export interface CostTrackingFeedback {
  actualDays?: number;
  actualComplexity?: 'trivial' | 'low' | 'medium' | 'high' | 'very_high';
  notes?: string;
  unexpectedIssues?: string;
}

export interface RecommendationFeedback {
  id: string;
  recommendationId: string;
  status: FeedbackStatus;
  userNotes?: string;
  submittedBy?: string;
  submittedAt?: string;
  costTracking?: CostTrackingFeedback;
  adoptedAt?: string;
  adoptionOutcome?: Record<string, unknown>;
}

// ============================================================
// DATABASE ENTITY TYPES
// ============================================================

export interface RecommendationEntity {
  id: string;
  project_id: string;
  feed_item_id: string | null;
  ifx_trace_id: string;
  model_used: string;
  generated_at: string;
  type: RecommendationType;
  action: RecommendationAction;
  priority: RecommendationPriority;
  confidence: number;
  subject: RecommendationSubject;
  replaces: string | null;
  complements: string | null;
  enables: string | null;
  role_visibility: TeamRole[];
  stability_assessment: StabilityAssessment;
  technical: TechnicalOutput;
  human_friendly: HumanFriendlyOutput;
  kqr: KQRQualification;
  is_delivered: boolean;
  delivered_at: string | null;
  delivery_channel: string | null;
  alert_type: BreakingChangeAlertType | null;
  alert_severity: RecommendationPriority | null;
  action_required: string | null;
  created_at: string;
}

export interface RecommendationFeedbackEntity {
  id: string;
  recommendation_id: string;
  status: FeedbackStatus;
  user_notes: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  actual_days: number | null;
  actual_complexity: string | null;
  unexpected_issues: string | null;
  adoption_notes: string | null;
  adopted_at: string | null;
  adoption_outcome: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
