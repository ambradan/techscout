/**
 * Tests for Learning Loop (Layer 5)
 *
 * Tests weight calculation and feedback calibration logic.
 * Database operations are mocked.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateNewWeight,
  calculateWeightFromCounts,
  getWeight,
  calculateCombinedWeight,
} from '../../src/feedback/learning';

// ============================================================
// Weight Calculation Tests
// ============================================================

describe('calculateNewWeight', () => {
  it('should increase weight for USEFUL feedback', () => {
    const result = calculateNewWeight(1.0, 'USEFUL');
    expect(result).toBe(1.05); // +5%
  });

  it('should increase weight more for ADOPTED feedback', () => {
    const result = calculateNewWeight(1.0, 'ADOPTED');
    expect(result).toBe(1.10); // +10%
  });

  it('should decrease weight for NOT_RELEVANT feedback', () => {
    const result = calculateNewWeight(1.0, 'NOT_RELEVANT');
    expect(result).toBe(0.92); // -8%
  });

  it('should not change weight for DISMISSED feedback', () => {
    const result = calculateNewWeight(1.0, 'DISMISSED');
    expect(result).toBe(1.0);
  });

  it('should not exceed MAX_WEIGHT (2.0)', () => {
    const result = calculateNewWeight(1.95, 'ADOPTED');
    expect(result).toBe(2.0);
  });

  it('should not go below MIN_WEIGHT (0.2)', () => {
    const result = calculateNewWeight(0.25, 'NOT_RELEVANT');
    expect(result).toBe(0.2);
  });

  it('should accumulate boosts correctly', () => {
    let weight = 1.0;
    weight = calculateNewWeight(weight, 'USEFUL');
    weight = calculateNewWeight(weight, 'USEFUL');
    weight = calculateNewWeight(weight, 'ADOPTED');
    expect(weight).toBeCloseTo(1.2, 10); // 1.0 + 0.05 + 0.05 + 0.10
  });

  it('should accumulate penalties correctly', () => {
    let weight = 1.0;
    weight = calculateNewWeight(weight, 'NOT_RELEVANT');
    weight = calculateNewWeight(weight, 'NOT_RELEVANT');
    expect(weight).toBeCloseTo(0.84, 2); // 1.0 - 0.08 - 0.08
  });
});

describe('calculateWeightFromCounts', () => {
  it('should return 1.0 for zero counts', () => {
    const result = calculateWeightFromCounts(0, 0, 0);
    expect(result).toBe(1.0);
  });

  it('should calculate boost from useful counts', () => {
    const result = calculateWeightFromCounts(4, 0, 0);
    expect(result).toBe(1.2); // 1.0 + 4 * 0.05
  });

  it('should calculate boost from adopted counts', () => {
    const result = calculateWeightFromCounts(0, 2, 0);
    expect(result).toBe(1.2); // 1.0 + 2 * 0.10
  });

  it('should calculate penalty from not_relevant counts', () => {
    const result = calculateWeightFromCounts(0, 0, 5);
    expect(result).toBe(0.6); // 1.0 - 5 * 0.08
  });

  it('should combine boosts and penalties', () => {
    const result = calculateWeightFromCounts(2, 1, 3);
    // 1.0 + (2 * 0.05) + (1 * 0.10) - (3 * 0.08) = 1.0 + 0.1 + 0.1 - 0.24 = 0.96
    expect(result).toBeCloseTo(0.96, 2);
  });

  it('should clamp to MIN_WEIGHT', () => {
    const result = calculateWeightFromCounts(0, 0, 20);
    expect(result).toBe(0.2);
  });

  it('should clamp to MAX_WEIGHT', () => {
    const result = calculateWeightFromCounts(50, 20, 0);
    expect(result).toBe(2.0);
  });
});

// ============================================================
// Weight Lookup Tests
// ============================================================

describe('getWeight', () => {
  it('should return weight from map', () => {
    const weights = new Map([
      ['category:frontend', 1.5],
      ['source:hacker_news', 0.8],
    ]);

    expect(getWeight(weights, 'category', 'frontend')).toBe(1.5);
    expect(getWeight(weights, 'source', 'hacker_news')).toBe(0.8);
  });

  it('should return 1.0 for unknown keys', () => {
    const weights = new Map([['category:frontend', 1.5]]);

    expect(getWeight(weights, 'category', 'backend')).toBe(1.0);
    expect(getWeight(weights, 'source', 'unknown')).toBe(1.0);
  });

  it('should handle case-insensitive keys', () => {
    const weights = new Map([['category:frontend', 1.5]]);

    expect(getWeight(weights, 'category', 'FRONTEND')).toBe(1.5);
    expect(getWeight(weights, 'category', 'Frontend')).toBe(1.5);
  });

  it('should return 1.0 for empty map', () => {
    const weights = new Map<string, number>();
    expect(getWeight(weights, 'category', 'anything')).toBe(1.0);
  });
});

// ============================================================
// Combined Weight Tests
// ============================================================

describe('calculateCombinedWeight', () => {
  it('should return 1.0 for empty weights map', () => {
    const weights = new Map<string, number>();
    const result = calculateCombinedWeight(weights, 'hacker_news', ['frontend'], ['react']);
    expect(result).toBe(1.0);
  });

  it('should apply source weight', () => {
    const weights = new Map([['source:hacker_news', 1.5]]);
    const result = calculateCombinedWeight(weights, 'hacker_news', [], []);
    // Geometric mean of (1.5 * 1.0 * 1.0)^(1/3) = 1.5^0.333 ≈ 1.145
    expect(result).toBeCloseTo(1.145, 2);
  });

  it('should apply category weights (averaged)', () => {
    const weights = new Map([
      ['category:frontend', 1.2],
      ['category:testing', 0.8],
    ]);
    const result = calculateCombinedWeight(weights, 'unknown', ['frontend', 'testing'], []);
    // Avg category = (1.2 + 0.8) / 2 = 1.0
    // Geometric mean of (1.0 * 1.0 * 1.0)^(1/3) = 1.0
    expect(result).toBe(1.0);
  });

  it('should apply technology weights (averaged)', () => {
    const weights = new Map([
      ['technology:react', 1.4],
      ['technology:typescript', 1.2],
    ]);
    const result = calculateCombinedWeight(weights, 'unknown', [], ['react', 'typescript']);
    // Avg tech = (1.4 + 1.2) / 2 = 1.3
    // Geometric mean of (1.0 * 1.0 * 1.3)^(1/3) = 1.3^0.333 ≈ 1.091
    expect(result).toBeCloseTo(1.091, 2);
  });

  it('should combine all weight types', () => {
    const weights = new Map([
      ['source:hacker_news', 1.5],
      ['category:frontend', 1.2],
      ['technology:react', 1.4],
    ]);
    const result = calculateCombinedWeight(weights, 'hacker_news', ['frontend'], ['react']);
    // Geometric mean of (1.5 * 1.2 * 1.4)^(1/3) = 2.52^0.333 ≈ 1.361
    expect(result).toBeCloseTo(1.361, 2);
  });

  it('should handle low weights (penalties)', () => {
    const weights = new Map([
      ['source:spammy_source', 0.3],
      ['category:irrelevant', 0.4],
    ]);
    const result = calculateCombinedWeight(weights, 'spammy_source', ['irrelevant'], []);
    // Geometric mean of (0.3 * 0.4 * 1.0)^(1/3) = 0.12^0.333 ≈ 0.493
    expect(result).toBeCloseTo(0.493, 2);
  });

  it('should clamp to MIN_WEIGHT', () => {
    const weights = new Map([
      ['source:bad', 0.2],
      ['category:bad', 0.2],
      ['technology:bad', 0.2],
    ]);
    const result = calculateCombinedWeight(weights, 'bad', ['bad'], ['bad']);
    // Geometric mean of (0.2 * 0.2 * 0.2)^(1/3) = 0.008^0.333 = 0.2
    expect(result).toBeCloseTo(0.2, 10);
  });

  it('should clamp to MAX_WEIGHT', () => {
    const weights = new Map([
      ['source:great', 2.0],
      ['category:great', 2.0],
      ['technology:great', 2.0],
    ]);
    const result = calculateCombinedWeight(weights, 'great', ['great'], ['great']);
    // Geometric mean of (2.0 * 2.0 * 2.0)^(1/3) = 8^0.333 = 2.0 (clamped)
    expect(result).toBe(2.0);
  });

  it('should handle missing categories/technologies gracefully', () => {
    const weights = new Map([['source:hacker_news', 1.3]]);
    const result = calculateCombinedWeight(weights, 'hacker_news', [], []);
    expect(result).toBeCloseTo(1.091, 2);
  });
});

// ============================================================
// Integration Behavior Tests
// ============================================================

describe('Learning Loop Integration Behavior', () => {
  it('should demonstrate weight calibration over time', () => {
    // Simulate multiple feedback events
    let categoryWeight = 1.0;
    let sourceWeight = 1.0;

    // User marks 3 items from "frontend" category as USEFUL
    for (let i = 0; i < 3; i++) {
      categoryWeight = calculateNewWeight(categoryWeight, 'USEFUL');
    }
    expect(categoryWeight).toBeCloseTo(1.15, 10); // +15%

    // User marks 2 items from "hacker_news" as NOT_RELEVANT
    for (let i = 0; i < 2; i++) {
      sourceWeight = calculateNewWeight(sourceWeight, 'NOT_RELEVANT');
    }
    expect(sourceWeight).toBeCloseTo(0.84, 2); // -16%

    // Combined effect on future items
    const weights = new Map([
      ['category:frontend', categoryWeight],
      ['source:hacker_news', sourceWeight],
    ]);

    const combined = calculateCombinedWeight(weights, 'hacker_news', ['frontend'], []);
    // Geometric mean of (0.84 * 1.15 * 1.0)^(1/3) = 0.966^0.333 ≈ 0.989
    // The boost and penalty roughly cancel out
    expect(combined).toBeCloseTo(0.989, 2);
  });

  it('should heavily boost adopted technologies', () => {
    let weight = 1.0;

    // User adopts 5 recommendations for React
    for (let i = 0; i < 5; i++) {
      weight = calculateNewWeight(weight, 'ADOPTED');
    }
    expect(weight).toBeCloseTo(1.5, 10); // +50%

    const weights = new Map([['technology:react', weight]]);
    const combined = calculateCombinedWeight(weights, 'any', [], ['react']);

    // Future React items get boosted
    expect(combined).toBeGreaterThan(1.1);
  });

  it('should suppress consistently irrelevant sources', () => {
    let weight = 1.0;

    // User marks 10 items from a source as NOT_RELEVANT
    for (let i = 0; i < 10; i++) {
      weight = calculateNewWeight(weight, 'NOT_RELEVANT');
    }
    expect(weight).toBeCloseTo(0.2, 10); // Clamped to minimum

    const weights = new Map([['source:spammy_blog', weight]]);
    const combined = calculateCombinedWeight(weights, 'spammy_blog', [], []);

    // Future items from this source are heavily penalized
    expect(combined).toBeLessThan(0.6);
  });
});
