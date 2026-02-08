/**
 * TechScout — Type Exports
 *
 * Re-exports all types from the types module.
 * Import from '@/types' or './types' in other modules.
 */

// IFX (Information Flow eXplicitness)
export type {
  IFXTagType,
  IFXTaggedClaim,
  IFXFact,
  IFXInference,
  IFXAssumption,
  IFXClaim,
  IFXTraceId,
  IFXTraceSummary,
  IFXGovernance,
} from './ifx';

// KQR (Knowledge Qualification & Reliability)
export type {
  KQRReliability,
  KQRSourceType,
  KQRSource,
  KQRCrossValidation,
  KQRConfidenceBreakdown,
  KQRQualification,
} from './kqr';
export { KQR_RELIABILITY_SCORES, KQR_SOURCE_TYPE_WEIGHTS } from './kqr';

// Project Profile
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

// Feed Items
export type {
  // Configuration
  FeedSourceTier,
  FeedSourceName,
  FeedSourceConfig,
  // Traction
  TractionSignals,
  // Feed Item
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

// Recommendations
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

// Migration Agent
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
