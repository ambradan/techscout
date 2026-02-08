/**
 * TechScout — Slack Delivery (Layer 4)
 *
 * Sends briefs to Slack channels using webhooks or API.
 * Supports Block Kit for rich formatting.
 */

import { logger } from '../lib/logger';
import type { TechnicalBrief } from './technical-brief';
import type { HumanBrief, HumanRecommendationBrief } from './human-brief';

// ============================================================
// TYPES
// ============================================================

export interface SlackConfig {
  webhookUrl?: string;
  botToken?: string;
  defaultChannel?: string;
}

export interface SlackMessage {
  channel?: string;
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
  unfurl_links?: boolean;
  unfurl_media?: boolean;
}

export interface SlackBlock {
  type: string;
  text?: SlackText;
  elements?: Array<SlackElement | SlackText>;
  accessory?: SlackElement;
  block_id?: string;
  fields?: SlackText[];
}

export interface SlackText {
  type: 'plain_text' | 'mrkdwn';
  text: string;
  emoji?: boolean;
}

export interface SlackElement {
  type: string;
  text?: SlackText;
  url?: string;
  action_id?: string;
  style?: string;
}

export interface SlackAttachment {
  color?: string;
  fallback?: string;
  blocks?: SlackBlock[];
  text?: string;
}

export interface SlackResult {
  success: boolean;
  channel?: string;
  ts?: string;
  error?: string;
  sentAt: string;
}

// ============================================================
// DEFAULT CONFIG
// ============================================================

function getDefaultConfig(): SlackConfig {
  return {
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
    botToken: process.env.SLACK_BOT_TOKEN,
    defaultChannel: process.env.SLACK_DEFAULT_CHANNEL,
  };
}

// ============================================================
// BLOCK BUILDERS
// ============================================================

function header(text: string): SlackBlock {
  return {
    type: 'header',
    text: { type: 'plain_text', text, emoji: true },
  };
}

function section(text: string): SlackBlock {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text },
  };
}

function divider(): SlackBlock {
  return { type: 'divider' };
}

function context(texts: string[]): SlackBlock {
  return {
    type: 'context',
    elements: texts.map(t => ({ type: 'mrkdwn', text: t })),
  };
}

function fields(items: Array<{ label: string; value: string }>): SlackBlock {
  return {
    type: 'section',
    fields: items.map(i => ({
      type: 'mrkdwn',
      text: `*${i.label}*\n${i.value}`,
    })),
  };
}

function actions(buttons: Array<{ text: string; url: string; style?: string }>): SlackBlock {
  return {
    type: 'actions',
    elements: buttons.map((b, i) => ({
      type: 'button',
      text: { type: 'plain_text', text: b.text, emoji: true },
      url: b.url,
      action_id: `button-${i}`,
      style: b.style,
    })),
  };
}

// ============================================================
// SEND FUNCTIONS
// ============================================================

/**
 * Send message via webhook.
 */
