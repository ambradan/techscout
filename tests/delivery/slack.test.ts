/**
 * Tests for Slack Delivery Module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sendSlackMessage,
  buildTechnicalBriefSlackMessage,
  buildHumanBriefSlackMessage,
  buildBreakingChangeAlertSlackMessage,
  buildBreakingChangeAlertsSlackMessage,
  deliverTechnicalBriefToSlack,
  deliverHumanBriefToSlack,
  sendBreakingChangeAlertToSlack,
  sendBreakingChangeAlertsToSlack,
  type SlackConfig,
} from '../../src/delivery/slack';
import type { TechnicalBrief } from '../../src/delivery/technical-brief';
import type { HumanBrief } from '../../src/delivery/human-brief';
import type { BreakingChangeAlert } from '../../src/types';

// Mock fetch for Slack API calls
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
  ],
  summary: {
    totalRecommendations: 1,
    byPriority: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
    topConcerns: ['1 critical recommendation requires immediate attention'],
    securityRelated: 0,
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

describe('Slack Delivery', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv('SLACK_WEBHOOK_URL', '');
    vi.stubEnv('SLACK_BOT_TOKEN', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('sendSlackMessage', () => {
    it('should use console fallback when no config provided', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await sendSlackMessage({
        text: 'Test message',
      });

      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should send via webhook when configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'ok',
      });

      const result = await sendSlackMessage(
        {
          text: 'Test message',
          blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Hello' } }],
        },
        {
          webhookUrl: 'https://hooks.slack.com/services/test',
        }
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should send via Bot API when token configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, channel: 'C123', ts: '1234567890.123456' }),
      });

      const result = await sendSlackMessage(
        {
          text: 'Test message',
          channel: '#general',
        },
        {
          botToken: 'xoxb-test-token',
        }
      );

      expect(result.success).toBe(true);
      expect(result.channel).toBe('C123');
      expect(result.ts).toBe('1234567890.123456');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer xoxb-test-token',
          }),
        })
      );
    });

    it('should handle webhook errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const result = await sendSlackMessage(
        { text: 'Test' },
        { webhookUrl: 'https://hooks.slack.com/services/test' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Slack webhook error');
    });

    it('should handle Bot API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: false, error: 'channel_not_found' }),
      });

      const result = await sendSlackMessage(
        { text: 'Test', channel: '#nonexistent' },
        { botToken: 'xoxb-test-token' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('channel_not_found');
    });

    it('should prefer Bot API over webhook when both configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, channel: 'C123', ts: '123.456' }),
      });

      await sendSlackMessage(
        { text: 'Test', channel: '#general' },
        {
          botToken: 'xoxb-test-token',
          webhookUrl: 'https://hooks.slack.com/services/test',
        }
      );

      // Should use Bot API endpoint, not webhook
      expect(mockFetch).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.any(Object)
      );
    });
  });

  describe('buildTechnicalBriefSlackMessage', () => {
    it('should build message with correct structure', () => {
      const brief = createMockTechnicalBrief();
      const message = buildTechnicalBriefSlackMessage(brief);

      expect(message.text).toContain('1 technical recommendation');
      expect(message.blocks).toBeDefined();
      expect(message.blocks!.length).toBeGreaterThan(0);
    });

    it('should include header and recommendation count', () => {
      const brief = createMockTechnicalBrief();
      const message = buildTechnicalBriefSlackMessage(brief);

      const headerBlock = message.blocks?.find(b => b.type === 'header');
      expect(headerBlock).toBeDefined();

      // Check that project info is included
      const jsonStr = JSON.stringify(message.blocks);
      expect(jsonStr).toContain('test-project-123');
    });

    it('should include dashboard URL action when provided', () => {
      const brief = createMockTechnicalBrief();
      const message = buildTechnicalBriefSlackMessage(brief, 'https://dashboard.example.com');

      const actionBlock = message.blocks?.find(b => b.type === 'actions');
      expect(actionBlock).toBeDefined();
    });

    it('should include priority icons', () => {
      const brief = createMockTechnicalBrief();
      const message = buildTechnicalBriefSlackMessage(brief);

      const jsonStr = JSON.stringify(message.blocks);
      expect(jsonStr).toContain(':red_circle:'); // Critical priority
    });
  });

  describe('buildHumanBriefSlackMessage', () => {
    it('should build message with Italian content', () => {
      const brief = createMockHumanBrief();
      const message = buildHumanBriefSlackMessage(brief);

      expect(message.text).toContain('Test Project');

      const jsonStr = JSON.stringify(message.blocks);
      expect(jsonStr).toContain('Report Tecnologico');
      expect(jsonStr).toContain('opportunità');
    });

    it('should include urgency counts', () => {
      const brief = createMockHumanBrief();
      const message = buildHumanBriefSlackMessage(brief);

      const jsonStr = JSON.stringify(message.blocks);
      expect(jsonStr).toContain('Urgenti');
      expect(jsonStr).toContain('Da pianificare');
    });

    it('should include recommendations with urgency icons', () => {
      const brief = createMockHumanBrief();
      const message = buildHumanBriefSlackMessage(brief);

      const jsonStr = JSON.stringify(message.blocks);
      expect(jsonStr).toContain(':red_circle:'); // Immediate urgency
      expect(jsonStr).toContain('Aggiornamento React');
    });
  });

  describe('buildBreakingChangeAlertSlackMessage', () => {
    it('should build alert message with severity icon', () => {
      const message = buildBreakingChangeAlertSlackMessage(
        'Test Project',
        'lodash',
        '4.17.20',
        '4.17.21',
        'Security vulnerability fixed',
        'critical'
      );

      const jsonStr = JSON.stringify(message.blocks);
      expect(jsonStr).toContain(':rotating_light:'); // Critical severity
      expect(jsonStr).toContain('lodash');
      expect(jsonStr).toContain('4.17.20');
      expect(jsonStr).toContain('4.17.21');
    });

    it('should include project name and severity', () => {
      const message = buildBreakingChangeAlertSlackMessage(
        'Test Project',
        'axios',
        '0.27.0',
        '1.0.0',
        'Major update',
        'high'
      );

      const jsonStr = JSON.stringify(message.blocks);
      expect(jsonStr).toContain('Test Project');
      expect(jsonStr).toContain('HIGH');
    });
  });

  describe('buildBreakingChangeAlertsSlackMessage', () => {
    it('should build message for multiple alerts', () => {
      const alerts = createMockAlerts();
      const message = buildBreakingChangeAlertsSlackMessage('Test Project', alerts);

      expect(message.text).toContain('2 Breaking Change Alerts');
      expect(message.blocks).toBeDefined();

      const jsonStr = JSON.stringify(message.blocks);
      expect(jsonStr).toContain('lodash');
      expect(jsonStr).toContain('axios');
    });

    it('should show critical and high counts', () => {
      const alerts = createMockAlerts();
      const message = buildBreakingChangeAlertsSlackMessage('Test Project', alerts);

      const jsonStr = JSON.stringify(message.blocks);
      expect(jsonStr).toContain('critical');
      expect(jsonStr).toContain('high');
    });

    it('should limit to 10 alerts', () => {
      // Create 15 alerts
      const alerts: BreakingChangeAlert[] = [];
      for (let i = 0; i < 15; i++) {
        alerts.push({
          id: `alert-${i}`,
          ifxTraceId: `IFX-${i}`,
          projectId: 'test',
          generatedAt: new Date().toISOString(),
          type: 'breaking_change_alert',
          alertType: 'major_version',
          subject: { name: `package-${i}`, currentVersion: '1.0.0', newVersion: '2.0.0' },
          severity: 'medium',
          technicalSummary: 'Update',
          humanSummary: 'Update available',
          actionRequired: 'Update',
        });
      }

      const message = buildBreakingChangeAlertsSlackMessage('Test', alerts);

      const jsonStr = JSON.stringify(message.blocks);
      expect(jsonStr).toContain('and 5 more alerts');
    });
  });

  describe('deliverTechnicalBriefToSlack', () => {
    it('should deliver brief to specified channel', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const brief = createMockTechnicalBrief();
      const result = await deliverTechnicalBriefToSlack(brief, '#tech-team');

      expect(result.success).toBe(true);
      consoleSpy.mockRestore();
    });
  });

  describe('deliverHumanBriefToSlack', () => {
    it('should deliver brief to specified channel', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const brief = createMockHumanBrief();
      const result = await deliverHumanBriefToSlack(brief, '#pm-channel');

      expect(result.success).toBe(true);
      consoleSpy.mockRestore();
    });
  });

  describe('sendBreakingChangeAlertToSlack', () => {
    it('should send single alert', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await sendBreakingChangeAlertToSlack(
        'Test Project',
        'lodash',
        '4.17.20',
        '4.17.21',
        'Security fix',
        'critical',
        '#security'
      );

      expect(result.success).toBe(true);
      consoleSpy.mockRestore();
    });
  });

  describe('sendBreakingChangeAlertsToSlack', () => {
    it('should send multiple alerts', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const alerts = createMockAlerts();
      const result = await sendBreakingChangeAlertsToSlack(
        'Test Project',
        alerts,
        '#alerts'
      );

      expect(result.success).toBe(true);
      consoleSpy.mockRestore();
    });

    it('should handle empty alerts array', async () => {
      const result = await sendBreakingChangeAlertsToSlack(
        'Test Project',
        [],
        '#alerts'
      );

      expect(result.success).toBe(true);
    });

    it('should send via webhook when configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => 'ok',
      });

      const alerts = createMockAlerts();
      const result = await sendBreakingChangeAlertsToSlack(
        'Test Project',
        alerts,
        '#alerts',
        { webhookUrl: 'https://hooks.slack.com/services/test' }
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
