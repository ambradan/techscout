/**
 * TechScout — Ranker (Layer 3, Step 5)
 *
 * Final ranking and capping of recommendations.
 * Determines priority, handles role visibility, and caps output.
 */

import type {
  Recommendation,
  RecommendationPriority,
  RecommendationAction,
  StabilityVerdict,
  StabilityAssessment,
  TechnicalOutput,
  HumanFriendlyOutput,
  RecommendationSubject,
  TeamRole,
  ProjectProfile,
  FeedItem,
} from '../types';
import { generateTraceId } from '../lib/ifx';
import { calculateConfidence } from '../lib/kqr';
import { logger } from '../lib/logger';
import type { AnalyzerOutput } from './analyzer';
import type { PreFilterMatch } from '../types';
import { randomUUID } from 'crypto';

// ============================================================
// CONFIGURATION
// ============================================================

/** Priority weights for ranking */
const PRIORITY_ORDER: Record<RecommendationPriority, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

/** Action weights for ranking (higher = more important) */
const ACTION_WEIGHTS: Record<RecommendationAction, number> = {
  REPLACE_EXISTING: 1.2,
  NEW_CAPABILITY: 1.1,
  COMPLEMENT: 1.0,
  MONITOR: 0.8,
};

/** Category to role mapping for visibility */
const CATEGORY_ROLE_MAP: Record<string, TeamRole[]> = {
  // Backend categories
  auth: ['developer_backend', 'developer_fullstack'],
  backend: ['developer_backend', 'developer_fullstack'],
  database: ['developer_backend', 'developer_fullstack'],
  api: ['developer_backend', 'developer_fullstack'],
  infra: ['developer_backend', 'developer_fullstack', 'other'],
  devops: ['developer_fullstack', 'other'],
  security: ['developer_backend', 'developer_fullstack', 'other'],

  // Frontend categories
  frontend: ['developer_frontend', 'developer_fullstack'],
  ui: ['developer_frontend', 'developer_fullstack', 'other'],
  styling: ['developer_frontend', 'developer_fullstack', 'other'],
  ux: ['developer_frontend', 'developer_fullstack', 'other'],

  // General categories (visible to all devs)
  testing: ['developer_frontend', 'developer_backend', 'developer_fullstack', 'other'],
  tooling: ['developer_frontend', 'developer_backend', 'developer_fullstack'],
  performance: ['developer_frontend', 'developer_backend', 'developer_fullstack'],
  ai: ['developer_backend', 'developer_fullstack'],
};

// ============================================================
// PRIORITY CALCULATION
// ============================================================

/**
 * Calculate recommendation priority based on multiple factors.
 */
export function calculatePriority(
  stability: StabilityAssessment,
  confidence: number,
  hasCFFindings: boolean
): RecommendationPriority {
  // Start with base priority from verdict
  let priority: RecommendationPriority;

  if (stability.verdict === 'DEFER') {
    return 'info';
  }

  if (stability.verdict === 'MONITOR') {
    return 'low';
  }

  // For RECOMMEND verdict, calculate based on factors
  const costOfNoChange = stability.costOfNoChange;

  // Critical: Security exposure is high/critical
  if (costOfNoChange.securityExposure === 'critical' ||
      (costOfNoChange.securityExposure === 'high' && hasCFFindings)) {
    return 'critical';
  }

  // High: Security exposure or compliance risk
  if (costOfNoChange.securityExposure === 'high' ||
      costOfNoChange.complianceRisk === 'high' ||
      costOfNoChange.deprecationRisk === 'high') {
    return 'high';
  }

  // Medium: Maintenance or performance concerns
  if (costOfNoChange.maintenanceRisk === 'high' ||
      costOfNoChange.performanceImpact === 'high' ||
      stability.stackHealthInfluence.painPointMatch) {
    return 'medium';
  }

  // Low confidence = lower priority
  if (confidence < 0.5) {
    return 'low';
  }

  return 'medium';
}

/**
 * Calculate final ranking score for sorting.
 */
