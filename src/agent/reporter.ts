/**
 * TechScout — Agent Reporter Module (Layer 6)
 *
 * Generates migration reports, creates pull requests,
 * and handles post-merge updates.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../lib/logger';
import { generateTraceId } from '../lib/ifx';
import type {
  MigrationReport,
  DiffStats,
  FileChange,
  CFAddressed,
  Observation,
  EffortComparison,
  IFXTraceInfo,
  PullRequest,
  ExecutionResult,
  TestingResult,
  BackupInfo,
  Recommendation,
  MigrationPlan,
  AgentGitConfig,
  StepRisk,
} from '../types';
import type { IFXTraceId } from '../types/ifx';

const execAsync = promisify(exec);

// ============================================================
// TYPES
// ============================================================

export interface ReportOptions {
  workingDir: string;
  recommendation: Recommendation;
  plan: MigrationPlan;
  execution: ExecutionResult;
  testing?: TestingResult;
  backup: BackupInfo;
  jobId: string;
}

export interface PullRequestOptions {
  workingDir: string;
  gitConfig: AgentGitConfig;
  backup: BackupInfo;
  report: MigrationReport;
  recommendation: Recommendation;
}

// ============================================================
// DIFF ANALYSIS
// ============================================================

/**
 * Get detailed diff stats from git.
 */
async function getDiffStats(
  workingDir: string,
  baseSha: string
): Promise<DiffStats> {
  try {
    const { stdout } = await execAsync(
      `git diff --stat ${baseSha}...HEAD`,
      { cwd: workingDir }
    );

    const lines = stdout.trim().split('\n');
    const summaryLine = lines[lines.length - 1] || '';

    const filesMatch = summaryLine.match(/(\d+) files? changed/);
    const insertionsMatch = summaryLine.match(/(\d+) insertions?/);
    const deletionsMatch = summaryLine.match(/(\d+) deletions?/);

    const filesChanged = filesMatch ? parseInt(filesMatch[1]) : 0;
    const insertions = insertionsMatch ? parseInt(insertionsMatch[1]) : 0;
    const deletions = deletionsMatch ? parseInt(deletionsMatch[1]) : 0;

    return {
      filesChanged,
      insertions,
      deletions,
      netChange: insertions >= deletions
        ? `+${insertions - deletions}`
        : `${insertions - deletions}`,
    };
  } catch {
    return {
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      netChange: '0',
    };
  }
}

/**
 * Get list of changed files with details.
 */
async function getFileChanges(
  workingDir: string,
  baseSha: string
): Promise<FileChange[]> {
  try {
    const { stdout } = await execAsync(
      `git diff --name-status ${baseSha}...HEAD`,
      { cwd: workingDir }
    );

    const changes: FileChange[] = [];

    for (const line of stdout.trim().split('\n')) {
      if (!line) continue;

      const [status, file] = line.split('\t');
      if (!file) continue;

      let change: string;
      let risk: StepRisk;

      switch (status) {
        case 'A':
          change = 'added';
          risk = 'low';
          break;
        case 'M':
          change = 'modified';
          risk = 'medium';
          break;
        case 'D':
          change = 'deleted';
          risk = 'high';
          break;
        case 'R':
          change = 'renamed';
          risk = 'medium';
          break;
        default:
          change = status;
          risk = 'medium';
      }

      // Increase risk for certain file types
      if (file.includes('config') || file.includes('.env')) {
        risk = 'high';
      }

      changes.push({ file, change, risk });
    }

    return changes;
  } catch {
    return [];
  }
}

// ============================================================
// REPORT GENERATION
// ============================================================

/**
 * Generate a migration report.
 */
