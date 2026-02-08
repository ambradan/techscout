/**
 * Tests for KQR (Knowledge Qualification & Reliability) scoring
 */

import { describe, it, expect } from 'vitest';
import {
  qualifySource,
  calculateConfidence,
  calculateFactualBasis,
  calculateInferenceQuality,
  crossValidateSources,
  generateQualification,
  meetsConfidenceThreshold,
  getMaxActionForConfidence,
  COMMON_SOURCES,
  CONFIDENCE_THRESHOLDS,
} from '../../src/lib/kqr';
import { tagFact, tagInference, tagAssumption } from '../../src/lib/ifx';
import type { IFXClaim, KQRSource } from '../../src/types';

describe('KQR Scoring', () => {
  describe('qualifySource', () => {
    it('should qualify a source with weight calculation', () => {
      const source = qualifySource(
        'Official React Docs',
        'primary_source',
        'high',
        { url: 'https://react.dev' }
      );

      expect(source.source).toBe('Official React Docs');
      expect(source.type).toBe('primary_source');
      expect(source.reliability).toBe('high');
      expect(source.weight).toBeGreaterThan(0);
      expect(source.url).toBe('https://react.dev');
    });

    it('should calculate higher weight for higher reliability', () => {
      const high = qualifySource('Source', 'automated_scan', 'high');
      const low = qualifySource('Source', 'automated_scan', 'low');

      expect(high.weight).toBeGreaterThan(low.weight);
    });
  });

  describe('COMMON_SOURCES', () => {
    it('should create GitHub API source', () => {
      const source = COMMON_SOURCES.githubApi('https://api.github.com/repos/test');
      expect(source.source).toBe('GitHub API');
      expect(source.type).toBe('automated_scan');
      expect(source.reliability).toBe('high');
    });

    it('should create HackerNews source with reliability based on points', () => {
      const highPoints = COMMON_SOURCES.hackerNews(600);
      const lowPoints = COMMON_SOURCES.hackerNews(50);

      expect(highPoints.reliability).toBe('high');
      expect(lowPoints.reliability).toBe('low');
    });

    it('should create npm registry source with reliability based on downloads', () => {
      const popular = COMMON_SOURCES.npmRegistry(200000);
      const unpopular = COMMON_SOURCES.npmRegistry(5000);

      expect(popular.reliability).toBe('high');
      expect(unpopular.reliability).toBe('low');
    });
  });

  describe('calculateFactualBasis', () => {
    it('should return 0 for empty claims', () => {
      expect(calculateFactualBasis([])).toBe(0);
    });

    it('should return 1 for all facts', () => {
      const claims: IFXClaim[] = [
        tagFact('Fact 1', 'source', 'high'),
        tagFact('Fact 2', 'source', 'high'),
      ];

      const basis = calculateFactualBasis(claims);
      expect(basis).toBeGreaterThanOrEqual(0.9);
    });

    it('should return lower score for more inferences/assumptions', () => {
      const mostlyFacts: IFXClaim[] = [
        tagFact('Fact 1', 'source', 'high'),
        tagFact('Fact 2', 'source', 'high'),
        tagAssumption('Assumption'),
      ];

      const mostlyAssumptions: IFXClaim[] = [
        tagFact('Fact 1', 'source', 'high'),
        tagAssumption('Assumption 1'),
        tagAssumption('Assumption 2'),
      ];

      expect(calculateFactualBasis(mostlyFacts)).toBeGreaterThan(
        calculateFactualBasis(mostlyAssumptions)
      );
    });
  });

  describe('calculateInferenceQuality', () => {
    it('should return 1 for no inferences', () => {
      const claims: IFXClaim[] = [
        tagFact('Fact', 'source', 'high'),
      ];

      expect(calculateInferenceQuality(claims)).toBe(1);
    });

    it('should return average confidence for inferences', () => {
      const claims: IFXClaim[] = [
        tagInference('Inference 1', ['fact'], 0.9),
        tagInference('Inference 2', ['fact'], 0.7),
      ];

      const quality = calculateInferenceQuality(claims);
      expect(quality).toBeGreaterThan(0.7);
      expect(quality).toBeLessThan(0.9);
    });

    it('should penalize low confidence inferences', () => {
      const highConfidence: IFXClaim[] = [
        tagInference('Inference', ['fact'], 0.9),
      ];

      const lowConfidence: IFXClaim[] = [
        tagInference('Inference', ['fact'], 0.3),
      ];

      expect(calculateInferenceQuality(highConfidence)).toBeGreaterThan(
        calculateInferenceQuality(lowConfidence)
      );
    });
  });

  describe('crossValidateSources', () => {
    it('should count agreeing and conflicting sources', () => {
      const sources = [
        { source: qualifySource('S1', 'primary_source', 'high'), agrees: true, hasData: true },
        { source: qualifySource('S2', 'primary_source', 'high'), agrees: true, hasData: true },
        { source: qualifySource('S3', 'primary_source', 'medium'), agrees: false, hasData: true },
      ];

      const result = crossValidateSources(sources);

      expect(result.sourcesAgreeing).toBe(2);
      expect(result.sourcesConflicting).toBe(1);
      expect(result.sourcesInsufficient).toBe(0);
    });

    it('should count sources with insufficient data', () => {
      const sources = [
        { source: qualifySource('S1', 'primary_source', 'high'), agrees: true, hasData: true },
        { source: qualifySource('S2', 'primary_source', 'high'), agrees: false, hasData: false },
      ];

      const result = crossValidateSources(sources);

      expect(result.sourcesInsufficient).toBe(1);
    });
  });

  describe('calculateConfidence', () => {
    it('should calculate overall confidence from sources and claims', () => {
      const sources: KQRSource[] = [
        qualifySource('GitHub', 'automated_scan', 'high'),
        qualifySource('Docs', 'primary_source', 'high'),
      ];

      const claims: IFXClaim[] = [
        tagFact('Fact 1', 'source', 'high'),
        tagFact('Fact 2', 'source', 'high'),
        tagInference('Inference', ['Fact 1'], 0.8),
      ];

      const result = calculateConfidence(sources, claims);

      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.breakdown.factualBasis).toBeDefined();
      expect(result.breakdown.inferenceQuality).toBeDefined();
      expect(result.breakdown.assumptionRisk).toBeDefined();
    });

    it('should return lower confidence when many assumptions', () => {
      const sources: KQRSource[] = [
        qualifySource('Source', 'automated_scan', 'high'),
      ];

      const fewAssumptions: IFXClaim[] = [
        tagFact('Fact', 'source', 'high'),
      ];

      const manyAssumptions: IFXClaim[] = [
        tagFact('Fact', 'source', 'high'),
        tagAssumption('Assumption 1'),
        tagAssumption('Assumption 2'),
        tagAssumption('Assumption 3'),
      ];

      const resultFew = calculateConfidence(sources, fewAssumptions);
      const resultMany = calculateConfidence(sources, manyAssumptions);

      expect(resultFew.confidence).toBeGreaterThan(resultMany.confidence);
    });
  });

  describe('meetsConfidenceThreshold', () => {
    it('should pass for high confidence REPLACE_EXISTING', () => {
      expect(meetsConfidenceThreshold(0.75, 'REPLACE_EXISTING')).toBe(true);
    });

    it('should pass for moderate confidence MONITOR', () => {
      expect(meetsConfidenceThreshold(0.45, 'MONITOR')).toBe(true);
    });

    it('should fail for very low confidence', () => {
      expect(meetsConfidenceThreshold(0.1, 'REPLACE_EXISTING')).toBe(false);
    });
  });

  describe('getMaxActionForConfidence', () => {
    it('should return REPLACE_EXISTING for very high confidence', () => {
      expect(getMaxActionForConfidence(0.85)).toBe('REPLACE_EXISTING');
    });

    it('should return COMPLEMENT for medium-high confidence', () => {
      expect(getMaxActionForConfidence(0.65)).toBe('COMPLEMENT');
    });

    it('should return MONITOR for low confidence', () => {
      expect(getMaxActionForConfidence(0.45)).toBe('MONITOR');
    });

    it('should return null for very low confidence', () => {
      expect(getMaxActionForConfidence(0.2)).toBeNull();
    });
  });

  describe('CONFIDENCE_THRESHOLDS', () => {
    it('should have ascending thresholds', () => {
      expect(CONFIDENCE_THRESHOLDS.minimum).toBeLessThan(CONFIDENCE_THRESHOLDS.monitor);
      expect(CONFIDENCE_THRESHOLDS.monitor).toBeLessThan(CONFIDENCE_THRESHOLDS.newCapability);
      expect(CONFIDENCE_THRESHOLDS.newCapability).toBeLessThan(CONFIDENCE_THRESHOLDS.complement);
      expect(CONFIDENCE_THRESHOLDS.complement).toBeLessThan(CONFIDENCE_THRESHOLDS.replaceExisting);
    });
  });
});
