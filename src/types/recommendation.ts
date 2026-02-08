/**
 * TechScout — Recommendation Types v1.1
 *
 * Every recommendation MUST be conforming to this schema.
 * Dual-output: technical (dev) + human-friendly (PM/stakeholder).
 * Governed by IFX/KQR.
 */

import { z } from 'zod';
import { IFXFactSchema, IFXInferenceSchema, IFXAssumptionSchema, IFXTraceIdSchema } from './ifx';
import type { IFXFact, IFXInference, IFXAssumption, IFXTraceId } from './ifx';
import { KQRQualificationSchema } from './kqr';
import type { KQRQualification } from './kqr';
import { TeamRoleSchema, BreakingChangeAlertTypeSchema } from './project-profile';
import type { TeamRole, BreakingChangeAlertType } from './project-profile';

// ============================================================
// ENUMS AND CONSTANTS
// ============================================================

export const RecommendationTypeSchema = z.enum(['recommendation', 'breaking_change_alert']);
export type RecommendationType = z.infer<typeof RecommendationTypeSchema>;

export const RecommendationActionSchema = z.enum([
  'REPLACE_EXISTING',
  'COMPLEMENT',
  'NEW_CAPABILITY',
  'MONITOR',
]);
export type RecommendationAction = z.infer<typeof RecommendationActionSchema>;

export const RecommendationPrioritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type RecommendationPriority = z.infer<typeof RecommendationPrioritySchema>;

export const SubjectTypeSchema = z.enum([
  'library',
  'framework',
  'platform',
  'tool',
  'service',
  'pattern',
  'practice',
]);
export type SubjectType = z.infer<typeof SubjectTypeSchema>;

export const SubjectMaturitySchema = z.enum([
  'experimental',
  'growth',
  'stable',
  'declining',
  'deprecated',
]);
export type SubjectMaturity = z.infer<typeof SubjectMaturitySchema>;

