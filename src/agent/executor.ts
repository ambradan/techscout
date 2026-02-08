/**
 * TechScout — Agent Executor Module (Layer 6)
 *
 * Executes approved migration plans step by step.
 * Enforces safety limits and can stop at any time.
 *
 * CRITICAL: The executor is NOT the decision maker.
 * All plans must be human-approved before execution.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../lib/logger';
import type {
  MigrationPlan,
  PlanStep,
  StepExecution,
  ExecutionResult,
  SafetyCheck,
  AmbiguityLogEntry,
  ClaudeCodeSession,
  AgentSafetyLimits,
  SafetyStopReason,
  BackupInfo,
} from '../types';
import {
  performSafetyCheck,
  shouldTriggerSafetyStop,
  createTimeoutChecker,
  isPathForbidden,
  containsForbiddenOperation,
} from './safety';
import { commitChanges, getBackupDiff } from './backup';

const execAsync = promisify(exec);

// ============================================================
// TYPES
// ============================================================

export interface ExecutorOptions {
  workingDir: string;
  plan: MigrationPlan;
  backup: BackupInfo;
  safetyLimits: AgentSafetyLimits;
  onStepComplete?: (step: StepExecution) => void;
  onSafetyWarning?: (warning: string) => void;
}

export interface ExecutorResult {
  success: boolean;
  execution?: ExecutionResult;
  stoppedAt?: number;
  stopReason?: SafetyStopReason;
  error?: string;
}

// ============================================================
// STEP EXECUTION
// ============================================================

/**
 * Execute a single plan step.
 */
async function executeStep(
  step: PlanStep,
  workingDir: string,
  safetyLimits: AgentSafetyLimits
): Promise<StepExecution> {
  const startTime = Date.now();

  logger.info('Executing step', {
    step: step.step,
    action: step.action,
    risk: step.risk,
  });

  try {
    // Validate command before execution
    const forbiddenOp = containsForbiddenOperation(
      step.command,
      safetyLimits.forbiddenOperations
    );
    if (forbiddenOp) {
      return {
        step: step.step,
        status: 'failed',
        durationSeconds: 0,
        output: '',
        error: `Command contains forbidden operation: ${forbiddenOp}`,
      };
    }

    // Check for forbidden paths
    for (const file of step.filesAffected) {
      if (isPathForbidden(file, safetyLimits.forbiddenPaths)) {
        return {
          step: step.step,
          status: 'failed',
          durationSeconds: 0,
          output: '',
          error: `Step affects forbidden path: ${file}`,
        };
      }
    }

    // Skip comment-only commands
    if (step.command.trim().startsWith('#')) {
      return {
        step: step.step,
        status: 'completed',
        durationSeconds: 0,
        output: 'Manual step - requires human intervention',
        notes: 'This step requires manual execution',
      };
    }

    // Execute the command
    const { stdout, stderr } = await execAsync(step.command, {
      cwd: workingDir,
      timeout: 300000, // 5 minute timeout per step
    });

    const durationSeconds = (Date.now() - startTime) / 1000;

    logger.info('Step completed', {
      step: step.step,
      durationSeconds,
    });

    return {
      step: step.step,
      status: 'completed',
      durationSeconds,
      output: stdout || stderr || 'Command executed successfully',
    };
  } catch (error) {
    const durationSeconds = (Date.now() - startTime) / 1000;
    const err = error as { stdout?: string; stderr?: string; message: string };

    logger.error('Step failed', {
      step: step.step,
      error: err.message,
    });

    return {
      step: step.step,
      status: 'failed',
      durationSeconds,
      output: err.stdout || '',
      error: err.stderr || err.message,
    };
  }
}

// ============================================================
// AMBIGUITY DETECTION
// ============================================================

/**
 * Detect ambiguity in step execution.
 */
function detectAmbiguity(
  step: PlanStep,
  execution: StepExecution
): AmbiguityLogEntry | null {
  // Check for warning patterns in output
  const warningPatterns = [
    /warning/i,
    /deprecated/i,
    /multiple versions/i,
    /conflict/i,
    /peer dep/i,
    /optional/i,
  ];

  for (const pattern of warningPatterns) {
    if (pattern.test(execution.output)) {
      return {
        atStep: step.step,
        description: `Potential ambiguity detected: ${pattern.source}`,
        decision: 'Proceeding with caution',
        confidence: 0.7,
        ifxTag: 'ASSUMPTION',
      };
    }
  }

  return null;
}

// ============================================================
// MAIN EXECUTOR
// ============================================================

/**
 * Execute an approved migration plan.
 */
