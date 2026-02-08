/**
 * TechScout — Agent Orchestrator (Layer 6)
 *
 * Coordinates the complete migration workflow:
 * Preflight → Backup → Plan → [Approval] → Execute → Test → Report → PR
 *
 * NON-NEGOTIABLE: The agent NEVER merges. Human approval is ALWAYS required.
 */

import { logger } from '../lib/logger';
import { generateTraceId } from '../lib/ifx';
import { supabase } from '../db/client';
import type {
  MigrationJob,
  MigrationStatus,
  AgentConfiguration,
  Recommendation,
  PreflightResult,
  BackupInfo,
  MigrationPlan,
  ExecutionResult,
  TestingResult,
  MigrationReport,
  PullRequest,
  HumanReview,
  SafetyStop,
  AuditAction,
  ActorType,
} from '../types';

import {
  getDefaultSafetyLimits,
  createSafetyStop,
  createSafeCompletion,
} from './safety';

import {
  createBackup,
  verifyBackup,
  rollbackToBackup,
  pushBackup,
} from './backup';

import {
  runPreflightChecks,
  getPreflightSummary,
  quickEnvironmentCheck,
  canExecuteRecommendation,
} from './preflight';

import {
  generatePlan,
  approvePlan,
  rejectPlan,
  renderPlanMarkdown,
  validatePlanForExecution,
} from './planner';

import {
  executePlan,
  runTests,
  runLinter,
  runTypeCheck,
} from './executor';

import {
  generateReport,
  createPullRequest,
  renderReportMarkdown,
} from './reporter';

// ============================================================
// TYPES
// ============================================================

export interface MigrationRequest {
  recommendation: Recommendation;
  projectId: string;
  workingDir: string;
  triggeredBy: string;
  config?: Partial<AgentConfiguration>;
}

export interface MigrationProgress {
  jobId: string;
  status: MigrationStatus;
  message: string;
  progress: number; // 0-100
}

export type ProgressCallback = (progress: MigrationProgress) => void;

// ============================================================
// DEFAULT CONFIGURATION
// ============================================================

function getDefaultConfig(): AgentConfiguration {
  return {
    enabled: true,
    mode: 'supervised',
    git: {
      provider: 'github',
      remote: 'origin',
      baseBranch: 'main',
      branchPrefix: 'techscout',
      autoPush: true,
      createPr: true,
    },
    safety: getDefaultSafetyLimits(),
    notifications: {
      onBranchCreated: true,
      onMigrationComplete: true,
      onMigrationFailed: true,
      onSafetyStop: true,
      onPrOpened: true,
      channel: 'slack',
    },
  };
}

// ============================================================
// AUDIT LOGGING
// ============================================================

