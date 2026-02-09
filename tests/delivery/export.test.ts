/**
 * Tests for Export Module (PDF, JSON, Markdown)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  exportTechnicalBriefPDF,
  exportHumanBriefPDF,
  exportTechnicalBriefAsJson,
  exportHumanBriefAsJson,
  exportTechnicalBriefAsMarkdown,
  exportHumanBriefAsMarkdown,
  uploadAndArchivePdf,
  type PdfExportResult,
} from '../../src/delivery/export';
import type { TechnicalBrief } from '../../src/delivery/technical-brief';
import type { HumanBrief } from '../../src/delivery/human-brief';

// Mock Supabase client
vi.mock('../../src/db/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 'archive-123' }, error: null })),
        })),
      })),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ data: { path: 'test/path.pdf' }, error: null })),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://storage.example.com/test.pdf' } })),
      })),
    },
  },
  getAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 'archive-123' }, error: null })),
        })),
      })),
    })),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ data: { path: 'test/path.pdf' }, error: null })),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://storage.example.com/test.pdf' } })),
      })),
    },
  })),
}));

// Sample technical brief
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
        facts: ['React 19 released'],
        inferences: ['Better performance'],
        assumptions: ['Team can migrate'],
      },
      effort: {
        estimate: '3 days',
        calibrated: true,
        complexity: 'medium',
        breakingChanges: true,
        reversibility: 'easy',
        steps: ['Update package.json', 'Run migration'],
      },
      impact: {
        security: 'No change',
        performance: '+40% render speed',
        maintainability: 'Improved',
        cost: 'No change',
      },
      tradeoffs: {
        gains: ['Better performance'],
        losses: ['Migration effort'],
      },
      risks: {
        failureModes: [{ description: 'Breaking changes', likelihood: 'medium', mitigation: 'Test' }],
      },
      limitations: ['Requires testing'],
      links: {
        sourceUrl: 'https://react.dev',
        ifxTraceId: 'IFX-REC-TEST1',
      },
    },
  ],
  summary: {
    totalRecommendations: 1,
    byPriority: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
    topConcerns: ['1 critical recommendation'],
    securityRelated: 0,
  },
});

// Sample human brief
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
      summary: 'React 19 porta miglioramenti significativi.',
      whyNow: 'Nuove funzionalita disponibili',
      verdict: {
        recommendation: 'Consigliato',
        plain: 'Benefici superano costi.',
      },
      impact: {
        security: 'Nessun impatto',
        cost: 'Nessun costo',
        risk: 'Basso rischio',
        urgency: 'Alta urgenza',
      },
      clientTalkingPoints: [
        { point: 'Performance migliorata', explanation: 'Sito piu veloce.' },
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
    keyHighlights: ['1 raccomandazione urgente'],
    overallRiskLevel: 'medium',
  },
});

describe('Export Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('JSON Export', () => {
    it('should export technical brief as JSON', () => {
      const brief = createMockTechnicalBrief();
      const json = exportTechnicalBriefAsJson(brief);

      const parsed = JSON.parse(json);
      expect(parsed.id).toBe(brief.id);
      expect(parsed.projectId).toBe(brief.projectId);
      expect(parsed.recommendations).toHaveLength(1);
    });

    it('should include metadata when requested', () => {
      const brief = createMockTechnicalBrief();
      const json = exportTechnicalBriefAsJson(brief, { includeMetadata: true });

      const parsed = JSON.parse(json);
      expect(parsed._metadata).toBeDefined();
      expect(parsed._metadata.format).toBe('json');
      expect(parsed._metadata.briefType).toBe('technical');
    });

    it('should export human brief as JSON', () => {
      const brief = createMockHumanBrief();
      const json = exportHumanBriefAsJson(brief);

      const parsed = JSON.parse(json);
      expect(parsed.id).toBe(brief.id);
      expect(parsed.projectName).toBe('Test Project');
    });
  });

  describe('Markdown Export', () => {
    it('should export technical brief as Markdown', () => {
      const brief = createMockTechnicalBrief();
      const markdown = exportTechnicalBriefAsMarkdown(brief);

      expect(markdown).toContain('TechScout Technical Brief');
      expect(markdown).toContain('React');
      expect(markdown).toContain('critical');
    });

    it('should include YAML frontmatter when metadata requested', () => {
      const brief = createMockTechnicalBrief();
      const markdown = exportTechnicalBriefAsMarkdown(brief, { includeMetadata: true });

      expect(markdown).toContain('---');
      expect(markdown).toContain('brief_type: technical');
      expect(markdown).toContain(`brief_id: ${brief.id}`);
    });

    it('should export human brief as Markdown', () => {
      const brief = createMockHumanBrief();
      const markdown = exportHumanBriefAsMarkdown(brief);

      expect(markdown).toContain('Report Tecnologico');
      expect(markdown).toContain('Test Project');
      expect(markdown).toContain('Aggiornamento React');
    });
  });

  describe('PDF Export', () => {
    it('should generate technical brief PDF buffer', async () => {
      const brief = createMockTechnicalBrief();
      const pdfBuffer = await exportTechnicalBriefPDF(brief);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
      // PDF starts with %PDF
      expect(pdfBuffer.slice(0, 4).toString()).toBe('%PDF');
    });

    it('should generate human brief PDF buffer', async () => {
      const brief = createMockHumanBrief();
      const pdfBuffer = await exportHumanBriefPDF(brief);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
      expect(pdfBuffer.slice(0, 4).toString()).toBe('%PDF');
    });

    it('should handle multiple recommendations in PDF', async () => {
      const brief = createMockTechnicalBrief();
      // Add more recommendations
      brief.recommendations.push({
        ...brief.recommendations[0],
        id: 'rec-2',
        subject: { ...brief.recommendations[0].subject, name: 'TypeScript' },
        classification: { ...brief.recommendations[0].classification, priority: 'high' },
      });
      brief.summary.totalRecommendations = 2;

      const pdfBuffer = await exportTechnicalBriefPDF(brief);

      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should generate PDF with proper size', async () => {
      const brief = createMockTechnicalBrief();
      const pdfBuffer = await exportTechnicalBriefPDF(brief);

      // A simple PDF should be at least 1KB
      expect(pdfBuffer.length).toBeGreaterThan(1000);
      // But not excessively large for simple content
      expect(pdfBuffer.length).toBeLessThan(500000);
    });
  });

  describe('PDF Content Validation', () => {
    it('should contain PDF header signature', async () => {
      const brief = createMockTechnicalBrief();
      const pdfBuffer = await exportTechnicalBriefPDF(brief);

      const header = pdfBuffer.slice(0, 8).toString();
      expect(header).toMatch(/^%PDF-1\./);
    });

    it('should contain PDF trailer', async () => {
      const brief = createMockTechnicalBrief();
      const pdfBuffer = await exportTechnicalBriefPDF(brief);

      const pdfString = pdfBuffer.toString('binary');
      expect(pdfString).toContain('%%EOF');
    });
  });

  describe('Empty/Edge Cases', () => {
    it('should handle empty recommendations array', async () => {
      const brief = createMockTechnicalBrief();
      brief.recommendations = [];
      brief.summary.totalRecommendations = 0;

      const pdfBuffer = await exportTechnicalBriefPDF(brief);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(0);
    });

    it('should handle long text content', async () => {
      const brief = createMockHumanBrief();
      brief.recommendations[0].summary = 'A'.repeat(2000);

      const pdfBuffer = await exportHumanBriefPDF(brief);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
    });

    it('should handle special characters in content', async () => {
      const brief = createMockTechnicalBrief();
      brief.recommendations[0].subject.name = 'React & TypeScript <test>';

      const pdfBuffer = await exportTechnicalBriefPDF(brief);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
    });
  });
});
