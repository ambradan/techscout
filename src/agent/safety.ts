/**
 * TechScout — Agent Safety Module (Layer 6)
 *
 * Enforces safety constraints on all agent operations.
 * The agent is an accelerator, not a decision maker.
 *
 * NON-NEGOTIABLE CONSTRAINTS:
 *   1. Isolated branch, never main/production
 *   2. Commit pre-modification state BEFORE any change
 *   3. Scope limited to recommendation files
 *   4. Mandatory human gate before merge
 *   5. If complexity > 2x estimate, STOP and ask
 *   6. Source code never exposed outside local runtime
 */

import { logger } from '../lib/logger';
import type {
  AgentSafetyLimits,
  SafetyCheck,
  SafetyStop,
  SafetyStopReason,
  PlanStep,
} from '../types';

// ============================================================
// DEFAULT SAFETY LIMITS
// ============================================================

export function getDefaultSafetyLimits(): AgentSafetyLimits {
  return {
    maxFilesModified: 20,
    maxLinesChanged: 1000,
    maxExecutionTimeMinutes: 30,
    complexityThreshold: 2.0,
    requireTestsPass: true,
    requireLintPass: true,
    forbiddenPaths: [
      '.env',
      '.env.*',
      '*.pem',
      '*.key',
      '**/secrets/**',
      '**/credentials/**',
      '.git/**',
      'node_modules/**',
      '**/dist/**',
      '**/build/**',
    ],
    forbiddenOperations: [
      'rm -rf',
      'drop database',
      'truncate',
      'delete from',
      'force push',
      '--force',
      '-f push',
      'chmod 777',
      'curl | sh',
      'wget | sh',
      'eval(',
      'exec(',
    ],
  };
}

// ============================================================
// SAFETY VALIDATION
// ============================================================

/**
 * Check if a file path is forbidden.
 */
