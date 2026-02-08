/**
 * TechScout — Delivery Orchestrator (Layer 4)
 *
 * Coordinates all delivery channels: briefs, email, Slack, exports.
 * Filters output by team role and delivery preferences.
 */

import { logger } from '../lib/logger';
import type { Recommendation, TeamMember, TeamRole } from '../types';
import {
  TechnicalBrief,
  generateTechnicalBrief,
  renderTechnicalBriefMarkdown,
  renderTechnicalSummary,
} from './technical-brief';
import {
  HumanBrief,
  generateHumanBrief,
  renderHumanBriefMarkdown,
  renderHumanSummary,
} from './human-brief';
import {
  sendEmail,
  deliverTechnicalBrief as emailTechnicalBrief,
  deliverHumanBrief as emailHumanBrief,
  sendBreakingChangeAlert,
  EmailConfig,
  EmailResult,
} from './email';
import {
  sendSlackMessage,
  deliverTechnicalBriefToSlack,
  deliverHumanBriefToSlack,
  sendBreakingChangeAlertToSlack,
  SlackConfig,
  SlackResult,
} from './slack';
import {
  exportTechnicalBrief,
  exportHumanBrief,
  ExportOptions,
  ExportResult,
  ExportFormat,
} from './export';

// ============================================================
// TYPES
// ============================================================

export interface DeliveryConfig {
  email?: Partial<EmailConfig>;
  slack?: Partial<SlackConfig>;
  dashboardUrl?: string;
}

export interface DeliveryTarget {
  type: 'email' | 'slack';
  // For email
  email?: string;
  name?: string;
  // For slack
  channel?: string;
  // Recipient role determines which brief they receive
  role: 'technical' | 'human';
}

export interface DeliveryRequest {
  projectId: string;
  projectName: string;
  recommendations: Recommendation[];
  targets: DeliveryTarget[];
  config?: DeliveryConfig;
  export?: {
    formats: ExportFormat[];
    archive?: boolean;
  };
}

export interface DeliveryReport {
  projectId: string;
  projectName: string;
  generatedAt: string;
  briefs: {
    technical: TechnicalBrief;
    human: HumanBrief;
  };
  deliveries: DeliveryOutcome[];
  exports: ExportResult[];
  summary: DeliverySummary;
}

export interface DeliveryOutcome {
  target: DeliveryTarget;
  success: boolean;
  messageId?: string;
  error?: string;
  deliveredAt: string;
}

export interface DeliverySummary {
  totalRecommendations: number;
  targetsAttempted: number;
  targetsSucceeded: number;
  targetsFailed: number;
  exportsGenerated: number;
  durationMs: number;
}

// ============================================================
// ROLE-BASED FILTERING
// ============================================================

/**
 * Determine which brief type a team role should receive.
 */
function getBriefTypeForRole(role: TeamRole): 'technical' | 'human' {
  const technicalRoles: TeamRole[] = [
    'developer_frontend',
    'developer_backend',
    'developer_fullstack',
  ];

  if (technicalRoles.includes(role)) {
    return 'technical';
  }

  return 'human';
}

/**
 * Filter recommendations by role visibility.
 */
export function filterRecommendationsForRole(
  recommendations: Recommendation[],
  role: TeamRole
): Recommendation[] {
  return recommendations.filter(rec => rec.roleVisibility.includes(role));
}

/**
 * Build delivery targets from team members.
 * Email addresses must be provided via emailMap since TeamMember doesn't store emails.
 */
export function buildTargetsFromTeam(
  team: TeamMember[],
  options?: {
    emailMap?: Map<string, string>; // userId -> email
    slackChannel?: string;
  }
): DeliveryTarget[] {
  const targets: DeliveryTarget[] = [];

  for (const member of team) {
    // Determine brief type based on preferences
    const wantsTechnical = member.receivesTechnicalBrief;
    const wantsHuman = member.receivesHumanBrief;

    // Skip if member doesn't want any briefs
    if (!wantsTechnical && !wantsHuman) {
      continue;
    }

    // Prefer technical if they want both, otherwise use what they want
    const briefType: 'technical' | 'human' = wantsTechnical ? 'technical' : 'human';

    // Email target
    if (member.notificationChannel === 'email' && options?.emailMap) {
      const email = options.emailMap.get(member.userId);
      if (email) {
        targets.push({
          type: 'email',
          email,
          name: member.name,
          role: briefType,
        });
      }
    }

    // Slack target
    if (member.notificationChannel === 'slack' && options?.slackChannel) {
      targets.push({
        type: 'slack',
        channel: options.slackChannel,
        role: briefType,
      });
    }
  }

  // Deduplicate Slack targets (one per role per channel)
  const seenSlackTargets = new Set<string>();
  return targets.filter(t => {
    if (t.type === 'slack') {
      const key = `${t.channel}:${t.role}`;
      if (seenSlackTargets.has(key)) return false;
      seenSlackTargets.add(key);
    }
    return true;
  });
}

