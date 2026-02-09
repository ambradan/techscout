/**
 * Tests for Breaking Change Detection Module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractDependencies,
  detectBreakingChanges,
  formatAlertsForDelivery,
  renderAlertsMarkdown,
  type DependencyInfo,
} from '../../src/matching/breaking-change';
import type { ProjectProfile, BreakingChangeAlert } from '../../src/types';

// Mock fetch for npm registry and GitHub API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Sample project profile
const createMockProfile = (overrides: Partial<ProjectProfile> = {}): ProjectProfile => ({
  project: {
    id: 'test-project-123',
    name: 'Test Project',
    slug: 'test-project',
  },
  stack: {
    languages: [{ name: 'typescript', percentage: 80, role: 'primary' }],
    frameworks: [{ name: 'react', version: '18.2.0' }],
    databases: [],
    keyDependencies: [
      { name: 'lodash', version: '4.17.21', ecosystem: 'npm' },
      { name: 'axios', version: '0.27.0', ecosystem: 'npm' },
      { name: 'moment', version: '2.29.4', ecosystem: 'npm' }, // EOL package
    ],
    allDependencies: {
      npm: {
        react: '^18.2.0',
        'react-dom': '^18.2.0',
        typescript: '^5.0.0',
      },
      pip: {},
    },
    infrastructure: [],
    devTools: [],
  },
  stackHealth: {
    overallScore: 0.75,
    components: {
      security: { score: 0.8, details: [] },
      freshness: { score: 0.7, details: [] },
      maintenance: { score: 0.75, details: [] },
      complexity: { score: 0.75, details: [] },
    },
  },
  manifest: {
    objectives: [],
    painPoints: [],
    constraints: [],
  },
  cfFindings: {
    findings: [],
    analyzedAt: new Date().toISOString(),
  },
  teamRoles: ['developer_fullstack'],
  scouting: {
    enabled: true,
    focusAreas: ['frontend', 'backend'],
    excludeCategories: [],
    maturityFilter: 'early_adopter',
    maxRecommendations: 5,
  },
  ...overrides,
});

describe('Breaking Change Detection', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv('GITHUB_TOKEN', 'test-token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('extractDependencies', () => {
    it('should extract dependencies from keyDependencies', () => {
      const profile = createMockProfile();
      const deps = extractDependencies(profile);

      expect(deps).toContainEqual({
        name: 'lodash',
        currentVersion: '4.17.21',
        ecosystem: 'npm',
      });
      expect(deps).toContainEqual({
        name: 'axios',
        currentVersion: '0.27.0',
        ecosystem: 'npm',
      });
    });

    it('should extract dependencies from allDependencies.npm', () => {
      const profile = createMockProfile();
      const deps = extractDependencies(profile);

      // Should have react from allDependencies (version cleaned)
      expect(deps).toContainEqual({
        name: 'react',
        currentVersion: '18.2.0',
        ecosystem: 'npm',
      });
    });

    it('should handle empty dependencies', () => {
      const profile = createMockProfile({
        stack: {
          languages: [],
          frameworks: [],
          databases: [],
          keyDependencies: [],
          allDependencies: { npm: {}, pip: {} },
          infrastructure: [],
          devTools: [],
        },
      });

      const deps = extractDependencies(profile);
      expect(deps).toHaveLength(0);
    });

    it('should not duplicate dependencies', () => {
      const profile = createMockProfile({
        stack: {
          languages: [],
          frameworks: [],
          databases: [],
          keyDependencies: [
            { name: 'react', version: '18.2.0', ecosystem: 'npm' },
          ],
          allDependencies: {
            npm: { react: '^18.2.0' },
            pip: {},
          },
          infrastructure: [],
          devTools: [],
        },
      });

      const deps = extractDependencies(profile);
      const reactDeps = deps.filter(d => d.name === 'react');
      expect(reactDeps).toHaveLength(1);
    });
  });

  describe('detectBreakingChanges', () => {
    it('should detect EOL packages', async () => {
      // Mock npm registry to return no updates
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '2.29.4' },
          versions: { '2.29.4': {} },
        }),
      });

      const profile = createMockProfile();
      const result = await detectBreakingChanges(profile, {
        checkMajorVersions: false,
        checkSecurityAdvisories: false,
        checkEOL: true,
      });

      // Should detect moment as EOL
      const eolAlerts = result.alerts.filter(a => a.alertType === 'eol_announcement');
      expect(eolAlerts.length).toBeGreaterThan(0);
      expect(eolAlerts.some(a => a.subject.name === 'moment')).toBe(true);
    });

    it('should detect major version updates', async () => {
      // Mock npm registry to return a major update for axios
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('axios')) {
          return {
            ok: true,
            json: async () => ({
              'dist-tags': { latest: '1.6.0' }, // Major update from 0.27.0
              versions: { '1.6.0': {} },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            'dist-tags': { latest: '4.17.21' },
            versions: { '4.17.21': {} },
          }),
        };
      });

      const profile = createMockProfile();
      const result = await detectBreakingChanges(profile, {
        checkMajorVersions: true,
        checkSecurityAdvisories: false,
        checkEOL: false,
      });

      const majorAlerts = result.alerts.filter(a => a.alertType === 'major_version');
      expect(majorAlerts.some(a => a.subject.name === 'axios')).toBe(true);
    });

    it('should detect deprecated packages', async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('axios')) {
          return {
            ok: true,
            json: async () => ({
              'dist-tags': { latest: '0.27.0' },
              versions: {
                '0.27.0': {
                  deprecated: 'This package is deprecated. Use fetch instead.',
                },
              },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            'dist-tags': { latest: '4.17.21' },
            versions: { '4.17.21': {} },
          }),
        };
      });

      const profile = createMockProfile();
      const result = await detectBreakingChanges(profile, {
        checkMajorVersions: true,
        checkSecurityAdvisories: false,
        checkEOL: false,
      });

      const deprecationAlerts = result.alerts.filter(a => a.alertType === 'deprecation_notice');
      expect(deprecationAlerts.some(a => a.subject.name === 'axios')).toBe(true);
    });

    it('should handle npm registry errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const profile = createMockProfile();
      const result = await detectBreakingChanges(profile, {
        checkMajorVersions: true,
        checkSecurityAdvisories: false,
        checkEOL: false,
      });

      // Should not crash, just return empty results or errors
      expect(result).toBeDefined();
      expect(Array.isArray(result.alerts)).toBe(true);
    });

    it('should limit dependencies checked', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          'dist-tags': { latest: '1.0.0' },
          versions: { '1.0.0': {} },
        }),
      });

      const profile = createMockProfile();
      const result = await detectBreakingChanges(profile, {
        checkMajorVersions: true,
        checkSecurityAdvisories: false,
        checkEOL: false,
        maxDependencies: 2,
      });

      expect(result.checked.dependencies).toBeLessThanOrEqual(2);
    });
  });

  describe('formatAlertsForDelivery', () => {
    it('should group alerts by severity', () => {
      const alerts: BreakingChangeAlert[] = [
        {
          id: '1',
          ifxTraceId: 'BCA-001',
          projectId: 'test',
          generatedAt: new Date().toISOString(),
          type: 'breaking_change_alert',
          alertType: 'security_advisory',
          subject: { name: 'pkg1', currentVersion: '1.0.0', newVersion: '1.0.1' },
          severity: 'critical',
          technicalSummary: 'Critical CVE',
          humanSummary: 'Critical issue',
          actionRequired: 'Update now',
        },
        {
          id: '2',
          ifxTraceId: 'BCA-002',
          projectId: 'test',
          generatedAt: new Date().toISOString(),
          type: 'breaking_change_alert',
          alertType: 'major_version',
          subject: { name: 'pkg2', currentVersion: '1.0.0', newVersion: '2.0.0' },
          severity: 'high',
          technicalSummary: 'Major update',
          humanSummary: 'New version',
          actionRequired: 'Review changes',
        },
        {
          id: '3',
          ifxTraceId: 'BCA-003',
          projectId: 'test',
          generatedAt: new Date().toISOString(),
          type: 'breaking_change_alert',
          alertType: 'deprecation_notice',
          subject: { name: 'pkg3', currentVersion: '1.0.0', newVersion: 'N/A' },
          severity: 'medium',
          technicalSummary: 'Deprecated',
          humanSummary: 'Package deprecated',
          actionRequired: 'Find alternative',
        },
      ];

      const grouped = formatAlertsForDelivery(alerts);

      expect(grouped.critical).toHaveLength(1);
      expect(grouped.critical[0].subject.name).toBe('pkg1');
      expect(grouped.high).toHaveLength(1);
      expect(grouped.high[0].subject.name).toBe('pkg2');
      expect(grouped.other).toHaveLength(1);
      expect(grouped.other[0].subject.name).toBe('pkg3');
    });
  });

  describe('renderAlertsMarkdown', () => {
    it('should render alerts as markdown', () => {
      const alerts: BreakingChangeAlert[] = [
        {
          id: '1',
          ifxTraceId: 'BCA-001',
          projectId: 'test',
          generatedAt: new Date().toISOString(),
          type: 'breaking_change_alert',
          alertType: 'security_advisory',
          subject: { name: 'lodash', currentVersion: '4.17.20', newVersion: '4.17.21' },
          severity: 'high',
          technicalSummary: 'Prototype pollution vulnerability',
          humanSummary: 'Security issue in lodash',
          actionRequired: 'Update to 4.17.21',
        },
      ];

      const markdown = renderAlertsMarkdown(alerts);

      expect(markdown).toContain('# Breaking Change Alerts');
      expect(markdown).toContain('lodash');
      expect(markdown).toContain('security advisory'); // Rendered with spaces
      expect(markdown).toContain('4.17.20');
      expect(markdown).toContain('4.17.21');
    });

    it('should return message for no alerts', () => {
      const markdown = renderAlertsMarkdown([]);
      expect(markdown).toBe('No breaking changes detected.');
    });
  });
});
