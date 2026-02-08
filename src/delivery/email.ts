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

  return {
    to: recipients,
    subject: `[TechScout] Technical Brief - ${brief.summary.totalRecommendations} Recommendations`,
    text: summary + '\n\n---\n\nFull report attached.',
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
  const summary = renderHumanSummary(brief);
  const fullText = renderHumanBriefEmail(brief);

  return {
    to: recipients,
    subject: `[TechScout] Report Tecnologico: ${brief.projectName}`,
    text: fullText,
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
  };

  return sendEmail(message, config);
}