export async function executePlan(
  options: ExecutorOptions
): Promise<ExecutorResult> {
  const { workingDir, plan, backup, safetyLimits, onStepComplete, onSafetyWarning } = options;

  const startTime = new Date();
  const stepsExecuted: StepExecution[] = [];
  const ambiguityLog: AmbiguityLogEntry[] = [];
  const timeoutChecker = createTimeoutChecker(startTime, safetyLimits.maxExecutionTimeMinutes);

  logger.info('Starting plan execution', {
    stepCount: plan.steps.length,
    maxExecutionMinutes: safetyLimits.maxExecutionTimeMinutes,
  });

  // Track forbidden paths/operations encountered
  const forbiddenPathsTouched: string[] = [];
  const forbiddenOpsAttempted: string[] = [];

  try {
    for (const step of plan.steps) {
      // Check timeout
      if (timeoutChecker.isExpired()) {
        logger.warn('Execution timeout reached');

        // Commit partial work
        await commitChanges(
          workingDir,
          `[TechScout] Partial migration - timeout at step ${step.step}`,
          backup
        );

        return {
          success: false,
          stoppedAt: step.step,
          stopReason: 'timeout',
          error: 'Execution timeout reached',
        };
      }

      // Execute the step
      const execution = await executeStep(step, workingDir, safetyLimits);
      stepsExecuted.push(execution);

      // Notify callback
      if (onStepComplete) {
        onStepComplete(execution);
      }

      // Check for ambiguity
      const ambiguity = detectAmbiguity(step, execution);
      if (ambiguity) {
        ambiguityLog.push(ambiguity);

        // High ambiguity ratio triggers safety stop
        if (ambiguityLog.length > plan.steps.length * 0.3) {
          logger.warn('High ambiguity detected');

          await commitChanges(
            workingDir,
            `[TechScout] Partial migration - high ambiguity at step ${step.step}`,
            backup
          );

          return {
            success: false,
            stoppedAt: step.step,
            stopReason: 'ambiguity_high',
            error: 'Too many ambiguous situations encountered',
          };
        }
      }

      // If step failed, stop execution
      if (execution.status === 'failed') {
        logger.error('Step failed, stopping execution', {
          step: step.step,
          error: execution.error,
        });

        // Commit partial work
        await commitChanges(
          workingDir,
          `[TechScout] Partial migration - failed at step ${step.step}`,
          backup
        );

        return {
          success: false,
          stoppedAt: step.step,
          error: execution.error,
        };
      }

      // Commit after each successful step
      await commitChanges(
        workingDir,
        `[TechScout] Step ${step.step}: ${step.action}`,
        backup
      );
    }

    // Get final diff stats
    const diffStats = await getBackupDiff(workingDir, backup);

    // Perform final safety check
    const safetyCheck = performSafetyCheck(
      diffStats.filesChanged,
      diffStats.insertions + diffStats.deletions,
      forbiddenPathsTouched,
      forbiddenOpsAttempted,
      plan.estimatedFiles, // Use as complexity proxy
      diffStats.filesChanged,
      safetyLimits
    );

    const completedAt = new Date();
    const durationMinutes = (completedAt.getTime() - startTime.getTime()) / (1000 * 60);

    // Create Claude Code session info (placeholder for actual usage)
    const claudeCode: ClaudeCodeSession = {
      model: 'claude-sonnet-4-5-20250929',
      sessionId: `exec-${Date.now()}`,
      totalTokens: 0, // Would be tracked in actual implementation
      apiCostUsd: 0,
    };

    const execution: ExecutionResult = {
      startedAt: startTime.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMinutes: Math.round(durationMinutes * 100) / 100,
      claudeCode,
      stepsExecuted,
      safetyChecks: safetyCheck,
      ambiguityLog,
    };

    logger.info('Plan execution completed', {
      stepsCompleted: stepsExecuted.filter(s => s.status === 'completed').length,
      durationMinutes,
      filesChanged: diffStats.filesChanged,
    });

    return { success: true, execution };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Execution failed', { error: errorMsg });

    // Try to commit partial work
    try {
      await commitChanges(
        workingDir,
        '[TechScout] Partial migration - error during execution',
        backup
      );
    } catch {
      logger.warn('Could not commit partial work');
    }

    return {
      success: false,
      error: errorMsg,
    };
  }
}

// ============================================================
// TEST EXECUTION
// ============================================================

export interface TestResult {
  testsRan: boolean;
  passed: boolean;
  total: number;
  passed_count: number;
  failed: number;
  output: string;
  error?: string;
}

/**
 * Run tests after migration.
 */
