/**
 * TechScout — Profile Normalizer
 *
 * Takes output from any provider (GitHub, GitLab, local upload, etc.)
 * and produces a normalized ProjectProfile conforming to the schema.
 *
 * This is the single source of truth for profile structure.
 */

import { logger } from '../lib/logger';
import type {
  PartialProjectProfile,
  ProjectProfile,
  ProjectStack,
  LanguageInfo,
  FrameworkInfo,
  KeyDependency,
  AllDependencies,
  StackHealth,
  StackHealthComponents,
  HealthComponentScore,
  ProjectManifest,
  CFFindings,
  CostTracking,
  Project,
  TeamMember,
  ScoutingConfig,
  ProjectSource,
  IFXGovernance,
} from '../types';

// ============================================================
// STACK MERGING
// ============================================================

/**
 * Merge languages from multiple providers, deduplicating and recalculating percentages.
 */
function mergeLanguages(partials: PartialProjectProfile[]): LanguageInfo[] {
  const languageMap = new Map<string, { percentage: number; sources: number }>();

  for (const partial of partials) {
    if (!partial.stack?.languages) continue;

    for (const lang of partial.stack.languages) {
      const existing = languageMap.get(lang.name);
      if (existing) {
        existing.percentage = Math.max(existing.percentage, lang.percentage);
        existing.sources += 1;
      } else {
        languageMap.set(lang.name, { percentage: lang.percentage, sources: 1 });
      }
    }
  }

  // Convert to array and sort by percentage
  const languages = Array.from(languageMap.entries())
    .map(([name, data]) => ({
      name,
      percentage: data.percentage,
      role: 'primary' as const, // Will be reassigned below
    }))
    .sort((a, b) => b.percentage - a.percentage);

  // Assign roles based on position
  return languages.map((lang, index) => ({
    ...lang,
    role: index === 0 ? 'primary' :
          index === 1 ? 'secondary' :
          lang.percentage < 5 ? 'scripting' : 'config',
  })) as LanguageInfo[];
}

/**
 * Merge frameworks from multiple providers, deduplicating.
 */
function mergeFrameworks(partials: PartialProjectProfile[]): FrameworkInfo[] {
  const frameworkMap = new Map<string, FrameworkInfo>();

  for (const partial of partials) {
    if (!partial.stack?.frameworks) continue;

    for (const framework of partial.stack.frameworks) {
      const key = framework.name.toLowerCase();
      const existing = frameworkMap.get(key);

      if (!existing) {
        frameworkMap.set(key, framework);
      } else if (framework.version && framework.version !== 'unknown') {
        // Prefer the version with actual version info
        frameworkMap.set(key, {
          ...existing,
          version: framework.version,
        });
      }
    }
  }

  return Array.from(frameworkMap.values());
}

/**
 * Merge key dependencies from multiple providers.
 */
function mergeKeyDependencies(partials: PartialProjectProfile[]): KeyDependency[] {
  const depMap = new Map<string, KeyDependency>();

  for (const partial of partials) {
    if (!partial.stack?.keyDependencies) continue;

    for (const dep of partial.stack.keyDependencies) {
      const key = `${dep.ecosystem}:${dep.name}`;
      const existing = depMap.get(key);

      if (!existing) {
        depMap.set(key, dep);
      } else if (dep.version && dep.version !== 'unknown') {
        depMap.set(key, { ...existing, version: dep.version });
      }
    }
  }

  return Array.from(depMap.values());
}

/**
 * Helper to get count from a field that can be number or string array.
 */
function getCount(value: number | string[] | undefined): number {
  if (value === undefined) return 0;
  if (typeof value === 'number') return value;
  return value.length;
}

/**
 * Merge all dependencies summary.
 */
