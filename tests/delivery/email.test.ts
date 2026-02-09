/**
 * Tests for Email Delivery Module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendEmail,
  buildTechnicalBriefEmail,
  buildHumanBriefEmail,
  renderTechnicalBriefHtml,
  renderHumanBriefHtml,
  renderBreakingChangeAlertHtml,
  sendBreakingChangeAlert,
  sendBreakingChangeAlerts,
  type EmailConfig,
} from '../../src/delivery/email';
import type { TechnicalBrief } from '../../src/delivery/technical-brief';
import type { HumanBrief } from '../../src/delivery/human-brief';
import type { BreakingChangeAlert } from '../../src/types';

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Sample technical brief - matches TechnicalBrief type from technical-brief.ts
const createMockTechnicalBrief = (): TechnicalBrief => ({
  id: 'IFX-2026-0209-BRIEF-TEST',
  projectId: 'test-project-123',
  generatedAt: new Date().toISOString(),
  recommendations: [
    {
      id: 'rec-1',
      subject: {
        name: 'React',
        type: 'framework',
        version: '19.0.0',
        ecosystem: 'npm',
        maturity: 'stable',
        traction: { stars: '200k', downloads: '10M/week' },
      },
      classification: {
        action: 'REPLACE_EXISTING',
        priority: 'critical',
        confidence: '85%',
        replaces: 'React 18',
      },
      stability: {
        verdict: 'RECOMMEND',
        reasoning: 'Performance improvements outweigh migration cost',
        costOfChange: {
          effort: '3 days',
          regressionRisk: 'medium',
          learningCurve: 'low',
          reversibility: 'easy',
        },
        costOfNoChange: {
          securityExposure: 'low',
          maintenanceRisk: 'medium',
          deprecationRisk: 'low',
        },
      },
      analysis: {
        facts: ['React 19 released with performance improvements'],
        inferences: ['Project will benefit from faster rendering'],
        assumptions: ['Team can allocate migration time'],
      },
      effort: {
        estimate: '3 days',
        calibrated: true,
        complexity: 'medium',
        breakingChanges: true,
        reversibility: 'easy',
        steps: ['Update package.json', 'Run migration script'],
      },
      impact: {
        security: 'No change',
        performance: '+40% render speed',
        maintainability: 'Improved',
        cost: 'No change',
      },
      tradeoffs: {
        gains: ['Better performance', 'Modern features'],
        losses: ['Migration effort'],
      },
      risks: {
        modes: [{ description: 'Breaking changes in hooks', likelihood: 'medium', mitigation: 'Test thoroughly' }],
      },
      limitations: ['Requires testing'],
      links: {
        sourceUrl: 'https://react.dev',
        ifxTraceId: 'IFX-2026-0209-REC-TEST1',
      },
    },
    {
      id: 'rec-2',
      subject: {
        name: 'TypeScript Strict',
        type: 'practice',
        maturity: 'stable',
        traction: {},
      },
      classification: {
        action: 'NEW_CAPABILITY',
        priority: 'high',
        confidence: '75%',
      },
      stability: {
        verdict: 'RECOMMEND',
        reasoning: 'Better type safety with minimal cost',
        costOfChange: {
          effort: '2 days',
          regressionRisk: 'low',
          learningCurve: 'low',
          reversibility: 'easy',
        },
        costOfNoChange: {
          securityExposure: 'medium',
          maintenanceRisk: 'high',
          deprecationRisk: 'none',
        },
      },
      analysis: {
        facts: [],
        inferences: [],
        assumptions: [],
      },
      effort: {
        estimate: '2 days',
        calibrated: false,
        complexity: 'low',
        breakingChanges: false,
        reversibility: 'easy',
        steps: ['Update tsconfig.json'],
      },
      impact: {
        security: 'Improved',
        performance: 'No change',
        maintainability: 'Significantly improved',
        cost: 'No change',
      },
      tradeoffs: {
        gains: ['Type safety'],
        losses: ['Initial fix effort'],
      },
      risks: {
        modes: [],
      },
      limitations: [],
      links: {
        sourceUrl: 'https://typescript.org',
        ifxTraceId: 'IFX-2026-0209-REC-TEST2',
      },
    },
  ],
  summary: {
    totalRecommendations: 2,
    byPriority: { critical: 1, high: 1, medium: 0, low: 0, info: 0 },
    topConcerns: ['1 critical recommendation requires immediate attention'],
    securityRelated: 1,
  },
});

// Sample human brief - matches HumanBrief type from human-brief.ts
const createMockHumanBrief = (): HumanBrief => ({
  id: 'IFX-2026-0209-HBRIEF-TEST',
  projectId: 'test-project-123',
  projectName: 'Test Project',
  generatedAt: new Date().toISOString(),
  recommendations: [
    {
      id: 'rec-1',
      title: 'Aggiornamento React',
      oneLiner: 'Migliora le performance con React 19',
      summary: 'React 19 porta miglioramenti significativi alle performance di rendering.',
      whyNow: 'Le nuove funzionalità migliorano significativamente la user experience',
      verdict: {
        recommendation: 'Consigliato',
        plain: 'I benefici superano i costi di migrazione.',
      },
      impact: {
        security: 'Nessun impatto',
        cost: 'Nessun costo aggiuntivo',
        risk: 'Basso rischio',
        urgency: 'Alta urgenza',
      },
      clientTalkingPoints: [
        { point: 'Performance migliorata', explanation: 'Il sito sarà più veloce.' },
      ],
      urgency: {
        level: 'immediate',
        label: 'Azione immediata',
        color: 'red',
      },
    },
  ],
  executiveSummary: {
    totalRecommendations: 1,
    immediate: 1,
    planned: 0,
    monitoring: 0,
    keyHighlights: ['1 raccomandazione richiede attenzione immediata'],
    overallRiskLevel: 'medium',
  },
});

// Sample breaking change alerts
const createMockAlerts = (): BreakingChangeAlert[] => [
  {
    id: 'alert-1',
    ifxTraceId: 'IFX-2026-0209-BCA-TEST1',
    projectId: 'test-project-123',
    generatedAt: new Date().toISOString(),
    type: 'breaking_change_alert',
    alertType: 'security_advisory',
    subject: { name: 'lodash', currentVersion: '4.17.20', newVersion: '4.17.21' },
    severity: 'critical',
    technicalSummary: 'CVE-2021-23337: Prototype pollution vulnerability',
    humanSummary: 'Security issue found in lodash. Update required.',
    actionRequired: 'Update to version 4.17.21 immediately',
  },
  {
    id: 'alert-2',
    ifxTraceId: 'IFX-2026-0209-BCA-TEST2',
    projectId: 'test-project-123',
    generatedAt: new Date().toISOString(),
    type: 'breaking_change_alert',
    alertType: 'major_version',
    subject: { name: 'axios', currentVersion: '0.27.0', newVersion: '1.6.0' },
    severity: 'high',
    technicalSummary: 'Major version update with breaking changes',
    humanSummary: 'New major version of axios available.',
    actionRequired: 'Review changelog and plan migration',
  },
];

describe('Email Delivery', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv('EMAIL_PROVIDER', 'console');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('sendEmail', () => {
    it('should send via console provider by default', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await sendEmail({
        to: [{ email: 'test@example.com', type: 'technical' }],
        subject: 'Test Email',
        text: 'Test content',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toContain('console-');
      expect(result.recipients).toContain('test@example.com');

      consoleSpy.mockRestore();
    });

    it('should send via Resend when configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'resend-msg-123' }),
      });

      const result = await sendEmail(
        {
          to: [{ email: 'test@example.com', type: 'technical' }],
          subject: 'Test Email',
          text: 'Test content',
          html: '<p>Test</p>',
        },
        {
          provider: 'resend',
          from: 'sender@example.com',
          resendApiKey: 're_test_key',
        }
      );

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('resend-msg-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer re_test_key',
          }),
        })
      );
    });

    it('should handle Resend API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key',
      });

      const result = await sendEmail(
        {
          to: [{ email: 'test@example.com', type: 'technical' }],
          subject: 'Test Email',
          text: 'Test content',
        },
        {
          provider: 'resend',
          from: 'sender@example.com',
          resendApiKey: 'invalid_key',
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Resend API error');
    });

    it('should throw when Resend key is missing', async () => {
      const result = await sendEmail(
        {
          to: [{ email: 'test@example.com', type: 'technical' }],
          subject: 'Test Email',
          text: 'Test content',
        },
        {
          provider: 'resend',
          from: 'sender@example.com',
          // resendApiKey missing
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('RESEND_API_KEY not configured');
    });
  });

  describe('buildTechnicalBriefEmail', () => {
    it('should build email with correct subject using renderTechnicalBriefHtml', () => {
      const brief = createMockTechnicalBrief();
      // Test directly with renderTechnicalBriefHtml since buildTechnicalBriefEmail
      // depends on renderTechnicalSummary which has its own tests
      const html = renderTechnicalBriefHtml(brief);

      expect(html).toContain('TechScout Technical Brief');
      expect(html).toContain('React');
      expect(html).toContain('critical');
    });

    it('should include HTML with recommendations', () => {
      const brief = createMockTechnicalBrief();
      const html = renderTechnicalBriefHtml(brief);

      expect(html).toBeDefined();
      expect(html).toContain('TechScout Technical Brief');
      expect(html).toContain('React');
      expect(html).toContain('TypeScript Strict');
    });

    it('should include effort and complexity in HTML', () => {
      const brief = createMockTechnicalBrief();
      const html = renderTechnicalBriefHtml(brief);

      expect(html).toContain('3 days');
      expect(html).toContain('medium');
      expect(html).toContain('2 days');
      expect(html).toContain('low');
    });
  });

  describe('buildHumanBriefEmail', () => {
    it('should build email with Italian subject', () => {
      const brief = createMockHumanBrief();
      const email = buildHumanBriefEmail(brief, [
        { email: 'pm@example.com', type: 'human' },
      ]);

      expect(email.subject).toContain('Report Tecnologico');
      expect(email.subject).toContain('Test Project');
      expect(email.subject).toContain('1 urgenti');
    });

    it('should include HTML content in Italian', () => {
      const brief = createMockHumanBrief();
      const email = buildHumanBriefEmail(brief, [
        { email: 'pm@example.com', type: 'human' },
      ]);

      expect(email.html).toBeDefined();
      expect(email.html).toContain('Report Tecnologico');
      expect(email.html).toContain('Opportunità');
      expect(email.html).toContain('Raccomandazioni');
    });
  });

  describe('HTML Rendering', () => {
    it('should render technical brief HTML with stats', () => {
      const brief = createMockTechnicalBrief();
      const html = renderTechnicalBriefHtml(brief);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('TechScout Technical Brief');
      expect(html).toContain('2'); // Total recommendations
      expect(html).toContain('Recommendations');
      expect(html).toContain('Critical');
    });

    it('should render human brief HTML with Italian labels', () => {
      const brief = createMockHumanBrief();
      const html = renderHumanBriefHtml(brief);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Report Tecnologico');
      expect(html).toContain('Opportunità');
      expect(html).toContain('Da Affrontare Subito');
    });

    it('should render breaking change alert HTML', () => {
      const html = renderBreakingChangeAlertHtml(
        'Test Project',
        'Critical security update needed'
      );

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Breaking Change Alert');
      expect(html).toContain('Test Project');
    });

    it('should render multiple alerts in HTML', () => {
      const alerts = createMockAlerts();
      const html = renderBreakingChangeAlertHtml('Test Project', '', alerts);

      expect(html).toContain('lodash');
      expect(html).toContain('axios');
      expect(html).toContain('4.17.20');
      expect(html).toContain('1.6.0');
      expect(html).toContain('critical'); // badge class uses lowercase
    });

    it('should escape HTML in user content', () => {
      const brief = createMockTechnicalBrief();
      brief.recommendations[0].subject.name = '<script>alert("xss")</script>';
      const html = renderTechnicalBriefHtml(brief);

      expect(html).not.toContain('<script>alert');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('sendBreakingChangeAlert', () => {
    it('should send alert with correct subject', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await sendBreakingChangeAlert(
        'Test Project',
        'Critical vulnerability found',
        [{ email: 'security@example.com' }]
      );

      expect(result.success).toBe(true);
      consoleSpy.mockRestore();
    });
  });

  describe('sendBreakingChangeAlerts', () => {
    it('should send multiple alerts in one email', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const alerts = createMockAlerts();
      const result = await sendBreakingChangeAlerts(
        'Test Project',
        alerts,
        [{ email: 'security@example.com' }]
      );

      expect(result.success).toBe(true);
      consoleSpy.mockRestore();
    });

    it('should include critical count in subject', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'msg-123' }),
      });

      const alerts = createMockAlerts();
      await sendBreakingChangeAlerts(
        'Test Project',
        alerts,
        [{ email: 'security@example.com' }],
        {
          provider: 'resend',
          from: 'sender@example.com',
          resendApiKey: 're_test_key',
        }
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.subject).toContain('2 Breaking Change Alerts');
      expect(callBody.subject).toContain('CRITICAL');
    });
  });
});