// ============================================================
// MAIN ORCHESTRATOR
// ============================================================

/**
 * Execute a full delivery pipeline.
 */
export async function executeDelivery(
  request: DeliveryRequest
): Promise<DeliveryReport> {
  const startTime = Date.now();

  logger.info('Starting delivery pipeline', {
    projectId: request.projectId,
    recommendationCount: request.recommendations.length,
    targetCount: request.targets.length,
  });

  // Generate briefs
  const technicalBrief = generateTechnicalBrief(
    request.projectId,
    request.recommendations
  );

  const humanBrief = generateHumanBrief(
    request.projectId,
    request.projectName,
    request.recommendations
  );

  logger.info('Briefs generated', {
    technicalRecCount: technicalBrief.recommendations.length,
    humanRecCount: humanBrief.recommendations.length,
  });

  // Deliver to targets
  const deliveries: DeliveryOutcome[] = [];

  for (const target of request.targets) {
    const outcome = await deliverToTarget(
      target,
      technicalBrief,
      humanBrief,
      request.config
    );
    deliveries.push(outcome);
  }

  // Generate exports
  const exports: ExportResult[] = [];

  if (request.export?.formats) {
    for (const format of request.export.formats) {
      // Export technical brief
      const techExport = await exportTechnicalBrief(technicalBrief, {
        format,
        includeMetadata: true,
        archive: request.export.archive,
      });
      exports.push(techExport);

      // Export human brief
      const humanExport = await exportHumanBrief(humanBrief, {
        format,
        includeMetadata: true,
        archive: request.export.archive,
      });
      exports.push(humanExport);
    }
  }

  // Build report
  const durationMs = Date.now() - startTime;
  const targetsSucceeded = deliveries.filter(d => d.success).length;
  const targetsFailed = deliveries.filter(d => !d.success).length;

  const report: DeliveryReport = {
    projectId: request.projectId,
    projectName: request.projectName,
    generatedAt: new Date().toISOString(),
    briefs: {
      technical: technicalBrief,
      human: humanBrief,
    },
    deliveries,
    exports,
    summary: {
      totalRecommendations: request.recommendations.length,
      targetsAttempted: request.targets.length,
      targetsSucceeded,
      targetsFailed,
      exportsGenerated: exports.filter(e => e.success).length,
      durationMs,
    },
  };

  logger.info('Delivery pipeline complete', {
    projectId: request.projectId,
    durationMs,
    targetsSucceeded,
    targetsFailed,
    exportsGenerated: report.summary.exportsGenerated,
  });

  return report;
}

/**
 * Deliver to a single target.
 */