export function calculateRankingScore(
  priority: RecommendationPriority,
  confidence: number,
  action: RecommendationAction,
  stability: StabilityAssessment
): number {
  const priorityScore = PRIORITY_ORDER[priority];
  const actionWeight = ACTION_WEIGHTS[action];

  // Base score from priority and action
  let score = priorityScore * actionWeight;

  // Boost for confidence
  score *= (0.5 + confidence * 0.5);

  // Boost for pain point match
  if (stability.stackHealthInfluence.painPointMatch) {
    score *= 1.2;
  }

  // Boost for CF finding relevance
  if (stability.costOfNoChange.securityExposure !== 'none') {
    score *= 1.1;
  }

  return score;
}

// ============================================================
// ROLE VISIBILITY
// ============================================================

/**
 * Determine which roles should see this recommendation.
 */
export function calculateRoleVisibility(
  categories: string[],
  action: RecommendationAction
): TeamRole[] {
  const roles = new Set<TeamRole>();

  // PM and stakeholders always see recommendations (via human_friendly)
  roles.add('pm');
  roles.add('stakeholder');

  // Map categories to roles
  for (const category of categories) {
    const categoryLower = category.toLowerCase();
    const mappedRoles = CATEGORY_ROLE_MAP[categoryLower];
    if (mappedRoles) {
      mappedRoles.forEach(r => roles.add(r));
    }
  }

  // If no dev roles found, default to fullstack
  const devRoles: TeamRole[] = [
    'developer_frontend',
    'developer_backend',
    'developer_fullstack',
  ];
  if (!devRoles.some(r => roles.has(r))) {
    roles.add('developer_fullstack');
  }

  return Array.from(roles);
}

// ============================================================
// RANKING AND CAPPING
// ============================================================

export interface RankerInput {
  item: FeedItem;
  profile: ProjectProfile;
  preFilterMatch: PreFilterMatch;
  analyzerOutput: AnalyzerOutput;
  stability: StabilityAssessment;
  action: RecommendationAction;
}

export interface RankedRecommendation extends Recommendation {
  rankingScore: number;
}

/**
 * Build a complete recommendation from components.
 */
export function buildRecommendation(input: RankerInput): RankedRecommendation {
  const {
    item,
    profile,
    preFilterMatch,
    analyzerOutput,
    stability,
    action,
  } = input;

  const traceId = generateTraceId('REC');

  // Calculate KQR qualification
  const kqr = calculateConfidence(
    [
      {
        source: item.sourceName,
        type: 'primary_source',
        reliability: item.sourceReliability || 'medium',
        weight: 0.3,
      },
    ],
    [
      ...analyzerOutput.technical.analysis.facts.map(f => ({
        ifxTag: f.ifxTag,
        claim: f.claim,
        source: f.source,
        sourceReliability: f.sourceReliability,
      })),
      ...analyzerOutput.technical.analysis.inferences,
      ...analyzerOutput.technical.analysis.assumptions,
    ]
  );

  // Check if there are relevant CF findings
  const hasCFFindings = profile.cfFindings.findings.some((f: { description: string }) =>
    preFilterMatch.technologiesMatched.some(t =>
      f.description.toLowerCase().includes(t.toLowerCase())
    )
  );

  // Calculate priority
  const priority = calculatePriority(stability, analyzerOutput.confidence, hasCFFindings);

  // Calculate role visibility
  const roleVisibility = calculateRoleVisibility(item.categories, action);

  // Calculate ranking score
  const rankingScore = calculateRankingScore(
    priority,
    analyzerOutput.confidence,
    action,
    stability
  );

  // Determine replaces/complements/enables
  let replaces: string | undefined;
  let complements: string | undefined;
  let enables: string | undefined;

  if (action === 'REPLACE_EXISTING') {
    // Try to identify what it replaces from matched technologies
    replaces = preFilterMatch.technologiesMatched
      .filter(t => profile.stack.keyDependencies.some(d =>
        d.name.toLowerCase().includes(t.toLowerCase())
      ))
      .join(', ') || undefined;
  } else if (action === 'COMPLEMENT') {
    complements = preFilterMatch.technologiesMatched.join(', ') || undefined;
  } else if (action === 'NEW_CAPABILITY') {
    enables = analyzerOutput.subject.name;
  }

  const recommendation: RankedRecommendation = {
    id: randomUUID(),
    ifxTraceId: traceId,
    projectId: profile.project.id,
    feedItemId: item.id,
    generatedAt: new Date().toISOString(),
    modelUsed: analyzerOutput.modelUsed,

    type: 'recommendation',
    action,
    priority,
    confidence: kqr.confidence,

    subject: analyzerOutput.subject,

    replaces,
    complements,
    enables,

    roleVisibility,

    stabilityAssessment: stability,
    technical: analyzerOutput.technical,
    humanFriendly: analyzerOutput.humanFriendly,
    kqr: {
      overallConfidence: kqr.confidence,
      sourcesUsed: [{
        source: item.sourceName,
        type: 'primary_source' as const,
        reliability: (item.sourceReliability || 'medium') as 'high' | 'medium' | 'low' | 'very_high',
        weight: 0.3,
      }],
      crossValidation: {
        sourcesAgreeing: 1,
        sourcesConflicting: 0,
        sourcesInsufficient: 0,
      },
      confidenceBreakdown: kqr.breakdown,
      qualificationStatement: `Raccomandazione con confidenza ${(kqr.confidence * 100).toFixed(0)}%. Basata su 1 fonte.`,
    },

    isDelivered: false,
    rankingScore,
  };

  return recommendation;
}

