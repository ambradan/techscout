/**
 * TechScout — Layer 6: Migration Agent Types v1.0
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

import type { IFXTraceId } from './ifx';

// ============================================================
// AGENT CONFIGURATION
// ============================================================

export type AgentMode = 'assisted' | 'supervised';
// assisted: agent works, opens PR, waits
// supervised: agent proposes plan, waits for ok, then executes, waits for merge
// NOTE: NO "autonomous" mode exists. Merge is ALWAYS manual.

export type GitProvider = 'github' | 'gitlab' | 'bitbucket';

export interface AgentGitConfig {
  provider: GitProvider;
  remote: string;
  baseBranch: string;
  branchPrefix: string;
  autoPush: boolean;
  createPr: boolean;
}

export interface AgentSafetyLimits {
  maxFilesModified: number;
  maxLinesChanged: number;
  maxExecutionTimeMinutes: number;
  complexityThreshold: number;
  requireTestsPass: boolean;
  requireLintPass: boolean;
  forbiddenPaths: string[];
  forbiddenOperations: string[];
}

export interface AgentNotificationConfig {
  onBranchCreated: boolean;
  onMigrationComplete: boolean;
  onMigrationFailed: boolean;
  onSafetyStop: boolean;
  onPrOpened: boolean;
  channel: 'email' | 'slack' | 'both';
}

export interface AgentConfiguration {
  enabled: boolean;
  mode: AgentMode;
  git: AgentGitConfig;
  safety: AgentSafetyLimits;
  notifications: AgentNotificationConfig;
}

// ============================================================
// MIGRATION JOB STATUS
// ============================================================

export type MigrationStatus =
  | 'pending'
  | 'backing_up'
  | 'planning'
  | 'awaiting_plan_approval'
  | 'executing'
  | 'testing'
  | 'reporting'
  | 'awaiting_review'
  | 'approved'
  | 'merged'
  | 'rejected'
  | 'failed'
  | 'safety_stopped'
  | 'timeout';

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested';

// ============================================================
// PREFLIGHT CHECKS
// ============================================================

export type PreflightCheckType =
  | 'base_branch_clean'
  | 'tests_green'
  | 'recommendation_valid'
  | 'scope_within_limits'
  | 'no_forbidden_paths';

export interface PreflightCheck {
  check: PreflightCheckType;
  status: 'passed' | 'failed' | 'skipped';
  detail: string;
}

export interface PreflightResult {
  startedAt: string;
  checks: PreflightCheck[];
  allPassed: boolean;
}

// ============================================================
// BACKUP
// ============================================================

export interface BackupInfo {
  branchName: string;
  createdFrom: string;
  createdFromSha: string;
  backupCommitSha: string;
  backupCommitMessage: string;
  createdAt: string;
  pushed: boolean;
}

// ============================================================
// MIGRATION PLAN
// ============================================================

export type StepRisk = 'low' | 'medium' | 'high';

export interface PlanStep {
  step: number;
  action: string;
  command: string;
  filesAffected: string[];
  risk: StepRisk;
  notes?: string;
  expected?: string;
}

export interface MigrationPlan {
  generatedAt: string;
  status: ReviewStatus;
  approvedBy?: string;
  approvedAt?: string;
  steps: PlanStep[];
  estimatedFiles: number;
  estimatedLines: number;
  withinSafetyLimits: boolean;
}

// ============================================================
// EXECUTION
// ============================================================

export interface StepExecution {
  step: number;
  status: 'completed' | 'failed' | 'skipped';
  durationSeconds: number;
  output: string;
  notes?: string;
  error?: string;
}

export interface SafetyCheck {
  filesModified: number;
  filesLimit: number;
  linesChanged: number;
  linesLimit: number;
  forbiddenPathsTouched: number;
  forbiddenOperationsAttempted: number;
  complexityRatio: number;
  complexityLimit: number;
  allWithinLimits: boolean;
}

export interface AmbiguityLogEntry {
  atStep: number;
  description: string;
  decision: string;
  confidence: number;
  ifxTag: 'FACT' | 'INFERENCE' | 'ASSUMPTION';
}

export interface ClaudeCodeSession {
  model: string;
  sessionId: string;
  totalTokens: number;
  apiCostUsd: number;
}

export interface ExecutionResult {
  startedAt: string;
  completedAt: string;
  durationMinutes: number;
  claudeCode: ClaudeCodeSession;
  stepsExecuted: StepExecution[];
  safetyChecks: SafetyCheck;
  ambiguityLog: AmbiguityLogEntry[];
}

// ============================================================
// TESTING
// ============================================================

export interface TestSuiteResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  newTestsAdded: number;
  testsModified: number;
}

export interface LintResult {
  passed: boolean;
  warnings: number;
  errors: number;
}

export interface TypeCheckResult {
  passed: boolean;
  errors: number;
}

export interface TestingResult {
  startedAt: string;
  completedAt: string;
  testSuite: TestSuiteResult;
  lint: LintResult;
  typeCheck: TypeCheckResult;
  allGreen: boolean;
}

// ============================================================
// MIGRATION REPORT
// ============================================================

export interface DiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
  netChange: string;
}

export interface FileChange {
  file: string;
  change: string;
  risk: StepRisk;
}

export interface CFAddressed {
  findingId: string;
  pattern: string;
  status: 'resolved' | 'partially_resolved';
  detail: string;
}

export type ObservationType = 'discovery' | 'suggestion' | 'warning';

export interface Observation {
  type: ObservationType;
  ifxTag: 'FACT' | 'INFERENCE' | 'ASSUMPTION';
  detail: string;
}

export interface EffortComparison {
  estimatedDays: string;
  actualExecutionMinutes: number;
  humanReviewEstimate: string;
  totalEstimate: string;
  speedupFactor: string;
}

export interface IFXTraceInfo {
  traceId: IFXTraceId;
  recommendationTrace: IFXTraceId;
  factsCount: number;
  inferencesCount: number;
  assumptionsCount: number;
  assumptionsValidated: number;
  assumptionsInvalidated: number;
  newFactsDiscovered: number;
}

export interface MigrationReport {
  generatedAt: string;
  summary: string;
  diffStats: DiffStats;
  filesDetail: FileChange[];
  cfFindingsAddressed: CFAddressed[];
  observations: Observation[];
  effortComparison: EffortComparison;
  ifxTrace: IFXTraceInfo;
}

// ============================================================
// PULL REQUEST
// ============================================================

export interface PullRequest {
  url: string;
  number: number;
  title: string;
  body: string;
  branch: string;
  target: string;
  createdAt: string;
  status: ReviewStatus;
  labels: string[];
  reviewChecklist: string[];
}

// ============================================================
// HUMAN REVIEW
// ============================================================

export interface HumanReview {
  status: ReviewStatus;
  reviewer?: string;
  reviewedAt?: string;
  comments?: string;
  mergeSha?: string;
}

// ============================================================
// POST-MERGE UPDATES
// ============================================================

export interface PostMergeUpdates {
  recommendationStatus: 'adopted';
  costTrackingActualDays: number;
  cfFindingsResolved: string[];
  stackHealthRecalculated: boolean;
}

export interface PostMergeInfo {
  mergedAt?: string;
  mergedBy?: string;
  autoUpdates: PostMergeUpdates;
}

// ============================================================
// SAFETY STOP
// ============================================================

export type SafetyStopReason =
  | 'files_limit_exceeded'
  | 'lines_limit_exceeded'
  | 'complexity_exceeded'
  | 'forbidden_path_access'
  | 'forbidden_operation'
  | 'tests_failed'
  | 'ambiguity_high'
  | 'timeout'
  | 'api_error';

export interface SafetyStop {
  triggered: boolean;
  triggerReason?: SafetyStopReason;
  triggerAtStep?: number;
  partialWorkCommitted: boolean;
  partialBranch?: string;
  recoveryOptions: string[];
}

// ============================================================
// COMPLETE MIGRATION JOB
// ============================================================

export interface MigrationJob {
  id: string;
  recommendationId: string;
  projectId: string;
  ifxTraceId: IFXTraceId;
  triggeredBy: string;
  triggeredAt: string;

  status: MigrationStatus;

  preflight?: PreflightResult;
  backup?: BackupInfo;
  plan?: MigrationPlan;
  execution?: ExecutionResult;
  testing?: TestingResult;
  report?: MigrationReport;
  pullRequest?: PullRequest;
  humanReview: HumanReview;
  postMerge?: PostMergeInfo;
  safetyStop: SafetyStop;

  startedAt?: string;
  completedAt?: string;
  durationMinutes?: number;

  createdAt: string;
  updatedAt: string;
}

// ============================================================
// AUDIT LOG
// ============================================================

export type AuditAction =
  | 'preflight_start'
  | 'preflight_complete'
  | 'preflight_failed'
  | 'branch_created'
  | 'backup_committed'
  | 'plan_generated'
  | 'plan_approved'
  | 'plan_rejected'
  | 'execution_start'
  | 'step_completed'
  | 'step_failed'
  | 'ambiguity_detected'
  | 'execution_complete'
  | 'tests_complete'
  | 'tests_failed'
  | 'safety_stop'
  | 'pr_opened'
  | 'pr_approved'
  | 'pr_merged'
  | 'pr_rejected';

export type ActorType = 'agent' | 'user' | 'system';

export interface AuditLogEntry {
  id: string;
  migrationJobId?: string;
  projectId?: string;
  action: AuditAction;
  detail: string;
  actor?: string;
  actorType: ActorType;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ============================================================
// DATABASE ENTITY TYPES
// ============================================================

export interface MigrationJobEntity {
  id: string;
  recommendation_id: string;
  project_id: string;
  ifx_trace_id: string;
  triggered_by: string;
  triggered_at: string;
  status: MigrationStatus;
  preflight: PreflightResult | null;
  branch_name: string | null;
  created_from_sha: string | null;
  backup_commit_sha: string | null;
  plan: MigrationPlan | null;
  plan_status: ReviewStatus | null;
  plan_approved_by: string | null;
  plan_approved_at: string | null;
  execution: ExecutionResult | null;
  testing: TestingResult | null;
  report: MigrationReport | null;
  pr_url: string | null;
  pr_number: number | null;
  pr_status: ReviewStatus | null;
  human_review_status: ReviewStatus;
  reviewer: string | null;
  reviewed_at: string | null;
  review_comments: string | null;
  merged_at: string | null;
  merged_by: string | null;
  merge_sha: string | null;
  safety_stopped: boolean;
  safety_stop_reason: string | null;
  safety_stop_at_step: number | null;
  started_at: string | null;
  completed_at: string | null;
  duration_minutes: number | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntity {
  id: string;
  migration_job_id: string | null;
  project_id: string | null;
  action: AuditAction;
  detail: string | null;
  actor: string | null;
  actor_type: ActorType;
  timestamp: string;
  metadata: Record<string, unknown>;
}
