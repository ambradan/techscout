/**
 * TechScout — Agent Planner Module (Layer 6)
 *
 * Generates detailed migration plans from recommendations.
 * Plans must be approved by a human before execution.
 */

import { logger } from '../lib/logger';
import type {
  MigrationPlan,
  PlanStep,
  StepRisk,
  AgentSafetyLimits,
  Recommendation,
  ReviewStatus,
} from '../types';
import { validatePlan } from './safety';

// ============================================================
// TYPES
// ============================================================

export interface PlannerOptions {
  recommendation: Recommendation;
  safetyLimits: AgentSafetyLimits;
  projectStack?: {
    languages: string[];
    frameworks: string[];
    packageManager?: string;
  };
}

export interface PlanResult {
  success: boolean;
  plan?: MigrationPlan;
  error?: string;
}

// ============================================================
// RISK ASSESSMENT
// ============================================================

/**
 * Assess risk level for a step based on its characteristics.
 */
function assessStepRisk(
  action: string,
  command: string,
  filesAffected: string[]
): StepRisk {
  // High risk indicators
  const highRiskPatterns = [
    /delete|remove|uninstall/i,
    /breaking/i,
    /migration/i,
    /database/i,
    /config/i,
    /\.env/i,
  ];

  // Medium risk indicators
  const mediumRiskPatterns = [
    /modify|update|change/i,
    /refactor/i,
    /replace/i,
  ];

  // Check command and action for risk patterns
  const text = `${action} ${command}`;

  for (const pattern of highRiskPatterns) {
    if (pattern.test(text)) {
      return 'high';
    }
  }

  for (const pattern of mediumRiskPatterns) {
    if (pattern.test(text)) {
      return 'medium';
    }
  }

  // More files = higher risk
  if (filesAffected.length > 5) {
    return 'medium';
  }

  return 'low';
}

/**
 * Estimate files affected by a step.
 */
function estimateFilesAffected(
  stepDescription: string,
  action: string
): string[] {
  const files: string[] = [];

  // Extract file patterns from description
  const filePatterns = stepDescription.match(/[\w./\\-]+\.\w+/g) || [];
  files.push(...filePatterns);

  // Add common files based on action type
  if (action === 'REPLACE_EXISTING') {
    files.push('package.json');
  }

  if (stepDescription.toLowerCase().includes('test')) {
    files.push('**/*.test.ts', '**/*.spec.ts');
  }

  if (stepDescription.toLowerCase().includes('config')) {
    files.push('*.config.js', '*.config.ts');
  }

  return [...new Set(files)];
}

/**
 * Generate command for a step.
 */
function generateCommand(
  stepDescription: string,
  packageManager: string = 'npm'
): string {
  const desc = stepDescription.toLowerCase();

  // Installation commands
  if (desc.includes('install') || desc.includes('add')) {
    const packages = desc.match(/`([^`]+)`/g) || [];
    const packageNames = packages.map(p => p.replace(/`/g, '')).join(' ');

    if (packageNames) {
      if (packageManager === 'npm') {
        return `npm install ${packageNames}`;
      } else if (packageManager === 'yarn') {
        return `yarn add ${packageNames}`;
      } else if (packageManager === 'pnpm') {
        return `pnpm add ${packageNames}`;
      }
    }
    return `# Install required packages`;
  }

  // Uninstall commands
  if (desc.includes('uninstall') || desc.includes('remove')) {
    const packages = desc.match(/`([^`]+)`/g) || [];
    const packageNames = packages.map(p => p.replace(/`/g, '')).join(' ');

    if (packageNames) {
      if (packageManager === 'npm') {
        return `npm uninstall ${packageNames}`;
      } else if (packageManager === 'yarn') {
        return `yarn remove ${packageNames}`;
      } else if (packageManager === 'pnpm') {
        return `pnpm remove ${packageNames}`;
      }
    }
    return `# Remove deprecated packages`;
  }

  // Update commands
  if (desc.includes('update') && desc.includes('import')) {
    return `# Update import statements in affected files`;
  }

  if (desc.includes('update') && desc.includes('config')) {
    return `# Update configuration files`;
  }

  // Test commands
  if (desc.includes('run test') || desc.includes('verify')) {
    return `npm test`;
  }

  // Build commands
  if (desc.includes('build')) {
    return `npm run build`;
  }

  // Default
  return `# ${stepDescription}`;
}

