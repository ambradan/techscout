/**
 * Tests for L3 Matching Engine - Pre-filter
 *
 * Pre-filter is deterministic with ZERO LLM calls
 */

import { describe, it, expect } from 'vitest';
import {
  preFilterItem,
  preFilterBatch,
  getPassedItems,
  createConfigFromProfile,
} from '../../src/matching/prefilter';
import type { FeedItem, ProjectProfile } from '../../src/types';

describe('Matching Prefilter', () => {
  // Create a minimal but valid ProjectProfile for testing
  const mockProfile: ProjectProfile = {
    project: {
      id: 'proj-1',
      name: 'test-project',
      owner: 'test-org',
      phase: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    team: [],
    sources: [],
    stack: {
      languages: [
        { name: 'TypeScript', percentage: 80, role: 'primary' },
        { name: 'JavaScript', percentage: 20, role: 'secondary' },
      ],
      frameworks: [
        { name: 'React', version: '18.2.0', category: 'frontend' },
        { name: 'Next.js', version: '14.0.0', category: 'fullstack' },
      ],
      keyDependencies: [
        { name: 'lodash', version: '4.17.21', ecosystem: 'npm', isDevDep: false },
      ],
      databases: [
        { name: 'PostgreSQL', version: '15', provider: 'Supabase' },
      ],
      allDependencies: {
        npm: { direct: ['react', 'lodash'], dev: ['typescript', 'vitest'] },
      },
      lastUpdated: new Date().toISOString(),
    },
    manifest: {
      goals: ['Performance improvement'],
      painPoints: ['Bundle size'],
      constraints: [],
    },
    scouting: {
      enabled: true,
      frequency: 'weekly',
      maxRecommendations: 5,
      focusAreas: ['frontend', 'performance'],
      excludeCategories: ['devops'],
      notificationChannels: [],
      breakingChanges: {
        alertLevel: 'high',
        autoCreateIssues: false,
      },
      export: {
        enabled: false,
        format: 'json',
      },
      agent: {
        enabled: false,
        autoApprove: false,
        requireReview: true,
        gitProvider: 'github',
        baseBranch: 'main',
        branchPrefix: 'techscout/',
        safety: {
          maxFilesModified: 50,
          maxLinesChanged: 5000,
          requireTestsPass: true,
          requireBuildPass: true,
          forbiddenPaths: ['.env', '.env.*', '*.pem', '*.key'],
          forbiddenOperations: ['rm -rf', 'drop database'],
        },
      },
    },
    stackHealth: {
      overallScore: 0.8,
      components: {
        maintainability: { score: 0.8, trend: 'stable' },
        security: { score: 0.9, trend: 'stable' },
        performance: { score: 0.7, trend: 'stable' },
        scalability: { score: 0.8, trend: 'stable' },
      },
      lastCalculated: new Date().toISOString(),
    },
    cfFindings: null,
    costTracking: null,
  };

  const createFeedItem = (overrides?: Partial<FeedItem>): FeedItem => ({
    id: 'feed-1',
    sourceId: 'hn',
    sourceType: 'hackernews',
    externalId: 'ext-1',
    title: 'New React Feature Released',
    url: 'https://example.com/article',
    content: 'React 19 brings new features for TypeScript projects',
    technologies: ['react', 'javascript', 'typescript'],
    categories: ['frontend', 'framework'],
    languageEcosystems: ['npm'],
    traction: {
      points: 100,
      comments: 50,
    },
    publishedAt: new Date().toISOString(),
    fetchedAt: new Date().toISOString(),
    normalizedAt: new Date().toISOString(),
    ...overrides,
  });

  describe('createConfigFromProfile', () => {
    it('should create config with appropriate thresholds', () => {
      const config = createConfigFromProfile(mockProfile);

      // Config should have filter thresholds
      expect(config.minTechOverlap).toBeGreaterThan(0);
      expect(config.minTechOverlap).toBeLessThan(1);
      expect(config.minCategoryRelevance).toBeGreaterThan(0);
      expect(config.minTraction).toBeGreaterThan(0);
    });

    it('should set maxOutputItems based on profile recommendations', () => {
      const config = createConfigFromProfile(mockProfile);
      // maxOutputItems = maxRecommendations * 6
      expect(config.maxOutputItems).toBe(30); // 5 * 6
    });

    it('should adjust thresholds based on stack health', () => {
      const highHealthProfile = { ...mockProfile, stackHealth: { ...mockProfile.stackHealth, overallScore: 0.9 } };
      const lowHealthProfile = { ...mockProfile, stackHealth: { ...mockProfile.stackHealth, overallScore: 0.3 } };

      const highConfig = createConfigFromProfile(highHealthProfile);
      const lowConfig = createConfigFromProfile(lowHealthProfile);

      // High health = stricter filtering (higher thresholds)
      expect(highConfig.minTechOverlap).toBeGreaterThanOrEqual(lowConfig.minTechOverlap);
    });
  });

  describe('preFilterItem', () => {
    it('should pass items matching project technologies', () => {
      const item = createFeedItem({ technologies: ['react', 'typescript'] });
      const result = preFilterItem(item, mockProfile);

      expect(result.passedFilter).toBe(true);
      expect(result.technologiesMatched.length).toBeGreaterThan(0);
    });

    it('should fail items not matching any technology', () => {
      const item = createFeedItem({
        technologies: ['python', 'django'],
        categories: ['backend'],
        languageEcosystems: ['pypi'],
      });
      const result = preFilterItem(item, mockProfile);

      // Should fail due to no tech overlap and irrelevant ecosystem
      expect(result.passedFilter).toBe(false);
    });

    it('should include match reasons', () => {
      const item = createFeedItem({ technologies: ['react', 'typescript'] });
      const result = preFilterItem(item, mockProfile);

      expect(result.matchReasons.length).toBeGreaterThan(0);
    });

    it('should exclude items in excluded categories', () => {
      const item = createFeedItem({
        technologies: ['react'],
        categories: ['devops'], // This is in excludeCategories
      });
      const result = preFilterItem(item, mockProfile);

      expect(result.passedFilter).toBe(false);
      expect(result.matchReasons).toContain('Excluded category');
    });

    it('should calculate relevance score', () => {
      const item = createFeedItem({ technologies: ['react', 'typescript'] });
      const result = preFilterItem(item, mockProfile);

      expect(result.matchScore).toBeGreaterThan(0);
      expect(result.matchScore).toBeLessThanOrEqual(1);
    });
  });

  describe('preFilterBatch', () => {
    it('should process multiple items', () => {
      const items = [
        createFeedItem({ id: '1', technologies: ['react'] }),
        createFeedItem({ id: '2', technologies: ['python'], languageEcosystems: ['pypi'] }),
        createFeedItem({ id: '3', technologies: ['typescript'] }),
      ];

      const results = preFilterBatch(items, mockProfile);

      // feedItemsEvaluated = total items
      expect(results.feedItemsEvaluated).toBe(3);
      // matches only contains passed items (filtered and sorted)
      expect(results.feedItemsPassed).toBeGreaterThan(0);
    });

    it('should separate passed and failed items', () => {
      const items = [
        createFeedItem({ id: '1', technologies: ['react'] }),
        createFeedItem({ id: '2', technologies: ['python'], categories: ['backend'], languageEcosystems: ['pypi'] }),
      ];

      const results = preFilterBatch(items, mockProfile);

      // Results track passed/rejected counts
      expect(results.feedItemsPassed).toBeGreaterThan(0);
      expect(results.feedItemsRejected).toBeGreaterThan(0);
      // matches array only contains passed items
      expect(results.matches.length).toBe(results.feedItemsPassed);
    });
  });

  describe('getPassedItems', () => {
    it('should return only passed items', () => {
      const items = [
        createFeedItem({ id: '1', technologies: ['react'] }),
        createFeedItem({ id: '2', technologies: ['python'], languageEcosystems: ['pypi'] }),
        createFeedItem({ id: '3', technologies: ['typescript'] }),
      ];

      const results = preFilterBatch(items, mockProfile);
      const passed = getPassedItems(items, results.matches);

      expect(passed.length).toBeLessThanOrEqual(items.length);
      // All passed items should have matching technologies
      passed.forEach(item => {
        const match = results.matches.find(m => m.feedItemId === item.id);
        expect(match?.passedFilter).toBe(true);
      });
    });
  });
});