export async function generateReport(
  options: ReportOptions
): Promise<MigrationReport> {
  const { workingDir, recommendation, plan, execution, testing, backup, jobId } = options;

  logger.info('Generating migration report', { jobId });

  // Get diff stats
  const diffStats = await getDiffStats(workingDir, backup.backupCommitSha);
  const filesDetail = await getFileChanges(workingDir, backup.backupCommitSha);

  // Generate observations from execution
  const observations: Observation[] = [];

  // Add discoveries from ambiguity log
  for (const amb of execution.ambiguityLog) {
    observations.push({
      type: 'warning',
      ifxTag: amb.ifxTag,
      detail: amb.description,
    });
  }

  // Add suggestions based on execution
  if (diffStats.filesChanged > plan.estimatedFiles) {
    observations.push({
      type: 'discovery',
      ifxTag: 'FACT',
      detail: `Migration affected ${diffStats.filesChanged} files (estimated: ${plan.estimatedFiles})`,
    });
  }

  if (execution.safetyChecks.complexityRatio > 1.2) {
    observations.push({
      type: 'warning',
      ifxTag: 'INFERENCE',
      detail: `Complexity was ${(execution.safetyChecks.complexityRatio * 100 - 100).toFixed(0)}% higher than estimated`,
    });
  }

  // Calculate effort comparison
  const rawEstimate = recommendation.technical?.effort?.rawEstimateDays || '0';
  const estimatedDays = parseFloat(rawEstimate.replace(/[^\d.]/g, '')) || 0;

  const effortComparison: EffortComparison = {
    estimatedDays: rawEstimate,
    actualExecutionMinutes: execution.durationMinutes,
    humanReviewEstimate: '0.5 days',
    totalEstimate: `${(execution.durationMinutes / 60 / 8 + 0.5).toFixed(1)} days`,
    speedupFactor: estimatedDays > 0
      ? `${(estimatedDays / (execution.durationMinutes / 60 / 8 + 0.5)).toFixed(1)}x`
      : 'N/A',
  };

  // Generate IFX trace info
  const ifxTrace: IFXTraceInfo = {
    traceId: generateTraceId() as IFXTraceId,
    recommendationTrace: recommendation.ifxTraceId as IFXTraceId,
    factsCount: recommendation.technical?.analysis?.facts?.length || 0,
    inferencesCount: recommendation.technical?.analysis?.inferences?.length || 0,
    assumptionsCount: recommendation.technical?.analysis?.assumptions?.length || 0,
    assumptionsValidated: 0,
    assumptionsInvalidated: 0,
    newFactsDiscovered: observations.filter(o => o.ifxTag === 'FACT').length,
  };

  // Generate summary
  const summary = generateSummary(diffStats, execution, testing);

  const report: MigrationReport = {
    generatedAt: new Date().toISOString(),
    summary,
    diffStats,
    filesDetail,
    cfFindingsAddressed: [], // Would be populated from CF findings in recommendation
    observations,
    effortComparison,
    ifxTrace,
  };

  logger.info('Report generated', {
    filesChanged: diffStats.filesChanged,
    observations: observations.length,
  });

  return report;
}

/**
 * Generate a summary string for the report.
 */
function generateSummary(
  diffStats: DiffStats,
  execution: ExecutionResult,
  testing?: TestingResult
): string {
  const parts: string[] = [];

  parts.push(`Migration completed in ${execution.durationMinutes.toFixed(1)} minutes.`);
  parts.push(`${diffStats.filesChanged} files changed (${diffStats.netChange} lines).`);

  if (testing) {
    if (testing.allGreen) {
      parts.push('All tests pass.');
    } else {
      parts.push(`Tests: ${testing.testSuite.failed} failed.`);
    }
  }

  if (execution.ambiguityLog.length > 0) {
    parts.push(`${execution.ambiguityLog.length} ambiguities noted.`);
  }

  return parts.join(' ');
}

// ============================================================
// PULL REQUEST
// ============================================================

/**
 * Create a pull request for the migration.
 */
