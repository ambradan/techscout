/**
 * TechScout — Type Exports v1.1
 *
 * Re-exports all types and Zod schemas from the types module.
 * Import from '@/types' or './types' in other modules.
 *
 * Types are inferred from Zod schemas for runtime validation.
 */

// ============================================================
// IFX (Information Flow eXplicitness)
// ============================================================
export {
  // Zod Schemas
  IFXTagTypeSchema,
  SourceReliabilitySchema,
  IFXTraceIdSchema,
  IFXTaggedClaimSchema,
  IFXFactSchema,
  IFXInferenceSchema,
  IFXAssumptionSchema,
  IFXClaimSchema,
  IFXTraceSummarySchema,
  IFXGovernanceSourceSchema,
  IFXGovernanceSchema,
  ClaimSummarySchema,
} from './ifx';

export type {
  IFXTagType,
  SourceReliability,
  IFXTraceId,
  IFXTaggedClaim,
  IFXFact,
  IFXInference,
  IFXAssumption,
  IFXClaim,
  IFXTraceSummary,
  IFXGovernanceSource,
  IFXGovernance,
  ClaimSummary,
} from './ifx';

// ============================================================
// KQR (Knowledge Qualification & Reliability)
// ============================================================
export {
  // Zod Schemas
  KQRReliabilitySchema,
  KQRSourceTypeSchema,
  KQRSourceSchema,
  KQRCrossValidationSchema,
  KQRConfidenceBreakdownSchema,
  KQRQualificationSchema,
  // Constants
  KQR_RELIABILITY_SCORES,
  KQR_SOURCE_TYPE_WEIGHTS,
} from './kqr';

export type {
  KQRReliability,
  KQRSourceType,
  KQRSource,
  KQRCrossValidation,
  KQRConfidenceBreakdown,
  KQRQualification,
} from './kqr';

// ============================================================
// Project Profile
// ============================================================
export {
  // Zod Schemas - Enums
  ProjectPhaseSchema,
  TeamRoleSchema,
  ScoutingFrequencySchema,
  SourceProviderSchema,
  ConnectionTypeSchema,
  LanguageRoleSchema,
  FrameworkCategorySchema,
  DependencyEcosystemSchema,
  CFSeveritySchema,
  BreakingChangeAlertTypeSchema,
  HealthTrendSchema,
  // Zod Schemas - Types
  TeamMemberSchema,
  NotificationChannelSchema,
  BreakingChangesConfigSchema,
  ExportConfigSchema,
  AgentSafetyConfigSchema,
  AgentConfigSchema,
  ScoutingConfigSchema,
  GitHubRepoSchema,
  GitLabRepoSchema,
  SourceConnectionSchema,
  ProjectSourceSchema,
  LanguageInfoSchema,
  FrameworkInfoSchema,
  DatabaseInfoSchema,
  HostingInfoSchema,
  InfrastructureInfoSchema,
  KeyDependencySchema,
  EcosystemDependenciesSchema,
  AllDependenciesSchema,
  ProjectStackSchema,
  HealthComponentScoreSchema,
  StackHealthComponentsSchema,
  StackHealthSchema,
  ProjectManifestSchema,
  CFFindingSchema,
  CFScanSummarySchema,
  CFFindingsSchema,
  AdoptionRecordSchema,
  CostCalibrationSchema,
  CostTrackingSchema,
  ProjectSchema,
  ProjectProfileSchema,
  PartialProjectProfileSchema,
  // Database Entity Schemas
  ProjectEntitySchema,
  ProjectSourceEntitySchema,
  ProjectTeamEntitySchema,
  ProjectStackEntitySchema,
  ProjectManifestEntitySchema,
  CFFindingEntitySchema,
  StackHealthEntitySchema,
} from './project-profile';