export async function runTests(
  workingDir: string,
  testCommand: string = 'npm test'
): Promise<TestResult> {
  logger.info('Running tests', { command: testCommand });

  try {
    const { stdout, stderr } = await execAsync(testCommand, {
      cwd: workingDir,
      timeout: 600000, // 10 minute timeout for tests
    });

    // Parse test output (basic parsing, would need framework-specific parsing)
    const output = stdout + stderr;

    // Try to extract test counts
    const passMatch = output.match(/(\d+)\s+pass/i);
    const failMatch = output.match(/(\d+)\s+fail/i);
    const totalMatch = output.match(/(\d+)\s+(?:tests?|specs?)/i);

    const passed_count = passMatch ? parseInt(passMatch[1]) : 0;
    const failed = failMatch ? parseInt(failMatch[1]) : 0;
    const total = totalMatch ? parseInt(totalMatch[1]) : passed_count + failed;

    return {
      testsRan: true,
      passed: failed === 0,
      total,
      passed_count,
      failed,
      output,
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message: string };

    return {
      testsRan: true,
      passed: false,
      total: 0,
      passed_count: 0,
      failed: 1,
      output: err.stdout || '',
      error: err.stderr || err.message,
    };
  }
}

/**
 * Run linter after migration.
 */
export async function runLinter(
  workingDir: string,
  lintCommand: string = 'npm run lint'
): Promise<{ passed: boolean; warnings: number; errors: number; output: string }> {
  logger.info('Running linter', { command: lintCommand });

  try {
    const { stdout, stderr } = await execAsync(lintCommand, {
      cwd: workingDir,
      timeout: 300000, // 5 minute timeout
    });

    const output = stdout + stderr;

    // Try to extract lint counts
    const errorMatch = output.match(/(\d+)\s+errors?/i);
    const warningMatch = output.match(/(\d+)\s+warnings?/i);

    const errors = errorMatch ? parseInt(errorMatch[1]) : 0;
    const warnings = warningMatch ? parseInt(warningMatch[1]) : 0;

    return {
      passed: errors === 0,
      warnings,
      errors,
      output,
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message: string };

    return {
      passed: false,
      warnings: 0,
      errors: 1,
      output: err.stderr || err.message,
    };
  }
}

/**
 * Run type checker after migration.
 */
export async function runTypeCheck(
  workingDir: string,
  typeCheckCommand: string = 'npx tsc --noEmit'
): Promise<{ passed: boolean; errors: number; output: string }> {
  logger.info('Running type check', { command: typeCheckCommand });

  try {
    const { stdout, stderr } = await execAsync(typeCheckCommand, {
      cwd: workingDir,
      timeout: 300000, // 5 minute timeout
    });

    return {
      passed: true,
      errors: 0,
      output: stdout || stderr || 'Type check passed',
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message: string };
    const output = (err.stdout || '') + (err.stderr || '');

    // Count TS errors
    const errorMatches = output.match(/error TS\d+/g) || [];

    return {
      passed: false,
      errors: errorMatches.length,
      output,
    };
  }
}

// ============================================================
// EXECUTION SUMMARY
// ============================================================

/**
 * Get execution summary for reporting.
 */
export function getExecutionSummary(result: ExecutorResult): string {
  const lines: string[] = [];

  lines.push('## Execution Summary');
  lines.push('');

  if (result.success && result.execution) {
    const exec = result.execution;

    lines.push(`**Status:** Completed successfully`);
    lines.push(`**Duration:** ${exec.durationMinutes} minutes`);
    lines.push(`**Steps completed:** ${exec.stepsExecuted.filter(s => s.status === 'completed').length}/${exec.stepsExecuted.length}`);
    lines.push('');

    lines.push('### Safety Checks');
    lines.push(`- Files modified: ${exec.safetyChecks.filesModified}/${exec.safetyChecks.filesLimit}`);
    lines.push(`- Lines changed: ${exec.safetyChecks.linesChanged}/${exec.safetyChecks.linesLimit}`);
    lines.push(`- Complexity ratio: ${exec.safetyChecks.complexityRatio}x`);

    if (exec.ambiguityLog.length > 0) {
      lines.push('');
      lines.push('### Ambiguities Detected');
      for (const amb of exec.ambiguityLog) {
        lines.push(`- Step ${amb.atStep}: ${amb.description}`);
      }
    }
  } else {
    lines.push(`**Status:** Failed`);

    if (result.stoppedAt) {
      lines.push(`**Stopped at step:** ${result.stoppedAt}`);
    }

    if (result.stopReason) {
      lines.push(`**Stop reason:** ${result.stopReason}`);
    }

    if (result.error) {
      lines.push(`**Error:** ${result.error}`);
    }
  }

  return lines.join('\n');
}