async function sendViaWebhook(
  config: SlackConfig,
  message: SlackMessage
): Promise<SlackResult> {
  if (!config.webhookUrl) {
    throw new Error('SLACK_WEBHOOK_URL not configured');
  }

  const res = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Slack webhook error: ${res.status} - ${error}`);
  }

  return {
    success: true,
    sentAt: new Date().toISOString(),
  };
}

/**
 * Send message via Bot API.
 */
async function sendViaBotApi(
  config: SlackConfig,
  message: SlackMessage
): Promise<SlackResult> {
  if (!config.botToken) {
    throw new Error('SLACK_BOT_TOKEN not configured');
  }

  const channel = message.channel || config.defaultChannel;
  if (!channel) {
    throw new Error('No channel specified');
  }

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      text: message.text,
      blocks: message.blocks,
      attachments: message.attachments,
      unfurl_links: message.unfurl_links ?? false,
      unfurl_media: message.unfurl_media ?? false,
    }),
  });

  const data = await res.json() as {
    ok: boolean;
    channel?: string;
    ts?: string;
    error?: string;
  };

  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  return {
    success: true,
    channel: data.channel,
    ts: data.ts,
    sentAt: new Date().toISOString(),
  };
}

/**
 * Send a Slack message.
 */
export async function sendSlackMessage(
  message: SlackMessage,
  config?: Partial<SlackConfig>
): Promise<SlackResult> {
  const mergedConfig = { ...getDefaultConfig(), ...config };

  logger.info('Sending Slack message', {
    channel: message.channel || mergedConfig.defaultChannel,
    hasBlocks: !!message.blocks?.length,
  });

  try {
    let result: SlackResult;

    if (mergedConfig.botToken) {
      result = await sendViaBotApi(mergedConfig, message);
    } else if (mergedConfig.webhookUrl) {
      result = await sendViaWebhook(mergedConfig, message);
    } else {
      // Console fallback
      console.log('='.repeat(60));
      console.log('SLACK MESSAGE (Console Fallback)');
      console.log('='.repeat(60));
      console.log(JSON.stringify(message, null, 2));
      console.log('='.repeat(60));

      result = {
        success: true,
        sentAt: new Date().toISOString(),
      };
    }

    logger.info('Slack message sent', {
      channel: result.channel,
      ts: result.ts,
    });

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Slack send failed', { error: errorMsg });

    return {
      success: false,
      error: errorMsg,
      sentAt: new Date().toISOString(),
    };
  }
}

// ============================================================
// BRIEF MESSAGE BUILDERS
// ============================================================

/**
 * Build Slack message for technical brief.
 */
export function buildTechnicalBriefSlackMessage(
  brief: TechnicalBrief,
  dashboardUrl?: string
): SlackMessage {
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push(header('📊 TechScout Technical Brief'));
  blocks.push(section(`*${brief.summary.totalRecommendations}* recommendation(s) for project \`${brief.projectId}\``));
  blocks.push(divider());

  // Summary
  const prioritySummary = Object.entries(brief.summary.byPriority)
    .map(([p, c]) => `${p}: ${c}`)
    .join(' | ');
  blocks.push(context([prioritySummary]));

  // Top concerns
  if (brief.summary.topConcerns.length > 0) {
    blocks.push(section('*⚠️ Top Concerns:*\n' + brief.summary.topConcerns.map(c => `• ${c}`).join('\n')));
  }

  blocks.push(divider());

  // Top 3 recommendations
  for (const rec of brief.recommendations.slice(0, 3)) {
    const icon = rec.classification.priority === 'CRITICAL' ? ':red_circle:'
      : rec.classification.priority === 'HIGH' ? ':large_orange_circle:'
      : rec.classification.priority === 'MEDIUM' ? ':large_yellow_circle:'
      : ':large_blue_circle:';

    blocks.push(section(
      `${icon} *${rec.subject.name}*\n` +
      `${rec.classification.action} | ${rec.effort.estimate} | ${rec.stability.verdict}`
    ));
  }

  if (brief.recommendations.length > 3) {
    blocks.push(context([`... and ${brief.recommendations.length - 3} more`]));
  }

  // Actions
  if (dashboardUrl) {
    blocks.push(actions([
      { text: 'View Full Report', url: dashboardUrl, style: 'primary' },
    ]));
  }

  blocks.push(context([`Trace: ${brief.id} | Generated: ${new Date(brief.generatedAt).toLocaleString()}`]));

  return {
    text: `TechScout: ${brief.summary.totalRecommendations} technical recommendation(s)`,
    blocks,
    unfurl_links: false,
  };
}

/**
 * Build Slack message for human-friendly brief.
 */
