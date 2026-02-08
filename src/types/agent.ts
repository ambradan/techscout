/**
 * TechScout — Layer 6: Migration Agent Types v1.1
 *
 * Agent types for semi-automated migrations.
 * The agent is an accelerator, not a decision maker.
 * Every modification requires human approval before merge.
 *
 * NON-NEGOTIABLE CONSTRAINTS:
 *   1. Isolated branch, never main/production
 *   2. Commit pre-modification state BEFORE any change
 *   3. Scope limited to recommendation files
 *   4. Mandatory human gate before merge
 *   5. If complexity > 2x estimate, STOP and ask
 *   6. Source code never exposed outside local runtime
 */

import { z } from 'zod';
import { IFXTraceIdSchema, IFXTagTypeSchema } from './ifx';
import type { IFXTraceId } from './ifx';

// ============================================================
// AGENT CONFIGURATION
// ============================================================

export const AgentModeSchema = z.enum(['assisted', 'supervised']);
export type AgentMode = z.infer<typeof AgentModeSchema>;
// assisted: agent works, opens PR, waits
// supervised: agent proposes plan, waits for ok, then executes, waits for merge
// NOTE: NO "autonomous" mode exists. Merge is ALWAYS manual.

export const GitProviderSchema = z.enum(['github', 'gitlab', 'bitbucket']);
export type GitProvider = z.infer<typeof GitProviderSchema>;

export const AgentGitConfigSchema = z.object({
  provider: GitProviderSchema,
  remote: z.string(),
  baseBranch: z.string(),
  branchPrefix: z.string(),
  autoPush: z.boolean(),
  createPr: z.boolean(),
});
export type AgentGitConfig = z.infer<typeof AgentGitConfigSchema>;

export const AgentSafetyLimitsSchema = z.object({
  maxFilesModified: z.number().int().min(1),
  maxLinesChanged: z.number().int().min(1),
  maxExecutionTimeMinutes: z.number().int().min(1),
  complexityThreshold: z.number().min(1),
  requireTestsPass: z.boolean(),
  requireLintPass: z.boolean(),
  forbiddenPaths: z.array(z.string()),
  forbiddenOperations: z.array(z.string()),
});
export type AgentSafetyLimits = z.infer<typeof AgentSafetyLimitsSchema>;

export const AgentNotificationConfigSchema = z.object({
  onBranchCreated: z.boolean(),
  onMigrationComplete: z.boolean(),
  onMigrationFailed: z.boolean(),
  onSafetyStop: z.boolean(),
  onPrOpened: z.boolean(),
  channel: z.enum(['email', 'slack', 'both']),
});
export type AgentNotificationConfig = z.infer<typeof AgentNotificationConfigSchema>;

export const AgentConfigurationSchema = z.object({
  enabled: z.boolean(),
  mode: AgentModeSchema,
  git: AgentGitConfigSchema,
  safety: AgentSafetyLimitsSchema,
  notifications: AgentNotificationConfigSchema,
});
export type AgentConfiguration = z.infer<typeof AgentConfigurationSchema>;

// ============================================================
// MIGRATION JOB STATUS
// ============================================================

export const MigrationStatusSchema = z.enum([
  'pending',
  'backing_up',
  'planning',
  'awaiting_plan_approval',
  'executing',
  'testing',
  'reporting',
  'awaiting_review',
  'approved',
  'merged',
  'rejected',
  'failed',
  'safety_stopped',
  'timeout',
]);
export type MigrationStatus = z.infer<typeof MigrationStatusSchema>;

export const ReviewStatusSchema = z.enum(['pending', 'approved', 'rejected', 'changes_requested']);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

// ============================================================
// PREFLIGHT CHECKS
// ============================================================

export const PreflightCheckTypeSchema = z.enum([
  'base_branch_clean',
  'tests_green',
  'recommendation_valid',
  'scope_within_limits',
  'no_forbidden_paths',
]);
export type PreflightCheckType = z.infer<typeof PreflightCheckTypeSchema>;

export const PreflightCheckSchema = z.object({
  check: PreflightCheckTypeSchema,
  status: z.enum(['passed', 'failed', 'skipped']),
  detail: z.string(),
});
export type PreflightCheck = z.infer<typeof PreflightCheckSchema>;

export const PreflightResultSchema = z.object({
  startedAt: z.string().datetime(),
  checks: z.array(PreflightCheckSchema),
  allPassed: z.boolean(),
});
export type PreflightResult = z.infer<typeof PreflightResultSchema>;

// ============================================================
// BACKUP
// ============================================================

