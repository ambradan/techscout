/**
 * TechScout — Profile Normalizer
 *
 * Takes output from any provider (GitHub, GitLab, local upload, etc.)
 * and produces a normalized ProjectProfile conforming to the schema.
 *
 * This is the single source of truth for profile structure.
 */

import type {
  PartialProjectProfile,
  ProjectProfile,
  ProjectStack,
  LanguageInfo,
  FrameworkInfo,
  KeyDependency,
  AllDependencies,
  StackHealth,
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
        result[ecosystem] = { ...deps };
      } else {
        // Merge - take max counts
        result[ecosystem] = {
          direct: Math.max(existing.direct, deps.direct),
          dev: Math.max(existing.dev, deps.dev),
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
      mode: 'assisted',
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

  // Merge stack from all partials
  const stack = mergeStack(partials);

  // Build data sources used for governance
  const dataSourcesUsed = partials.map(p => ({
    source: `${p.source}_api`,
    reliability: 'high' as const,
    lastFetched: p.fetchedAt,
  }));

  // Build profile
  const profile: ProjectProfile = {
    project,
    team: existingTeam ?? [],
    scouting: getDefaultScoutingConfig(),
    sources: existingSources ?? [],
    stack,
    stackHealth: getDefaultStackHealth(),
    manifest: existingManifest
      ? { ...getDefaultManifest(), ...existingManifest }
      : getDefaultManifest(),
    cfFindings: getDefaultCFFindings(),
    costTracking: getDefaultCostTracking(),
    governance: {
      ...getDefaultGovernance(),
      dataSourcesUsed,
    },
  };

  // Calculate completeness
  profile.governance.profileCompletenessScore = calculateProfileCompleteness(profile);
  profile.governance.lastProfileValidation = new Date().toISOString();

  return profile;
}

/**
 * Update an existing profile with new partial data.
 */
export function updateProfileWithPartials(
  existingProfile: ProjectProfile,
  newPartials: PartialProjectProfile[]
): ProjectProfile {
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

  // Update data sources
  const newDataSources = newPartials.map(p => ({
    source: `${p.source}_api`,
    reliability: 'high' as const,
    lastFetched: p.fetchedAt,
  }));

  const updatedProfile: ProjectProfile = {
    ...existingProfile,
    stack: mergedStack,
    governance: {
      ...existingProfile.governance,
      dataSourcesUsed: [
        ...existingProfile.governance.dataSourcesUsed,
        ...newDataSources,
      ],
      lastProfileValidation: new Date().toISOString(),
    },
  };

  // Recalculate completeness
  updatedProfile.governance.profileCompletenessScore = calculateProfileCompleteness(updatedProfile);

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

  if (profile.manifest.objectives.length === 0) {
    warnings.push('No objectives defined. This helps with matching relevance.');
  }

  if (profile.manifest.painPoints.length === 0) {
    warnings.push('No pain points defined. Recommendations may be less targeted.');
  }

  if (profile.governance.profileCompletenessScore < 0.5) {
    warnings.push(`Profile completeness is low (${profile.governance.profileCompletenessScore}). Consider adding more details.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
