/**
 * Tests for L3 Matching Engine - Maturity Gate
 */

import { describe, it, expect } from 'vitest';
import {
  isAtLeastAsMature,
  evaluateMaturityGate,
} from '../../src/matching/maturity';

describe('Maturity Gate', () => {
  describe('isAtLeastAsMature', () => {
    // Maturity levels: experimental < growth < stable < declining < deprecated

    it('should return true when stable meets growth requirement', () => {
      expect(isAtLeastAsMature('stable', 'growth')).toBe(true);
    });

    it('should return true when growth meets growth requirement', () => {
      expect(isAtLeastAsMature('growth', 'growth')).toBe(true);
    });

    it('should return true when growth meets experimental requirement', () => {
      expect(isAtLeastAsMature('growth', 'experimental')).toBe(true);
    });

    it('should return false when experimental tries to meet stable', () => {
      expect(isAtLeastAsMature('experimental', 'stable')).toBe(false);
    });

    it('should return false when experimental tries to meet growth', () => {
      expect(isAtLeastAsMature('experimental', 'growth')).toBe(false);
    });

    it('should return true when experimental meets experimental', () => {
      expect(isAtLeastAsMature('experimental', 'experimental')).toBe(true);
    });

    it('should return false for deprecated (never recommend)', () => {
      expect(isAtLeastAsMature('deprecated', 'experimental')).toBe(false);
    });
  });

  describe('evaluateMaturityGate', () => {
    // Note: evaluateMaturityGate takes { maturity, action, traction? }
    // The minimum maturity required is determined by the action:
    //   REPLACE_EXISTING: 'growth'
    //   COMPLEMENT: 'experimental'
    //   NEW_CAPABILITY: 'experimental'
    //   MONITOR: 'experimental'

    it('should pass for growth subject with MONITOR action (requires experimental)', () => {
      const result = evaluateMaturityGate({
        maturity: 'growth',
        action: 'MONITOR',
      });

      expect(result.passed).toBe(true);
    });

    it('should pass for stable subject with REPLACE_EXISTING action (requires growth)', () => {
      const result = evaluateMaturityGate({
        maturity: 'stable',
        action: 'REPLACE_EXISTING',
      });

      expect(result.passed).toBe(true);
    });

    it('should fail for experimental subject with REPLACE_EXISTING action (requires growth)', () => {
      const result = evaluateMaturityGate({
        maturity: 'experimental',
        action: 'REPLACE_EXISTING',
      });

      expect(result.passed).toBe(false);
    });

    it('should fail for deprecated subject', () => {
      const result = evaluateMaturityGate({
        maturity: 'deprecated',
        action: 'MONITOR',
      });

      expect(result.passed).toBe(false);
    });
  });
});