function mergeAllDependencies(partials: PartialProjectProfile[]): AllDependencies {
  const result: AllDependencies = {};

  for (const partial of partials) {
    if (!partial.stack?.allDependencies) continue;

    for (const [ecosystem, deps] of Object.entries(partial.stack.allDependencies)) {
      if (!deps) continue;

      const existing = result[ecosystem];
      if (!existing) {
        result[ecosystem] = {
          direct: getCount(deps.direct),
          dev: getCount(deps.dev),
          packages: deps.packages ?? [],
        };
      } else {
        // Merge - take max counts
        result[ecosystem] = {
          direct: Math.max(getCount(existing.direct), getCount(deps.direct)),
          dev: Math.max(getCount(existing.dev), getCount(deps.dev)),
          packages: [...new Set([...(existing.packages ?? []), ...(deps.packages ?? [])])],
        };
      }
    }
  }

  return result;
}

/**
 * Merge complete stack from multiple partials.
 */
function mergeStack(partials: PartialProjectProfile[]): ProjectStack {
  return {
    languages: mergeLanguages(partials),
    frameworks: mergeFrameworks(partials),
    databases: [], // Will be populated from infrastructure detection or user input
    infrastructure: {
      hosting: [],
      ciCd: [],
    },
    keyDependencies: mergeKeyDependencies(partials),
    allDependencies: mergeAllDependencies(partials),
  };
}

// ============================================================
// STACK HEALTH CALCULATION
// ============================================================

/**
 * Known latest major versions for common packages.
 * Used to estimate dependency freshness.
 */
const KNOWN_LATEST_MAJORS: Record<string, number> = {
  // Node.js ecosystem
  'react': 19,
  'next': 15,
  'vue': 3,
  'nuxt': 3,
  'angular': 19,
  'svelte': 5,
  'express': 4,
  'fastify': 5,
  'nestjs': 10,
  '@nestjs/core': 10,
  'typescript': 5,
  'vite': 6,
  'vitest': 3,
  'jest': 30,
  'zod': 3,
  'prisma': 6,
  '@prisma/client': 6,
  'drizzle-orm': 0, // Still 0.x
  'tailwindcss': 4,
  // Python ecosystem
  'django': 5,
  'flask': 3,
  'fastapi': 0, // Still 0.x
  'pytest': 8,
  // Rust ecosystem
  'tokio': 1,
  'actix-web': 4,
  'axum': 0, // Still 0.x
};

/**
 * Parse a version string to extract major version.
 */