export function buildHumanBriefSlackMessage(
  brief: HumanBrief,
  dashboardUrl?: string
): SlackMessage {
  const blocks: SlackBlock[] = [];

  // Header
  blocks.push(header(`📋 Report Tecnologico: ${brief.projectName}`));
  blocks.push(section(
    `*${brief.executiveSummary.totalRecommendations}* opportunità identificate\n` +
    `Livello di rischio: *${brief.executiveSummary.overallRiskLevel}*`
  ));
  blocks.push(divider());

  // Summary fields
  blocks.push(fields([
    { label: 'Urgenti', value: brief.executiveSummary.immediate.toString() },
    { label: 'Da pianificare', value: brief.executiveSummary.planned.toString() },
    { label: 'Da monitorare', value: brief.executiveSummary.monitoring.toString() },
  ]));

  // Key highlights
  if (brief.executiveSummary.keyHighlights.length > 0) {
    blocks.push(section(
      '*Punti chiave:*\n' +
      brief.executiveSummary.keyHighlights.map(h => `• ${h}`).join('\n')
    ));
  }

  blocks.push(divider());

  // Top 3 recommendations
  for (const rec of brief.recommendations.slice(0, 3)) {
    const icon = rec.urgency.level === 'immediate' ? ':red_circle:'
      : rec.urgency.level === 'soon' ? ':large_orange_circle:'
      : rec.urgency.level === 'planned' ? ':large_yellow_circle:'
      : ':large_blue_circle:';

    blocks.push(section(
      `${icon} *${rec.title}*\n` +
      `_${rec.oneLiner}_`
    ));
  }

  if (brief.recommendations.length > 3) {
    blocks.push(context([`... e altre ${brief.recommendations.length - 3}`]));
  }

  // Actions
  if (dashboardUrl) {
    blocks.push(actions([
      { text: 'Visualizza Report Completo', url: dashboardUrl, style: 'primary' },
    ]));
  }

  blocks.push(context([`Generato: ${new Date(brief.generatedAt).toLocaleDateString('it-IT')}`]));

  return {
    text: `TechScout Report: ${brief.projectName}`,
    blocks,
    unfurl_links: false,
  };
}

/**
 * Build breaking change alert message.
 */
export function buildBreakingChangeAlertSlackMessage(
  projectName: string,
  subject: string,
  currentVersion: string,
  newVersion: string,
  summary: string,
  severity: string
): SlackMessage {
  const severityIcon = severity === 'critical' ? ':rotating_light:'
    : severity === 'high' ? ':warning:'
    : ':information_source:';

  const blocks: SlackBlock[] = [
    header(`${severityIcon} Breaking Change Alert`),
    section(`*${subject}*: \`${currentVersion}\` → \`${newVersion}\``),
    section(summary),
    context([`Project: ${projectName} | Severity: ${severity.toUpperCase()}`]),
  ];

  return {
    text: `Breaking Change Alert: ${subject} ${newVersion}`,
    blocks,
  };
}

// ============================================================
// DELIVERY FUNCTIONS
// ============================================================

/**
 * Deliver technical brief to Slack.
 */
export async function deliverTechnicalBriefToSlack(
  brief: TechnicalBrief,
  channel?: string,
  dashboardUrl?: string,
  config?: Partial<SlackConfig>
): Promise<SlackResult> {
  const message = buildTechnicalBriefSlackMessage(brief, dashboardUrl);
  message.channel = channel;
  return sendSlackMessage(message, config);
}

/**
 * Deliver human-friendly brief to Slack.
 */
export async function deliverHumanBriefToSlack(
  brief: HumanBrief,
  channel?: string,
  dashboardUrl?: string,
  config?: Partial<SlackConfig>
): Promise<SlackResult> {
  const message = buildHumanBriefSlackMessage(brief, dashboardUrl);
  message.channel = channel;
  return sendSlackMessage(message, config);
}

/**
 * Send breaking change alert to Slack.
 */
export async function sendBreakingChangeAlertToSlack(
  projectName: string,
  subject: string,
  currentVersion: string,
  newVersion: string,
  summary: string,
  severity: string,
  channel?: string,
  config?: Partial<SlackConfig>
): Promise<SlackResult> {
  const message = buildBreakingChangeAlertSlackMessage(
    projectName,
    subject,
    currentVersion,
    newVersion,
    summary,
    severity
  );
  message.channel = channel;
  return sendSlackMessage(message, config);
}