// ============================================================
// PLAN GENERATION
// ============================================================

/**
 * Generate a migration plan from a recommendation.
 */
export function generatePlan(options: PlannerOptions): PlanResult {
  const { recommendation, safetyLimits, projectStack } = options;

  logger.info('Generating migration plan', {
    recommendationId: recommendation.id,
    action: recommendation.action,
  });

  try {
    const steps: PlanStep[] = [];
    const rawSteps = recommendation.technical?.effort?.steps || [];

    if (rawSteps.length === 0) {
      return {
        success: false,
        error: 'No implementation steps provided in recommendation',
      };
    }

    // Convert recommendation steps to plan steps
    for (let i = 0; i < rawSteps.length; i++) {
      const stepDesc = rawSteps[i];
      const filesAffected = estimateFilesAffected(stepDesc, recommendation.action);
      const command = generateCommand(
        stepDesc,
        projectStack?.packageManager
      );

      const planStep: PlanStep = {
        step: i + 1,
        action: stepDesc,
        command,
        filesAffected,
        risk: assessStepRisk(stepDesc, command, filesAffected),
        expected: `Step ${i + 1} completion`,
      };

      steps.push(planStep);
    }

    // Add verification steps
    steps.push({
      step: steps.length + 1,
      action: 'Run test suite to verify migration',
      command: 'npm test',
      filesAffected: [],
      risk: 'low',
      expected: 'All tests pass',
    });

    if (safetyLimits.requireLintPass) {
      steps.push({
        step: steps.length + 1,
        action: 'Run linter to check code quality',
        command: 'npm run lint',
        filesAffected: [],
        risk: 'low',
        expected: 'No lint errors',
      });
    }

    // Estimate totals
    const estimatedFiles = new Set<string>();
    for (const step of steps) {
      for (const file of step.filesAffected) {
        estimatedFiles.add(file);
      }
    }
    const estimatedFileCount = Math.max(estimatedFiles.size, steps.length);
    const estimatedLines = estimatedFileCount * 30; // Rough estimate

    // Validate against safety limits
    const validation = validatePlan(
      steps,
      estimatedFileCount,
      estimatedLines,
      safetyLimits
    );

    const plan: MigrationPlan = {
      generatedAt: new Date().toISOString(),
      status: 'pending',
      steps,
      estimatedFiles: estimatedFileCount,
      estimatedLines,
      withinSafetyLimits: validation.valid,
    };

    if (!validation.valid) {
      logger.warn('Plan exceeds safety limits', {
        violations: validation.violations,
      });
    }

    logger.info('Migration plan generated', {
      stepCount: steps.length,
      estimatedFiles: estimatedFileCount,
      estimatedLines,
      withinLimits: validation.valid,
    });

    return { success: true, plan };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Plan generation failed', { error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

/**
 * Approve a migration plan.
 */
export function approvePlan(
  plan: MigrationPlan,
  approver: string
): MigrationPlan {
  logger.info('Plan approved', { approver });

  return {
    ...plan,
    status: 'approved',
    approvedBy: approver,
    approvedAt: new Date().toISOString(),
  };
}

/**
 * Reject a migration plan.
 */
export function rejectPlan(
  plan: MigrationPlan,
  rejector: string,
  reason?: string
): MigrationPlan {
  logger.info('Plan rejected', { rejector, reason });

  return {
    ...plan,
    status: 'rejected',
    approvedBy: rejector,
    approvedAt: new Date().toISOString(),
  };
}

/**
 * Request changes to a migration plan.
 */
export function requestPlanChanges(
  plan: MigrationPlan,
  reviewer: string,
  changes: string[]
): MigrationPlan {
  logger.info('Plan changes requested', { reviewer, changeCount: changes.length });

  return {
    ...plan,
    status: 'changes_requested',
    approvedBy: reviewer,
    approvedAt: new Date().toISOString(),
  };
}

// ============================================================
// PLAN RENDERING
// ============================================================

/**
 * Render a migration plan as Markdown.
 */
export function renderPlanMarkdown(plan: MigrationPlan): string {
  const lines: string[] = [];

  lines.push('# Migration Plan');
  lines.push('');
  lines.push(`**Generated:** ${new Date(plan.generatedAt).toLocaleString()}`);
  lines.push(`**Status:** ${plan.status}`);

  if (plan.approvedBy) {
    lines.push(`**Approved by:** ${plan.approvedBy}`);
    lines.push(`**Approved at:** ${plan.approvedAt}`);
  }

  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Total steps:** ${plan.steps.length}`);
  lines.push(`- **Estimated files:** ${plan.estimatedFiles}`);
  lines.push(`- **Estimated lines:** ${plan.estimatedLines}`);
  lines.push(`- **Within safety limits:** ${plan.withinSafetyLimits ? 'Yes' : 'No'}`);
  lines.push('');

  lines.push('## Steps');
  lines.push('');

  const riskEmoji: Record<StepRisk, string> = {
    low: '🟢',
    medium: '🟡',
    high: '🔴',
  };

  for (const step of plan.steps) {
    lines.push(`### Step ${step.step}: ${step.action}`);
    lines.push('');
    lines.push(`**Risk:** ${riskEmoji[step.risk]} ${step.risk}`);
    lines.push('');
    lines.push('```bash');
    lines.push(step.command);
    lines.push('```');
    lines.push('');

    if (step.filesAffected.length > 0) {
      lines.push('**Files affected:**');
      for (const file of step.filesAffected) {
        lines.push(`- \`${file}\``);
      }
      lines.push('');
    }

    if (step.expected) {
      lines.push(`**Expected outcome:** ${step.expected}`);
      lines.push('');
    }

    if (step.notes) {
      lines.push(`> ${step.notes}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('**Review Checklist:**');
  lines.push('- [ ] All steps are necessary and correct');
  lines.push('- [ ] High-risk steps have been reviewed');
  lines.push('- [ ] Rollback strategy is understood');
  lines.push('- [ ] Team has been notified');

  return lines.join('\n');
}

/**
 * Get a summary of the plan for notifications.
 */
export function getPlanSummary(plan: MigrationPlan): string {
  const highRiskSteps = plan.steps.filter(s => s.risk === 'high').length;
  const mediumRiskSteps = plan.steps.filter(s => s.risk === 'medium').length;

  return `Migration plan: ${plan.steps.length} steps, ~${plan.estimatedFiles} files, ~${plan.estimatedLines} lines. Risk: ${highRiskSteps} high, ${mediumRiskSteps} medium. ${plan.withinSafetyLimits ? 'Within limits.' : 'EXCEEDS LIMITS.'}`;
}

// ============================================================
// PLAN VALIDATION
// ============================================================

/**
 * Validate that a plan is ready for execution.
 */
export function validatePlanForExecution(
  plan: MigrationPlan
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (plan.status !== 'approved') {
    issues.push(`Plan status is '${plan.status}', expected 'approved'`);
  }

  if (!plan.approvedBy) {
    issues.push('Plan has no approver');
  }

  if (!plan.withinSafetyLimits) {
    issues.push('Plan exceeds safety limits');
  }

  if (plan.steps.length === 0) {
    issues.push('Plan has no steps');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