export type {
  // Enums
  ProjectPhase,
  TeamRole,
  ScoutingFrequency,
  SourceProvider,
  ConnectionType,
  LanguageRole,
  FrameworkCategory,
  DependencyEcosystem,
  CFSeverity,
  BreakingChangeAlertType,
  HealthTrend,
  // Team
  TeamMember,
  NotificationChannel,
  // Scouting config
  BreakingChangesConfig,
  ExportConfig,
  AgentSafetyConfig,
  AgentConfig,
  ScoutingConfig,
  // Sources
  GitHubRepo,
  GitLabRepo,
  SourceConnection,
  ProjectSource,
  // Stack
  LanguageInfo,
  FrameworkInfo,
  DatabaseInfo,
  HostingInfo,
  InfrastructureInfo,
  KeyDependency,
  EcosystemDependencies,
  AllDependencies,
  ProjectStack,
  // Stack Health
  HealthComponentScore,
  StackHealthComponents,
  StackHealth,
  // Manifest
  ProjectManifest,
  // CF Findings
  CFFinding,
  CFScanSummary,
  CFFindings,
  // Cost Tracking
  AdoptionRecord,
  CostCalibration,
  CostTracking,
  // Complete Profile
  Project,
  ProjectProfile,
  PartialProjectProfile,
  // Database Entities
  ProjectEntity,
  ProjectSourceEntity,
  ProjectTeamEntity,
  ProjectStackEntity,
  ProjectManifestEntity,
  CFFindingEntity,
  StackHealthEntity,
} from './project-profile';

// ============================================================
// Feed Items
// ============================================================
export {
  // Zod Schemas
  FeedSourceTierSchema,
  FeedSourceNameSchema,
  FeedSourceConfigSchema,
  TractionSignalsSchema,
  FeedSourceTypeSchema,
  FeedItemSchema,
  RawFeedItemSchema,
  FeedItemEntitySchema,
  FeedFetchResultSchema,
  FeedBatchResultSchema,
  PreFilterMatchSchema,
  PreFilterBatchResultSchema,
} from './feed-item';

export type {
  // Configuration
  FeedSourceTier,
  FeedSourceName,
  FeedSourceConfig,
  // Traction
  TractionSignals,
  // Feed Item
  FeedSourceType,
  FeedItem,
  RawFeedItem,
  FeedItemEntity,
  // Processing
  FeedFetchResult,
  FeedBatchResult,
  // Pre-filtering
  PreFilterMatch,
  PreFilterBatchResult,
} from './feed-item';

// ============================================================
// Recommendations
// ============================================================
export {
  // Zod Schemas - Enums
  RecommendationTypeSchema,
  RecommendationActionSchema,
  RecommendationPrioritySchema,
  SubjectTypeSchema,
  SubjectMaturitySchema,
  RiskLevelSchema,
  ReversibilitySchema,
  StabilityVerdictSchema,
  FeedbackStatusSchema,
  ActionRequiredSchema,
  LearningCurveSchema,
  ComplexitySchema,
  // Zod Schemas - Types
  SubjectTractionSchema,
  RecommendationSubjectSchema,
  CostOfChangeSchema,
  CostOfNoChangeSchema,
  MaturityGateSchema,
  StackHealthInfluenceSchema,
  StabilityAssessmentSchema,
  TechnicalAnalysisSchema,
  CalibratedEffortSchema,
  ImpactScoreSchema,
  TechnicalImpactSchema,
  TradeoffsSchema,
  FailureModeSchema,
  TechnicalOutputSchema,
  ClientTalkingPointSchema,
  HumanFriendlyImpactSchema,
  HumanFriendlyOutputSchema,
  RecommendationSchema,
  BreakingChangeAlertSubjectSchema,
  BreakingChangeAlertSchema,
  CostTrackingFeedbackSchema,
  RecommendationFeedbackSchema,
  RecommendationEntitySchema,
  RecommendationFeedbackEntitySchema,
} from './recommendation';

