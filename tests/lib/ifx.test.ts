/**
 * Tests for IFX (Information Flow eXplicitness) helpers
 */

import { describe, it, expect } from 'vitest';
import {
  tagFact,
  tagInference,
  tagAssumption,
  generateTraceId,
  summarizeClaims,
  createTraceSummary,
  formatClaim,
  calculateAssumptionRisk,
} from '../../src/lib/ifx';
import type { IFXClaim } from '../../src/types';

describe('IFX Helpers', () => {
  describe('tagFact', () => {
    it('should create a FACT tagged claim', () => {
      const claim = tagFact(
        'React version is 18.2.0',
        'package.json',
        'very_high'
      );

      expect(claim.ifxTag).toBe('FACT');
      expect(claim.claim).toBe('React version is 18.2.0');
      expect(claim.source).toBe('package.json');
      expect(claim.sourceReliability).toBe('very_high');
    });

    it('should include timestamp', () => {
      const claim = tagFact('Some fact', 'source', 'high');
      expect(claim.timestamp).toBeDefined();
    });

    it('should accept optional sourceUrl and cfFindingId', () => {
      const claim = tagFact(
        'Test fact',
        'github',
        'high',
        { sourceUrl: 'https://github.com/repo', cfFindingId: 'CF-001' }
      );

      expect(claim.sourceUrl).toBe('https://github.com/repo');
      expect(claim.cfFindingId).toBe('CF-001');
    });
  });

  describe('tagInference', () => {
    it('should create an INFERENCE tagged claim', () => {
      const claim = tagInference(
        'Project likely uses hooks',
        ['React 18 is used', 'No class components found'],
        0.85
      );

      expect(claim.ifxTag).toBe('INFERENCE');
      expect(claim.claim).toBe('Project likely uses hooks');
      expect(claim.derivedFrom).toHaveLength(2);
      expect(claim.confidence).toBe(0.85);
    });

    it('should throw error for confidence > 1', () => {
      expect(() => tagInference('Test', ['base'], 1.5)).toThrow();
    });

    it('should throw error for confidence < 0', () => {
      expect(() => tagInference('Test', ['base'], -0.5)).toThrow();
    });

    it('should accept boundary values 0 and 1', () => {
      const zero = tagInference('Test', ['base'], 0);
      expect(zero.confidence).toBe(0);

      const one = tagInference('Test', ['base'], 1);
      expect(one.confidence).toBe(1);
    });
  });

  describe('tagAssumption', () => {
    it('should create an ASSUMPTION tagged claim', () => {
      const claim = tagAssumption('Team prefers functional components');

      expect(claim.ifxTag).toBe('ASSUMPTION');
      expect(claim.claim).toBe('Team prefers functional components');
      expect(claim.validated).toBeUndefined();
    });

    it('should include timestamp', () => {
      const claim = tagAssumption('Some assumption');
      expect(claim.timestamp).toBeDefined();
    });
  });

  describe('generateTraceId', () => {
    it('should generate unique trace IDs', () => {
      const id1 = generateTraceId();
      const id2 = generateTraceId();

      expect(id1).not.toBe(id2);
    });

    it('should follow IFX trace ID format', () => {
      const id = generateTraceId();
      // Format: IFX-YYYY-MMDD-SEQ (SEQ may contain underscores)
      expect(id).toMatch(/^IFX-\d{4}-\d{4}-[A-Z0-9_-]+$/);
    });

    it('should include type suffix when provided', () => {
      const id = generateTraceId('MIG');
      // Format: IFX-YYYY-MMDD-TYPE-SEQ (SEQ may contain underscores from nanoid)
      expect(id).toMatch(/^IFX-\d{4}-\d{4}-MIG-[A-Z0-9_-]+$/);
    });
  });

  describe('summarizeClaims', () => {
    it('should count facts, inferences, and assumptions', () => {
      const claims: IFXClaim[] = [
        tagFact('Fact 1', 'source', 'high'),
        tagFact('Fact 2', 'source', 'high'),
        tagInference('Inference 1', ['Fact 1'], 0.8),
        tagAssumption('Assumption 1'),
      ];

      const summary = summarizeClaims(claims);

      expect(summary.facts).toBe(2);
      expect(summary.inferences).toBe(1);
      expect(summary.assumptions).toBe(1);
    });

    it('should calculate average inference confidence', () => {
      const claims: IFXClaim[] = [
        tagInference('Inference 1', ['base'], 0.8),
        tagInference('Inference 2', ['base'], 0.6),
      ];

      const summary = summarizeClaims(claims);
      expect(summary.avgInferenceConfidence).toBe(0.7);
    });
  });

  describe('formatClaim', () => {
    it('should format a FACT claim', () => {
      const claim = tagFact('React is 18.2.0', 'package.json', 'high');
      const formatted = formatClaim(claim);
      expect(formatted).toBe('[FACT] React is 18.2.0');
    });

    it('should format an INFERENCE claim', () => {
      const claim = tagInference('Uses hooks', ['Fact'], 0.9);
      const formatted = formatClaim(claim);
      expect(formatted).toBe('[INFERENCE] Uses hooks');
    });

    it('should format an ASSUMPTION claim', () => {
      const claim = tagAssumption('Team prefers TypeScript');
      const formatted = formatClaim(claim);
      expect(formatted).toBe('[ASSUMPTION] Team prefers TypeScript');
    });
  });

  describe('calculateAssumptionRisk', () => {
    it('should return 0 when no assumptions', () => {
      const claims: IFXClaim[] = [
        tagFact('Fact 1', 'source', 'high'),
        tagFact('Fact 2', 'source', 'high'),
      ];

      const risk = calculateAssumptionRisk(claims);
      expect(risk).toBe(0);
    });

    it('should return higher risk when more assumptions than facts', () => {
      const fewAssumptions: IFXClaim[] = [
        tagFact('Fact 1', 'source', 'high'),
        tagFact('Fact 2', 'source', 'high'),
        tagAssumption('Assumption 1'),
      ];

      const manyAssumptions: IFXClaim[] = [
        tagFact('Fact 1', 'source', 'high'),
        tagAssumption('Assumption 1'),
        tagAssumption('Assumption 2'),
        tagAssumption('Assumption 3'),
      ];

      const riskFew = calculateAssumptionRisk(fewAssumptions);
      const riskMany = calculateAssumptionRisk(manyAssumptions);

      expect(riskMany).toBeGreaterThan(riskFew);
    });

    it('should return risk between 0 and 1', () => {
      const claims: IFXClaim[] = [
        tagAssumption('Assumption 1'),
        tagAssumption('Assumption 2'),
      ];

      const risk = calculateAssumptionRisk(claims);
      expect(risk).toBeGreaterThanOrEqual(0);
      expect(risk).toBeLessThanOrEqual(1);
    });
  });

  describe('createTraceSummary', () => {
    it('should create trace summary with counts', () => {
      const traceId = generateTraceId();
      const claims: IFXClaim[] = [
        tagFact('Fact 1', 'source', 'high'),
        tagInference('Inference 1', ['Fact 1'], 0.8),
        tagAssumption('Assumption 1'),
      ];

      const summary = createTraceSummary(traceId, claims);

      expect(summary.traceId).toBe(traceId);
      expect(summary.factsCount).toBe(1);
      expect(summary.inferencesCount).toBe(1);
      expect(summary.assumptionsCount).toBe(1);
    });

    it('should include recommendation trace when provided', () => {
      const traceId = generateTraceId();
      const recTraceId = generateTraceId();
      const claims: IFXClaim[] = [];

      const summary = createTraceSummary(traceId, claims, recTraceId);

      expect(summary.recommendationTrace).toBe(recTraceId);
    });
  });
});