export const BackupInfoSchema = z.object({
  branchName: z.string(),
  createdFrom: z.string(),
  createdFromSha: z.string(),
  backupCommitSha: z.string(),
  backupCommitMessage: z.string(),
  createdAt: z.string().datetime(),
  pushed: z.boolean(),
});
export type BackupInfo = z.infer<typeof BackupInfoSchema>;

// ============================================================
// MIGRATION PLAN
// ============================================================

export const StepRiskSchema = z.enum(['low', 'medium', 'high']);
export type StepRisk = z.infer<typeof StepRiskSchema>;

export const PlanStepSchema = z.object({
  step: z.number().int().min(1),
  action: z.string(),
  command: z.string(),
  filesAffected: z.array(z.string()),
  risk: StepRiskSchema,
  notes: z.string().optional(),
  expected: z.string().optional(),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const MigrationPlanSchema = z.object({
  generatedAt: z.string().datetime(),
  status: ReviewStatusSchema,
  approvedBy: z.string().optional(),
  approvedAt: z.string().datetime().optional(),
  steps: z.array(PlanStepSchema),
  estimatedFiles: z.number().int().min(0),
  estimatedLines: z.number().int().min(0),
  withinSafetyLimits: z.boolean(),
});
export type MigrationPlan = z.infer<typeof MigrationPlanSchema>;

// ============================================================
// EXECUTION
// ============================================================

export const StepExecutionSchema = z.object({
  step: z.number().int().min(1),
  status: z.enum(['completed', 'failed', 'skipped']),
  durationSeconds: z.number().min(0),
  output: z.string(),
  notes: z.string().optional(),
  error: z.string().optional(),
});
export type StepExecution = z.infer<typeof StepExecutionSchema>;

export const SafetyCheckSchema = z.object({
  filesModified: z.number().int().min(0),
  filesLimit: z.number().int().min(1),
  linesChanged: z.number().int().min(0),
  linesLimit: z.number().int().min(1),
  forbiddenPathsTouched: z.number().int().min(0),
  forbiddenOperationsAttempted: z.number().int().min(0),
  complexityRatio: z.number().min(0),
  complexityLimit: z.number().min(1),
  allWithinLimits: z.boolean(),
});
export type SafetyCheck = z.infer<typeof SafetyCheckSchema>;

export const AmbiguityLogEntrySchema = z.object({
  atStep: z.number().int().min(1),
  description: z.string(),
  decision: z.string(),
  confidence: z.number().min(0).max(1),
  ifxTag: IFXTagTypeSchema,
});
export type AmbiguityLogEntry = z.infer<typeof AmbiguityLogEntrySchema>;

export const ClaudeCodeSessionSchema = z.object({
  model: z.string(),
  sessionId: z.string(),
  totalTokens: z.number().int().min(0),
  apiCostUsd: z.number().min(0),
});
export type ClaudeCodeSession = z.infer<typeof ClaudeCodeSessionSchema>;

export const ExecutionResultSchema = z.object({
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  durationMinutes: z.number().min(0),
  claudeCode: ClaudeCodeSessionSchema,
  stepsExecuted: z.array(StepExecutionSchema),
  safetyChecks: SafetyCheckSchema,
  ambiguityLog: z.array(AmbiguityLogEntrySchema),
});
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

// ============================================================
// TESTING
// ============================================================

export const TestSuiteResultSchema = z.object({
  total: z.number().int().min(0),
  passed: z.number().int().min(0),
  failed: z.number().int().min(0),
  skipped: z.number().int().min(0),
  newTestsAdded: z.number().int().min(0),
  testsModified: z.number().int().min(0),
});
export type TestSuiteResult = z.infer<typeof TestSuiteResultSchema>;

export const LintResultSchema = z.object({
  passed: z.boolean(),
  warnings: z.number().int().min(0),
  errors: z.number().int().min(0),
});
export type LintResult = z.infer<typeof LintResultSchema>;

export const TypeCheckResultSchema = z.object({
  passed: z.boolean(),
  errors: z.number().int().min(0),
});
export type TypeCheckResult = z.infer<typeof TypeCheckResultSchema>;

export const TestingResultSchema = z.object({
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  testSuite: TestSuiteResultSchema,
  lint: LintResultSchema,
  typeCheck: TypeCheckResultSchema,
  allGreen: z.boolean(),
});
export type TestingResult = z.infer<typeof TestingResultSchema>;

// ============================================================
// MIGRATION REPORT
// ============================================================

export const DiffStatsSchema = z.object({
  filesChanged: z.number().int().min(0),
  insertions: z.number().int().min(0),
  deletions: z.number().int().min(0),
  netChange: z.string(),
});
export type DiffStats = z.infer<typeof DiffStatsSchema>;

export const FileChangeSchema = z.object({
  file: z.string(),
  change: z.string(),
  risk: StepRiskSchema,
});
export type FileChange = z.infer<typeof FileChangeSchema>;

export const CFAddressedSchema = z.object({
  findingId: z.string(),
  pattern: z.string(),
  status: z.enum(['resolved', 'partially_resolved']),
  detail: z.string(),
});
export type CFAddressed = z.infer<typeof CFAddressedSchema>;

export const ObservationTypeSchema = z.enum(['discovery', 'suggestion', 'warning']);
export type ObservationType = z.infer<typeof ObservationTypeSchema>;

export const ObservationSchema = z.object({
  type: ObservationTypeSchema,
  ifxTag: IFXTagTypeSchema,
  detail: z.string(),
});
export type Observation = z.infer<typeof ObservationSchema>;

export const EffortComparisonSchema = z.object({
  estimatedDays: z.string(),
  actualExecutionMinutes: z.number().min(0),
  humanReviewEstimate: z.string(),
  totalEstimate: z.string(),
  speedupFactor: z.string(),
});
export type EffortComparison = z.infer<typeof EffortComparisonSchema>;

export const IFXTraceInfoSchema = z.object({
  traceId: IFXTraceIdSchema,
  recommendationTrace: IFXTraceIdSchema,
  factsCount: z.number().int().min(0),
  inferencesCount: z.number().int().min(0),
  assumptionsCount: z.number().int().min(0),
  assumptionsValidated: z.number().int().min(0),
  assumptionsInvalidated: z.number().int().min(0),
  newFactsDiscovered: z.number().int().min(0),
});
export type IFXTraceInfo = z.infer<typeof IFXTraceInfoSchema>;

export const MigrationReportSchema = z.object({
  generatedAt: z.string().datetime(),
  summary: z.string(),
  diffStats: DiffStatsSchema,
  filesDetail: z.array(FileChangeSchema),
  cfFindingsAddressed: z.array(CFAddressedSchema),
  observations: z.array(ObservationSchema),
  effortComparison: EffortComparisonSchema,
  ifxTrace: IFXTraceInfoSchema,
});
export type MigrationReport = z.infer<typeof MigrationReportSchema>;

// ============================================================
// PULL REQUEST
// ============================================================

export const PullRequestSchema = z.object({
  url: z.string().url(),
  number: z.number().int().min(1),
  title: z.string(),
  body: z.string(),
  branch: z.string(),
  target: z.string(),
  createdAt: z.string().datetime(),
  status: ReviewStatusSchema,
  labels: z.array(z.string()),
  reviewChecklist: z.array(z.string()),
});
export type PullRequest = z.infer<typeof PullRequestSchema>;

// ============================================================
// HUMAN REVIEW
// ============================================================

export const HumanReviewSchema = z.object({
  status: ReviewStatusSchema,
  reviewer: z.string().optional(),
  reviewedAt: z.string().datetime().optional(),
  comments: z.string().optional(),
  mergeSha: z.string().optional(),
});
export type HumanReview = z.infer<typeof HumanReviewSchema>;

// ============================================================
// POST-MERGE UPDATES
// ============================================================

export const PostMergeUpdatesSchema = z.object({
  recommendationStatus: z.literal('adopted'),
  costTrackingActualDays: z.number().min(0),
  cfFindingsResolved: z.array(z.string()),
  stackHealthRecalculated: z.boolean(),
});
export type PostMergeUpdates = z.infer<typeof PostMergeUpdatesSchema>;

export const PostMergeInfoSchema = z.object({
  mergedAt: z.string().datetime().optional(),
  mergedBy: z.string().optional(),
  autoUpdates: PostMergeUpdatesSchema,
});
export type PostMergeInfo = z.infer<typeof PostMergeInfoSchema>;

// ============================================================
// SAFETY STOP
// ============================================================

export const SafetyStopReasonSchema = z.enum([
  'files_limit_exceeded',
  'lines_limit_exceeded',
  'complexity_exceeded',
  'forbidden_path_access',
  'forbidden_operation',
  'tests_failed',
  'ambiguity_high',
  'timeout',
  'api_error',
]);
export type SafetyStopReason = z.infer<typeof SafetyStopReasonSchema>;

export const SafetyStopSchema = z.object({
  triggered: z.boolean(),
  triggerReason: SafetyStopReasonSchema.optional(),
  triggerAtStep: z.number().int().min(1).optional(),
  partialWorkCommitted: z.boolean(),
  partialBranch: z.string().optional(),
  recoveryOptions: z.array(z.string()),
});
export type SafetyStop = z.infer<typeof SafetyStopSchema>;

// ============================================================
// COMPLETE MIGRATION JOB
// ============================================================

export const MigrationJobSchema = z.object({
  id: z.string(),
  recommendationId: z.string(),
  projectId: z.string(),
  ifxTraceId: IFXTraceIdSchema,
  triggeredBy: z.string(),
  triggeredAt: z.string().datetime(),

  status: MigrationStatusSchema,

  preflight: PreflightResultSchema.optional(),
  backup: BackupInfoSchema.optional(),
  plan: MigrationPlanSchema.optional(),
  execution: ExecutionResultSchema.optional(),
  testing: TestingResultSchema.optional(),
  report: MigrationReportSchema.optional(),
  pullRequest: PullRequestSchema.optional(),
  humanReview: HumanReviewSchema,
  postMerge: PostMergeInfoSchema.optional(),
  safetyStop: SafetyStopSchema,

  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  durationMinutes: z.number().min(0).optional(),

  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MigrationJob = z.infer<typeof MigrationJobSchema>;

// ============================================================
// AUDIT LOG
// ============================================================

export const AuditActionSchema = z.enum([
  'preflight_start',
  'preflight_complete',
  'preflight_failed',
  'branch_created',
  'backup_committed',
  'plan_generated',
  'plan_approved',
  'plan_rejected',
  'execution_start',
  'step_completed',
  'step_failed',
  'ambiguity_detected',
  'execution_complete',
  'tests_complete',
  'tests_failed',
  'safety_stop',
  'pr_opened',
  'pr_approved',
  'pr_merged',
  'pr_rejected',
]);
export type AuditAction = z.infer<typeof AuditActionSchema>;

export const ActorTypeSchema = z.enum(['agent', 'user', 'system']);
export type ActorType = z.infer<typeof ActorTypeSchema>;

export const AuditLogEntrySchema = z.object({
  id: z.string(),
  migrationJobId: z.string().optional(),
  projectId: z.string().optional(),
  action: AuditActionSchema,
  detail: z.string(),
  actor: z.string().optional(),
  actorType: ActorTypeSchema,
  timestamp: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

// ============================================================
// DATABASE ENTITY TYPES
// ============================================================

export const MigrationJobEntitySchema = z.object({
  id: z.string(),
  recommendation_id: z.string(),
  project_id: z.string(),
  ifx_trace_id: z.string(),
  triggered_by: z.string(),
  triggered_at: z.string().datetime(),
  status: MigrationStatusSchema,
  preflight: PreflightResultSchema.nullable(),
  branch_name: z.string().nullable(),
  created_from_sha: z.string().nullable(),
  backup_commit_sha: z.string().nullable(),
  plan: MigrationPlanSchema.nullable(),
  plan_status: ReviewStatusSchema.nullable(),
  plan_approved_by: z.string().nullable(),
  plan_approved_at: z.string().datetime().nullable(),
  execution: ExecutionResultSchema.nullable(),
  testing: TestingResultSchema.nullable(),
  report: MigrationReportSchema.nullable(),
  pr_url: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  pr_status: ReviewStatusSchema.nullable(),
  human_review_status: ReviewStatusSchema,
  reviewer: z.string().nullable(),
  reviewed_at: z.string().datetime().nullable(),
  review_comments: z.string().nullable(),
  merged_at: z.string().datetime().nullable(),
  merged_by: z.string().nullable(),
  merge_sha: z.string().nullable(),
  safety_stopped: z.boolean(),
  safety_stop_reason: z.string().nullable(),
  safety_stop_at_step: z.number().int().nullable(),
  started_at: z.string().datetime().nullable(),
  completed_at: z.string().datetime().nullable(),
  duration_minutes: z.number().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type MigrationJobEntity = z.infer<typeof MigrationJobEntitySchema>;

export const AuditLogEntitySchema = z.object({
  id: z.string(),
  migration_job_id: z.string().nullable(),
  project_id: z.string().nullable(),
  action: AuditActionSchema,
  detail: z.string().nullable(),
  actor: z.string().nullable(),
  actor_type: ActorTypeSchema,
  timestamp: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()),
});
export type AuditLogEntity = z.infer<typeof AuditLogEntitySchema>;
