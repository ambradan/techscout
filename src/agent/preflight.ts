/**
 * TechScout — Agent Preflight Checks (Layer 6)
 *
 * Pre-execution validation before any migration runs.
 * All checks must pass before the agent can proceed.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../lib/logger';
import type {
  PreflightCheck,
  PreflightCheckType,
  PreflightResult,
  AgentSafetyLimits,
  Recommendation,
} from '../types';
import { isPathForbidden, validatePlan } from './safety';

const execAsync = promisify(exec);

// ============================================================
// TYPES
// ============================================================

export interface PreflightOptions {
  workingDir: string;
  baseBranch: string;
  recommendation: Recommendation;
  safetyLimits: AgentSafetyLimits;
  runTests?: boolean;
  testCommand?: string;
}

// ============================================================
// INDIVIDUAL CHECKS
// ============================================================

/**
 * Check that the base branch is clean (no uncommitted changes).
 */
async function checkBaseBranchClean(
  workingDir: string
): Promise<PreflightCheck> {
  try {
    const { stdout } = await execAsync('git status --porcelain', {
      cwd: workingDir,
    });

    const isClean = stdout.trim() === '';

    return {
      check: 'base_branch_clean',
      status: isClean ? 'passed' : 'failed',
      detail: isClean
        ? 'Working directory is clean'
        : `Uncommitted changes detected: ${stdout.trim().split('\n').length} files`,
    };
  } catch (error) {
    return {
      check: 'base_branch_clean',
      status: 'failed',
      detail: `Failed to check git status: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Check that tests pass on the current branch.
 */
async function checkTestsGreen(
  workingDir: string,
  testCommand?: string
): Promise<PreflightCheck> {
  const command = testCommand || 'npm test';

  try {
    await execAsync(command, {
      cwd: workingDir,
      timeout: 300000, // 5 minute timeout
    });

    return {
      check: 'tests_green',
      status: 'passed',
      detail: `Test suite passed: ${command}`,
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message: string };
    return {
      check: 'tests_green',
      status: 'failed',
      detail: `Tests failed: ${err.stderr || err.message}`,
    };
  }
}

/**
 * Check that the recommendation is valid and actionable.
 */
function checkRecommendationValid(
  recommendation: Recommendation
): PreflightCheck {
  const issues: string[] = [];

  // Check required fields
  if (!recommendation.id) {
    issues.push('Missing recommendation ID');
  }

  if (!recommendation.subject?.name) {
    issues.push('Missing subject name');
  }

  if (!recommendation.action) {
    issues.push('Missing action type');
  }

  // Check stability assessment
  if (!recommendation.stabilityAssessment) {
    issues.push('Missing stability assessment');
  } else if (recommendation.stabilityAssessment.verdict === 'DEFER') {
    issues.push('Recommendation verdict is DEFER - not ready for migration');
  }

  // Check technical output
  if (!recommendation.technical?.effort?.steps?.length) {
    issues.push('Missing implementation steps');
  }

  if (issues.length > 0) {
    return {
      check: 'recommendation_valid',
      status: 'failed',
      detail: `Recommendation validation failed: ${issues.join(', ')}`,
    };
  }

  return {
    check: 'recommendation_valid',
    status: 'passed',
    detail: `Recommendation ${recommendation.id} is valid and actionable`,
  };
}

/**
 * Check that the migration scope is within safety limits.
 */
function checkScopeWithinLimits(
  recommendation: Recommendation,
  safetyLimits: AgentSafetyLimits
): PreflightCheck {
  const steps = recommendation.technical?.effort?.steps || [];
  const estimatedFiles = steps.length * 2; // Rough estimate
  const estimatedLines = estimatedFiles * 50; // Rough estimate

  // Simple validation without actual plan
  const violations: string[] = [];

  if (estimatedFiles > safetyLimits.maxFilesModified) {
    violations.push(
      `Estimated files (${estimatedFiles}) may exceed limit (${safetyLimits.maxFilesModified})`
    );
  }

  if (estimatedLines > safetyLimits.maxLinesChanged) {
    violations.push(
      `Estimated lines (${estimatedLines}) may exceed limit (${safetyLimits.maxLinesChanged})`
    );
  }

  // Check complexity from effort
  const rawEstimate = recommendation.technical?.effort?.rawEstimateDays || '0';
  const estimatedDays = parseFloat(rawEstimate.replace(/[^\d.]/g, '')) || 0;

  if (estimatedDays > 10) {
    violations.push(
      `Estimated effort (${estimatedDays} days) suggests complex migration - proceed with caution`
    );
  }

  if (violations.length > 0) {
    return {
      check: 'scope_within_limits',
      status: 'failed',
      detail: violations.join('; '),
    };
  }

  return {
    check: 'scope_within_limits',
    status: 'passed',
    detail: `Scope appears within safety limits: ~${estimatedFiles} files, ~${estimatedLines} lines`,
  };
}

/**
 * Check that no forbidden paths are targeted.
 */
function checkNoForbiddenPaths(
  recommendation: Recommendation,
  safetyLimits: AgentSafetyLimits
): PreflightCheck {
  // Extract file paths mentioned in the recommendation
  const mentionedPaths: string[] = [];

  // Check implementation steps for file paths
  const steps = recommendation.technical?.effort?.steps || [];
  for (const step of steps) {
    // Simple extraction of potential paths from step text
    const pathMatches = step.match(/[\w./\\-]+\.\w+/g) || [];
    mentionedPaths.push(...pathMatches);
  }

  // Check for forbidden paths
  const forbiddenFound: string[] = [];
  for (const path of mentionedPaths) {
    if (isPathForbidden(path, safetyLimits.forbiddenPaths)) {
      forbiddenFound.push(path);
    }
  }

  if (forbiddenFound.length > 0) {
    return {
      check: 'no_forbidden_paths',
      status: 'failed',
      detail: `Forbidden paths detected: ${forbiddenFound.join(', ')}`,
    };
  }

  return {
    check: 'no_forbidden_paths',
    status: 'passed',
    detail: 'No forbidden paths detected in recommendation scope',
  };
}

// ============================================================
// PREFLIGHT RUNNER
// ============================================================

/**
 * Run all preflight checks.
 */
export async function runPreflightChecks(
  options: PreflightOptions
): Promise<PreflightResult> {
  const startedAt = new Date().toISOString();
  const checks: PreflightCheck[] = [];

  logger.info('Starting preflight checks', {
    workingDir: options.workingDir,
    recommendationId: options.recommendation.id,
  });

  // 1. Check base branch is clean
  const branchCheck = await checkBaseBranchClean(options.workingDir);
  checks.push(branchCheck);

  // 2. Check tests (optional)
  if (options.runTests !== false) {
    const testCheck = await checkTestsGreen(
      options.workingDir,
      options.testCommand
    );
    checks.push(testCheck);
  } else {
    checks.push({
      check: 'tests_green',
      status: 'skipped',
      detail: 'Test check skipped by configuration',
    });
  }

  // 3. Check recommendation is valid
  const recCheck = checkRecommendationValid(options.recommendation);
  checks.push(recCheck);

  // 4. Check scope within limits
  const scopeCheck = checkScopeWithinLimits(
    options.recommendation,
    options.safetyLimits
  );
  checks.push(scopeCheck);

  // 5. Check no forbidden paths
  const pathCheck = checkNoForbiddenPaths(
    options.recommendation,
    options.safetyLimits
  );
  checks.push(pathCheck);

  // Determine if all passed
  const allPassed = checks.every(
    c => c.status === 'passed' || c.status === 'skipped'
  );

  const result: PreflightResult = {
    startedAt,
    checks,
    allPassed,
  };

  logger.info('Preflight checks complete', {
    allPassed,
    passed: checks.filter(c => c.status === 'passed').length,
    failed: checks.filter(c => c.status === 'failed').length,
    skipped: checks.filter(c => c.status === 'skipped').length,
  });

  return result;
}

/**
 * Get a summary of preflight results.
 */
export function getPreflightSummary(result: PreflightResult): string {
  const lines: string[] = [];

  lines.push('## Preflight Checks');
  lines.push('');

  const statusEmoji = {
    passed: '✅',
    failed: '❌',
    skipped: '⏭️',
  };

  for (const check of result.checks) {
    const emoji = statusEmoji[check.status];
    const name = formatCheckName(check.check);
    lines.push(`${emoji} **${name}**: ${check.detail}`);
  }

  lines.push('');

  if (result.allPassed) {
    lines.push('**Result:** All checks passed. Migration can proceed.');
  } else {
    const failed = result.checks.filter(c => c.status === 'failed');
    lines.push(`**Result:** ${failed.length} check(s) failed. Migration blocked.`);
  }

  return lines.join('\n');
}

/**
 * Format check type name for display.
 */
function formatCheckName(check: PreflightCheckType): string {
  const names: Record<PreflightCheckType, string> = {
    base_branch_clean: 'Clean Working Directory',
    tests_green: 'Tests Passing',
    recommendation_valid: 'Valid Recommendation',
    scope_within_limits: 'Scope Within Limits',
    no_forbidden_paths: 'No Forbidden Paths',
  };

  return names[check] || check;
}

// ============================================================
// QUICK CHECKS
// ============================================================

/**
 * Quick check if the environment is ready for migration.
 */
export async function quickEnvironmentCheck(
  workingDir: string
): Promise<{ ready: boolean; issues: string[] }> {
  const issues: string[] = [];

  try {
    // Check git is available
    await execAsync('git --version', { cwd: workingDir });
  } catch {
    issues.push('Git is not available');
  }

  try {
    // Check this is a git repo
    await execAsync('git rev-parse --git-dir', { cwd: workingDir });
  } catch {
    issues.push('Not a git repository');
  }

  try {
    // Check npm/node is available
    await execAsync('npm --version', { cwd: workingDir });
  } catch {
    issues.push('npm is not available');
  }

  return {
    ready: issues.length === 0,
    issues,
  };
}

/**
 * Verify that the recommendation can be executed.
 */
export function canExecuteRecommendation(
  recommendation: Recommendation
): { canExecute: boolean; blockers: string[] } {
  const blockers: string[] = [];

  // Check verdict
  if (recommendation.stabilityAssessment?.verdict === 'DEFER') {
    blockers.push('Stability verdict is DEFER - recommendation should be deferred');
  }

  // Check confidence
  if (recommendation.confidence < 0.5) {
    blockers.push(`Low confidence (${(recommendation.confidence * 100).toFixed(0)}%) - may need human review`);
  }

  // Check for breaking changes
  if (recommendation.technical?.effort?.breakingChanges) {
    blockers.push('Migration involves breaking changes - requires careful review');
  }

  // Check complexity
  if (recommendation.technical?.effort?.complexity === 'very_high') {
    blockers.push('Very high complexity - consider manual migration');
  }

  return {
    canExecute: blockers.length === 0,
    blockers,
  };
}