export type {
  // Enums
  RecommendationType,
  RecommendationAction,
  RecommendationPriority,
  SubjectType,
  SubjectMaturity,
  RiskLevel,
  Reversibility,
  StabilityVerdict,
  FeedbackStatus,
  ActionRequired,
  LearningCurve,
  Complexity,
  // Subject
  SubjectTraction,
  RecommendationSubject,
  // Stability Assessment
  CostOfChange,
  CostOfNoChange,
  MaturityGate,
  StackHealthInfluence,
  StabilityAssessment,
  // Technical Output
  TechnicalAnalysis,
  CalibratedEffort,
  ImpactScore,
  TechnicalImpact,
  Tradeoffs,
  FailureMode,
  TechnicalOutput,
  // Human-Friendly Output
  ClientTalkingPoint,
  HumanFriendlyImpact,
  HumanFriendlyOutput,
  // Complete Recommendation
  Recommendation,
  BreakingChangeAlert,
  // Feedback
  CostTrackingFeedback,
  RecommendationFeedback,
  // Database Entities
  RecommendationEntity,
  RecommendationFeedbackEntity,
} from './recommendation';

// ============================================================
// Migration Agent
// ============================================================
export {
  // Zod Schemas - Enums
  AgentModeSchema,
  GitProviderSchema,
  MigrationStatusSchema,
  ReviewStatusSchema,
  PreflightCheckTypeSchema,
  StepRiskSchema,
  SafetyStopReasonSchema,
  AuditActionSchema,
  ActorTypeSchema,
  ObservationTypeSchema,
  // Zod Schemas - Types
  AgentGitConfigSchema,
  AgentSafetyLimitsSchema,
  AgentNotificationConfigSchema,
  AgentConfigurationSchema,
  PreflightCheckSchema,
  PreflightResultSchema,
  BackupInfoSchema,
  PlanStepSchema,
  MigrationPlanSchema,
  StepExecutionSchema,
  SafetyCheckSchema,
  AmbiguityLogEntrySchema,
  ClaudeCodeSessionSchema,
  ExecutionResultSchema,
  TestSuiteResultSchema,
  LintResultSchema,
  TypeCheckResultSchema,
  TestingResultSchema,
  DiffStatsSchema,
  FileChangeSchema,
  CFAddressedSchema,
  ObservationSchema,
  EffortComparisonSchema,
  IFXTraceInfoSchema,
  MigrationReportSchema,
  PullRequestSchema,
  HumanReviewSchema,
  PostMergeUpdatesSchema,
  PostMergeInfoSchema,
  SafetyStopSchema,
  MigrationJobSchema,
  AuditLogEntrySchema,
  MigrationJobEntitySchema,
  AuditLogEntitySchema,
} from './agent';

export type {
  // Configuration
  AgentMode,
  GitProvider,
  AgentGitConfig,
  AgentSafetyLimits,
  AgentNotificationConfig,
  AgentConfiguration,
  // Status
  MigrationStatus,
  ReviewStatus,
  // Preflight
  PreflightCheckType,
  PreflightCheck,
  PreflightResult,
  // Backup
  BackupInfo,
  // Plan
  StepRisk,
  PlanStep,
  MigrationPlan,
  // Execution
  StepExecution,
  SafetyCheck,
  AmbiguityLogEntry,
  ClaudeCodeSession,
  ExecutionResult,
  // Testing
  TestSuiteResult,
  LintResult,
  TypeCheckResult,
  TestingResult,
  // Report
  DiffStats,
  FileChange,
  CFAddressed,
  ObservationType,
  Observation,
  EffortComparison,
  IFXTraceInfo,
  MigrationReport,
  // PR
  PullRequest,
  // Review
  HumanReview,
  // Post-Merge
  PostMergeUpdates,
  PostMergeInfo,
  // Safety
  SafetyStopReason,
  SafetyStop,
  // Complete Job
  MigrationJob,
  // Audit
  AuditAction,
  ActorType,
  AuditLogEntry,
  // Database Entities
  MigrationJobEntity,
  AuditLogEntity,
} from './agent';
