/**
 * TechScout — Breaking Change Detection (Layer 3, Parallel)
 *
 * Monitors project dependencies for:
 * - Major version releases
 * - Security advisories (CVE)
 * - Deprecation notices
 * - End-of-life announcements
 *
 * Alerts from this module BYPASS the Stability Gate and ranking.
 * They are delivered IMMEDIATELY.
 */

import { randomUUID } from 'crypto';
import type {
  BreakingChangeAlert,
  BreakingChangeAlertType,
  RecommendationPriority,
  ProjectProfile,
} from '../types';
import { generateTraceId } from '../lib/ifx';
import { logger } from '../lib/logger';

// ============================================================
// TYPES
// ============================================================

export interface DependencyInfo {
  name: string;
  currentVersion: string;
  ecosystem: 'npm' | 'pip' | 'cargo' | 'go' | 'gem' | 'composer';
}

export interface VersionCheckResult {
  dependency: DependencyInfo;
  latestVersion: string | null;
  isMajorUpdate: boolean;
  isDeprecated: boolean;
  deprecationMessage?: string;
}

export interface SecurityAdvisory {
  id: string;
  package: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  patchedVersions: string[];
  vulnerableVersionRange: string;
  url: string;
  publishedAt: string;
}

export interface EOLInfo {
  package: string;
  version: string;
  eolDate: string;
  message: string;
  url?: string;
}

export interface BreakingChangeCheckResult {
  alerts: BreakingChangeAlert[];
  checked: {
    dependencies: number;
    advisories: number;
    eolChecks: number;
  };
  errors: string[];
}

// ============================================================
// KNOWN EOL PACKAGES (static list, should be updated periodically)
// ============================================================

const KNOWN_EOL: Record<string, EOLInfo> = {
  'node-sass': {
    package: 'node-sass',
    version: '*',
    eolDate: '2022-10-01',
    message: 'node-sass is deprecated. Use sass (Dart Sass) instead.',
    url: 'https://sass-lang.com/blog/libsass-is-deprecated',
  },
  'request': {
    package: 'request',
    version: '*',
    eolDate: '2020-02-11',
    message: 'request is deprecated. Use node-fetch, axios, or got instead.',
    url: 'https://github.com/request/request/issues/3142',
  },
  'moment': {
    package: 'moment',
    version: '*',
    eolDate: '2020-09-01',
    message: 'moment is in maintenance mode. Consider date-fns or dayjs.',
    url: 'https://momentjs.com/docs/#/-project-status/',
  },
  'enzyme': {
    package: 'enzyme',
    version: '*',
    eolDate: '2022-01-01',
    message: 'enzyme is not maintained for React 18+. Use React Testing Library.',
    url: 'https://testing-library.com/docs/react-testing-library/migrate-from-enzyme/',
  },
  'tslint': {
    package: 'tslint',
    version: '*',
    eolDate: '2019-12-01',
    message: 'TSLint is deprecated. Use ESLint with typescript-eslint.',
    url: 'https://github.com/palantir/tslint/issues/4534',
  },
  'core-js@2': {
    package: 'core-js',
    version: '2.x',
    eolDate: '2020-01-01',
    message: 'core-js@2 is deprecated. Upgrade to core-js@3.',
    url: 'https://github.com/zloirock/core-js/blob/master/docs/2019-03-19-core-js-3-babel-and-a-look-into-the-future.md',
  },
};

// ============================================================
// NPM REGISTRY CHECK
// ============================================================

/**
 * Fetch package info from npm registry.
 */