export async function createPullRequest(
  options: PullRequestOptions
): Promise<PullRequest | null> {
  const { workingDir, gitConfig, backup, report, recommendation } = options;

  if (!gitConfig.createPr) {
    logger.info('PR creation disabled in config');
    return null;
  }

  logger.info('Creating pull request', {
    branch: backup.branchName,
    target: gitConfig.baseBranch,
  });

  try {
    // Push branch if not already pushed
    if (!backup.pushed) {
      await execAsync(`git push -u origin ${backup.branchName}`, {
        cwd: workingDir,
      });
    }

    // Generate PR body
    const body = generatePRBody(report, recommendation);

    // Create PR using GitHub CLI
    const title = `[TechScout] ${recommendation.action}: ${recommendation.subject.name}`;

    const { stdout } = await execAsync(
      `gh pr create --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" --base ${gitConfig.baseBranch} --head ${backup.branchName}`,
      { cwd: workingDir }
    );

    // Parse PR URL from output
    const prUrlMatch = stdout.match(/(https:\/\/github\.com\/[^\s]+\/pull\/\d+)/);
    const prUrl = prUrlMatch ? prUrlMatch[1] : stdout.trim();

    // Extract PR number
    const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
    const prNumber = prNumberMatch ? parseInt(prNumberMatch[1]) : 0;

    const pullRequest: PullRequest = {
      url: prUrl,
      number: prNumber,
      title,
      body,
      branch: backup.branchName,
      target: gitConfig.baseBranch,
      createdAt: new Date().toISOString(),
      status: 'pending',
      labels: ['techscout', 'automated-migration'],
      reviewChecklist: [
        'All tests pass',
        'Changes match recommendation scope',
        'No security concerns',
        'Documentation updated if needed',
      ],
    };

    logger.info('Pull request created', {
      url: prUrl,
      number: prNumber,
    });

    return pullRequest;
  } catch (error) {
    logger.error('Failed to create pull request', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Generate PR body from report.
 */
function generatePRBody(report: MigrationReport, recommendation: Recommendation): string {
  const lines: string[] = [];

  lines.push('## Summary');
  lines.push('');
  lines.push(report.summary);
  lines.push('');

  lines.push('## Recommendation');
  lines.push('');
  lines.push(`- **Action:** ${recommendation.action}`);
  lines.push(`- **Subject:** ${recommendation.subject.name}`);
  lines.push(`- **Priority:** ${recommendation.priority}`);
  lines.push(`- **Confidence:** ${(recommendation.confidence * 100).toFixed(0)}%`);
  lines.push('');

  lines.push('## Changes');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Files changed | ${report.diffStats.filesChanged} |`);
  lines.push(`| Insertions | +${report.diffStats.insertions} |`);
  lines.push(`| Deletions | -${report.diffStats.deletions} |`);
  lines.push(`| Net change | ${report.diffStats.netChange} |`);
  lines.push('');

  if (report.observations.length > 0) {
    lines.push('## Observations');
    lines.push('');
    for (const obs of report.observations) {
      const icon = obs.type === 'warning' ? '⚠️' : obs.type === 'discovery' ? '💡' : 'ℹ️';
      lines.push(`- ${icon} [${obs.ifxTag}] ${obs.detail}`);
    }
    lines.push('');
  }

  lines.push('## Review Checklist');
  lines.push('');
  lines.push('- [ ] All tests pass');
  lines.push('- [ ] Changes match recommendation scope');
  lines.push('- [ ] No security concerns introduced');
  lines.push('- [ ] Documentation updated if needed');
  lines.push('- [ ] Rollback strategy understood');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push(`**IFX Trace:** \`${report.ifxTrace.traceId}\``);
  lines.push('');
  lines.push('*Generated by TechScout Migration Agent*');

  return lines.join('\n');
}

// ============================================================
// REPORT RENDERING
// ============================================================

/**
 * Render a migration report as Markdown.
 */
export function renderReportMarkdown(report: MigrationReport): string {
  const lines: string[] = [];

  lines.push('# Migration Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date(report.generatedAt).toLocaleString()}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(report.summary);
  lines.push('');

  lines.push('## Diff Statistics');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Files changed | ${report.diffStats.filesChanged} |`);
  lines.push(`| Insertions | +${report.diffStats.insertions} |`);
  lines.push(`| Deletions | -${report.diffStats.deletions} |`);
  lines.push(`| Net change | ${report.diffStats.netChange} |`);
  lines.push('');

  if (report.filesDetail.length > 0) {
    lines.push('## Files Changed');
    lines.push('');
    lines.push(`| File | Change | Risk |`);
    lines.push(`|------|--------|------|`);
    for (const file of report.filesDetail.slice(0, 20)) {
      const riskEmoji = file.risk === 'high' ? '🔴' : file.risk === 'medium' ? '🟡' : '🟢';
      lines.push(`| \`${file.file}\` | ${file.change} | ${riskEmoji} ${file.risk} |`);
    }
    if (report.filesDetail.length > 20) {
      lines.push(`| ... | ${report.filesDetail.length - 20} more files | |`);
    }
    lines.push('');
  }

  if (report.observations.length > 0) {
    lines.push('## Observations');
    lines.push('');
    for (const obs of report.observations) {
      const icon = obs.type === 'warning' ? '⚠️'
        : obs.type === 'discovery' ? '💡'
        : '📝';
      lines.push(`- ${icon} **[${obs.ifxTag}]** ${obs.detail}`);
    }
    lines.push('');
  }

  lines.push('## Effort Comparison');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Estimated effort | ${report.effortComparison.estimatedDays} |`);
  lines.push(`| Actual execution | ${report.effortComparison.actualExecutionMinutes} min |`);
  lines.push(`| Human review estimate | ${report.effortComparison.humanReviewEstimate} |`);
  lines.push(`| Total estimate | ${report.effortComparison.totalEstimate} |`);
  lines.push(`| Speedup factor | ${report.effortComparison.speedupFactor} |`);
  lines.push('');

  lines.push('## IFX Trace');
  lines.push('');
  lines.push(`- **Trace ID:** \`${report.ifxTrace.traceId}\``);
  lines.push(`- **Recommendation Trace:** \`${report.ifxTrace.recommendationTrace}\``);
  lines.push(`- **Facts:** ${report.ifxTrace.factsCount}`);
  lines.push(`- **Inferences:** ${report.ifxTrace.inferencesCount}`);
  lines.push(`- **Assumptions:** ${report.ifxTrace.assumptionsCount}`);
  lines.push(`- **New facts discovered:** ${report.ifxTrace.newFactsDiscovered}`);
  lines.push('');

  lines.push('---');
  lines.push('*Generated by TechScout Migration Agent*');

  return lines.join('\n');
}

/**
 * Get a short summary for notifications.
 */
export function getReportSummary(report: MigrationReport): string {
  return `Migration complete: ${report.diffStats.filesChanged} files (${report.diffStats.netChange} lines). ${report.observations.filter(o => o.type === 'warning').length} warnings. Speedup: ${report.effortComparison.speedupFactor}.`;
}