/**
 * Rank and cap recommendations for a project.
 */
export function rankAndCap(
  recommendations: RankedRecommendation[],
  maxRecommendations: number
): RankedRecommendation[] {
  // Filter to only RECOMMEND verdicts
  const toDeliver = recommendations.filter(
    r => r.stabilityAssessment.verdict === 'RECOMMEND'
  );

  // Sort by ranking score (descending)
  const sorted = toDeliver.sort((a, b) => b.rankingScore - a.rankingScore);

  // Cap to max
  const capped = sorted.slice(0, maxRecommendations);

  logger.info('Recommendations ranked and capped', {
    total: recommendations.length,
    recommend: toDeliver.length,
    capped: capped.length,
    maxAllowed: maxRecommendations,
  });

  return capped;
}

/**
 * Filter recommendations by role.
 */
export function filterByRole(
  recommendations: RankedRecommendation[],
  role: TeamRole
): RankedRecommendation[] {
  return recommendations.filter(r => r.roleVisibility.includes(role));
}

/**
 * Get recommendations summary for logging/debugging.
 */
export function getRecommendationsSummary(
  recommendations: RankedRecommendation[]
): {
  total: number;
  byPriority: Record<RecommendationPriority, number>;
  byAction: Record<RecommendationAction, number>;
  byVerdict: Record<StabilityVerdict, number>;
  topN: Array<{ title: string; priority: string; score: number }>;
} {
  const byPriority: Record<RecommendationPriority, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  const byAction: Record<RecommendationAction, number> = {
    REPLACE_EXISTING: 0,
    COMPLEMENT: 0,
    NEW_CAPABILITY: 0,
    MONITOR: 0,
  };

  const byVerdict: Record<StabilityVerdict, number> = {
    RECOMMEND: 0,
    MONITOR: 0,
    DEFER: 0,
  };

  for (const rec of recommendations) {
    byPriority[rec.priority]++;
    byAction[rec.action]++;
    byVerdict[rec.stabilityAssessment.verdict]++;
  }

  const topN = recommendations
    .slice(0, 5)
    .map(r => ({
      title: r.subject.name,
      priority: r.priority,
      score: r.rankingScore,
    }));

  return {
    total: recommendations.length,
    byPriority,
    byAction,
    byVerdict,
    topN,
  };
}

/**
 * Deduplicate recommendations by subject.
 * Keeps the highest-ranked recommendation for each subject.
 */
export function deduplicateBySubject(
  recommendations: RankedRecommendation[]
): RankedRecommendation[] {
  const bySubject = new Map<string, RankedRecommendation>();

  // Sort by ranking score descending
  const sorted = [...recommendations].sort((a, b) => b.rankingScore - a.rankingScore);

  for (const rec of sorted) {
    const subjectKey = rec.subject.name.toLowerCase();
    if (!bySubject.has(subjectKey)) {
      bySubject.set(subjectKey, rec);
    }
  }

  const deduped = Array.from(bySubject.values());

  if (deduped.length < recommendations.length) {
    logger.debug('Deduplicated recommendations by subject', {
      before: recommendations.length,
      after: deduped.length,
    });
  }

  return deduped;
}