async function logAuditEntry(
  action: AuditAction,
  detail: string,
  jobId?: string,
  projectId?: string,
  actor?: string,
  actorType: ActorType = 'agent'
): Promise<void> {
  try {
    await supabase.from('audit_log').insert({
      migration_job_id: jobId,
      project_id: projectId,
      action,
      detail,
      actor,
      actor_type: actorType,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Failed to log audit entry', {
      action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================
// JOB MANAGEMENT
// ============================================================

/**
 * Create a new migration job.
 */
async function createMigrationJob(
  request: MigrationRequest
): Promise<MigrationJob> {
  const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const traceId = generateTraceId();

  const job: MigrationJob = {
    id: jobId,
    recommendationId: request.recommendation.id,
    projectId: request.projectId,
    ifxTraceId: traceId,
    triggeredBy: request.triggeredBy,
    triggeredAt: new Date().toISOString(),
    status: 'pending',
    humanReview: { status: 'pending' },
    safetyStop: { triggered: false, partialWorkCommitted: false, recoveryOptions: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Save to database
  await supabase.from('migration_jobs').insert({
    id: job.id,
    recommendation_id: job.recommendationId,
    project_id: job.projectId,
    ifx_trace_id: job.ifxTraceId,
    triggered_by: job.triggeredBy,
    triggered_at: job.triggeredAt,
    status: job.status,
    human_review_status: 'pending',
    safety_stopped: false,
  });

  logger.info('Migration job created', { jobId, recommendationId: request.recommendation.id });

  return job;
}

/**
 * Update migration job status.
 */
async function updateJobStatus(
  job: MigrationJob,
  status: MigrationStatus,
  updates?: Partial<MigrationJob>
): Promise<MigrationJob> {
  const updatedJob = {
    ...job,
    ...updates,
    status,
    updatedAt: new Date().toISOString(),
  };

  await supabase
    .from('migration_jobs')
    .update({
      status,
      ...convertJobToEntity(updates || {}),
      updated_at: updatedJob.updatedAt,
    })
    .eq('id', job.id);

  return updatedJob;
}

/**
 * Convert job updates to database entity format.
 */
function convertJobToEntity(updates: Partial<MigrationJob>): Record<string, unknown> {
  const entity: Record<string, unknown> = {};

  if (updates.preflight) entity.preflight = updates.preflight;
  if (updates.backup) {
    entity.branch_name = updates.backup.branchName;
    entity.created_from_sha = updates.backup.createdFromSha;
    entity.backup_commit_sha = updates.backup.backupCommitSha;
  }
  if (updates.plan) {
    entity.plan = updates.plan;
    entity.plan_status = updates.plan.status;
    entity.plan_approved_by = updates.plan.approvedBy;
    entity.plan_approved_at = updates.plan.approvedAt;
  }
  if (updates.execution) entity.execution = updates.execution;
  if (updates.testing) entity.testing = updates.testing;
  if (updates.report) entity.report = updates.report;
  if (updates.pullRequest) {
    entity.pr_url = updates.pullRequest.url;
    entity.pr_number = updates.pullRequest.number;
    entity.pr_status = updates.pullRequest.status;
  }
  if (updates.humanReview) {
    entity.human_review_status = updates.humanReview.status;
    entity.reviewer = updates.humanReview.reviewer;
    entity.reviewed_at = updates.humanReview.reviewedAt;
    entity.review_comments = updates.humanReview.comments;
    entity.merge_sha = updates.humanReview.mergeSha;
  }
  if (updates.safetyStop?.triggered) {
    entity.safety_stopped = true;
    entity.safety_stop_reason = updates.safetyStop.triggerReason;
    entity.safety_stop_at_step = updates.safetyStop.triggerAtStep;
  }
  if (updates.startedAt) entity.started_at = updates.startedAt;
  if (updates.completedAt) entity.completed_at = updates.completedAt;
  if (updates.durationMinutes) entity.duration_minutes = updates.durationMinutes;

  return entity;
}

// ============================================================
// MAIN ORCHESTRATOR
// ============================================================

/**
 * Run a complete migration workflow.
 */
export async function runMigration(
  request: MigrationRequest,
  onProgress?: ProgressCallback
): Promise<MigrationJob> {
  const config = { ...getDefaultConfig(), ...request.config };
  const startTime = new Date();

  // Create job
  let job = await createMigrationJob(request);

  const reportProgress = (status: MigrationStatus, message: string, progress: number) => {
    if (onProgress) {
      onProgress({ jobId: job.id, status, message, progress });
    }
  };

  try {
    // ==================== PREFLIGHT ====================
    reportProgress('pending', 'Running preflight checks...', 5);
    await logAuditEntry('preflight_start', 'Starting preflight checks', job.id, job.projectId);

    const preflight = await runPreflightChecks({
      workingDir: request.workingDir,
      baseBranch: config.git.baseBranch,
      recommendation: request.recommendation,
      safetyLimits: config.safety,
    });

    job = await updateJobStatus(job, preflight.allPassed ? 'backing_up' : 'failed', {
      preflight,
    });

    if (!preflight.allPassed) {
      await logAuditEntry('preflight_failed', getPreflightSummary(preflight), job.id, job.projectId);
      return job;
    }

    await logAuditEntry('preflight_complete', 'All preflight checks passed', job.id, job.projectId);
    reportProgress('backing_up', 'Creating backup...', 15);

    // ==================== BACKUP ====================
    const backupResult = await createBackup({
      workingDir: request.workingDir,
      gitConfig: config.git,
      recommendationId: request.recommendation.id,
      subject: request.recommendation.subject.name,
      jobId: job.id,
    });

    if (!backupResult.success || !backupResult.backup) {
      job = await updateJobStatus(job, 'failed', {
        safetyStop: createSafetyStop('api_error'),
      });
      return job;
    }

    const backup = backupResult.backup;
    await logAuditEntry('branch_created', `Branch: ${backup.branchName}`, job.id, job.projectId);
    await logAuditEntry('backup_committed', `Backup SHA: ${backup.backupCommitSha}`, job.id, job.projectId);

    job = await updateJobStatus(job, 'planning', { backup });
    reportProgress('planning', 'Generating migration plan...', 25);

    // ==================== PLANNING ====================
    const planResult = generatePlan({
      recommendation: request.recommendation,
      safetyLimits: config.safety,
    });

    if (!planResult.success || !planResult.plan) {
      job = await updateJobStatus(job, 'failed');
      return job;
    }

    let plan = planResult.plan;
    await logAuditEntry('plan_generated', `${plan.steps.length} steps planned`, job.id, job.projectId);

    // In supervised mode, wait for approval
    if (config.mode === 'supervised') {
      job = await updateJobStatus(job, 'awaiting_plan_approval', { plan });
      reportProgress('awaiting_plan_approval', 'Waiting for plan approval...', 35);

      logger.info('Migration plan awaiting approval', {
        jobId: job.id,
        steps: plan.steps.length,
      });

      // Return job - caller must approve plan before continuing
      return job;
    }

    // In assisted mode, auto-approve but still require human merge
    plan = approvePlan(plan, 'auto-approved');
    await logAuditEntry('plan_approved', 'Auto-approved in assisted mode', job.id, job.projectId);

    // Continue to execution...
    return await executeApprovedPlan(job, plan, backup, request, config, onProgress);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Migration failed', { jobId: job.id, error: errorMsg });

    job = await updateJobStatus(job, 'failed', {
      safetyStop: createSafetyStop('api_error'),
      completedAt: new Date().toISOString(),
    });

    return job;
  }
}

/**
 * Approve a pending plan and continue execution.
 */
export async function approvePlanAndContinue(
  jobId: string,
  approver: string,
  request: MigrationRequest,
  onProgress?: ProgressCallback
): Promise<MigrationJob> {
  // Load job from database
  const { data: jobData, error } = await supabase
    .from('migration_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error || !jobData) {
    throw new Error(`Job not found: ${jobId}`);
  }

  if (jobData.status !== 'awaiting_plan_approval') {
    throw new Error(`Job is not awaiting approval: ${jobData.status}`);
  }

  const job: MigrationJob = {
    id: jobData.id,
    recommendationId: jobData.recommendation_id,
    projectId: jobData.project_id,
    ifxTraceId: jobData.ifx_trace_id,
    triggeredBy: jobData.triggered_by,
    triggeredAt: jobData.triggered_at,
    status: jobData.status,
    preflight: jobData.preflight,
    backup: jobData.branch_name ? {
      branchName: jobData.branch_name,
      createdFrom: '',
      createdFromSha: jobData.created_from_sha,
      backupCommitSha: jobData.backup_commit_sha,
      backupCommitMessage: '',
      createdAt: '',
      pushed: true,
    } : undefined,
    plan: jobData.plan,
    humanReview: { status: 'pending' },
    safetyStop: { triggered: false, partialWorkCommitted: false, recoveryOptions: [] },
    createdAt: jobData.created_at,
    updatedAt: jobData.updated_at,
  };

  if (!job.plan || !job.backup) {
    throw new Error('Job missing plan or backup');
  }

  // Approve the plan
  const approvedPlan = approvePlan(job.plan, approver);
  await logAuditEntry('plan_approved', `Approved by ${approver}`, job.id, job.projectId, approver, 'user');

  const config = { ...getDefaultConfig(), ...request.config };

  return await executeApprovedPlan(job, approvedPlan, job.backup, request, config, onProgress);
}

/**
 * Execute an approved migration plan.
 */
async function executeApprovedPlan(
  job: MigrationJob,
  plan: MigrationPlan,
  backup: BackupInfo,
  request: MigrationRequest,
  config: AgentConfiguration,
  onProgress?: ProgressCallback
): Promise<MigrationJob> {
  const reportProgress = (status: MigrationStatus, message: string, progress: number) => {
    if (onProgress) {
      onProgress({ jobId: job.id, status, message, progress });
    }
  };

  try {
    job = await updateJobStatus(job, 'executing', {
      plan,
      startedAt: new Date().toISOString(),
    });
    reportProgress('executing', 'Executing migration...', 45);
    await logAuditEntry('execution_start', 'Starting plan execution', job.id, job.projectId);

    // ==================== EXECUTION ====================
    const executionResult = await executePlan({
      workingDir: request.workingDir,
      plan,
      backup,
      safetyLimits: config.safety,
      onStepComplete: (step) => {
        const progress = 45 + (step.step / plan.steps.length) * 30;
        reportProgress('executing', `Step ${step.step}/${plan.steps.length}: ${step.status}`, progress);
        logAuditEntry(
          step.status === 'completed' ? 'step_completed' : 'step_failed',
          `Step ${step.step}: ${step.output?.slice(0, 200) || ''}`,
          job.id,
          job.projectId
        );
      },
    });

    if (!executionResult.success) {
      job = await updateJobStatus(job, executionResult.stopReason === 'timeout' ? 'timeout' : 'safety_stopped', {
        execution: executionResult.execution,
        safetyStop: createSafetyStop(
          executionResult.stopReason || 'api_error',
          executionResult.stoppedAt,
          backup.branchName
        ),
      });
      await logAuditEntry('safety_stop', executionResult.error || 'Execution stopped', job.id, job.projectId);
      return job;
    }

    const execution = executionResult.execution!;
    await logAuditEntry('execution_complete', `Completed in ${execution.durationMinutes} minutes`, job.id, job.projectId);

    job = await updateJobStatus(job, 'testing', { execution });
    reportProgress('testing', 'Running tests...', 80);

    // ==================== TESTING ====================
    const testResult = await runTests(request.workingDir);
    const lintResult = await runLinter(request.workingDir);
    const typeCheckResult = await runTypeCheck(request.workingDir);

    const testing: TestingResult = {
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      testSuite: {
        total: testResult.total,
        passed: testResult.passed_count,
        failed: testResult.failed,
        skipped: 0,
        newTestsAdded: 0,
        testsModified: 0,
      },
      lint: {
        passed: lintResult.passed,
        warnings: lintResult.warnings,
        errors: lintResult.errors,
      },
      typeCheck: {
        passed: typeCheckResult.passed,
        errors: typeCheckResult.errors,
      },
      allGreen: testResult.passed && lintResult.passed && typeCheckResult.passed,
    };

    await logAuditEntry(
      testing.allGreen ? 'tests_complete' : 'tests_failed',
      `Tests: ${testing.testSuite.passed}/${testing.testSuite.total} passed`,
      job.id,
      job.projectId
    );

    if (!testing.allGreen && config.safety.requireTestsPass) {
      job = await updateJobStatus(job, 'safety_stopped', {
        testing,
        safetyStop: createSafetyStop('tests_failed'),
      });
      return job;
    }

    job = await updateJobStatus(job, 'reporting', { testing });
    reportProgress('reporting', 'Generating report...', 90);

    // ==================== REPORTING ====================
    const report = await generateReport({
      workingDir: request.workingDir,
      recommendation: request.recommendation,
      plan,
      execution,
      testing,
      backup,
      jobId: job.id,
    });

    job = await updateJobStatus(job, 'awaiting_review', { report });

    // ==================== PULL REQUEST ====================
    if (config.git.createPr) {
      const pullRequest = await createPullRequest({
        workingDir: request.workingDir,
        gitConfig: config.git,
        backup,
        report,
        recommendation: request.recommendation,
      });

      if (pullRequest) {
        job = await updateJobStatus(job, 'awaiting_review', { pullRequest });
        await logAuditEntry('pr_opened', `PR #${pullRequest.number}: ${pullRequest.url}`, job.id, job.projectId);
      }
    }

    job = await updateJobStatus(job, 'awaiting_review', {
      completedAt: new Date().toISOString(),
      durationMinutes: (Date.now() - new Date(job.startedAt!).getTime()) / (1000 * 60),
      safetyStop: createSafeCompletion(),
    });

    reportProgress('awaiting_review', 'Migration complete - awaiting human review', 100);

    logger.info('Migration completed', {
      jobId: job.id,
      durationMinutes: job.durationMinutes,
      prUrl: job.pullRequest?.url,
    });

    return job;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Migration execution failed', { jobId: job.id, error: errorMsg });

    job = await updateJobStatus(job, 'failed', {
      safetyStop: createSafetyStop('api_error'),
      completedAt: new Date().toISOString(),
    });

    return job;
  }
}

/**
 * Mark a migration as approved (merged by human).
 */
export async function markMigrationMerged(
  jobId: string,
  mergedBy: string,
  mergeSha: string
): Promise<void> {
  await supabase
    .from('migration_jobs')
    .update({
      status: 'merged',
      human_review_status: 'approved',
      reviewer: mergedBy,
      reviewed_at: new Date().toISOString(),
      merged_by: mergedBy,
      merged_at: new Date().toISOString(),
      merge_sha: mergeSha,
    })
    .eq('id', jobId);

  await logAuditEntry('pr_merged', `Merged by ${mergedBy}, SHA: ${mergeSha}`, jobId, undefined, mergedBy, 'user');

  logger.info('Migration marked as merged', { jobId, mergedBy });
}

/**
 * Reject a migration.
 */
export async function rejectMigration(
  jobId: string,
  rejectedBy: string,
  reason?: string
): Promise<void> {
  await supabase
    .from('migration_jobs')
    .update({
      status: 'rejected',
      human_review_status: 'rejected',
      reviewer: rejectedBy,
      reviewed_at: new Date().toISOString(),
      review_comments: reason,
    })
    .eq('id', jobId);

  await logAuditEntry('pr_rejected', reason || 'Rejected', jobId, undefined, rejectedBy, 'user');

  logger.info('Migration rejected', { jobId, rejectedBy, reason });
}

// ============================================================
// RE-EXPORTS
// ============================================================

export {
  getDefaultSafetyLimits,
  isPathForbidden,
  containsForbiddenOperation,
  validatePlan,
  createSafetyStop,
  createSafeCompletion,
} from './safety';

export {
  createBackup,
  verifyBackup,
  rollbackToBackup,
  pushBackup,
} from './backup';

export {
  runPreflightChecks,
  getPreflightSummary,
  quickEnvironmentCheck,
  canExecuteRecommendation,
} from './preflight';

export {
  generatePlan,
  approvePlan,
  rejectPlan,
  renderPlanMarkdown,
  validatePlanForExecution,
} from './planner';

export {
  executePlan,
  runTests,
  runLinter,
  runTypeCheck,
} from './executor';

export {
  generateReport,
  createPullRequest,
  renderReportMarkdown,
  getReportSummary,
} from './reporter';