async function deliverToTarget(
  target: DeliveryTarget,
  technicalBrief: TechnicalBrief,
  humanBrief: HumanBrief,
  config?: DeliveryConfig
): Promise<DeliveryOutcome> {
  try {
    if (target.type === 'email') {
      if (!target.email) {
        throw new Error('Email target missing email address');
      }

      let emailResult: EmailResult;

      if (target.role === 'technical') {
        emailResult = await emailTechnicalBrief(
          technicalBrief,
          [{ email: target.email, name: target.name }],
          config?.email
        );
      } else {
        emailResult = await emailHumanBrief(
          humanBrief,
          [{ email: target.email, name: target.name }],
          config?.email
        );
      }

      return {
        target,
        success: emailResult.success,
        messageId: emailResult.messageId,
        error: emailResult.error,
        deliveredAt: emailResult.sentAt,
      };
    }

    if (target.type === 'slack') {
      let slackResult: SlackResult;

      if (target.role === 'technical') {
        slackResult = await deliverTechnicalBriefToSlack(
          technicalBrief,
          target.channel,
          config?.dashboardUrl,
          config?.slack
        );
      } else {
        slackResult = await deliverHumanBriefToSlack(
          humanBrief,
          target.channel,
          config?.dashboardUrl,
          config?.slack
        );
      }

      return {
        target,
        success: slackResult.success,
        messageId: slackResult.ts,
        error: slackResult.error,
        deliveredAt: slackResult.sentAt,
      };
    }

    throw new Error(`Unknown target type: ${target.type}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Delivery to target failed', {
      targetType: target.type,
      error: errorMsg,
    });

    return {
      target,
      success: false,
      error: errorMsg,
      deliveredAt: new Date().toISOString(),
    };
  }
}

// ============================================================
// BREAKING CHANGE ALERTS
// ============================================================

export interface BreakingChangeAlert {
  projectId: string;
  projectName: string;
  subject: string;
  currentVersion: string;
  newVersion: string;
  summary: string;
  severity: 'critical' | 'high' | 'medium';
  targets: DeliveryTarget[];
  config?: DeliveryConfig;
}

/**
 * Send a breaking change alert to all targets.
 */
export async function sendBreakingChangeAlerts(
  alert: BreakingChangeAlert
): Promise<DeliveryOutcome[]> {
  logger.info('Sending breaking change alerts', {
    projectId: alert.projectId,
    subject: alert.subject,
    severity: alert.severity,
    targetCount: alert.targets.length,
  });

  const outcomes: DeliveryOutcome[] = [];

  for (const target of alert.targets) {
    try {
      if (target.type === 'email' && target.email) {
        const result = await sendBreakingChangeAlert(
          alert.projectName,
          `${alert.subject}: ${alert.currentVersion} → ${alert.newVersion}\n\n${alert.summary}`,
          [{ email: target.email, name: target.name }],
          alert.config?.email
        );

        outcomes.push({
          target,
          success: result.success,
          messageId: result.messageId,
          error: result.error,
          deliveredAt: result.sentAt,
        });
      }

      if (target.type === 'slack') {
        const result = await sendBreakingChangeAlertToSlack(
          alert.projectName,
          alert.subject,
          alert.currentVersion,
          alert.newVersion,
          alert.summary,
          alert.severity,
          target.channel,
          alert.config?.slack
        );

        outcomes.push({
          target,
          success: result.success,
          messageId: result.ts,
          error: result.error,
          deliveredAt: result.sentAt,
        });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      outcomes.push({
        target,
        success: false,
        error: errorMsg,
        deliveredAt: new Date().toISOString(),
      });
    }
  }

  return outcomes;
}

// ============================================================
// CONVENIENCE FUNCTIONS
// ============================================================

/**
 * Quick delivery to a single email recipient.
 */
export async function quickEmailDelivery(
  projectId: string,
  projectName: string,
  recommendations: Recommendation[],
  email: string,
  role: 'technical' | 'human',
  config?: DeliveryConfig
): Promise<DeliveryOutcome> {
  const report = await executeDelivery({
    projectId,
    projectName,
    recommendations,
    targets: [{ type: 'email', email, role }],
    config,
  });

  return report.deliveries[0];
}

/**
 * Quick delivery to a Slack channel.
 */
export async function quickSlackDelivery(
  projectId: string,
  projectName: string,
  recommendations: Recommendation[],
  channel: string,
  role: 'technical' | 'human',
  config?: DeliveryConfig
): Promise<DeliveryOutcome> {
  const report = await executeDelivery({
    projectId,
    projectName,
    recommendations,
    targets: [{ type: 'slack', channel, role }],
    config,
  });

  return report.deliveries[0];
}

/**
 * Generate briefs only (no delivery).
 */
export function generateBriefs(
  projectId: string,
  projectName: string,
  recommendations: Recommendation[]
): { technical: TechnicalBrief; human: HumanBrief } {
  return {
    technical: generateTechnicalBrief(projectId, recommendations),
    human: generateHumanBrief(projectId, projectName, recommendations),
  };
}

/**
 * Get plain text summaries for notifications.
 */
export function getSummaries(
  technical: TechnicalBrief,
  human: HumanBrief
): { technical: string; human: string } {
  return {
    technical: renderTechnicalSummary(technical),
    human: renderHumanSummary(human),
  };
}

// ============================================================
// RE-EXPORTS
// ============================================================

export {
  TechnicalBrief,
  generateTechnicalBrief,
  renderTechnicalBriefMarkdown,
  renderTechnicalSummary,
} from './technical-brief';

export {
  HumanBrief,
  generateHumanBrief,
  renderHumanBriefMarkdown,
  renderHumanSummary,
} from './human-brief';

export {
  sendEmail,
  EmailConfig,
  EmailResult,
} from './email';

export {
  sendSlackMessage,
  SlackConfig,
  SlackResult,
} from './slack';

export {
  exportTechnicalBrief,
  exportHumanBrief,
  ExportOptions,
  ExportFormat,
  ExportResult,
} from './export';