export function isPathForbidden(
  filePath: string,
  forbiddenPaths: string[]
): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();

  for (const pattern of forbiddenPaths) {
    const normalizedPattern = pattern.replace(/\\/g, '/').toLowerCase();

    // Simple glob matching
    if (normalizedPattern.includes('**')) {
      const parts = normalizedPattern.split('**');
      if (parts.length === 2) {
        const [prefix, suffix] = parts;
        if (
          (prefix === '' || normalizedPath.startsWith(prefix)) &&
          (suffix === '' || normalizedPath.endsWith(suffix))
        ) {
          return true;
        }
      }
    } else if (normalizedPattern.includes('*')) {
      // Single wildcard
      const regex = new RegExp(
        '^' + normalizedPattern.replace(/\*/g, '.*') + '$'
      );
      if (regex.test(normalizedPath)) {
        return true;
      }
    } else {
      // Exact match or prefix
      if (
        normalizedPath === normalizedPattern ||
        normalizedPath.startsWith(normalizedPattern + '/')
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a command contains forbidden operations.
 */
export function containsForbiddenOperation(
  command: string,
  forbiddenOperations: string[]
): string | null {
  const normalizedCommand = command.toLowerCase();

  for (const forbidden of forbiddenOperations) {
    if (normalizedCommand.includes(forbidden.toLowerCase())) {
      return forbidden;
    }
  }

  return null;
}

/**
 * Validate a plan step against safety limits.
 */
export function validatePlanStep(
  step: PlanStep,
  limits: AgentSafetyLimits
): { valid: boolean; reason?: string } {
  // Check for forbidden paths
  for (const file of step.filesAffected) {
    if (isPathForbidden(file, limits.forbiddenPaths)) {
      return {
        valid: false,
        reason: `Step ${step.step} affects forbidden path: ${file}`,
      };
    }
  }

  // Check for forbidden operations
  const forbiddenOp = containsForbiddenOperation(step.command, limits.forbiddenOperations);
  if (forbiddenOp) {
    return {
      valid: false,
      reason: `Step ${step.step} contains forbidden operation: ${forbiddenOp}`,
    };
  }

  return { valid: true };
}

/**
 * Validate an entire plan against safety limits.
 */
export function validatePlan(
  steps: PlanStep[],
  estimatedFiles: number,
  estimatedLines: number,
  limits: AgentSafetyLimits
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // Check file limit
  if (estimatedFiles > limits.maxFilesModified) {
    violations.push(
      `Estimated files (${estimatedFiles}) exceeds limit (${limits.maxFilesModified})`
    );
  }

  // Check lines limit
  if (estimatedLines > limits.maxLinesChanged) {
    violations.push(
      `Estimated lines (${estimatedLines}) exceeds limit (${limits.maxLinesChanged})`
    );
  }

  // Validate each step
  for (const step of steps) {
    const result = validatePlanStep(step, limits);
    if (!result.valid && result.reason) {
      violations.push(result.reason);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// ============================================================
// RUNTIME SAFETY CHECKS
// ============================================================

/**
 * Perform runtime safety check during execution.
 */
export function performSafetyCheck(
  filesModified: number,
  linesChanged: number,
  forbiddenPathsTouched: string[],
  forbiddenOpsAttempted: string[],
  estimatedComplexity: number,
  actualComplexity: number,
  limits: AgentSafetyLimits
): SafetyCheck {
  const complexityRatio = estimatedComplexity > 0
    ? actualComplexity / estimatedComplexity
    : 1.0;

  return {
    filesModified,
    filesLimit: limits.maxFilesModified,
    linesChanged,
    linesLimit: limits.maxLinesChanged,
    forbiddenPathsTouched: forbiddenPathsTouched.length,
    forbiddenOperationsAttempted: forbiddenOpsAttempted.length,
    complexityRatio: Math.round(complexityRatio * 100) / 100,
    complexityLimit: limits.complexityThreshold,
    allWithinLimits:
      filesModified <= limits.maxFilesModified &&
      linesChanged <= limits.maxLinesChanged &&
      forbiddenPathsTouched.length === 0 &&
      forbiddenOpsAttempted.length === 0 &&
      complexityRatio <= limits.complexityThreshold,
  };
}

/**
 * Determine if a safety stop should be triggered.
 */
export function shouldTriggerSafetyStop(
  check: SafetyCheck,
  testsPassed: boolean,
  limits: AgentSafetyLimits
): { stop: boolean; reason?: SafetyStopReason } {
  if (check.filesModified > check.filesLimit) {
    return { stop: true, reason: 'files_limit_exceeded' };
  }

  if (check.linesChanged > check.linesLimit) {
    return { stop: true, reason: 'lines_limit_exceeded' };
  }

  if (check.forbiddenPathsTouched > 0) {
    return { stop: true, reason: 'forbidden_path_access' };
  }

  if (check.forbiddenOperationsAttempted > 0) {
    return { stop: true, reason: 'forbidden_operation' };
  }

  if (check.complexityRatio > check.complexityLimit) {
    return { stop: true, reason: 'complexity_exceeded' };
  }

  if (limits.requireTestsPass && !testsPassed) {
    return { stop: true, reason: 'tests_failed' };
  }

  return { stop: false };
}

// ============================================================
// SAFETY STOP HANDLING
// ============================================================

/**
 * Create a safety stop record.
 */
export function createSafetyStop(
  reason: SafetyStopReason,
  atStep?: number,
  partialBranch?: string
): SafetyStop {
  const recoveryOptions = getRecoveryOptions(reason);

  logger.warn('Safety stop triggered', {
    reason,
    atStep,
    partialBranch,
  });

  return {
    triggered: true,
    triggerReason: reason,
    triggerAtStep: atStep,
    partialWorkCommitted: !!partialBranch,
    partialBranch,
    recoveryOptions,
  };
}

/**
 * Get recovery options for a safety stop reason.
 */
function getRecoveryOptions(reason: SafetyStopReason): string[] {
  switch (reason) {
    case 'files_limit_exceeded':
      return [
        'Split migration into smaller chunks',
        'Increase file limit with approval',
        'Review and exclude unnecessary files',
      ];

    case 'lines_limit_exceeded':
      return [
        'Split migration into phases',
        'Increase line limit with approval',
        'Review for unnecessary changes',
      ];

    case 'complexity_exceeded':
      return [
        'Request human assistance for complex section',
        'Simplify approach',
        'Break into smaller tasks',
      ];

    case 'forbidden_path_access':
      return [
        'Review plan to exclude sensitive paths',
        'Request explicit approval for path access',
        'Use alternative approach',
      ];

    case 'forbidden_operation':
      return [
        'Rewrite command without forbidden operation',
        'Request explicit approval',
        'Use safer alternative',
      ];

    case 'tests_failed':
      return [
        'Review and fix failing tests',
        'Update tests for new behavior',
        'Roll back changes',
      ];

    case 'ambiguity_high':
      return [
        'Request clarification from user',
        'Document assumptions and proceed with caution',
        'Defer ambiguous sections to human',
      ];

    case 'timeout':
      return [
        'Resume from checkpoint',
        'Optimize slow operations',
        'Increase timeout with approval',
      ];

    case 'api_error':
      return [
        'Retry operation',
        'Check API status',
        'Resume from last checkpoint',
      ];

    default:
      return ['Review logs and determine cause', 'Contact support'];
  }
}

/**
 * Create a non-triggered safety stop (migration completed safely).
 */
export function createSafeCompletion(): SafetyStop {
  return {
    triggered: false,
    partialWorkCommitted: false,
    recoveryOptions: [],
  };
}

// ============================================================
// BRANCH SAFETY
// ============================================================

const PROTECTED_BRANCHES = ['main', 'master', 'production', 'prod', 'release'];

/**
 * Check if a branch is protected.
 */
export function isProtectedBranch(branchName: string): boolean {
  const normalized = branchName.toLowerCase().trim();
  return PROTECTED_BRANCHES.includes(normalized);
}

/**
 * Validate that target branch is safe for agent operations.
 */
export function validateTargetBranch(
  branchName: string,
  baseBranch: string
): { valid: boolean; reason?: string } {
  if (isProtectedBranch(branchName)) {
    return {
      valid: false,
      reason: `Cannot operate on protected branch: ${branchName}`,
    };
  }

  // Agent should never push to base branch directly
  if (branchName === baseBranch) {
    return {
      valid: false,
      reason: `Cannot operate directly on base branch: ${baseBranch}`,
    };
  }

  return { valid: true };
}

/**
 * Generate a safe branch name for migration.
 */
export function generateSafeBranchName(
  prefix: string,
  recommendationId: string,
  subject: string
): string {
  // Sanitize subject for branch name
  const sanitizedSubject = subject
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);

  const shortId = recommendationId.slice(-8);
  const timestamp = Date.now().toString(36);

  return `${prefix}/${sanitizedSubject}-${shortId}-${timestamp}`;
}

// ============================================================
// EXECUTION TIME SAFETY
// ============================================================

/**
 * Create an execution timeout checker.
 */
export function createTimeoutChecker(
  startTime: Date,
  limitMinutes: number
): { isExpired: () => boolean; remainingMs: () => number } {
  const limitMs = limitMinutes * 60 * 1000;

  return {
    isExpired: () => {
      const elapsed = Date.now() - startTime.getTime();
      return elapsed >= limitMs;
    },
    remainingMs: () => {
      const elapsed = Date.now() - startTime.getTime();
      return Math.max(0, limitMs - elapsed);
    },
  };
}

// ============================================================
// LOGGING & AUDIT
// ============================================================

/**
 * Log a safety event for audit trail.
 */
export function logSafetyEvent(
  event: 'check_passed' | 'check_failed' | 'stop_triggered' | 'limit_warning',
  details: Record<string, unknown>
): void {
  logger.info(`Safety event: ${event}`, {
    event,
    ...details,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create a safety summary for reporting.
 */
export function createSafetySummary(
  check: SafetyCheck,
  safetyStop: SafetyStop
): string {
  const lines: string[] = [];

  lines.push('## Safety Summary');
  lines.push('');

  if (safetyStop.triggered) {
    lines.push(`**Status:** STOPPED (${safetyStop.triggerReason})`);
    if (safetyStop.triggerAtStep !== undefined) {
      lines.push(`**Stopped at step:** ${safetyStop.triggerAtStep}`);
    }
    lines.push('');
    lines.push('**Recovery options:**');
    for (const option of safetyStop.recoveryOptions) {
      lines.push(`- ${option}`);
    }
  } else {
    lines.push('**Status:** All checks passed');
  }

  lines.push('');
  lines.push('### Limits');
  lines.push(`- Files: ${check.filesModified}/${check.filesLimit}`);
  lines.push(`- Lines: ${check.linesChanged}/${check.linesLimit}`);
  lines.push(`- Complexity ratio: ${check.complexityRatio}x (limit: ${check.complexityLimit}x)`);

  if (check.forbiddenPathsTouched > 0) {
    lines.push(`- **Forbidden paths accessed:** ${check.forbiddenPathsTouched}`);
  }

  if (check.forbiddenOperationsAttempted > 0) {
    lines.push(`- **Forbidden operations:** ${check.forbiddenOperationsAttempted}`);
  }

  return lines.join('\n');
}