function parseMajorVersion(version: string): number | null {
  if (!version || version === 'unknown') return null;
  const match = version.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Calculate dependency freshness score based on version analysis.
 * Returns a score from 0 to 1.
 */
function calculateDependencyFreshness(
  keyDependencies: KeyDependency[],
  allDependencies: AllDependencies
): HealthComponentScore {
  const factors: string[] = [];
  let freshnessScores: number[] = [];

  // Analyze key dependencies
  for (const dep of keyDependencies) {
    const latestMajor = KNOWN_LATEST_MAJORS[dep.name];
    if (latestMajor !== undefined) {
      const currentMajor = parseMajorVersion(dep.version);
      if (currentMajor !== null) {
        if (currentMajor >= latestMajor) {
          freshnessScores.push(1.0);
          factors.push(`${dep.name}@${dep.version} is current`);
        } else if (currentMajor >= latestMajor - 1) {
          freshnessScores.push(0.7);
          factors.push(`${dep.name}@${dep.version} is 1 major behind`);
        } else if (currentMajor >= latestMajor - 2) {
          freshnessScores.push(0.4);
          factors.push(`${dep.name}@${dep.version} is 2 majors behind`);
        } else {
          freshnessScores.push(0.2);
          factors.push(`${dep.name}@${dep.version} is significantly outdated`);
        }
      }
    }
  }

  // Calculate total dependency count
  let totalDeps = 0;
  for (const eco of Object.values(allDependencies)) {
    if (eco) {
      totalDeps += getCount(eco.direct) + getCount(eco.dev);
    }
  }

  // Factor in dependency count (more deps = higher maintenance burden)
  if (totalDeps > 100) {
    freshnessScores.push(0.5);
    factors.push(`High dependency count (${totalDeps})`);
  } else if (totalDeps > 50) {
    freshnessScores.push(0.7);
    factors.push(`Moderate dependency count (${totalDeps})`);
  } else if (totalDeps > 0) {
    freshnessScores.push(0.9);
    factors.push(`Reasonable dependency count (${totalDeps})`);
  }

  // Calculate average score
  const score = freshnessScores.length > 0
    ? freshnessScores.reduce((a, b) => a + b, 0) / freshnessScores.length
    : 0.5;

  if (factors.length === 0) {
    factors.push('Insufficient version data for analysis');
  }

  return {
    score: Math.round(score * 100) / 100,
    factors: factors.slice(0, 5), // Limit to top 5 factors
  };
}

/**
 * Calculate security score based on known patterns.
 */
function calculateSecurityScore(
  keyDependencies: KeyDependency[],
  frameworks: FrameworkInfo[]
): HealthComponentScore {
  const factors: string[] = [];
  let score = 0.7; // Start with moderate score

  // Check for auth libraries
  const hasAuth = keyDependencies.some(d =>
    ['better-auth', 'next-auth', '@auth/core', 'passport', 'jsonwebtoken'].includes(d.name)
  );
  if (hasAuth) {
    score += 0.1;
    factors.push('Authentication library detected');
  }

  // Check for validation libraries
  const hasValidation = keyDependencies.some(d =>
    ['zod', 'yup', 'joi', 'class-validator'].includes(d.name)
  );
  if (hasValidation) {
    score += 0.1;
    factors.push('Input validation library detected');
  }

  // Check for known secure frameworks
  const secureFrameworks = ['Next.js', 'NestJS', 'FastAPI', 'Django'];
  const hasSecureFramework = frameworks.some(f =>
    secureFrameworks.includes(f.name)
  );
  if (hasSecureFramework) {
    score += 0.05;
    factors.push('Framework with built-in security features');
  }

  if (factors.length === 0) {
    factors.push('Initial security assessment pending');
  }

  return {
    score: Math.min(1, Math.round(score * 100) / 100),
    factors,
  };
}

/**
 * Calculate maintenance risk score.
 */
function calculateMaintenanceRisk(
  allDependencies: AllDependencies,
  keyDependencies: KeyDependency[]
): HealthComponentScore {
  const factors: string[] = [];
  let score = 0.7;

  // Check ecosystem diversity
  const ecosystems = Object.keys(allDependencies).filter(k => allDependencies[k]);
  if (ecosystems.length > 3) {
    score -= 0.1;
    factors.push(`Multiple ecosystems (${ecosystems.join(', ')})`);
  } else if (ecosystems.length === 1) {
    score += 0.1;
    factors.push('Single ecosystem reduces maintenance overhead');
  }

  // Check for ORMs (can be maintenance burden)
  const hasOrm = keyDependencies.some(d => d.category === 'orm');
  if (hasOrm) {
    factors.push('ORM detected - migrations require attention');
  }

  // Check key dependency count
  if (keyDependencies.length > 10) {
    score -= 0.1;
    factors.push('Many key dependencies to maintain');
  }

  if (factors.length === 0) {
    factors.push('Maintenance assessment pending');
  }

  return {
    score: Math.max(0, Math.min(1, Math.round(score * 100) / 100)),
    factors,
  };
}

/**
 * Calculate complexity score.
 */
function calculateComplexityScore(
  languages: LanguageInfo[],
  frameworks: FrameworkInfo[],
  allDependencies: AllDependencies
): HealthComponentScore {
  const factors: string[] = [];
  let score = 0.8;

  // Language complexity
  if (languages.length > 3) {
    score -= 0.1;
    factors.push(`Multiple languages (${languages.map(l => l.name).join(', ')})`);
  }

  // Framework count
  if (frameworks.length > 5) {
    score -= 0.15;
    factors.push('Many frameworks increase complexity');
  } else if (frameworks.length <= 2) {
    score += 0.05;
    factors.push('Focused framework selection');
  }

  // Check for both frontend and backend frameworks
  const hasFrontend = frameworks.some(f => f.category === 'frontend');
  const hasBackend = frameworks.some(f => f.category === 'backend');
  if (hasFrontend && hasBackend) {
    factors.push('Full-stack application');
  }

  if (factors.length === 0) {
    factors.push('Complexity assessment pending');
  }

  return {
    score: Math.max(0, Math.min(1, Math.round(score * 100) / 100)),
    factors,
  };
}

/**
 * Calculate initial stack health based on dependency analysis.
 */
function calculateStackHealth(stack: ProjectStack): StackHealth {
  logger.debug('Calculating stack health');

  const freshness = calculateDependencyFreshness(
    stack.keyDependencies,
    stack.allDependencies
  );

  const security = calculateSecurityScore(
    stack.keyDependencies,
    stack.frameworks
  );

  const maintenanceRisk = calculateMaintenanceRisk(
    stack.allDependencies,
    stack.keyDependencies
  );

  const complexity = calculateComplexityScore(
    stack.languages,
    stack.frameworks,
    stack.allDependencies
  );

  const components: StackHealthComponents = {
    security,
    freshness,
    maintenanceRisk,
    complexity,
  };

  // Calculate overall score as weighted average
  const weights = {
    security: 0.3,
    freshness: 0.3,
    maintenanceRisk: 0.2,
    complexity: 0.2,
  };

  const overallScore =
    security.score * weights.security +
    freshness.score * weights.freshness +
    maintenanceRisk.score * weights.maintenanceRisk +
    complexity.score * weights.complexity;

  logger.info('Stack health calculated', {
    overall: Math.round(overallScore * 100) / 100,
    security: security.score,
    freshness: freshness.score,
    maintenanceRisk: maintenanceRisk.score,
    complexity: complexity.score,
  });

  return {
    overallScore: Math.round(overallScore * 100) / 100,
    lastCalculated: new Date().toISOString(),
    components,
  };
}

// ============================================================
// DEFAULT VALUES
// ============================================================

function getDefaultStackHealth(): StackHealth {
  return {
    overallScore: 0.5,
    lastCalculated: new Date().toISOString(),
    components: {
      security: { score: 0.5, factors: ['Initial assessment pending'] },
      freshness: { score: 0.5, factors: ['Initial assessment pending'] },
      maintenanceRisk: { score: 0.5, factors: ['Initial assessment pending'] },
      complexity: { score: 0.5, factors: ['Initial assessment pending'] },
    },
  };
}

function getDefaultManifest(): ProjectManifest {
  return {
    phase: 'growth',
    description: '',
    objectives: [],
    painPoints: [],
    constraints: [],
    openTo: [],
    notOpenTo: [],
  };
}

function getDefaultCFFindings(): CFFindings {
  return {
    lastScan: '',
    scanVersion: '',
    summary: {
      totalFindings: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    },
    findings: [],
  };
}

function getDefaultCostTracking(): CostTracking {
  return {
    adoptions: [],
    calibration: {
      totalAdoptions: 0,
      avgEstimateAccuracy: 1.0,
      biasDirection: 'balanced',
    },
  };
}

function getDefaultScoutingConfig(): ScoutingConfig {
  return {
    enabled: true,
    frequency: 'weekly',
    maxRecommendations: 5,
    focusAreas: [],
    excludeCategories: [],
    notificationChannels: [],
    breakingChanges: {
      enabled: true,
      alertOn: ['major_version', 'deprecation_notice', 'security_advisory', 'eol_announcement'],
      delivery: 'immediate',
      channels: [],
    },
    export: {
      enabled: true,
      format: ['pdf', 'json'],
      frequency: 'after_each_brief',
      storage: 'supabase_storage',
      retentionDays: 365,
    },
    agent: {
      enabled: false,
      gitProvider: 'github',
      baseBranch: 'main',
      branchPrefix: 'techscout/migrate',
      safety: {
        maxFilesModified: 15,
        maxLinesChanged: 500,
        maxExecutionTimeMinutes: 30,
        complexityThreshold: 2.0,
        requireTestsPass: true,
      },
    },
  };
}

function getDefaultGovernance(): IFXGovernance {
  return {
    ifxVersion: '1.0',
    kqrVersion: '1.0',
    profileCompletenessScore: 0,
    dataSourcesUsed: [],
  };
}

// ============================================================
// PROFILE COMPLETENESS CALCULATION
// ============================================================

function calculateProfileCompleteness(profile: Partial<ProjectProfile>): number {
  let score = 0;
  let maxScore = 0;

  // Project identity (required)
  maxScore += 10;
  if (profile.project?.name) score += 5;
  if (profile.project?.slug) score += 5;

  // Stack (important)
  maxScore += 30;
  if (profile.stack?.languages && profile.stack.languages.length > 0) score += 10;
  if (profile.stack?.frameworks && profile.stack.frameworks.length > 0) score += 10;
  if (profile.stack?.keyDependencies && profile.stack.keyDependencies.length > 0) score += 10;

  // Manifest (important for matching)
  maxScore += 30;
  if (profile.manifest?.description && profile.manifest.description.length > 20) score += 6;
  if (profile.manifest?.objectives && profile.manifest.objectives.length > 0) score += 6;
  if (profile.manifest?.painPoints && profile.manifest.painPoints.length > 0) score += 6;
  if (profile.manifest?.constraints && profile.manifest.constraints.length > 0) score += 6;
  if (profile.manifest?.openTo && profile.manifest.openTo.length > 0) score += 6;

  // Sources (helpful)
  maxScore += 15;
  if (profile.sources && profile.sources.length > 0) score += 15;

  // Team (optional but useful)
  maxScore += 10;
  if (profile.team && profile.team.length > 0) score += 10;

  // CF Findings (if scanned)
  maxScore += 5;
  if (profile.cfFindings?.findings && profile.cfFindings.findings.length > 0) score += 5;

  return Math.round((score / maxScore) * 100) / 100;
}

// ============================================================
// MAIN NORMALIZER
// ============================================================

export interface NormalizeProfileInput {
  project: Project;
  partials: PartialProjectProfile[];
  existingManifest?: Partial<ProjectManifest>;
  existingTeam?: TeamMember[];
  existingSources?: ProjectSource[];
}

/**
 * Normalize and merge partial profiles from multiple providers
 * into a complete ProjectProfile.
 */
export function normalizeProfile(input: NormalizeProfileInput): ProjectProfile {
  const { project, partials, existingManifest, existingTeam, existingSources } = input;
  logger.info('Normalizing profile', { projectId: project.id, partialsCount: partials.length });

  // Merge stack from all partials
  const stack = mergeStack(partials);

  // Calculate stack health based on dependency freshness
  const stackHealth = calculateStackHealth(stack);

  // Build data sources used for governance
  const dataSourcesUsed = partials.map(p => ({
    source: `${p.source}_api`,
    reliability: 'high' as const,
    lastFetched: p.fetchedAt,
  }));

  // Build governance with completeness
  const governance: IFXGovernance = {
    ...getDefaultGovernance(),
    dataSourcesUsed,
    lastProfileValidation: new Date().toISOString(),
    profileCompletenessScore: 0, // Will be calculated after profile is built
  };

  // Build profile
  const profile: ProjectProfile = {
    project,
    team: existingTeam ?? [],
    scouting: getDefaultScoutingConfig(),
    sources: existingSources ?? [],
    stack,
    stackHealth,
    manifest: existingManifest
      ? { ...getDefaultManifest(), ...existingManifest }
      : getDefaultManifest(),
    cfFindings: getDefaultCFFindings(),
    costTracking: getDefaultCostTracking(),
    governance,
  };

  // Calculate completeness and update governance
  governance.profileCompletenessScore = calculateProfileCompleteness(profile);

  logger.info('Profile normalized', {
    projectId: project.id,
    completeness: governance.profileCompletenessScore,
    healthScore: stackHealth.overallScore,
  });

  return profile;
}

/**
 * Update an existing profile with new partial data.
 */
export function updateProfileWithPartials(
  existingProfile: ProjectProfile,
  newPartials: PartialProjectProfile[]
): ProjectProfile {
  logger.info('Updating profile with new partials', {
    projectId: existingProfile.project.id,
    newPartialsCount: newPartials.length,
  });

  // Merge new stack data with existing
  const combinedPartials: PartialProjectProfile[] = [
    // Create a pseudo-partial from existing profile
    {
      source: 'github' as const,
      fetchedAt: existingProfile.project.updatedAt,
      stack: existingProfile.stack,
    },
    ...newPartials,
  ];

  const mergedStack = mergeStack(combinedPartials);

  // Recalculate stack health with new data
  const stackHealth = calculateStackHealth(mergedStack);

  // Update data sources
  const newDataSources = newPartials.map(p => ({
    source: `${p.source}_api`,
    reliability: 'high' as const,
    lastFetched: p.fetchedAt,
  }));

  const existingDataSources = existingProfile.governance?.dataSourcesUsed ?? [];

  // Build new governance object
  const governance: IFXGovernance = {
    ifxVersion: existingProfile.governance?.ifxVersion ?? '1.0',
    kqrVersion: existingProfile.governance?.kqrVersion ?? '1.0',
    profileCompletenessScore: 0, // Will be calculated
    dataSourcesUsed: [...existingDataSources, ...newDataSources],
    lastProfileValidation: new Date().toISOString(),
  };

  const updatedProfile: ProjectProfile = {
    ...existingProfile,
    stack: mergedStack,
    stackHealth,
    governance,
  };

  // Recalculate completeness
  governance.profileCompletenessScore = calculateProfileCompleteness(updatedProfile);

  logger.info('Profile updated', {
    projectId: existingProfile.project.id,
    newCompleteness: governance.profileCompletenessScore,
    newHealthScore: stackHealth.overallScore,
  });

  return updatedProfile;
}

/**
 * Validate a profile against the schema requirements.
 */
export function validateProfile(profile: ProjectProfile): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!profile.project.id) errors.push('project.id is required');
  if (!profile.project.name) errors.push('project.name is required');
  if (!profile.project.ownerId) errors.push('project.ownerId is required');

  // Recommended fields
  if (profile.stack.languages.length === 0) {
    warnings.push('No languages detected. Profile may be incomplete.');
  }

  if (!profile.manifest?.objectives || profile.manifest.objectives.length === 0) {
    warnings.push('No objectives defined. This helps with matching relevance.');
  }

  if (!profile.manifest?.painPoints || profile.manifest.painPoints.length === 0) {
    warnings.push('No pain points defined. Recommendations may be less targeted.');
  }

  const completeness = profile.governance?.profileCompletenessScore ?? 0;
  if (completeness < 0.5) {
    warnings.push(`Profile completeness is low (${completeness}). Consider adding more details.`);
  }

  const result = {
    valid: errors.length === 0,
    errors,
    warnings,
  };

  logger.debug('Profile validation result', {
    projectId: profile.project.id,
    valid: result.valid,
    errorCount: errors.length,
    warningCount: warnings.length,
  });

  return result;
}

/**
 * Export calculateStackHealth for use by other modules.
 */
export { calculateStackHealth };