async function fetchNpmPackageInfo(packageName: string): Promise<{
  latestVersion: string;
  deprecated?: string;
  versions: string[];
} | null> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const latestVersion = data['dist-tags']?.latest;
    const latestInfo = data.versions?.[latestVersion];

    return {
      latestVersion,
      deprecated: latestInfo?.deprecated,
      versions: Object.keys(data.versions || {}),
    };
  } catch (error) {
    logger.warn('Failed to fetch npm package info', {
      package: packageName,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Check if version change is a major update.
 */
function isMajorVersionUpdate(currentVersion: string, latestVersion: string): boolean {
  const currentMajor = parseInt(currentVersion.replace(/^[^0-9]*/, '').split('.')[0], 10);
  const latestMajor = parseInt(latestVersion.replace(/^[^0-9]*/, '').split('.')[0], 10);

  if (isNaN(currentMajor) || isNaN(latestMajor)) {
    return false;
  }

  return latestMajor > currentMajor;
}

/**
 * Check npm dependencies for updates and deprecations.
 */
async function checkNpmDependencies(dependencies: DependencyInfo[]): Promise<VersionCheckResult[]> {
  const npmDeps = dependencies.filter(d => d.ecosystem === 'npm');
  const results: VersionCheckResult[] = [];

  for (const dep of npmDeps) {
    const info = await fetchNpmPackageInfo(dep.name);

    if (info) {
      results.push({
        dependency: dep,
        latestVersion: info.latestVersion,
        isMajorUpdate: isMajorVersionUpdate(dep.currentVersion, info.latestVersion),
        isDeprecated: !!info.deprecated,
        deprecationMessage: info.deprecated,
      });
    }
  }

  return results;
}

// ============================================================
// GITHUB SECURITY ADVISORIES
// ============================================================

/**
 * Fetch security advisories from GitHub Advisory Database.
 */
async function fetchGitHubAdvisories(
  ecosystem: string,
  packageName: string
): Promise<SecurityAdvisory[]> {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    logger.warn('GITHUB_TOKEN not set, skipping advisory check');
    return [];
  }

  try {
    // Use GitHub GraphQL API for advisories
    const query = `
      query($ecosystem: SecurityAdvisoryEcosystem!, $package: String!) {
        securityVulnerabilities(
          first: 10,
          ecosystem: $ecosystem,
          package: $package,
          orderBy: { field: UPDATED_AT, direction: DESC }
        ) {
          nodes {
            advisory {
              ghsaId
              summary
              description
              severity
              publishedAt
              permalink
            }
            package {
              name
            }
            vulnerableVersionRange
            firstPatchedVersion {
              identifier
            }
          }
        }
      }
    `;

    const ecosystemMap: Record<string, string> = {
      npm: 'NPM',
      pip: 'PIP',
      cargo: 'RUST',
      go: 'GO',
      gem: 'RUBYGEMS',
      composer: 'COMPOSER',
    };

    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          ecosystem: ecosystemMap[ecosystem] || 'NPM',
          package: packageName,
        },
      }),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const vulnerabilities = data?.data?.securityVulnerabilities?.nodes || [];

    return vulnerabilities.map((v: Record<string, unknown>) => {
      const advisory = v.advisory as Record<string, unknown>;
      const firstPatchedVersion = v.firstPatchedVersion as Record<string, unknown> | null;
      return {
        id: advisory.ghsaId as string,
        package: packageName,
        severity: (advisory.severity as string)?.toLowerCase() as SecurityAdvisory['severity'],
        title: advisory.summary as string,
        description: advisory.description as string,
        patchedVersions: firstPatchedVersion ? [firstPatchedVersion.identifier as string] : [],
        vulnerableVersionRange: v.vulnerableVersionRange as string,
        url: advisory.permalink as string,
        publishedAt: advisory.publishedAt as string,
      };
    });
  } catch (error) {
    logger.warn('Failed to fetch GitHub advisories', {
      package: packageName,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Check if a version is affected by an advisory.
 */
function isVersionAffected(version: string, vulnerableRange: string): boolean {
  // Simple version range check (supports basic patterns like "< 1.2.3", ">= 1.0.0 < 2.0.0")
  // For production, use semver library
  try {
    const cleanVersion = version.replace(/^[^0-9]*/, '');
    const parts = vulnerableRange.split(',').map(p => p.trim());

    for (const part of parts) {
      const match = part.match(/([<>=]+)\s*([0-9.]+)/);
      if (match) {
        const [, operator, targetVersion] = match;
        const comparison = compareVersions(cleanVersion, targetVersion);

        if (operator === '<' && comparison >= 0) return false;
        if (operator === '<=' && comparison > 0) return false;
        if (operator === '>' && comparison <= 0) return false;
        if (operator === '>=' && comparison < 0) return false;
        if (operator === '=' && comparison !== 0) return false;
      }
    }

    return true;
  } catch {
    return true; // Assume affected if we can't parse
  }
}

/**
 * Simple version comparison.
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(n => parseInt(n, 10) || 0);
  const partsB = b.split('.').map(n => parseInt(n, 10) || 0);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }

  return 0;
}

// ============================================================
// EOL CHECKS
// ============================================================

/**
 * Check dependencies against known EOL list.
 */
function checkEOL(dependencies: DependencyInfo[]): EOLInfo[] {
  const eolAlerts: EOLInfo[] = [];

  for (const dep of dependencies) {
    // Check exact package name
    if (KNOWN_EOL[dep.name]) {
      eolAlerts.push(KNOWN_EOL[dep.name]);
    }

    // Check versioned entries (e.g., core-js@2)
    const versionedKey = `${dep.name}@${dep.currentVersion.split('.')[0]}`;
    if (KNOWN_EOL[versionedKey]) {
      eolAlerts.push(KNOWN_EOL[versionedKey]);
    }
  }

  return eolAlerts;
}

// ============================================================
// ALERT GENERATION
// ============================================================

/**
 * Map severity to priority.
 */
function severityToPriority(severity: string): RecommendationPriority {
  switch (severity.toLowerCase()) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
      return 'low';
    default:
      return 'info';
  }
}

/**
 * Generate alert from major version update.
 */
function createMajorVersionAlert(
  projectId: string,
  result: VersionCheckResult
): BreakingChangeAlert {
  return {
    id: randomUUID(),
    ifxTraceId: generateTraceId('BCA'),
    projectId,
    generatedAt: new Date().toISOString(),
    type: 'breaking_change_alert',
    alertType: 'major_version',
    subject: {
      name: result.dependency.name,
      currentVersion: result.dependency.currentVersion,
      newVersion: result.latestVersion!,
      url: `https://www.npmjs.com/package/${result.dependency.name}`,
    },
    severity: 'high',
    technicalSummary: `Major version update available: ${result.dependency.name} ${result.dependency.currentVersion} → ${result.latestVersion}. Major versions typically include breaking changes that require code modifications.`,
    humanSummary: `Una nuova versione importante di ${result.dependency.name} è disponibile. L'aggiornamento potrebbe richiedere modifiche al codice.`,
    actionRequired: `1. Review changelog at https://www.npmjs.com/package/${result.dependency.name}\n2. Check for breaking changes\n3. Update in a separate branch\n4. Run full test suite`,
  };
}

/**
 * Generate alert from deprecation.
 */
function createDeprecationAlert(
  projectId: string,
  result: VersionCheckResult
): BreakingChangeAlert {
  return {
    id: randomUUID(),
    ifxTraceId: generateTraceId('BCA'),
    projectId,
    generatedAt: new Date().toISOString(),
    type: 'breaking_change_alert',
    alertType: 'deprecation_notice',
    subject: {
      name: result.dependency.name,
      currentVersion: result.dependency.currentVersion,
      newVersion: result.latestVersion || 'N/A',
      url: `https://www.npmjs.com/package/${result.dependency.name}`,
    },
    severity: 'high',
    technicalSummary: `Package deprecated: ${result.dependency.name}. ${result.deprecationMessage || 'No replacement specified.'}`,
    humanSummary: `Il pacchetto ${result.dependency.name} è stato deprecato e non riceverà più aggiornamenti di sicurezza. È necessario pianificare una migrazione.`,
    actionRequired: `1. Identify replacement package\n2. Plan migration timeline\n3. Update affected code`,
  };
}

/**
 * Generate alert from security advisory.
 */
function createSecurityAlert(
  projectId: string,
  dependency: DependencyInfo,
  advisory: SecurityAdvisory
): BreakingChangeAlert {
  const patchedVersion = advisory.patchedVersions[0] || 'unknown';

  return {
    id: randomUUID(),
    ifxTraceId: generateTraceId('BCA'),
    projectId,
    generatedAt: new Date().toISOString(),
    type: 'breaking_change_alert',
    alertType: 'security_advisory',
    subject: {
      name: dependency.name,
      currentVersion: dependency.currentVersion,
      newVersion: patchedVersion,
      url: advisory.url,
    },
    severity: severityToPriority(advisory.severity),
    technicalSummary: `Security vulnerability ${advisory.id}: ${advisory.title}. Affected versions: ${advisory.vulnerableVersionRange}. Patched in: ${patchedVersion}.`,
    humanSummary: `Vulnerabilità di sicurezza rilevata in ${dependency.name}: ${advisory.title}. Severità: ${advisory.severity}. Aggiornamento urgente consigliato.`,
    actionRequired: `1. Update ${dependency.name} to version ${patchedVersion} or later\n2. Review advisory: ${advisory.url}\n3. Check for exploitation attempts in logs`,
  };
}

/**
 * Generate alert from EOL.
 */
function createEOLAlert(
  projectId: string,
  dependency: DependencyInfo,
  eol: EOLInfo
): BreakingChangeAlert {
  return {
    id: randomUUID(),
    ifxTraceId: generateTraceId('BCA'),
    projectId,
    generatedAt: new Date().toISOString(),
    type: 'breaking_change_alert',
    alertType: 'eol_announcement',
    subject: {
      name: dependency.name,
      currentVersion: dependency.currentVersion,
      newVersion: 'EOL',
      url: eol.url,
    },
    severity: 'high',
    technicalSummary: `End of Life: ${eol.package} reached EOL on ${eol.eolDate}. ${eol.message}`,
    humanSummary: `Il pacchetto ${eol.package} non è più supportato (fine vita: ${eol.eolDate}). Non riceverà aggiornamenti di sicurezza.`,
    actionRequired: `1. ${eol.message}\n2. Plan migration before security issues arise\n3. ${eol.url ? `See: ${eol.url}` : 'Research alternatives'}`,
  };
}

// ============================================================
// MAIN DETECTION FUNCTION
// ============================================================

/**
 * Extract dependencies from project profile.
 */
export function extractDependencies(profile: ProjectProfile): DependencyInfo[] {
  const dependencies: DependencyInfo[] = [];

  // Extract from keyDependencies
  for (const dep of profile.stack.keyDependencies) {
    if (dep.version) {
      dependencies.push({
        name: dep.name,
        currentVersion: dep.version,
        ecosystem: (dep.ecosystem as DependencyInfo['ecosystem']) || 'npm',
      });
    }
  }

  // Extract from allDependencies.npm
  const npmDeps = profile.stack.allDependencies?.npm || {};
  if (typeof npmDeps === 'object') {
    for (const [name, version] of Object.entries(npmDeps)) {
      if (typeof version === 'string' && !dependencies.some(d => d.name === name)) {
        dependencies.push({
          name,
          currentVersion: version.replace(/^[\^~]/, ''),
          ecosystem: 'npm',
        });
      }
    }
  }

  // Extract from allDependencies.pip
  const pipDeps = profile.stack.allDependencies?.pip || {};
  if (typeof pipDeps === 'object') {
    for (const [name, version] of Object.entries(pipDeps)) {
      if (typeof version === 'string') {
        dependencies.push({
          name,
          currentVersion: version.replace(/^[=<>~!]+/, ''),
          ecosystem: 'pip',
        });
      }
    }
  }

  return dependencies;
}

/**
 * Run full breaking change detection for a project.
 *
 * This function:
 * 1. Checks npm registry for major updates and deprecations
 * 2. Checks GitHub Advisory Database for CVEs
 * 3. Checks against known EOL packages
 *
 * Returns alerts that should BYPASS stability gate and be delivered immediately.
 */
export async function detectBreakingChanges(
  profile: ProjectProfile,
  options: {
    checkMajorVersions?: boolean;
    checkSecurityAdvisories?: boolean;
    checkEOL?: boolean;
    maxDependencies?: number;
  } = {}
): Promise<BreakingChangeCheckResult> {
  const {
    checkMajorVersions = true,
    checkSecurityAdvisories = true,
    checkEOL: checkEOLFlag = true,
    maxDependencies = 50,
  } = options;

  const projectId = profile.project.id;
  const alerts: BreakingChangeAlert[] = [];
  const errors: string[] = [];
  const checked = {
    dependencies: 0,
    advisories: 0,
    eolChecks: 0,
  };

  logger.info('Starting breaking change detection', { projectId });

  // Extract dependencies from profile
  const allDependencies = extractDependencies(profile);
  const dependencies = allDependencies.slice(0, maxDependencies);

  logger.info('Dependencies extracted', {
    total: allDependencies.length,
    checking: dependencies.length,
  });

  checked.dependencies = dependencies.length;

  // 1. Check npm for major versions and deprecations
  if (checkMajorVersions) {
    try {
      const versionResults = await checkNpmDependencies(dependencies);

      for (const result of versionResults) {
        if (result.isMajorUpdate) {
          alerts.push(createMajorVersionAlert(projectId, result));
        }

        if (result.isDeprecated) {
          alerts.push(createDeprecationAlert(projectId, result));
        }
      }

      logger.info('Version check completed', {
        checked: versionResults.length,
        majorUpdates: versionResults.filter(r => r.isMajorUpdate).length,
        deprecated: versionResults.filter(r => r.isDeprecated).length,
      });
    } catch (error) {
      const msg = `Version check failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(msg);
      logger.error(msg);
    }
  }

  // 2. Check GitHub advisories for CVEs
  if (checkSecurityAdvisories) {
    try {
      for (const dep of dependencies) {
        const advisories = await fetchGitHubAdvisories(dep.ecosystem, dep.name);
        checked.advisories += advisories.length;

        for (const advisory of advisories) {
          if (isVersionAffected(dep.currentVersion, advisory.vulnerableVersionRange)) {
            alerts.push(createSecurityAlert(projectId, dep, advisory));
          }
        }
      }

      logger.info('Security advisory check completed', {
        advisoriesChecked: checked.advisories,
        alertsGenerated: alerts.filter(a => a.alertType === 'security_advisory').length,
      });
    } catch (error) {
      const msg = `Advisory check failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(msg);
      logger.error(msg);
    }
  }

  // 3. Check EOL
  if (checkEOLFlag) {
    try {
      const eolResults = checkEOL(dependencies);
      checked.eolChecks = dependencies.length;

      for (const eol of eolResults) {
        const dep = dependencies.find(d => d.name === eol.package);
        if (dep) {
          alerts.push(createEOLAlert(projectId, dep, eol));
        }
      }

      logger.info('EOL check completed', {
        eolFound: eolResults.length,
      });
    } catch (error) {
      const msg = `EOL check failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(msg);
      logger.error(msg);
    }
  }

  // Deduplicate alerts by package name and alert type
  const uniqueAlerts = deduplicateAlerts(alerts);

  logger.info('Breaking change detection completed', {
    projectId,
    totalAlerts: uniqueAlerts.length,
    byType: {
      major_version: uniqueAlerts.filter(a => a.alertType === 'major_version').length,
      deprecation_notice: uniqueAlerts.filter(a => a.alertType === 'deprecation_notice').length,
      security_advisory: uniqueAlerts.filter(a => a.alertType === 'security_advisory').length,
      eol_announcement: uniqueAlerts.filter(a => a.alertType === 'eol_announcement').length,
    },
    errors: errors.length,
  });

  return {
    alerts: uniqueAlerts,
    checked,
    errors,
  };
}

/**
 * Deduplicate alerts by package name and type.
 * Keeps the most severe alert for each combination.
 */
function deduplicateAlerts(alerts: BreakingChangeAlert[]): BreakingChangeAlert[] {
  const severityOrder: Record<RecommendationPriority, number> = {
    critical: 5,
    high: 4,
    medium: 3,
    low: 2,
    info: 1,
  };

  const byKey = new Map<string, BreakingChangeAlert>();

  for (const alert of alerts) {
    const key = `${alert.subject.name}:${alert.alertType}`;
    const existing = byKey.get(key);

    if (!existing || severityOrder[alert.severity] > severityOrder[existing.severity]) {
      byKey.set(key, alert);
    }
  }

  return Array.from(byKey.values());
}

/**
 * Format alerts for immediate delivery.
 */
export function formatAlertsForDelivery(alerts: BreakingChangeAlert[]): {
  critical: BreakingChangeAlert[];
  high: BreakingChangeAlert[];
  other: BreakingChangeAlert[];
} {
  return {
    critical: alerts.filter(a => a.severity === 'critical'),
    high: alerts.filter(a => a.severity === 'high'),
    other: alerts.filter(a => a.severity !== 'critical' && a.severity !== 'high'),
  };
}

/**
 * Render alerts as markdown for notification.
 */
export function renderAlertsMarkdown(alerts: BreakingChangeAlert[]): string {
  if (alerts.length === 0) {
    return 'No breaking changes detected.';
  }

  const lines: string[] = [];

  lines.push('# Breaking Change Alerts');
  lines.push('');
  lines.push(`**${alerts.length} alert(s) detected** - These require immediate attention.`);
  lines.push('');

  const grouped = formatAlertsForDelivery(alerts);

  if (grouped.critical.length > 0) {
    lines.push('## Critical');
    lines.push('');
    for (const alert of grouped.critical) {
      lines.push(renderSingleAlert(alert));
    }
  }

  if (grouped.high.length > 0) {
    lines.push('## High Priority');
    lines.push('');
    for (const alert of grouped.high) {
      lines.push(renderSingleAlert(alert));
    }
  }

  if (grouped.other.length > 0) {
    lines.push('## Other');
    lines.push('');
    for (const alert of grouped.other) {
      lines.push(renderSingleAlert(alert));
    }
  }

  return lines.join('\n');
}

function renderSingleAlert(alert: BreakingChangeAlert): string {
  const typeEmoji: Record<BreakingChangeAlertType, string> = {
    major_version: '📦',
    deprecation_notice: '⚠️',
    security_advisory: '🔒',
    eol_announcement: '💀',
  };

  const lines: string[] = [];

  lines.push(`### ${typeEmoji[alert.alertType]} ${alert.subject.name}`);
  lines.push('');
  lines.push(`**Type:** ${alert.alertType.replace(/_/g, ' ')}`);
  lines.push(`**Version:** ${alert.subject.currentVersion} → ${alert.subject.newVersion}`);
  lines.push(`**Severity:** ${alert.severity}`);
  lines.push('');
  lines.push(alert.technicalSummary);
  lines.push('');
  lines.push('**Action Required:**');
  lines.push('```');
  lines.push(alert.actionRequired);
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}
