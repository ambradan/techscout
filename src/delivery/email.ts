/**
 * TechScout — Email Delivery (Layer 4)
 *
 * Sends briefs via email using configurable providers.
 * Supports Resend, SendGrid, or custom SMTP.
 */

import { logger } from '../lib/logger';
import type { TechnicalBrief } from './technical-brief';
import type { HumanBrief } from './human-brief';
import { renderTechnicalBriefMarkdown, renderTechnicalSummary } from './technical-brief';
import { renderHumanBriefEmail, renderHumanSummary } from './human-brief';
import type { BreakingChangeAlert } from '../types';

// ============================================================
// TYPES
// ============================================================

export type EmailProvider = 'resend' | 'sendgrid' | 'smtp' | 'console';

export interface EmailConfig {
  provider: EmailProvider;
  from: string;
  replyTo?: string;
  // Provider-specific config
  resendApiKey?: string;
  sendgridApiKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
}

export interface EmailRecipient {
  email: string;
  name?: string;
  type: 'technical' | 'human';
}

export interface EmailMessage {
  to: EmailRecipient[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  recipients: string[];
  sentAt: string;
}

// ============================================================
// DEFAULT CONFIG
// ============================================================

function getDefaultConfig(): EmailConfig {
  return {
    provider: (process.env.EMAIL_PROVIDER as EmailProvider) || 'console',
    from: process.env.EMAIL_FROM || 'techscout@example.com',
    replyTo: process.env.EMAIL_REPLY_TO,
    resendApiKey: process.env.RESEND_API_KEY,
    sendgridApiKey: process.env.SENDGRID_API_KEY,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : undefined,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
  };
}

// ============================================================
// EMAIL PROVIDERS
// ============================================================

async function sendViaResend(
  config: EmailConfig,
  message: EmailMessage
): Promise<EmailResult> {
  if (!config.resendApiKey) {
    throw new Error('RESEND_API_KEY not configured');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.from,
      to: message.to.map(r => r.email),
      subject: message.subject,
      text: message.text,
      html: message.html,
      reply_to: config.replyTo,
      attachments: message.attachments?.map(a => ({
        filename: a.filename,
        content: Buffer.from(a.content).toString('base64'),
      })),
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Resend API error: ${res.status} - ${error}`);
  }

  const data = await res.json() as { id: string };

  return {
    success: true,
    messageId: data.id,
    recipients: message.to.map(r => r.email),
    sentAt: new Date().toISOString(),
  };
}

async function sendViaSendGrid(
  config: EmailConfig,
  message: EmailMessage
): Promise<EmailResult> {
  if (!config.sendgridApiKey) {
    throw new Error('SENDGRID_API_KEY not configured');
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.sendgridApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{
        to: message.to.map(r => ({ email: r.email, name: r.name })),
      }],
      from: { email: config.from },
      reply_to: config.replyTo ? { email: config.replyTo } : undefined,
      subject: message.subject,
      content: [
        { type: 'text/plain', value: message.text },
        ...(message.html ? [{ type: 'text/html', value: message.html }] : []),
      ],
      attachments: message.attachments?.map(a => ({
        filename: a.filename,
        content: Buffer.from(a.content).toString('base64'),
        type: a.contentType,
      })),
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`SendGrid API error: ${res.status} - ${error}`);
  }

  const messageId = res.headers.get('x-message-id') || undefined;

  return {
    success: true,
    messageId,
    recipients: message.to.map(r => r.email),
    sentAt: new Date().toISOString(),
  };
}

async function sendViaConsole(
  _config: EmailConfig,
  message: EmailMessage
): Promise<EmailResult> {
  // Console provider for development/testing
  console.log('='.repeat(60));
  console.log('EMAIL (Console Provider)');
  console.log('='.repeat(60));
  console.log(`To: ${message.to.map(r => r.email).join(', ')}`);
  console.log(`Subject: ${message.subject}`);
  console.log('-'.repeat(40));
  console.log(message.text);
  console.log('='.repeat(60));

  return {
    success: true,
    messageId: `console-${Date.now()}`,
    recipients: message.to.map(r => r.email),
    sentAt: new Date().toISOString(),
  };
}

// ============================================================
// SEND FUNCTION
// ============================================================

/**
 * Send an email message.
 */
export async function sendEmail(
  message: EmailMessage,
  config?: Partial<EmailConfig>
): Promise<EmailResult> {
  const mergedConfig = { ...getDefaultConfig(), ...config };

  logger.info('Sending email', {
    provider: mergedConfig.provider,
    recipients: message.to.length,
    subject: message.subject,
  });

  try {
    let result: EmailResult;

    switch (mergedConfig.provider) {
      case 'resend':
        result = await sendViaResend(mergedConfig, message);
        break;
      case 'sendgrid':
        result = await sendViaSendGrid(mergedConfig, message);
        break;
      case 'console':
        result = await sendViaConsole(mergedConfig, message);
        break;
      default:
        throw new Error(`Unknown email provider: ${mergedConfig.provider}`);
    }

    logger.info('Email sent successfully', {
      messageId: result.messageId,
      recipients: result.recipients.length,
    });

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('Email send failed', { error: errorMsg });

    return {
      success: false,
      error: errorMsg,
      recipients: message.to.map(r => r.email),
      sentAt: new Date().toISOString(),
    };
  }
}

// ============================================================
// BRIEF EMAIL BUILDERS
// ============================================================

/**
 * Build email for technical brief.
 */
export function buildTechnicalBriefEmail(
  brief: TechnicalBrief,
  recipients: EmailRecipient[]
): EmailMessage {
  const summary = renderTechnicalSummary(brief);
  const markdown = renderTechnicalBriefMarkdown(brief);
  const criticalCount = brief.recommendations.filter(r => r.classification.priority === 'critical').length;

  return {
    to: recipients,
    subject: `[TechScout] Technical Brief - ${brief.summary.totalRecommendations} Recommendations${criticalCount > 0 ? ` (${criticalCount} Critical)` : ''}`,
    text: summary + '\n\n---\n\nFull report attached.',
    html: renderTechnicalBriefHtml(brief),
    attachments: [
      {
        filename: `techscout-brief-${brief.id}.md`,
        content: markdown,
        contentType: 'text/markdown',
      },
    ],
  };
}

/**
 * Build email for human-friendly brief.
 */
export function buildHumanBriefEmail(
  brief: HumanBrief,
  recipients: EmailRecipient[]
): EmailMessage {
  const fullText = renderHumanBriefEmail(brief);
  const immediateCount = brief.recommendations.filter(r => r.urgency.level === 'immediate').length;

  return {
    to: recipients,
    subject: `[TechScout] Report Tecnologico: ${brief.projectName}${immediateCount > 0 ? ` (${immediateCount} urgenti)` : ''}`,
    text: fullText,
    html: renderHumanBriefHtml(brief),
  };
}

// ============================================================
// DELIVERY FUNCTIONS
// ============================================================

/**
 * Deliver technical brief to developer recipients.
 */
export async function deliverTechnicalBrief(
  brief: TechnicalBrief,
  recipients: Array<{ email: string; name?: string }>,
  config?: Partial<EmailConfig>
): Promise<EmailResult> {
  const emailRecipients: EmailRecipient[] = recipients.map(r => ({
    ...r,
    type: 'technical' as const,
  }));

  const message = buildTechnicalBriefEmail(brief, emailRecipients);
  return sendEmail(message, config);
}

/**
 * Deliver human-friendly brief to PM/stakeholder recipients.
 */
export async function deliverHumanBrief(
  brief: HumanBrief,
  recipients: Array<{ email: string; name?: string }>,
  config?: Partial<EmailConfig>
): Promise<EmailResult> {
  const emailRecipients: EmailRecipient[] = recipients.map(r => ({
    ...r,
    type: 'human' as const,
  }));

  const message = buildHumanBriefEmail(brief, emailRecipients);
  return sendEmail(message, config);
}

/**
 * Send a breaking change alert email.
 */
export async function sendBreakingChangeAlert(
  projectName: string,
  alertSummary: string,
  recipients: Array<{ email: string; name?: string }>,
  config?: Partial<EmailConfig>
): Promise<EmailResult> {
  const message: EmailMessage = {
    to: recipients.map(r => ({ ...r, type: 'technical' as const })),
    subject: `[TechScout] ⚠️ Breaking Change Alert: ${projectName}`,
    text: `BREAKING CHANGE ALERT\n\n${alertSummary}\n\nThis is an automated alert from TechScout.`,
    html: renderBreakingChangeAlertHtml(projectName, alertSummary),
  };

  return sendEmail(message, config);
}

// ============================================================
// HTML TEMPLATES
// ============================================================

const EMAIL_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px; }
  .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
  .header h1 { margin: 0; font-size: 24px; }
  .header .subtitle { opacity: 0.9; margin-top: 5px; }
  .content { background: #fff; border: 1px solid #e1e5eb; border-top: none; padding: 30px; border-radius: 0 0 8px 8px; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; }
  .badge-critical { background: #fee2e2; color: #dc2626; }
  .badge-high { background: #fef3c7; color: #d97706; }
  .badge-medium { background: #dbeafe; color: #2563eb; }
  .badge-low { background: #d1fae5; color: #059669; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; margin: 20px 0; }
  .stat-card { background: #f8fafc; border-radius: 8px; padding: 15px; text-align: center; }
  .stat-value { font-size: 28px; font-weight: 700; color: #1e293b; }
  .stat-label { font-size: 12px; color: #64748b; text-transform: uppercase; }
  .recommendation { background: #f8fafc; border-left: 4px solid #667eea; padding: 15px; margin: 15px 0; border-radius: 0 8px 8px 0; }
  .recommendation h3 { margin: 0 0 10px 0; color: #1e293b; }
  .recommendation p { margin: 0; color: #475569; }
  .alert-box { padding: 20px; border-radius: 8px; margin: 20px 0; }
  .alert-critical { background: #fef2f2; border: 1px solid #fecaca; }
  .alert-high { background: #fffbeb; border: 1px solid #fde68a; }
  .alert-medium { background: #eff6ff; border: 1px solid #bfdbfe; }
  .footer { text-align: center; padding: 20px; color: #64748b; font-size: 12px; }
  .btn { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; }
  .btn:hover { background: #5a67d8; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  th { background: #f8fafc; font-weight: 600; color: #475569; }
`;

/**
 * Render technical brief as HTML email.
 */
export function renderTechnicalBriefHtml(brief: TechnicalBrief): string {
  const criticalCount = brief.recommendations.filter(r => r.classification.priority === 'critical').length;
  const highCount = brief.recommendations.filter(r => r.classification.priority === 'high').length;

  const recommendationsHtml = brief.recommendations.slice(0, 5).map(rec => `
    <div class="recommendation">
      <h3>${escapeHtml(rec.subject.name)}</h3>
      <span class="badge badge-${rec.classification.priority}">${rec.classification.priority}</span>
      <span class="badge" style="background: #e0e7ff; color: #4338ca;">${rec.classification.action}</span>
      <p style="margin-top: 10px;">${escapeHtml(rec.stability.reasoning)}</p>
      <p style="margin-top: 10px; font-size: 14px;">
        <strong>Effort:</strong> ${rec.effort.estimate} |
        <strong>Complexity:</strong> ${rec.effort.complexity}
      </p>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TechScout Technical Brief</title>
  <style>${EMAIL_STYLES}</style>
</head>
<body>
  <div class="header">
    <h1>📊 TechScout Technical Brief</h1>
    <div class="subtitle">Project: ${brief.projectId} | ${new Date(brief.generatedAt).toLocaleDateString()}</div>
  </div>

  <div class="content">
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value">${brief.summary.totalRecommendations}</div>
        <div class="stat-label">Recommendations</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: #dc2626;">${criticalCount}</div>
        <div class="stat-label">Critical</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: #d97706;">${highCount}</div>
        <div class="stat-label">High Priority</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${brief.summary.securityRelated}</div>
        <div class="stat-label">Security</div>
      </div>
    </div>

    ${brief.summary.topConcerns.length > 0 ? `
    <div class="alert-box alert-high">
      <strong>⚠️ Top Concerns:</strong>
      <ul style="margin: 10px 0 0 0; padding-left: 20px;">
        ${brief.summary.topConcerns.map(c => `<li>${escapeHtml(c)}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    <h2>Top Recommendations</h2>
    ${recommendationsHtml}

    ${brief.recommendations.length > 5 ? `
    <p style="text-align: center; color: #64748b;">
      + ${brief.recommendations.length - 5} more recommendations in the full report
    </p>
    ` : ''}
  </div>

  <div class="footer">
    <p>Generated by TechScout | IFX Trace: ${brief.id}</p>
    <p>This is an automated technology intelligence report.</p>
  </div>
</body>
</html>
  `;
}

/**
 * Render human-friendly brief as HTML email.
 */
export function renderHumanBriefHtml(brief: HumanBrief): string {
  const immediateCount = brief.recommendations.filter(r => r.urgency.level === 'immediate').length;
  const plannedCount = brief.recommendations.filter(r => r.urgency.level === 'planned').length;

  const recommendationsHtml = brief.recommendations.slice(0, 5).map(rec => `
    <div class="recommendation">
      <h3>${escapeHtml(rec.title)}</h3>
      <span class="badge badge-${rec.urgency.level === 'immediate' ? 'critical' : rec.urgency.level === 'planned' ? 'medium' : 'low'}">${rec.urgency.label}</span>
      <p style="margin-top: 10px;">${escapeHtml(rec.oneLiner)}</p>
      <p style="margin-top: 10px; color: #64748b;">${escapeHtml(rec.whyNow)}</p>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Report Tecnologico - ${brief.projectName}</title>
  <style>${EMAIL_STYLES}</style>
</head>
<body>
  <div class="header">
    <h1>📋 Report Tecnologico</h1>
    <div class="subtitle">${escapeHtml(brief.projectName)} | ${new Date(brief.generatedAt).toLocaleDateString('it-IT')}</div>
  </div>

  <div class="content">
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value">${brief.executiveSummary.totalRecommendations}</div>
        <div class="stat-label">Opportunità</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: #dc2626;">${brief.executiveSummary.immediate}</div>
        <div class="stat-label">Da Affrontare Subito</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: #2563eb;">${brief.executiveSummary.planned}</div>
        <div class="stat-label">Da Pianificare</div>
      </div>
    </div>

    ${brief.executiveSummary.keyHighlights.length > 0 ? `
    <div class="alert-box alert-medium">
      <strong>📌 Punti Chiave:</strong>
      <ul style="margin: 10px 0 0 0; padding-left: 20px;">
        ${brief.executiveSummary.keyHighlights.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    <h2>Raccomandazioni</h2>
    ${recommendationsHtml}

    ${brief.recommendations.length > 5 ? `
    <p style="text-align: center; color: #64748b;">
      + ${brief.recommendations.length - 5} altre raccomandazioni nel report completo
    </p>
    ` : ''}
  </div>

  <div class="footer">
    <p>Generato da TechScout</p>
    <p>Questo è un report automatico di technology intelligence.</p>
  </div>
</body>
</html>
  `;
}

/**
 * Render breaking change alert as HTML email.
 */
export function renderBreakingChangeAlertHtml(
  projectName: string,
  alertSummary: string,
  alerts?: BreakingChangeAlert[]
): string {
  const alertsHtml = alerts ? alerts.map(alert => `
    <div class="alert-box alert-${alert.severity}">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>${escapeHtml(alert.subject.name)}</strong>
        <span class="badge badge-${alert.severity}">${alert.severity}</span>
      </div>
      <p style="margin: 10px 0;">
        <code>${alert.subject.currentVersion}</code> → <code>${alert.subject.newVersion || 'N/A'}</code>
      </p>
      <p style="color: #475569;">${escapeHtml(alert.humanSummary)}</p>
      <p style="margin-top: 10px; font-weight: 600;">Action: ${escapeHtml(alert.actionRequired)}</p>
    </div>
  `).join('') : `<p>${escapeHtml(alertSummary)}</p>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Breaking Change Alert - ${projectName}</title>
  <style>${EMAIL_STYLES}</style>
</head>
<body>
  <div class="header" style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);">
    <h1>⚠️ Breaking Change Alert</h1>
    <div class="subtitle">${escapeHtml(projectName)}</div>
  </div>

  <div class="content">
    <p style="font-size: 16px; color: #dc2626; font-weight: 600;">
      Immediate attention required for your project dependencies.
    </p>

    ${alertsHtml}

    <div style="text-align: center; margin-top: 30px;">
      <p style="color: #64748b;">Review these alerts and take appropriate action to maintain system stability.</p>
    </div>
  </div>

  <div class="footer">
    <p>Generated by TechScout Breaking Change Detection</p>
    <p>This is an automated security and dependency alert.</p>
  </div>
</body>
</html>
  `;
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================
// ENHANCED DELIVERY WITH HTML
// ============================================================

/**
 * Send breaking change alerts with full details.
 */
export async function sendBreakingChangeAlerts(
  projectName: string,
  alerts: BreakingChangeAlert[],
  recipients: Array<{ email: string; name?: string }>,
  config?: Partial<EmailConfig>
): Promise<EmailResult> {
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const highCount = alerts.filter(a => a.severity === 'high').length;

  const textSummary = alerts.map(a =>
    `[${a.severity.toUpperCase()}] ${a.subject.name}: ${a.subject.currentVersion} → ${a.subject.newVersion || 'N/A'}\n${a.humanSummary}\nAction: ${a.actionRequired}`
  ).join('\n\n---\n\n');

  const message: EmailMessage = {
    to: recipients.map(r => ({ ...r, type: 'technical' as const })),
    subject: `[TechScout] ⚠️ ${alerts.length} Breaking Change Alert${alerts.length > 1 ? 's' : ''}: ${projectName}${criticalCount > 0 ? ' (CRITICAL)' : ''}`,
    text: `BREAKING CHANGE ALERTS FOR ${projectName}\n\n${criticalCount} critical, ${highCount} high priority\n\n${textSummary}\n\nThis is an automated alert from TechScout.`,
    html: renderBreakingChangeAlertHtml(projectName, '', alerts),
  };

  return sendEmail(message, config);
}