export const RiskLevelSchema = z.enum(['none', 'low', 'medium', 'high', 'critical']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const ReversibilitySchema = z.enum(['easy', 'medium', 'hard', 'irreversible']);
export type Reversibility = z.infer<typeof ReversibilitySchema>;

export const StabilityVerdictSchema = z.enum(['RECOMMEND', 'MONITOR', 'DEFER']);
export type StabilityVerdict = z.infer<typeof StabilityVerdictSchema>;

export const FeedbackStatusSchema = z.enum([
  'pending',
  'useful',
  'not_relevant',
  'already_knew',
  'adopted',
  'dismissed',
]);
export type FeedbackStatus = z.infer<typeof FeedbackStatusSchema>;

export const ActionRequiredSchema = z.enum(['IMMEDIATE', 'PLAN', 'MONITOR']);
export type ActionRequired = z.infer<typeof ActionRequiredSchema>;

// ============================================================
// SUBJECT (the thing being recommended)
// ============================================================

export const SubjectTractionSchema = z.object({
  githubStars: z.number().int().min(0).optional(),
  githubStars30dGrowth: z.string().optional(),
  npmWeeklyDownloads: z.number().int().min(0).optional(),
  pypiMonthlyDownloads: z.number().int().min(0).optional(),
  firstRelease: z.string().optional(),
  lastRelease: z.string().optional(),
  contributors: z.number().int().min(0).optional(),
  openIssues: z.number().int().min(0).optional(),
});
export type SubjectTraction = z.infer<typeof SubjectTractionSchema>;

export const RecommendationSubjectSchema = z.object({
  name: z.string(),
  type: SubjectTypeSchema,
  url: z.string().url().optional(),
  version: z.string().optional(),
  ecosystem: z.string().optional(),
  license: z.string().optional(),
  maturity: SubjectMaturitySchema,
  traction: SubjectTractionSchema,
});
export type RecommendationSubject = z.infer<typeof RecommendationSubjectSchema>;

// ============================================================
// STABILITY ASSESSMENT (Stability Gate output)
// ============================================================

export const LearningCurveSchema = z.enum(['none', 'low', 'medium', 'high']);
export type LearningCurve = z.infer<typeof LearningCurveSchema>;

export const CostOfChangeSchema = z.object({
  effortDays: z.string(),
  regressionRisk: RiskLevelSchema,
  learningCurve: LearningCurveSchema,
  dependenciesAffected: z.number().int().min(0),
  testsToUpdate: z.string().optional(),
  reversibility: ReversibilitySchema,
});
export type CostOfChange = z.infer<typeof CostOfChangeSchema>;

export const CostOfNoChangeSchema = z.object({
  securityExposure: RiskLevelSchema,
  maintenanceRisk: RiskLevelSchema,
  performanceImpact: RiskLevelSchema,
  deprecationRisk: RiskLevelSchema,
  complianceRisk: RiskLevelSchema,
  detail: z.string(),
});
export type CostOfNoChange = z.infer<typeof CostOfNoChangeSchema>;

export const MaturityGateSchema = z.object({
  subjectMaturity: SubjectMaturitySchema,
  minMaturityForAction: SubjectMaturitySchema,
  passed: z.boolean(),
});
export type MaturityGate = z.infer<typeof MaturityGateSchema>;

export const StackHealthInfluenceSchema = z.object({
  currentScore: z.number().min(0).max(1),
  thresholdApplied: z.enum(['high', 'medium', 'low']),
  painPointMatch: z.boolean(),
  matchedPainPoint: z.string().optional(),
});
export type StackHealthInfluence = z.infer<typeof StackHealthInfluenceSchema>;

export const StabilityAssessmentSchema = z.object({
  costOfChange: CostOfChangeSchema,
  costOfNoChange: CostOfNoChangeSchema,
  maturityGate: MaturityGateSchema,
  stackHealthInfluence: StackHealthInfluenceSchema,
  verdict: StabilityVerdictSchema,
  verdictReasoning: z.string(),
  verdictPlain: z.string(),
});
export type StabilityAssessment = z.infer<typeof StabilityAssessmentSchema>;

// ============================================================
// TECHNICAL OUTPUT (for developers)
// ============================================================

export const TechnicalAnalysisSchema = z.object({
  facts: z.array(IFXFactSchema),
  inferences: z.array(IFXInferenceSchema),
  assumptions: z.array(IFXAssumptionSchema),
});
export type TechnicalAnalysis = z.infer<typeof TechnicalAnalysisSchema>;

export const ComplexitySchema = z.enum(['trivial', 'low', 'medium', 'high', 'very_high']);
export type Complexity = z.infer<typeof ComplexitySchema>;

export const CalibratedEffortSchema = z.object({
  rawEstimateDays: z.string(),
  calibrationApplied: z.boolean(),
  calibrationFactor: z.number().optional(),
  calibratedEstimateDays: z.string(),
  calibrationNote: z.string().optional(),
  complexity: ComplexitySchema,
  breakingChanges: z.boolean(),
  reversibility: ReversibilitySchema,
  steps: z.array(z.string()),
});
export type CalibratedEffort = z.infer<typeof CalibratedEffortSchema>;

export const ImpactScoreSchema = z.object({
  scoreChange: z.string(),
  detail: z.string(),
});
export type ImpactScore = z.infer<typeof ImpactScoreSchema>;

export const TechnicalImpactSchema = z.object({
  security: ImpactScoreSchema,
  performance: ImpactScoreSchema,
  maintainability: ImpactScoreSchema,
  cost: ImpactScoreSchema,
  risk: z.object({
    level: RiskLevelSchema,
    detail: z.string(),
  }),
});
export type TechnicalImpact = z.infer<typeof TechnicalImpactSchema>;

export const TradeoffsSchema = z.object({
  gains: z.array(z.string()),
  losses: z.array(z.string()),
});
export type Tradeoffs = z.infer<typeof TradeoffsSchema>;

export const FailureModeSchema = z.object({
  mode: z.string(),
  probability: z.enum(['low', 'medium', 'high']),
  mitigation: z.string(),
});
export type FailureMode = z.infer<typeof FailureModeSchema>;

export const TechnicalOutputSchema = z.object({
  analysis: TechnicalAnalysisSchema,
  effort: CalibratedEffortSchema,
  impact: TechnicalImpactSchema,
  tradeoffs: TradeoffsSchema,
  failureModes: z.array(FailureModeSchema),
  limitations: z.array(z.string()),
});
export type TechnicalOutput = z.infer<typeof TechnicalOutputSchema>;

// ============================================================
// HUMAN-FRIENDLY OUTPUT (for PM, stakeholders)
// ============================================================

export const ClientTalkingPointSchema = z.object({
  point: z.string(),
  answer: z.string(),
});
export type ClientTalkingPoint = z.infer<typeof ClientTalkingPointSchema>;

export const HumanFriendlyImpactSchema = z.object({
  security: z.string(),
  costo: z.string(),
  rischio: z.string(),
  urgenza: z.string(),
});
export type HumanFriendlyImpact = z.infer<typeof HumanFriendlyImpactSchema>;

export const HumanFriendlyOutputSchema = z.object({
  title: z.string(),
  oneLiner: z.string(),
  summary: z.string(),
  whyNow: z.string(),
  clientTalkingPoints: z.array(ClientTalkingPointSchema),
  impactSummary: HumanFriendlyImpactSchema,
});
export type HumanFriendlyOutput = z.infer<typeof HumanFriendlyOutputSchema>;

// ============================================================
// COMPLETE RECOMMENDATION
// ============================================================

export const RecommendationSchema = z.object({
  id: z.string(),
  ifxTraceId: IFXTraceIdSchema,
  projectId: z.string(),
  feedItemId: z.string().optional(),
  generatedAt: z.string().datetime(),
  modelUsed: z.string(),

  // Type and classification
  type: RecommendationTypeSchema,
  action: RecommendationActionSchema,
  priority: RecommendationPrioritySchema,
  confidence: z.number().min(0).max(1),

  // Subject
  subject: RecommendationSubjectSchema,

  // What it affects
  replaces: z.string().optional(),
  complements: z.string().optional(),
  enables: z.string().optional(),

  // Role visibility
  roleVisibility: z.array(TeamRoleSchema),

  // Assessments
  stabilityAssessment: StabilityAssessmentSchema,
  technical: TechnicalOutputSchema,
  humanFriendly: HumanFriendlyOutputSchema,
  kqr: KQRQualificationSchema,

  // Delivery state
  isDelivered: z.boolean(),
  deliveredAt: z.string().datetime().optional(),
  deliveryChannel: z.string().optional(),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

// ============================================================
// BREAKING CHANGE ALERT
// ============================================================

export const BreakingChangeAlertSubjectSchema = z.object({
  name: z.string(),
  currentVersion: z.string(),
  newVersion: z.string(),
  url: z.string().url().optional(),
});

export const BreakingChangeAlertSchema = z.object({
  id: z.string(),
  ifxTraceId: IFXTraceIdSchema,
  projectId: z.string(),
  generatedAt: z.string().datetime(),
  type: z.literal('breaking_change_alert'),

  alertType: BreakingChangeAlertTypeSchema,

  subject: BreakingChangeAlertSubjectSchema,

  severity: RecommendationPrioritySchema,

  technicalSummary: z.string(),
  humanSummary: z.string(),

  actionRequired: ActionRequiredSchema,
  actionDetail: z.string(),

  affectedTeamRoles: z.array(TeamRoleSchema),
});
export type BreakingChangeAlert = z.infer<typeof BreakingChangeAlertSchema>;

// ============================================================
// FEEDBACK
// ============================================================

export const CostTrackingFeedbackSchema = z.object({
  actualDays: z.number().min(0).optional(),
  actualComplexity: ComplexitySchema.optional(),
  notes: z.string().optional(),
  unexpectedIssues: z.string().optional(),
});
export type CostTrackingFeedback = z.infer<typeof CostTrackingFeedbackSchema>;

export const RecommendationFeedbackSchema = z.object({
  id: z.string(),
  recommendationId: z.string(),
  status: FeedbackStatusSchema,
  userNotes: z.string().optional(),
  submittedBy: z.string().optional(),
  submittedAt: z.string().datetime().optional(),
  costTracking: CostTrackingFeedbackSchema.optional(),
  adoptedAt: z.string().datetime().optional(),
  adoptionOutcome: z.record(z.string(), z.unknown()).optional(),
});
export type RecommendationFeedback = z.infer<typeof RecommendationFeedbackSchema>;

// ============================================================
// DATABASE ENTITY TYPES
// ============================================================

export const RecommendationEntitySchema = z.object({
  id: z.string(),
  project_id: z.string(),
  feed_item_id: z.string().nullable(),
  ifx_trace_id: z.string(),
  model_used: z.string(),
  generated_at: z.string().datetime(),
  type: RecommendationTypeSchema,
  action: RecommendationActionSchema,
  priority: RecommendationPrioritySchema,
  confidence: z.number().min(0).max(1),
  subject: RecommendationSubjectSchema,
  replaces: z.string().nullable(),
  complements: z.string().nullable(),
  enables: z.string().nullable(),
  role_visibility: z.array(TeamRoleSchema),
  stability_assessment: StabilityAssessmentSchema,
  technical: TechnicalOutputSchema,
  human_friendly: HumanFriendlyOutputSchema,
  kqr: KQRQualificationSchema,
  is_delivered: z.boolean(),
  delivered_at: z.string().datetime().nullable(),
  delivery_channel: z.string().nullable(),
  alert_type: BreakingChangeAlertTypeSchema.nullable(),
  alert_severity: RecommendationPrioritySchema.nullable(),
  action_required: z.string().nullable(),
  created_at: z.string().datetime(),
});
export type RecommendationEntity = z.infer<typeof RecommendationEntitySchema>;

export const RecommendationFeedbackEntitySchema = z.object({
  id: z.string(),
  recommendation_id: z.string(),
  status: FeedbackStatusSchema,
  user_notes: z.string().nullable(),
  submitted_by: z.string().nullable(),
  submitted_at: z.string().datetime().nullable(),
  actual_days: z.number().nullable(),
  actual_complexity: z.string().nullable(),
  unexpected_issues: z.string().nullable(),
  adoption_notes: z.string().nullable(),
  adopted_at: z.string().datetime().nullable(),
  adoption_outcome: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type RecommendationFeedbackEntity = z.infer<typeof RecommendationFeedbackEntitySchema>;
